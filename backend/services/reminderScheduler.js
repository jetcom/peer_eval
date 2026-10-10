const cron = require('node-cron');
const prisma = require('../lib/prisma');
const emailService = require('./email');
const { isPastDueDate, getNowInTimezone, dueDateToUtc } = require('../utils/dateUtils');
const { startReviewPeriod } = require('./paperReviewService');
const { vetInstructor } = require('./instructorVetting');
const { buildInstructorActionLinks } = require('../utils/instructorActionLinks');

/**
 * Reminder Scheduler Service
 *
 * Runs periodically (every 15 minutes) to check for reminder schedules
 * and send automatic reminder emails to students with incomplete evaluations.
 */

let schedulerTask = null;

/**
 * Convert a Date to a string in the format used for due dates (YYYY-MM-DDTHH:MM)
 * in the specified timezone
 */
function formatDateInTimezone(date, timezone) {
  const tz = timezone || 'America/New_York';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  const getPart = (type) => parts.find(p => p.type === type)?.value;
  // Handle case where midnight might be formatted as "24:00" instead of "00:00"
  let hour = getPart('hour');
  if (hour === '24') hour = '00';
  return `${getPart('year')}-${getPart('month')}-${getPart('day')}T${hour}:${getPart('minute')}`;
}

/**
 * Check for paper review rounds that should auto-start their review period.
 * Runs as part of the 15-minute cron cycle.
 */
async function processAutoStartReviews() {
  console.log('[ReminderScheduler] Checking for auto-start review rounds...');

  try {
    // Find rounds that are still in submission, have auto-start enabled, and have a deadline set
    const rounds = await prisma.paperReviewRound.findMany({
      where: {
        status: 'submission',
        autoStartReview: 1,
        submissionDeadline: { not: null }
      },
      include: {
        evalType: {
          include: {
            assignment: {
              include: {
                class: {
                  select: {
                    dueDateTimezone: true,
                    name: true,
                    teacher: { select: { email: true, firstName: true } }
                  }
                }
              }
            }
          }
        }
      }
    });

    for (const round of rounds) {
      const timezone = round.evalType.assignment.class.dueDateTimezone || 'America/New_York';
      const className = round.evalType.assignment.class.name;
      const assignmentName = round.evalType.assignment.name;
      const teacher = round.evalType.assignment.class.teacher;

      if (!isPastDueDate(round.submissionDeadline, timezone)) {
        continue;
      }

      console.log(`[ReminderScheduler] Auto-starting review for "${assignmentName}" in class "${className}" (evalType ${round.evalTypeId})`);

      const result = await startReviewPeriod(round.evalTypeId);

      if (result.success) {
        console.log(`[ReminderScheduler] Auto-started review: ${result.assignmentsCreated} assignments created, deadline ${result.reviewDeadline}`);
      } else {
        console.warn(`[ReminderScheduler] Auto-start failed for evalType ${round.evalTypeId}: ${result.error}`);

        // Only notify on the cycle that first catches this, not every 15 minutes
        // for as long as the round stays unresolved
        const minutesSinceDeadline = (new Date(getNowInTimezone(timezone)) - new Date(round.submissionDeadline)) / 60000;
        if (teacher && minutesSinceDeadline < 20) {
          try {
            await emailService.notifyTeacherOfAutoStartFailure({
              teacherEmail: teacher.email,
              teacherName: teacher.firstName,
              className,
              assignmentName,
              reason: result.error
            });
          } catch (emailErr) {
            console.error(`[ReminderScheduler] Failed to notify teacher of auto-start failure for evalType ${round.evalTypeId}:`, emailErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('[ReminderScheduler] Error processing auto-start reviews:', err);
  }
}

/**
 * Check for paper review rounds that should auto-complete and release feedback.
 * Runs as part of the 15-minute cron cycle.
 */
async function processAutoReleaseFeedback() {
  console.log('[ReminderScheduler] Checking for auto-release feedback rounds...');

  try {
    // Find rounds in review status with auto-release enabled and a review deadline set
    const rounds = await prisma.paperReviewRound.findMany({
      where: {
        status: 'review',
        autoReleaseFeedback: 1,
        reviewDeadline: { not: null }
      },
      include: {
        evalType: {
          include: {
            assignment: {
              include: {
                class: { select: { dueDateTimezone: true, name: true } }
              }
            }
          }
        }
      }
    });

    for (const round of rounds) {
      const timezone = round.evalType.assignment.class.dueDateTimezone || 'America/New_York';
      const className = round.evalType.assignment.class.name;
      const assignmentName = round.evalType.assignment.name;

      if (!isPastDueDate(round.reviewDeadline, timezone)) {
        continue;
      }

      console.log(`[ReminderScheduler] Auto-releasing feedback for "${assignmentName}" in class "${className}" (evalType ${round.evalTypeId})`);

      await prisma.paperReviewRound.update({
        where: { id: round.id },
        data: {
          status: 'completed',
          feedbackReleasedAt: new Date()
        }
      });

      console.log(`[ReminderScheduler] Auto-released feedback for "${assignmentName}" — status set to completed`);
    }
  } catch (err) {
    console.error('[ReminderScheduler] Error processing auto-release feedback:', err);
  }
}

/**
 * Check and send reminders for all active schedules
 */
async function processReminders() {
  console.log('[ReminderScheduler] Running scheduled reminder check...');

  // Check for auto-start review rounds first
  await processAutoStartReviews();

  // Check for auto-release feedback on completed review rounds
  await processAutoReleaseFeedback();

  try {
    const now = new Date();

    // Get all enabled reminder schedules
    const schedules = await prisma.reminderSchedule.findMany({
      where: { enabled: 1 }
    });

    for (const schedule of schedules) {
      await processSchedule(schedule, now);
    }

    console.log(`[ReminderScheduler] Processed ${schedules.length} schedules`);
  } catch (err) {
    console.error('[ReminderScheduler] Error processing reminders:', err);
  }
}

// Hours before a due date at which students with incomplete work are reminded.
// A schedule's hoursBeforeDue is its first reminder; it then follows this
// ladder, so reminders cluster near the deadline instead of repeating overnight.
const REMINDER_MILESTONES_HOURS = [72, 48, 24, 12, 6, 3, 2, 1];

function milestonesFor(hoursBeforeDue) {
  return [hoursBeforeDue, ...REMINDER_MILESTONES_HOURS.filter(h => h < hoursBeforeDue)];
}

/**
 * Start of the reminder window we're currently in for a due date, e.g. with
 * 5h left the window is the 6h milestone and starts 6h before due. A student
 * is reminded at most once per window. Returns null if the due date has passed
 * or is beyond the first milestone.
 */
function currentWindowStart(dueDate, timezone, now, milestones) {
  const dueMs = dueDateToUtc(dueDate, timezone).getTime();
  const hoursLeft = (dueMs - now.getTime()) / 3600000;
  if (hoursLeft <= 0) return null;

  const reached = milestones.filter(h => h >= hoursLeft);
  if (reached.length === 0) return null;

  return new Date(dueMs - Math.min(...reached) * 3600000);
}

/**
 * Process a single reminder schedule.
 *
 * Finds due dates within `hoursBeforeDue` hours from now, and reminds each
 * student with incomplete work once per milestone window (see
 * REMINDER_MILESTONES_HOURS). This is self-healing — if a cron cycle is missed
 * the next cycle in the same window still sends it.
 */
async function processSchedule(schedule, now) {
  const { id, classId, hoursBeforeDue, nudgeTemplateId } = schedule;

  try {
    // Get class info
    const classInfo = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        teacher: {
          select: { id: true, email: true, firstName: true, lastName: true }
        }
      }
    });

    if (!classInfo) {
      console.log(`[ReminderScheduler] Class ${classId} not found, skipping schedule ${id}`);
      return;
    }

    const classTimezone = classInfo.dueDateTimezone || 'America/New_York';
    const milestones = milestonesFor(hoursBeforeDue);

    // Build the "now" and "horizon" strings in the class's local timezone.
    // We want due dates where:  now < dueDate <= now + hoursBeforeDue
    // i.e. the due date is in the future but close enough to warrant a reminder.
    const nowStr = formatDateInTimezone(now, classTimezone);
    const horizon = new Date(now.getTime() + hoursBeforeDue * 60 * 60 * 1000);
    const horizonStr = formatDateInTimezone(horizon, classTimezone);

    console.log(`[ReminderScheduler] Class ${classId} (${classTimezone}): now=${nowStr}, horizon=${horizonStr} (${hoursBeforeDue}h)`);

    const isAssignmentMode = classInfo.evaluationMode === 'assignments';

    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } }
      }
    });

    const students = enrollments
      .filter(e => e.user.role === 'student')
      .map(e => e.user);
    const studentIds = students.map(s => s.id);

    // studentId → { student, items: [{ phase, assignmentId }] } still needing a
    // reminder in the current window (incomplete + not yet reminded this window)
    const toRemind = new Map();
    const remindedAssignmentNames = new Set();

    const addItem = (student, item) => {
      if (!toRemind.has(student.id)) toRemind.set(student.id, { student, items: [] });
      toRemind.get(student.id).items.push(item);
    };

    const alreadyRemindedThisWindow = (student, windowStart, item) =>
      prisma.reminderLog.findFirst({
        where: { classId, userId: student.id, ...item, sentAt: { gte: windowStart } }
      });

    if (isAssignmentMode) {
      // Find assignments with eval types due between now and the horizon
      const assignments = await prisma.assignment.findMany({
        where: {
          classId,
          evalTypes: {
            some: {
              dueDate: { gt: nowStr, lte: horizonStr }
            }
          }
        },
        include: {
          evalTypes: {
            where: {
              dueDate: { gt: nowStr, lte: horizonStr }
            }
          }
        }
      });

      if (assignments.length === 0) return;

      console.log(`[ReminderScheduler] Class ${classId}: found ${assignments.length} assignment(s) due within ${hoursBeforeDue}h`);

      for (const assignment of assignments) {
        const dueDate = assignment.evalTypes.map(et => et.dueDate).sort()[0];
        const windowStart = currentWindowStart(dueDate, classTimezone, now, milestones);
        if (!windowStart) continue;

        const evalTypeIds = assignment.evalTypes.map(et => et.id);
        const submittedEvals = await prisma.assignmentEvaluation.findMany({
          where: {
            evalTypeId: { in: evalTypeIds },
            evaluatorId: { in: studentIds }
          },
          select: { evaluatorId: true }
        });

        const completedIds = new Set(submittedEvals.map(e => e.evaluatorId));
        const item = { phase: null, assignmentId: assignment.id };

        for (const student of students) {
          if (completedIds.has(student.id)) continue;
          if (await alreadyRemindedThisWindow(student, windowStart, item)) continue;

          addItem(student, item);
          remindedAssignmentNames.add(assignment.name);
        }
      }
    } else {
      // Phase-based mode — loop over every phase due in this window
      const phaseDueDates = await prisma.phaseDueDate.findMany({
        where: {
          classId,
          dueDate: { gt: nowStr, lte: horizonStr }
        }
      });

      if (phaseDueDates.length === 0) return;

      const groupMembers = await prisma.groupMember.findMany({
        where: {
          userId: { in: studentIds },
          group: { classId }
        },
        include: {
          group: {
            include: {
              members: {
                include: { user: { select: { id: true } } }
              }
            }
          }
        }
      });

      for (const pdd of phaseDueDates) {
        const phaseNum = pdd.phase;
        const windowStart = currentWindowStart(pdd.dueDate, classTimezone, now, milestones);
        if (!windowStart) continue;

        console.log(`[ReminderScheduler] Class ${classId}: found phase ${phaseNum} due ${pdd.dueDate} (within ${hoursBeforeDue}h)`);

        const item = { phase: phaseNum, assignmentId: null };

        for (const student of students) {
          const membership = groupMembers.find(gm => gm.userId === student.id);
          if (!membership) continue;

          const teammateIds = membership.group.members
            .map(m => m.user.id)
            .filter(tid => tid !== student.id);

          if (teammateIds.length === 0) continue;

          let submittedIds;
          if (phaseNum === 0) {
            // Final Evaluation uses final_comments table, not evaluations
            const submitted = await prisma.finalComment.findMany({
              where: {
                evaluatorId: student.id,
                evaluateeId: { in: teammateIds },
                OR: [{ classId }, { classId: null }]
              },
              select: { evaluateeId: true }
            });
            submittedIds = submitted.map(e => e.evaluateeId);
          } else {
            const submitted = await prisma.evaluation.findMany({
              where: {
                evaluatorId: student.id,
                evaluateeId: { in: teammateIds },
                phase: phaseNum,
                OR: [{ classId }, { classId: null }]
              },
              select: { evaluateeId: true }
            });
            submittedIds = submitted.map(e => e.evaluateeId);
          }

          const evaluatedIds = new Set(submittedIds);
          const hasIncomplete = teammateIds.some(tid => !evaluatedIds.has(tid));

          if (!hasIncomplete) continue;
          if (await alreadyRemindedThisWindow(student, windowStart, item)) continue;

          addItem(student, item);
        }
      }
    }

    if (toRemind.size === 0) return;

    const studentsToRemind = [...toRemind.values()].map(e => e.student);

    console.log(`[ReminderScheduler] Sending ${studentsToRemind.length} reminders for class ${classInfo.name}`);

    // Get template if specified
    let templateSubject = null;
    let templateMessage = null;
    if (nudgeTemplateId) {
      const template = await prisma.nudgeTemplate.findUnique({
        where: { id: nudgeTemplateId }
      });
      if (template) {
        templateSubject = template.subject;
        templateMessage = template.message;
      }
    }

    // Log the reminders BEFORE sending to prevent duplicates during deployments.
    // One entry per (student, phase/assignment) for per-item window tracking;
    // these logs also feed the teacher's daily digest.
    const logsToCreate = [];
    for (const { student, items } of toRemind.values()) {
      for (const item of items) {
        logsToCreate.push({ classId, userId: student.id, ...item, sentAt: now });
      }
    }
    await prisma.reminderLog.createMany({ data: logsToCreate });

    await prisma.reminderSchedule.update({
      where: { id },
      data: { lastSentAt: now }
    });

    const result = await emailService.sendBulkNudge({
      students: studentsToRemind,
      className: classInfo.name,
      assignmentName: remindedAssignmentNames.size === 1 ? [...remindedAssignmentNames][0] : null,
      message: templateMessage,
      instructorName: `${classInfo.teacher.firstName} ${classInfo.teacher.lastName}`,
      subject: templateSubject || `Reminder: Evaluations Due Soon for ${classInfo.name}`
    });

    console.log(`[ReminderScheduler] Sent ${result.successful} reminders, ${result.failed} failed for class ${classInfo.name}`);
  } catch (err) {
    console.error(`[ReminderScheduler] Error processing schedule ${id}:`, err);
  }
}

/**
 * Email each teacher one digest of the automatic reminders sent to their
 * students over the past 24 hours. Runs daily; replaces the per-batch
 * notification so a night of reminders doesn't mean a pile of teacher emails.
 */
async function processReminderDigests() {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const logs = await prisma.reminderLog.findMany({
      where: { sentAt: { gte: since } },
      orderBy: { sentAt: 'asc' }
    });
    if (logs.length === 0) return;

    const classIds = [...new Set(logs.map(l => l.classId))];
    const userIds = [...new Set(logs.map(l => l.userId))];
    const assignmentIds = [...new Set(logs.map(l => l.assignmentId).filter(Boolean))];

    const [classes, users, assignments] = await Promise.all([
      prisma.class.findMany({
        where: { id: { in: classIds } },
        select: { id: true, name: true, dueDateTimezone: true, teacher: { select: { id: true, email: true, firstName: true } } }
      }),
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true }
      }),
      prisma.assignment.findMany({
        where: { id: { in: assignmentIds } },
        select: { id: true, name: true }
      })
    ]);

    const userById = new Map(users.map(u => [u.id, u]));
    const assignmentById = new Map(assignments.map(a => [a.id, a]));
    const itemLabel = (log) => log.assignmentId
      ? (assignmentById.get(log.assignmentId)?.name || 'Assignment')
      : (log.phase === 0 ? 'Final evaluation' : `Phase ${log.phase}`);

    // teacherId → { teacher, classes: [{ className, timezone, students: [...] }] }
    const byTeacher = new Map();
    for (const cls of classes) {
      if (!cls.teacher) continue;

      // studentId → { name, email, items: Set, sends: [Date] }
      const studentMap = new Map();
      for (const log of logs.filter(l => l.classId === cls.id)) {
        const user = userById.get(log.userId);
        if (!user) continue;
        if (!studentMap.has(user.id)) {
          studentMap.set(user.id, { firstName: user.firstName, lastName: user.lastName, email: user.email, items: new Set(), sentTimes: new Set() });
        }
        const entry = studentMap.get(user.id);
        entry.items.add(itemLabel(log));
        entry.sentTimes.add(log.sentAt.getTime());
      }
      if (studentMap.size === 0) continue;

      if (!byTeacher.has(cls.teacher.id)) byTeacher.set(cls.teacher.id, { teacher: cls.teacher, classes: [] });
      byTeacher.get(cls.teacher.id).classes.push({
        className: cls.name,
        timezone: cls.dueDateTimezone || 'America/New_York',
        students: [...studentMap.values()]
          .map(s => ({ ...s, items: [...s.items], sentTimes: [...s.sentTimes].sort().map(t => new Date(t)) }))
          .sort((a, b) => a.lastName.localeCompare(b.lastName))
      });
    }

    for (const { teacher, classes: teacherClasses } of byTeacher.values()) {
      try {
        await emailService.sendTeacherReminderDigest({
          teacherEmail: teacher.email,
          teacherName: teacher.firstName,
          classes: teacherClasses
        });
      } catch (emailErr) {
        console.error(`[ReminderScheduler] Failed to send reminder digest to teacher ${teacher.id}:`, emailErr.message);
      }
    }

    console.log(`[ReminderScheduler] Sent reminder digests to ${byTeacher.size} teacher(s)`);
  } catch (err) {
    console.error('[ReminderScheduler] processReminderDigests error:', err);
  }
}

/**
 * Start the reminder scheduler
 * Runs every 15 minutes
 */
// Days a request may sit before the 1st and 2nd admin follow-up
const PENDING_INSTRUCTOR_FOLLOWUP_DAYS = [3, 7];

/**
 * Email admins about instructor requests nobody has acted on. Runs daily.
 * Each request triggers at most one email per stage (day 3, day 7).
 */
async function processPendingInstructorReminders() {
  try {
    const now = Date.now();
    const pending = await prisma.user.findMany({
      where: { role: 'pending_teacher', approvalRemindersSent: { lt: PENDING_INSTRUCTOR_FOLLOWUP_DAYS.length } },
      select: { id: true, email: true, firstName: true, lastName: true, university: true, department: true, createdAt: true, approvalRemindersSent: true }
    });

    const due = pending.filter(u => {
      const ageDays = (now - u.createdAt.getTime()) / 86400000;
      return ageDays >= PENDING_INSTRUCTOR_FOLLOWUP_DAYS[u.approvalRemindersSent];
    });
    if (!due.length) return;

    const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { email: true } });
    const adminEmails = admins.map(a => a.email);
    if (!adminEmails.length) {
      console.warn('[ReminderScheduler] Pending instructor follow-up skipped: no admin users');
      return;
    }

    const requests = [];
    for (const u of due) {
      let vet = null;
      try { vet = await vetInstructor(u); } catch (e) { console.error('[ReminderScheduler] vetting failed for', u.email, e.message); }
      requests.push({
        instructor: u,
        waitingDays: Math.floor((now - u.createdAt.getTime()) / 86400000),
        vet,
        ...buildInstructorActionLinks(u.id)
      });
    }

    const result = await emailService.sendPendingInstructorDigest({ adminEmails, requests });
    if (result.success) {
      await prisma.user.updateMany({
        where: { id: { in: due.map(u => u.id) } },
        data: { approvalRemindersSent: { increment: 1 } }
      });
      console.log(`[ReminderScheduler] Sent pending-instructor follow-up for ${due.length} request(s)`);
    } else {
      console.error('[ReminderScheduler] Pending instructor follow-up email failed:', result.error);
    }
  } catch (err) {
    console.error('[ReminderScheduler] processPendingInstructorReminders error:', err);
  }
}

let pendingInstructorTask = null;
let reminderDigestTask = null;

function startScheduler() {
  if (schedulerTask) {
    console.log('[ReminderScheduler] Scheduler already running');
    return;
  }

  // Run every 15 minutes
  schedulerTask = cron.schedule('*/15 * * * *', processReminders);

  // Daily 9am Eastern: nudge admins about instructor requests waiting 3+ / 7+ days
  pendingInstructorTask = cron.schedule('0 9 * * *', processPendingInstructorReminders, { timezone: 'America/New_York' });

  // Daily 8am Eastern: one digest per teacher of yesterday's automatic reminders
  reminderDigestTask = cron.schedule('0 8 * * *', processReminderDigests, { timezone: 'America/New_York' });

  console.log('[ReminderScheduler] Scheduler started (runs every 15 minutes)');

  // Run once on startup after a short delay
  setTimeout(() => {
    console.log('[ReminderScheduler] Running initial check...');
    processReminders();
  }, 5000);
}

/**
 * Stop the reminder scheduler
 */
function stopScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    console.log('[ReminderScheduler] Scheduler stopped');
  }
  if (pendingInstructorTask) {
    pendingInstructorTask.stop();
    pendingInstructorTask = null;
  }
  if (reminderDigestTask) {
    reminderDigestTask.stop();
    reminderDigestTask = null;
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  processReminders,
  processPendingInstructorReminders,
  processReminderDigests
};

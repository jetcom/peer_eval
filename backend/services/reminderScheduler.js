const cron = require('node-cron');
const prisma = require('../lib/prisma');
const emailService = require('./email');
const { isPastDueDate } = require('../utils/dateUtils');
const { startReviewPeriod } = require('./paperReviewService');

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

      if (!isPastDueDate(round.submissionDeadline, timezone)) {
        continue;
      }

      console.log(`[ReminderScheduler] Auto-starting review for "${assignmentName}" in class "${className}" (evalType ${round.evalTypeId})`);

      const result = await startReviewPeriod(round.evalTypeId);

      if (result.success) {
        console.log(`[ReminderScheduler] Auto-started review: ${result.assignmentsCreated} assignments created, deadline ${result.reviewDeadline}`);
      } else {
        console.warn(`[ReminderScheduler] Auto-start failed for evalType ${round.evalTypeId}: ${result.error}`);
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

/**
 * Process a single reminder schedule.
 *
 * Strategy: find due dates that are in the future but within `hoursBeforeDue`
 * hours from now.  If such a due date exists AND we haven't already sent a
 * reminder for it, send one.  This is self-healing — if a cron cycle is missed
 * the next cycle will still catch it, rather than requiring an exact 30-minute
 * window hit.
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

    // Build the "now" and "horizon" strings in the class's local timezone.
    // We want due dates where:  now < dueDate <= now + hoursBeforeDue
    // i.e. the due date is in the future but close enough to warrant a reminder.
    const nowStr = formatDateInTimezone(now, classTimezone);
    const horizon = new Date(now.getTime() + hoursBeforeDue * 60 * 60 * 1000);
    const horizonStr = formatDateInTimezone(horizon, classTimezone);

    console.log(`[ReminderScheduler] Class ${classId} (${classTimezone}): now=${nowStr}, horizon=${horizonStr} (${hoursBeforeDue}h)`);

    const isAssignmentMode = classInfo.evaluationMode === 'assignments';

    let studentsToRemind = [];
    let assignmentName = null;
    let dueDate = null;
    let phase = null;
    let firstAssignmentId = null;

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

      firstAssignmentId = assignments[0]?.id || null;
      console.log(`[ReminderScheduler] Class ${classId}: found ${assignments.length} assignment(s) due within ${hoursBeforeDue}h`);

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

      for (const assignment of assignments) {
        dueDate = assignment.evalTypes[0]?.dueDate;
        assignmentName = assignment.name;

        const submittedEvals = await prisma.assignmentEvaluation.findMany({
          where: {
            assignmentId: assignment.id,
            evaluatorId: { in: studentIds }
          },
          select: { evaluatorId: true }
        });

        const completedIds = new Set(submittedEvals.map(e => e.evaluatorId));
        const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

        for (const student of students) {
          if (completedIds.has(student.id)) continue;

          const recentReminder = await prisma.reminderLog.findFirst({
            where: {
              classId,
              userId: student.id,
              assignmentId: assignment.id,
              sentAt: { gte: fourHoursAgo }
            }
          });

          if (!recentReminder) {
            studentsToRemind.push(student);
          }
        }
      }
    } else {
      // Phase-based mode
      const phaseDueDates = await prisma.phaseDueDate.findMany({
        where: {
          classId,
          dueDate: { gt: nowStr, lte: horizonStr }
        }
      });

      if (phaseDueDates.length === 0) return;

      console.log(`[ReminderScheduler] Class ${classId}: found phase ${phaseDueDates[0].phase} due ${phaseDueDates[0].dueDate} (within ${hoursBeforeDue}h)`);

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

      phase = phaseDueDates[0].phase;
      dueDate = phaseDueDates[0].dueDate;

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

      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

      for (const student of students) {
        const membership = groupMembers.find(gm => gm.userId === student.id);
        if (!membership) continue;

        const teammateIds = membership.group.members
          .map(m => m.user.id)
          .filter(tid => tid !== student.id);

        if (teammateIds.length === 0) continue;

        const submitted = await prisma.evaluation.findMany({
          where: {
            evaluatorId: student.id,
            evaluateeId: { in: teammateIds },
            phase,
            OR: [
              { classId },
              { classId: null }
            ]
          },
          select: { evaluateeId: true }
        });

        const evaluatedIds = new Set(submitted.map(e => e.evaluateeId));
        const hasIncomplete = teammateIds.some(tid => !evaluatedIds.has(tid));

        if (!hasIncomplete) continue;

        const recentReminder = await prisma.reminderLog.findFirst({
          where: {
            classId,
            userId: student.id,
            phase,
            sentAt: { gte: fourHoursAgo }
          }
        });

        if (!recentReminder) {
          studentsToRemind.push(student);
        }
      }
    }

    if (studentsToRemind.length === 0) {
      return;
    }

    console.log(`[ReminderScheduler] Sending ${studentsToRemind.length} reminders for class ${classInfo.name} (due ${dueDate})`);

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

    // Log the reminders BEFORE sending to prevent duplicates during deployments
    const logsToCreate = studentsToRemind.map(student => ({
      classId,
      userId: student.id,
      phase: isAssignmentMode ? null : phase,
      assignmentId: isAssignmentMode ? firstAssignmentId : null,
      sentAt: now
    }));

    await prisma.reminderLog.createMany({
      data: logsToCreate
    });

    await prisma.reminderSchedule.update({
      where: { id },
      data: { lastSentAt: now }
    });

    const result = await emailService.sendBulkNudge({
      students: studentsToRemind,
      className: classInfo.name,
      assignmentName,
      message: templateMessage,
      instructorName: `${classInfo.teacher.firstName} ${classInfo.teacher.lastName}`,
      subject: templateSubject || `Reminder: Evaluations Due Soon for ${classInfo.name}`
    });

    if (result.successful > 0 && classInfo.teacher) {
      await emailService.notifyTeacherOfNudges({
        teacherEmail: classInfo.teacher.email,
        teacherName: classInfo.teacher.firstName,
        className: classInfo.name,
        students: studentsToRemind.map(s => ({
          firstName: s.firstName,
          lastName: s.lastName,
          email: s.email
        })),
        isReminder: true
      });
    }

    console.log(`[ReminderScheduler] Sent ${result.successful} reminders, ${result.failed} failed for class ${classInfo.name}`);
  } catch (err) {
    console.error(`[ReminderScheduler] Error processing schedule ${id}:`, err);
  }
}

/**
 * Start the reminder scheduler
 * Runs every 15 minutes
 */
function startScheduler() {
  if (schedulerTask) {
    console.log('[ReminderScheduler] Scheduler already running');
    return;
  }

  // Run every 15 minutes
  schedulerTask = cron.schedule('*/15 * * * *', processReminders);

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
}

module.exports = {
  startScheduler,
  stopScheduler,
  processReminders
};

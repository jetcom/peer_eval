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
 * Process a single reminder schedule
 */
async function processSchedule(schedule, now) {
  const { id, classId, hoursBeforeDue, nudgeTemplateId, lastSentAt } = schedule;

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

    // Get the class timezone for proper date comparison
    const classTimezone = classInfo.dueDateTimezone || 'America/New_York';

    // Calculate the reminder window
    // We look for due dates that are within hoursBeforeDue hours from now
    const reminderWindowStart = new Date(now.getTime() + (hoursBeforeDue - 0.25) * 60 * 60 * 1000);
    const reminderWindowEnd = new Date(now.getTime() + (hoursBeforeDue + 0.25) * 60 * 60 * 1000);

    // Convert to strings in class timezone for comparison with stored due dates
    // Due dates are stored as "YYYY-MM-DDTHH:MM" strings in the class's local timezone
    const windowStartStr = formatDateInTimezone(reminderWindowStart, classTimezone);
    const windowEndStr = formatDateInTimezone(reminderWindowEnd, classTimezone);

    console.log(`[ReminderScheduler] Class ${classId} (${classTimezone}): checking window ${windowStartStr} to ${windowEndStr}`);

    // Check if this is assignment-based or phase-based
    const isAssignmentMode = classInfo.evaluationMode === 'assignments';

    let studentsToRemind = [];
    let assignmentName = null;
    let dueDate = null;

    if (isAssignmentMode) {
      // Find assignments with eval types due within the window
      // Use timezone-aware string comparison
      const assignments = await prisma.assignment.findMany({
        where: {
          classId,
          evalTypes: {
            some: {
              dueDate: {
                gte: windowStartStr,
                lte: windowEndStr
              }
            }
          }
        },
        include: {
          evalTypes: {
            where: {
              dueDate: {
                gte: windowStartStr,
                lte: windowEndStr
              }
            }
          }
        }
      });

      if (assignments.length === 0) return;

      // Get students enrolled in the class
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

        // Get submitted evaluations for this assignment
        const submittedEvals = await prisma.assignmentEvaluation.findMany({
          where: {
            assignmentId: assignment.id,
            evaluatorId: { in: studentIds }
          },
          select: { evaluatorId: true }
        });

        const completedIds = new Set(submittedEvals.map(e => e.evaluatorId));

        // Filter out students who have already been reminded in the last 4 hours
        const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

        for (const student of students) {
          if (completedIds.has(student.id)) continue;

          // Check if we already sent a reminder to this student recently
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
      // dueDate is stored as String in class timezone format (YYYY-MM-DDTHH:MM)
      // Use timezone-aware string comparison
      const phaseDueDates = await prisma.phaseDueDate.findMany({
        where: {
          classId,
          dueDate: {
            gte: windowStartStr,
            lte: windowEndStr
          }
        }
      });

      if (phaseDueDates.length === 0) return;

      // Get students enrolled in the class
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
      const phase = phaseDueDates[0].phase;
      dueDate = phaseDueDates[0].dueDate;

      // Get groups to determine who each student should evaluate
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
          .filter(id => id !== student.id);

        if (teammateIds.length === 0) continue;

        // Check completions for this phase
        // Note: Some older evaluations might have classId: null if submitted without class_id in URL
        // So we check for either the specific classId OR null
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
        const hasIncomplete = teammateIds.some(id => !evaluatedIds.has(id));

        if (!hasIncomplete) continue;

        // Check if we already sent a reminder to this student recently
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

    // Log the reminders BEFORE sending to prevent duplicates during deployments
    // If server crashes after logging but before sending, we skip a reminder (better than duplicates)
    const logsToCreate = studentsToRemind.map(student => ({
      classId,
      userId: student.id,
      phase: isAssignmentMode ? null : phase,
      assignmentId: isAssignmentMode ? (assignments?.[0]?.id || null) : null,
      sentAt: now
    }));

    await prisma.reminderLog.createMany({
      data: logsToCreate
    });

    // Update lastSentAt on the schedule
    await prisma.reminderSchedule.update({
      where: { id },
      data: { lastSentAt: now }
    });

    // Now send the reminders (logs already written, so no duplicates if this crashes)
    const result = await emailService.sendBulkNudge({
      students: studentsToRemind,
      className: classInfo.name,
      assignmentName,
      message: templateMessage,
      instructorName: `${classInfo.teacher.firstName} ${classInfo.teacher.lastName}`,
      subject: templateSubject || `Reminder: Evaluations Due Soon for ${classInfo.name}`
    });

    // Notify teacher
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

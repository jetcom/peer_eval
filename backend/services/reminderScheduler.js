const cron = require('node-cron');
const prisma = require('../lib/prisma');
const emailService = require('./email');

/**
 * Reminder Scheduler Service
 *
 * Runs periodically (every 15 minutes) to check for reminder schedules
 * and send automatic reminder emails to students with incomplete evaluations.
 */

let schedulerTask = null;

/**
 * Check and send reminders for all active schedules
 */
async function processReminders() {
  console.log('[ReminderScheduler] Running scheduled reminder check...');

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

    // Calculate the reminder window
    // We look for due dates that are within hoursBeforeDue hours from now
    const reminderWindowStart = new Date(now.getTime() + (hoursBeforeDue - 0.25) * 60 * 60 * 1000);
    const reminderWindowEnd = new Date(now.getTime() + (hoursBeforeDue + 0.25) * 60 * 60 * 1000);

    // Check if this is assignment-based or phase-based
    const isAssignmentMode = classInfo.evaluationMode === 'assignments';

    let studentsToRemind = [];
    let assignmentName = null;
    let dueDate = null;

    if (isAssignmentMode) {
      // Find assignments with eval types due within the window
      const assignments = await prisma.assignment.findMany({
        where: {
          classId,
          evalTypes: {
            some: {
              dueDate: {
                gte: reminderWindowStart,
                lte: reminderWindowEnd
              }
            }
          }
        },
        include: {
          evalTypes: {
            where: {
              dueDate: {
                gte: reminderWindowStart,
                lte: reminderWindowEnd
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
      // dueDate is stored as String (ISO format), so convert DateTime to strings for comparison
      const phaseDueDates = await prisma.phaseDueDate.findMany({
        where: {
          classId,
          dueDate: {
            gte: reminderWindowStart.toISOString(),
            lte: reminderWindowEnd.toISOString()
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
        const submitted = await prisma.evaluation.findMany({
          where: {
            evaluatorId: student.id,
            evaluateeId: { in: teammateIds },
            phase,
            classId
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

    // Send reminders
    const result = await emailService.sendBulkNudge({
      students: studentsToRemind,
      className: classInfo.name,
      assignmentName,
      message: templateMessage,
      instructorName: `${classInfo.teacher.firstName} ${classInfo.teacher.lastName}`,
      subject: templateSubject || `Reminder: Evaluations Due Soon for ${classInfo.name}`
    });

    // Log the reminders
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

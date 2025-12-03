const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken, requireAdmin, requireTeacher } = require('../middleware/auth');
const emailService = require('../services/email');

const router = express.Router();

/**
 * Send nudge emails to students with incomplete evaluations
 * POST /api/notifications/nudge
 *
 * Body: {
 *   studentIds: number[],      // Array of student IDs to nudge
 *   classId: number,           // Class ID for context
 *   assignmentId?: number,     // Optional assignment ID (for assignment-based evals)
 *   message?: string           // Optional custom message
 * }
 */
router.post('/nudge', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { studentIds, classId, assignmentId, message } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'studentIds array is required' });
    }

    if (!classId) {
      return res.status(400).json({ error: 'classId is required' });
    }

    // Get class info
    const classInfo = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        teacher: {
          select: { firstName: true, lastName: true }
        }
      }
    });

    if (!classInfo) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Check permission: user must be admin, the class teacher, or an instructor of the class
    const isAdmin = req.user.role === 'admin';
    const isClassTeacher = classInfo.teacherId === req.user.id;
    const isInstructor = await prisma.classInstructor.findFirst({
      where: { classId, userId: req.user.id }
    });

    if (!isAdmin && !isClassTeacher && !isInstructor) {
      return res.status(403).json({ error: 'Not authorized to send nudges for this class' });
    }

    // Get assignment info if provided
    let assignmentName = null;
    if (assignmentId) {
      const assignment = await prisma.assignment.findUnique({
        where: { id: assignmentId },
        select: { name: true }
      });
      assignmentName = assignment?.name;
    }

    // Get students
    const students = await prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, email: true, firstName: true, lastName: true }
    });

    const instructorName = `${classInfo.teacher.firstName} ${classInfo.teacher.lastName}`;

    // Send emails
    const result = await emailService.sendBulkNudge({
      students,
      className: classInfo.name,
      assignmentName,
      message,
      instructorName
    });

    res.json({
      message: `Nudge emails sent: ${result.successful} successful, ${result.failed} failed`,
      ...result
    });
  } catch (err) {
    console.error('Send nudge error:', err);
    res.status(500).json({ error: 'Failed to send nudge emails' });
  }
});

/**
 * Get students who need nudging (incomplete evaluations)
 * GET /api/notifications/needs-nudge/:classId
 */
router.get('/needs-nudge/:classId', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);
    const { assignmentId, phase } = req.query;

    // Get class info
    const classInfo = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, teacherId: true }
    });

    if (!classInfo) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Check permission
    const isAdmin = req.user.role === 'admin';
    const isClassTeacher = classInfo.teacherId === req.user.id;
    const isInstructor = await prisma.classInstructor.findFirst({
      where: { classId, userId: req.user.id }
    });

    if (!isAdmin && !isClassTeacher && !isInstructor) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Get all students in the class
    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true }
        }
      }
    });

    const students = enrollments.map(e => e.user);
    const studentIds = students.map(s => s.id);

    if (assignmentId) {
      // Assignment-based evaluations
      const assignment = await prisma.assignment.findUnique({
        where: { id: parseInt(assignmentId) },
        include: {
          evalTypes: true
        }
      });

      if (!assignment) {
        return res.status(404).json({ error: 'Assignment not found' });
      }

      // Get submitted evaluations for this assignment
      const submittedEvals = await prisma.assignmentEvaluation.findMany({
        where: {
          assignmentId: parseInt(assignmentId),
          evaluatorId: { in: studentIds }
        },
        select: { evaluatorId: true }
      });

      const evaluatorsWhoSubmitted = new Set(submittedEvals.map(e => e.evaluatorId));

      const studentsNeedingNudge = students.filter(s => !evaluatorsWhoSubmitted.has(s.id));

      res.json({
        students: studentsNeedingNudge.map(s => ({
          id: s.id,
          email: s.email,
          first_name: s.firstName,
          last_name: s.lastName
        })),
        totalStudents: students.length,
        incompleteCount: studentsNeedingNudge.length
      });
    } else if (phase) {
      // Phase-based evaluations
      const phaseNum = parseInt(phase);

      // Get students' groups
      const groupMembers = await prisma.groupMember.findMany({
        where: {
          userId: { in: studentIds },
          group: {
            classId
          }
        },
        include: {
          group: {
            include: {
              members: {
                include: {
                  user: { select: { id: true } }
                }
              }
            }
          }
        }
      });

      const studentsNeedingNudge = [];

      for (const student of students) {
        const membership = groupMembers.find(gm => gm.userId === student.id);
        if (!membership) continue;

        const teammateIds = membership.group.members
          .map(m => m.user.id)
          .filter(id => id !== student.id);

        if (teammateIds.length === 0) continue;

        // Check if this student has evaluated all teammates for this phase
        const submittedEvals = await prisma.evaluation.findMany({
          where: {
            evaluatorId: student.id,
            evaluateeId: { in: teammateIds },
            phase: phaseNum,
            classId
          },
          select: { evaluateeId: true }
        });

        const evaluatedIds = new Set(submittedEvals.map(e => e.evaluateeId));
        const hasIncomplete = teammateIds.some(id => !evaluatedIds.has(id));

        if (hasIncomplete) {
          studentsNeedingNudge.push({
            id: student.id,
            email: student.email,
            first_name: student.firstName,
            last_name: student.lastName,
            evaluated: submittedEvals.length,
            total: teammateIds.length
          });
        }
      }

      res.json({
        students: studentsNeedingNudge,
        totalStudents: students.length,
        incompleteCount: studentsNeedingNudge.length
      });
    } else {
      return res.status(400).json({ error: 'Either assignmentId or phase query param is required' });
    }
  } catch (err) {
    console.error('Get needs-nudge error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * Send evaluation reminders to students with upcoming deadlines
 * POST /api/notifications/send-reminders
 *
 * Teachers can send reminders for their own classes.
 * Admins can send reminders for all classes.
 *
 * Body: {
 *   classId?: number,          // Optional: specific class (required for teachers)
 *   hoursBeforeDeadline?: number  // Default: 24
 * }
 */
router.post('/send-reminders', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { hoursBeforeDeadline = 24, classId } = req.body;
    const now = new Date();
    const reminderWindow = new Date(now.getTime() + hoursBeforeDeadline * 60 * 60 * 1000);

    const isAdmin = req.user.role === 'admin';

    // Non-admins must specify a classId
    if (!isAdmin && !classId) {
      return res.status(400).json({ error: 'classId is required for non-admin users' });
    }

    // Verify teacher has access to the class
    if (classId && !isAdmin) {
      const classInfo = await prisma.class.findUnique({
        where: { id: classId },
        select: { teacherId: true }
      });
      const isInstructor = await prisma.classInstructor.findFirst({
        where: { classId, userId: req.user.id }
      });
      if (classInfo?.teacherId !== req.user.id && !isInstructor) {
        return res.status(403).json({ error: 'Not authorized to send reminders for this class' });
      }
    }

    const results = { sent: 0, failed: 0, details: [] };

    // Build class filter
    const classFilter = classId ? { classId } : {};

    // Check assignment-based evaluations
    const upcomingAssignments = await prisma.assignment.findMany({
      where: {
        ...classFilter,
        evalTypes: {
          some: {
            dueDate: {
              gte: now,
              lte: reminderWindow
            }
          }
        }
      },
      include: {
        class: {
          include: {
            enrollments: {
              include: {
                user: { select: { id: true, email: true, firstName: true } }
              }
            }
          }
        },
        evalTypes: {
          where: {
            dueDate: {
              gte: now,
              lte: reminderWindow
            }
          }
        }
      }
    });

    for (const assignment of upcomingAssignments) {
      const dueDate = assignment.evalTypes[0]?.dueDate;
      if (!dueDate) continue;

      // Get students who haven't completed
      const studentIds = assignment.class.enrollments.map(e => e.user.id);
      const submittedEvals = await prisma.assignmentEvaluation.findMany({
        where: {
          assignmentId: assignment.id,
          evaluatorId: { in: studentIds }
        },
        select: { evaluatorId: true }
      });

      const completedIds = new Set(submittedEvals.map(e => e.evaluatorId));
      const incompleteStudents = assignment.class.enrollments
        .filter(e => !completedIds.has(e.user.id))
        .map(e => e.user);

      for (const student of incompleteStudents) {
        const emailResult = await emailService.sendEvaluationReminder({
          student,
          className: assignment.class.name,
          dueDate,
          assignmentName: assignment.name
        });

        if (emailResult.success) {
          results.sent++;
        } else {
          results.failed++;
          results.details.push({ email: student.email, error: emailResult.error });
        }
      }
    }

    // Check phase-based evaluations
    const upcomingPhases = await prisma.phaseDueDate.findMany({
      where: {
        ...classFilter,
        dueDate: {
          gte: now,
          lte: reminderWindow
        }
      },
      include: {
        class: {
          include: {
            enrollments: {
              include: {
                user: { select: { id: true, email: true, firstName: true } }
              }
            }
          }
        }
      }
    });

    for (const phaseDue of upcomingPhases) {
      const students = phaseDue.class.enrollments.map(e => e.user);

      for (const student of students) {
        // For simplicity, send to all students - could add logic to check completion
        const emailResult = await emailService.sendEvaluationReminder({
          student,
          className: phaseDue.class.name,
          dueDate: phaseDue.dueDate
        });

        if (emailResult.success) {
          results.sent++;
        } else {
          results.failed++;
          results.details.push({ email: student.email, error: emailResult.error });
        }
      }
    }

    res.json({
      message: `Reminder emails sent: ${results.sent} successful, ${results.failed} failed`,
      ...results
    });
  } catch (err) {
    console.error('Send reminders error:', err);
    res.status(500).json({ error: 'Failed to send reminders' });
  }
});

/**
 * Test email sending (admin only)
 * POST /api/notifications/test
 */
router.post('/test', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { to } = req.body;
    const recipient = to || req.user.email;

    const result = await emailService.sendEmail({
      to: recipient,
      subject: 'PeerEvals Test Email',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Test Email</h2>
          <p>This is a test email from PeerEvals.</p>
          <p>If you received this, email sending is working correctly!</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            Sent at: ${new Date().toISOString()}
          </p>
        </div>
      `
    });

    if (result.success) {
      res.json({ message: `Test email sent to ${recipient}`, id: result.data?.id });
    } else {
      res.status(500).json({ error: 'Failed to send test email', details: result.error });
    }
  } catch (err) {
    console.error('Test email error:', err);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

module.exports = router;

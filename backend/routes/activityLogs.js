const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken, requireTeacher } = require('../middleware/auth');

const router = express.Router();

/**
 * Get activity logs for a class
 * GET /api/activity-logs/:classId
 *
 * Query params:
 *   - limit: number of records (default 100, max 500)
 *   - offset: pagination offset
 *   - userId: filter by specific user
 *   - action: filter by action type
 *   - startDate: filter by start date
 *   - endDate: filter by end date
 */
router.get('/:classId', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);
    const {
      limit = 100,
      offset = 0,
      userId,
      action,
      startDate,
      endDate
    } = req.query;

    // Verify access to class
    const classInfo = await prisma.class.findUnique({
      where: { id: classId },
      select: { teacherId: true }
    });

    if (!classInfo) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const isAdmin = req.user.role === 'admin';
    const isTeacher = classInfo.teacherId === req.user.id;
    const isInstructor = await prisma.classInstructor.findFirst({
      where: { classId, userId: req.user.id }
    });

    if (!isAdmin && !isTeacher && !isInstructor) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Build filter
    const where = { classId };

    if (userId) {
      where.userId = parseInt(userId);
    }

    if (action) {
      where.action = action;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    // Get logs with user info
    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit), 500),
        skip: parseInt(offset),
        include: {
          // We can't use include since there's no relation
          // We'll manually join below
        }
      }),
      prisma.activityLog.count({ where })
    ]);

    // Get user info for all users in logs
    const userIds = [...new Set(logs.map(l => l.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, email: true, role: true }
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Format response
    const formattedLogs = logs.map(log => {
      const user = userMap.get(log.userId);
      return {
        id: log.id,
        user_id: log.userId,
        user_name: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
        user_email: user?.email,
        user_role: user?.role,
        action: log.action,
        details: log.details ? JSON.parse(log.details) : null,
        ip_address: log.ipAddress,
        created_at: log.createdAt
      };
    });

    res.json({
      logs: formattedLogs,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Get activity logs error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * Get activity summary for all students in a class
 * GET /api/activity-logs/:classId/summary
 *
 * Returns last login and activity for each student
 */
router.get('/:classId/summary', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);

    // Verify access to class
    const classInfo = await prisma.class.findUnique({
      where: { id: classId },
      select: { teacherId: true }
    });

    if (!classInfo) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const isAdmin = req.user.role === 'admin';
    const isTeacher = classInfo.teacherId === req.user.id;
    const isInstructor = await prisma.classInstructor.findFirst({
      where: { classId, userId: req.user.id }
    });

    if (!isAdmin && !isTeacher && !isInstructor) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Get all students in the class
    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true }
        }
      }
    });

    const students = enrollments
      .filter(e => e.user.role === 'student')
      .map(e => e.user);

    // Get activity data for each student
    const studentIds = students.map(s => s.id);

    // Get last login for each student (global, not class-specific)
    const lastLogins = await prisma.activityLog.findMany({
      where: {
        userId: { in: studentIds },
        action: { in: ['login', 'login_sso'] }
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['userId'],
      select: { userId: true, createdAt: true, ipAddress: true }
    });
    const loginMap = new Map(lastLogins.map(l => [l.userId, l]));

    // Get last class activity for each student
    const lastClassActivities = await prisma.activityLog.findMany({
      where: {
        userId: { in: studentIds },
        classId
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['userId'],
      select: { userId: true, createdAt: true, action: true }
    });
    const activityMap = new Map(lastClassActivities.map(a => [a.userId, a]));

    // Get evaluation submission counts per student
    const evalCounts = await prisma.activityLog.groupBy({
      by: ['userId'],
      where: {
        userId: { in: studentIds },
        classId,
        action: { in: ['submit_evaluation', 'update_evaluation'] }
      },
      _count: true
    });
    const evalCountMap = new Map(evalCounts.map(c => [c.userId, c._count]));

    // Build summary
    const summary = students.map(student => {
      const lastLogin = loginMap.get(student.id);
      const lastActivity = activityMap.get(student.id);

      return {
        user_id: student.id,
        first_name: student.firstName,
        last_name: student.lastName,
        email: student.email,
        last_login: lastLogin?.createdAt || null,
        last_login_ip: lastLogin?.ipAddress || null,
        last_class_activity: lastActivity?.createdAt || null,
        last_action: lastActivity?.action || null,
        evaluation_submissions: evalCountMap.get(student.id) || 0
      };
    });

    // Sort by last activity (null = no activity, sorted to bottom)
    summary.sort((a, b) => {
      if (!a.last_class_activity && !b.last_class_activity) return 0;
      if (!a.last_class_activity) return 1;
      if (!b.last_class_activity) return -1;
      return new Date(b.last_class_activity) - new Date(a.last_class_activity);
    });

    res.json(summary);
  } catch (err) {
    console.error('Get activity summary error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * Get activity for a specific user
 * GET /api/activity-logs/user/:userId
 *
 * Teachers can view activity for students in their classes
 */
router.get('/user/:userId', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { classId, limit = 50 } = req.query;

    // Verify user exists and teacher has access
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, email: true, role: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if requesting user has access to this user's data
    // Admin can see all, teachers can see students in their classes
    if (req.user.role !== 'admin') {
      // Find classes where the teacher teaches and the user is enrolled
      const teacherClasses = await prisma.class.findMany({
        where: {
          OR: [
            { teacherId: req.user.id },
            { instructors: { some: { userId: req.user.id } } }
          ]
        },
        select: { id: true }
      });

      const teacherClassIds = teacherClasses.map(c => c.id);

      const enrollment = await prisma.classEnrollment.findFirst({
        where: {
          userId,
          classId: { in: teacherClassIds }
        }
      });

      if (!enrollment) {
        return res.status(403).json({ error: 'Not authorized to view this user\'s activity' });
      }
    }

    // Build filter
    const where = { userId };
    if (classId) {
      where.classId = parseInt(classId);
    }

    const logs = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit), 200)
    });

    res.json({
      user: {
        id: user.id,
        first_name: user.firstName,
        last_name: user.lastName,
        email: user.email
      },
      logs: logs.map(log => ({
        id: log.id,
        action: log.action,
        class_id: log.classId,
        details: log.details ? JSON.parse(log.details) : null,
        ip_address: log.ipAddress,
        created_at: log.createdAt
      }))
    });
  } catch (err) {
    console.error('Get user activity error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;

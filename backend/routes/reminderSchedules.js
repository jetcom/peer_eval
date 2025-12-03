const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken, requireTeacher } = require('../middleware/auth');

const router = express.Router();

/**
 * Get reminder schedules for a class
 * GET /api/reminder-schedules/:classId
 */
router.get('/:classId', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);

    // Verify access
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

    const schedules = await prisma.reminderSchedule.findMany({
      where: { classId },
      orderBy: { hoursBeforeDue: 'asc' }
    });

    res.json(schedules.map(s => ({
      id: s.id,
      class_id: s.classId,
      hours_before_due: s.hoursBeforeDue,
      enabled: s.enabled === 1,
      nudge_template_id: s.nudgeTemplateId,
      last_sent_at: s.lastSentAt,
      created_at: s.createdAt
    })));
  } catch (err) {
    console.error('Get reminder schedules error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * Create or update reminder schedule
 * POST /api/reminder-schedules
 */
router.post('/', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { class_id, hours_before_due, enabled, nudge_template_id } = req.body;

    if (!class_id || !hours_before_due) {
      return res.status(400).json({ error: 'class_id and hours_before_due are required' });
    }

    // Verify access
    const classInfo = await prisma.class.findUnique({
      where: { id: class_id },
      select: { teacherId: true }
    });

    if (!classInfo) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const isAdmin = req.user.role === 'admin';
    const isTeacher = classInfo.teacherId === req.user.id;
    const isInstructor = await prisma.classInstructor.findFirst({
      where: { classId: class_id, userId: req.user.id }
    });

    if (!isAdmin && !isTeacher && !isInstructor) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Upsert the schedule
    const schedule = await prisma.reminderSchedule.upsert({
      where: {
        classId_hoursBeforeDue: {
          classId: class_id,
          hoursBeforeDue: hours_before_due
        }
      },
      update: {
        enabled: enabled !== false ? 1 : 0,
        nudgeTemplateId: nudge_template_id || null
      },
      create: {
        classId: class_id,
        hoursBeforeDue: hours_before_due,
        enabled: enabled !== false ? 1 : 0,
        nudgeTemplateId: nudge_template_id || null
      }
    });

    res.json({
      id: schedule.id,
      class_id: schedule.classId,
      hours_before_due: schedule.hoursBeforeDue,
      enabled: schedule.enabled === 1,
      nudge_template_id: schedule.nudgeTemplateId,
      last_sent_at: schedule.lastSentAt
    });
  } catch (err) {
    console.error('Create/update reminder schedule error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * Delete a reminder schedule
 * DELETE /api/reminder-schedules/:id
 */
router.delete('/:id', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const schedule = await prisma.reminderSchedule.findUnique({
      where: { id },
      include: {
        // We need to check class ownership manually since there's no relation
      }
    });

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Verify access
    const classInfo = await prisma.class.findUnique({
      where: { id: schedule.classId },
      select: { teacherId: true }
    });

    const isAdmin = req.user.role === 'admin';
    const isTeacher = classInfo?.teacherId === req.user.id;
    const isInstructor = await prisma.classInstructor.findFirst({
      where: { classId: schedule.classId, userId: req.user.id }
    });

    if (!isAdmin && !isTeacher && !isInstructor) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.reminderSchedule.delete({
      where: { id }
    });

    res.json({ message: 'Schedule deleted' });
  } catch (err) {
    console.error('Delete reminder schedule error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * Toggle a reminder schedule on/off
 * PATCH /api/reminder-schedules/:id/toggle
 */
router.patch('/:id/toggle', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const schedule = await prisma.reminderSchedule.findUnique({
      where: { id }
    });

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Verify access
    const classInfo = await prisma.class.findUnique({
      where: { id: schedule.classId },
      select: { teacherId: true }
    });

    const isAdmin = req.user.role === 'admin';
    const isTeacher = classInfo?.teacherId === req.user.id;
    const isInstructor = await prisma.classInstructor.findFirst({
      where: { classId: schedule.classId, userId: req.user.id }
    });

    if (!isAdmin && !isTeacher && !isInstructor) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updated = await prisma.reminderSchedule.update({
      where: { id },
      data: { enabled: schedule.enabled === 1 ? 0 : 1 }
    });

    res.json({
      id: updated.id,
      enabled: updated.enabled === 1
    });
  } catch (err) {
    console.error('Toggle reminder schedule error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;

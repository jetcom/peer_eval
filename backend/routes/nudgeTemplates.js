const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken, requireTeacher } = require('../middleware/auth');

const router = express.Router();

/**
 * Get all nudge templates
 * GET /api/nudge-templates
 */
router.get('/', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const templates = await prisma.nudgeTemplate.findMany({
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' }
      ]
    });

    res.json(templates.map(t => ({
      id: t.id,
      name: t.name,
      subject: t.subject,
      message: t.message,
      is_default: t.isDefault === 1,
      created_by: t.createdById,
      created_at: t.createdAt,
      updated_at: t.updatedAt
    })));
  } catch (err) {
    console.error('Get nudge templates error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * Get a single nudge template
 * GET /api/nudge-templates/:id
 */
router.get('/:id', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const template = await prisma.nudgeTemplate.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({
      id: template.id,
      name: template.name,
      subject: template.subject,
      message: template.message,
      is_default: template.isDefault === 1,
      created_by: template.createdById,
      created_at: template.createdAt,
      updated_at: template.updatedAt
    });
  } catch (err) {
    console.error('Get nudge template error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * Create a new nudge template
 * POST /api/nudge-templates
 */
router.post('/', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { name, subject, message, is_default } = req.body;

    if (!name || !message) {
      return res.status(400).json({ error: 'Name and message are required' });
    }

    // If setting as default, unset any existing defaults
    if (is_default) {
      await prisma.nudgeTemplate.updateMany({
        where: { isDefault: 1 },
        data: { isDefault: 0 }
      });
    }

    const template = await prisma.nudgeTemplate.create({
      data: {
        name,
        subject: subject || 'Action Required: Incomplete Evaluations',
        message,
        isDefault: is_default ? 1 : 0,
        createdById: req.user.id
      }
    });

    res.status(201).json({
      id: template.id,
      name: template.name,
      subject: template.subject,
      message: template.message,
      is_default: template.isDefault === 1,
      created_by: template.createdById,
      created_at: template.createdAt
    });
  } catch (err) {
    console.error('Create nudge template error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * Update a nudge template
 * PUT /api/nudge-templates/:id
 */
router.put('/:id', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, subject, message, is_default } = req.body;

    const existing = await prisma.nudgeTemplate.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // If setting as default, unset any existing defaults
    if (is_default) {
      await prisma.nudgeTemplate.updateMany({
        where: { isDefault: 1, id: { not: id } },
        data: { isDefault: 0 }
      });
    }

    const template = await prisma.nudgeTemplate.update({
      where: { id },
      data: {
        name: name || existing.name,
        subject: subject || existing.subject,
        message: message || existing.message,
        isDefault: is_default !== undefined ? (is_default ? 1 : 0) : existing.isDefault,
        updatedAt: new Date()
      }
    });

    res.json({
      id: template.id,
      name: template.name,
      subject: template.subject,
      message: template.message,
      is_default: template.isDefault === 1,
      created_by: template.createdById,
      updated_at: template.updatedAt
    });
  } catch (err) {
    console.error('Update nudge template error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * Delete a nudge template
 * DELETE /api/nudge-templates/:id
 */
router.delete('/:id', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const existing = await prisma.nudgeTemplate.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await prisma.nudgeTemplate.delete({
      where: { id }
    });

    res.json({ message: 'Template deleted' });
  } catch (err) {
    console.error('Delete nudge template error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;

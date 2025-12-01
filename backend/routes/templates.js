const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken, requireTeacher } = require('../middleware/auth');

const router = express.Router();

// Helper to format template response
const formatTemplate = (t) => ({
  id: t.id,
  name: t.name,
  description: t.description,
  target_type: t.targetType,
  is_system: t.isSystem === 1,
  created_by: t.createdById,
  created_at: t.createdAt,
  criteria: t.criteria ? t.criteria.map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
    order_index: c.orderIndex,
    min_value: c.minValue,
    max_value: c.maxValue
  })) : []
});

// Get all templates (available to all authenticated users)
// Teachers/admins see system templates + their own templates
// Admins with ?all=true see all templates
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { target_type, all } = req.query;
    const isAdmin = req.user.role === 'admin';
    const isTeacher = req.user.role === 'teacher' || req.user.role === 'admin';

    // Build where clause
    const where = {};
    if (target_type) {
      where.targetType = target_type;
    }

    // If admin and requesting all, show all templates
    // Otherwise show system templates + user's own templates
    if (!(isAdmin && all === 'true')) {
      where.OR = [
        { isSystem: 1 },  // System templates
        { createdById: req.user.id }  // User's own templates
      ];
    }

    const templates = await prisma.evalTemplate.findMany({
      where,
      include: {
        criteria: {
          orderBy: { orderIndex: 'asc' }
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true }
        }
      },
      orderBy: [
        { isSystem: 'desc' },  // System templates first
        { name: 'asc' }
      ]
    });

    res.json(templates.map(t => ({
      ...formatTemplate(t),
      created_by_name: t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}` : null
    })));
  } catch (err) {
    console.error('Get templates error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get single template
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const template = await prisma.evalTemplate.findUnique({
      where: { id },
      include: {
        criteria: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(formatTemplate(template));
  } catch (err) {
    console.error('Get template error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create custom template (teachers and admins)
router.post('/', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { name, description, target_type, criteria } = req.body;

    if (!name || !target_type) {
      return res.status(400).json({ error: 'Name and target_type are required' });
    }

    if (!['individual', 'group'].includes(target_type)) {
      return res.status(400).json({ error: 'target_type must be "individual" or "group"' });
    }

    const template = await prisma.evalTemplate.create({
      data: {
        name,
        description: description || null,
        targetType: target_type,
        isSystem: 0,
        createdById: req.user.id,
        criteria: {
          create: (criteria || []).map((c, index) => ({
            name: c.name,
            description: c.description || null,
            orderIndex: c.order_index ?? index,
            minValue: c.min_value ?? 1,
            maxValue: c.max_value ?? 5
          }))
        }
      },
      include: {
        criteria: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    });

    res.json(formatTemplate(template));
  } catch (err) {
    console.error('Create template error:', err);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Update template (teachers can update their own, admins can update any non-system template)
router.put('/:id', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, target_type, criteria } = req.body;
    const isAdmin = req.user.role === 'admin';

    // Check if template exists and is not a system template
    const existing = await prisma.evalTemplate.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (existing.isSystem === 1) {
      return res.status(403).json({ error: 'Cannot modify system templates' });
    }

    // Check ownership - teachers can only edit their own templates, admins can edit any
    if (!isAdmin && existing.createdById !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit templates you created' });
    }

    // Update template and replace criteria
    await prisma.$transaction(async (tx) => {
      // Delete existing criteria
      await tx.evalTemplateCriterion.deleteMany({
        where: { templateId: id }
      });

      // Update template with new criteria
      await tx.evalTemplate.update({
        where: { id },
        data: {
          name: name || existing.name,
          description: description !== undefined ? description : existing.description,
          targetType: target_type || existing.targetType,
          criteria: {
            create: (criteria || []).map((c, index) => ({
              name: c.name,
              description: c.description || null,
              orderIndex: c.order_index ?? index,
              minValue: c.min_value ?? 1,
              maxValue: c.max_value ?? 5
            }))
          }
        }
      });
    });

    // Fetch updated template
    const updated = await prisma.evalTemplate.findUnique({
      where: { id },
      include: {
        criteria: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    });

    res.json(formatTemplate(updated));
  } catch (err) {
    console.error('Update template error:', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete template (teachers can delete their own, admins can delete any non-system template)
router.delete('/:id', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const isAdmin = req.user.role === 'admin';

    const existing = await prisma.evalTemplate.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (existing.isSystem === 1) {
      return res.status(403).json({ error: 'Cannot delete system templates' });
    }

    // Check ownership - teachers can only delete their own templates, admins can delete any
    if (!isAdmin && existing.createdById !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete templates you created' });
    }

    // Cascade delete will remove criteria
    await prisma.evalTemplate.delete({
      where: { id }
    });

    res.json({ message: 'Template deleted' });
  } catch (err) {
    console.error('Delete template error:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Duplicate a template (teachers and admins)
router.post('/:id/duplicate', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name } = req.body;

    const original = await prisma.evalTemplate.findUnique({
      where: { id },
      include: {
        criteria: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    });

    if (!original) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const newTemplate = await prisma.evalTemplate.create({
      data: {
        name: name || `${original.name} (Copy)`,
        description: original.description,
        targetType: original.targetType,
        isSystem: 0,
        createdById: req.user.id,
        criteria: {
          create: original.criteria.map(c => ({
            name: c.name,
            description: c.description,
            orderIndex: c.orderIndex,
            minValue: c.minValue,
            maxValue: c.maxValue
          }))
        }
      },
      include: {
        criteria: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    });

    res.json(formatTemplate(newTemplate));
  } catch (err) {
    console.error('Duplicate template error:', err);
    res.status(500).json({ error: 'Failed to duplicate template' });
  }
});

module.exports = router;

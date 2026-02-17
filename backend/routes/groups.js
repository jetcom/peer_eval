const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse');
const prisma = require('../lib/prisma');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Helper to format member response
const formatMember = (m) => ({
  id: m.id,
  email: m.email,
  first_name: m.firstName,
  last_name: m.lastName
});

// Helper to format group response
const formatGroup = (g) => ({
  id: g.id,
  name: g.name,
  class_id: g.classId,
  created_at: g.createdAt
});

// Get all groups (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const groups = await prisma.group.findMany({
      orderBy: { name: 'asc' }
    });

    res.json(groups.map(formatGroup));
  } catch (err) {
    console.error('Get groups error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get all groups with members (admin only)
router.get('/with-members', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const groups = await prisma.group.findMany({
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json(groups.map(g => ({
      ...formatGroup(g),
      members: g.members.map(m => formatMember(m.user))
    })));
  } catch (err) {
    console.error('Get groups with members error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get group with members
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json({
      ...formatGroup(group),
      members: group.members.map(m => ({
        id: m.user.id,
        email: m.user.email,
        name: `${m.user.firstName} ${m.user.lastName}`.trim()
      }))
    });
  } catch (err) {
    console.error('Get group error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get current user's group (optionally filtered by class)
// Admins/teachers can pass user_id to masquerade as a student
router.get('/my/group', authenticateToken, async (req, res) => {
  try {
    const { class_id, user_id } = req.query;

    // Allow admins/teachers to masquerade as a student
    const isTeacherOrAdmin = req.user.role === 'teacher' || req.user.role === 'admin';
    const targetUserId = (isTeacherOrAdmin && user_id) ? parseInt(user_id) : req.user.id;

    const whereClause = class_id
      ? { userId: targetUserId, group: { classId: parseInt(class_id) } }
      : { userId: targetUserId };

    const membership = await prisma.groupMember.findFirst({
      where: whereClause,
      include: {
        group: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!membership) {
      return res.status(404).json({ error: 'User is not in any group' });
    }

    const group = membership.group;
    const response = {
      ...formatGroup(group),
      members: group.members.map(m => formatMember(m.user))
    };

    // If group has a class_id, fetch class details including instructors
    if (group.classId) {
      const classData = await prisma.class.findUnique({
        where: { id: group.classId },
        include: {
          teacher: {
            select: {
              firstName: true,
              lastName: true
            }
          },
          instructors: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      });

      if (classData) {
        response.class = {
          id: classData.id,
          name: classData.name,
          section: classData.section,
          semester: classData.semester,
          teacher_id: classData.teacherId,
          num_phases: classData.numPhases,
          has_final_evaluation: classData.hasFinalEvaluation,
          due_date: classData.dueDate,
          due_date_timezone: classData.dueDateTimezone,
          archived: classData.archived,
          min_comment_words: classData.minCommentWords,
          evaluation_mode: classData.evaluationMode,
          allow_late: classData.allowLate,
          include_self_eval: classData.includeSelfEval,
          show_groups: classData.showGroups,
          created_at: classData.createdAt,
          teacher_name: `${classData.teacher.firstName} ${classData.teacher.lastName}`.trim(),
          instructors: classData.instructors.map(i => ({
            id: i.user.id,
            first_name: i.user.firstName,
            last_name: i.user.lastName,
            email: i.user.email
          }))
        };
      }
    }

    res.json(response);
  } catch (err) {
    console.error('Get my group error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create group (admin only, or teacher for their class)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, class_id } = req.body;

    // If class_id provided, check teacher owns the class
    if (class_id && req.user.role === 'teacher') {
      const classData = await prisma.class.findFirst({
        where: {
          id: parseInt(class_id),
          teacherId: req.user.id
        }
      });

      if (!classData) {
        return res.status(403).json({ error: 'Not authorized for this class' });
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin or teacher access required' });
    }

    const group = await prisma.group.create({
      data: {
        name,
        classId: class_id ? parseInt(class_id) : null
      }
    });

    res.json({
      id: group.id,
      name: group.name,
      class_id: group.classId
    });
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Add member to group (admin or teacher who owns the class)
router.post('/:id/members', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { userId } = req.body;
    const memberUserId = parseInt(userId);

    // Check if user has permission (admin or teacher who owns the class)
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        class: {
          select: { teacherId: true }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (req.user.role !== 'admin' && req.user.id !== group.class?.teacherId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // First remove user from any existing group in the same class
    if (group.classId) {
      // Get all groups in the same class
      const classGroups = await prisma.group.findMany({
        where: { classId: group.classId },
        select: { id: true }
      });
      const classGroupIds = classGroups.map(g => g.id);

      await prisma.groupMember.deleteMany({
        where: {
          userId: memberUserId,
          groupId: { in: classGroupIds }
        }
      });
    } else {
      await prisma.groupMember.deleteMany({
        where: { userId: memberUserId }
      });
    }

    // Add to new group
    await prisma.groupMember.create({
      data: {
        groupId: id,
        userId: memberUserId
      }
    });

    res.json({ message: 'Member added' });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// Remove member from group (admin or teacher who owns the class)
router.delete('/:id/members/:userId', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);

    // Check if user has permission (admin or teacher who owns the class)
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        class: {
          select: { teacherId: true }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (req.user.role !== 'admin' && req.user.id !== group.class?.teacherId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.groupMember.deleteMany({
      where: {
        groupId: id,
        userId: userId
      }
    });

    res.json({ message: 'Member removed' });
  } catch (err) {
    console.error('Remove member error:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Upload groups via CSV (admin only)
// CSV format: group_name,user_email
router.post('/upload-csv', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const errors = [];
  const createdGroups = [];

  try {
    const records = await new Promise((resolve, reject) => {
      parse(req.file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      }, (err, records) => {
        if (err) reject(err);
        else resolve(records);
      });
    });

    if (records.length === 0) {
      return res.json({ created: 0, errors: [] });
    }

    // Group records by group_name
    const groupMap = new Map();
    for (const record of records) {
      const { group_name, user_email } = record;
      if (!groupMap.has(group_name)) {
        groupMap.set(group_name, []);
      }
      groupMap.get(group_name).push(user_email);
    }

    // Process each group
    for (const [groupName, emails] of groupMap) {
      try {
        // Create or get group
        let group = await prisma.group.findFirst({
          where: { name: groupName }
        });

        if (!group) {
          group = await prisma.group.create({
            data: { name: groupName }
          });
          createdGroups.push({ id: group.id, name: groupName });
        }

        // Process members for this group
        for (const email of emails) {
          const user = await prisma.user.findUnique({
            where: { email }
          });

          if (!user) {
            errors.push({ group: groupName, email, error: 'User not found' });
            continue;
          }

          // Remove from any existing group first
          await prisma.groupMember.deleteMany({
            where: { userId: user.id }
          });

          // Add to new group
          await prisma.groupMember.upsert({
            where: {
              groupId_userId: {
                groupId: group.id,
                userId: user.id
              }
            },
            update: {},
            create: {
              groupId: group.id,
              userId: user.id
            }
          });
        }
      } catch (groupErr) {
        errors.push({ group: groupName, error: groupErr.message });
      }
    }

    res.json({ created: createdGroups.length, errors });
  } catch (err) {
    console.error('CSV parse error:', err);
    res.status(400).json({ error: 'Failed to parse CSV: ' + err.message });
  }
});

// Delete group (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // Prisma cascades will handle group_members deletion
    await prisma.group.delete({
      where: { id }
    });

    res.json({ message: 'Group deleted' });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

module.exports = router;

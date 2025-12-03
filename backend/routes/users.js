const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { parse } = require('csv-parse');
const prisma = require('../lib/prisma');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const emailService = require('../services/email');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get all users (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        universityId: true,
        role: true,
        protected: true,
        createdAt: true
      },
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' }
      ]
    });

    // Map to snake_case for backwards compatibility
    res.json(users.map(u => ({
      id: u.id,
      email: u.email,
      first_name: u.firstName,
      last_name: u.lastName,
      university_id: u.universityId,
      role: u.role,
      protected: u.protected,
      created_at: u.createdAt
    })));
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create user (admin only)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { email, password, first_name, last_name, role = 'student', sendWelcomeEmail: shouldSendEmail = true } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName: first_name,
        lastName: last_name,
        role,
        mustChangePassword: 1
      }
    });

    // Send welcome email with credentials
    if (shouldSendEmail) {
      try {
        await emailService.sendWelcomeEmail({
          user: {
            firstName: first_name,
            email,
            role
          },
          temporaryPassword: password
        });
      } catch (emailErr) {
        console.error('Failed to send welcome email:', emailErr);
      }
    }

    res.json({
      id: user.id,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      role: user.role
    });
  } catch (err) {
    console.error('Create user error:', err);
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Upload users via CSV (admin only)
// CSV format: #university_id, last_name, first_name, email, group_name#
router.post('/upload-csv', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const results = [];
  const errors = [];
  const credentials = [];

  // Preprocess CSV to strip # markers from start and end of lines
  let csvContent = req.file.buffer.toString('utf8');
  csvContent = csvContent.split('\n').map(line => {
    line = line.trim();
    if (line.startsWith('#')) line = line.substring(1);
    if (line.endsWith('#')) line = line.slice(0, -1);
    return line;
  }).join('\n');

  // Helper to get field value with flexible column names
  const getField = (record, ...names) => {
    for (const name of names) {
      if (record[name] !== undefined) return record[name];
      const lowerName = name.toLowerCase();
      for (const key of Object.keys(record)) {
        if (key.toLowerCase() === lowerName) return record[key];
      }
    }
    return undefined;
  };

  try {
    const records = await new Promise((resolve, reject) => {
      parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      }, (err, records) => {
        if (err) reject(err);
        else resolve(records);
      });
    });

    if (records.length === 0) {
      return res.json({ created: 0, errors: [], credentials: [] });
    }

    for (const record of records) {
      const university_id = getField(record, 'university_id', 'universityID', 'universityid', 'id', 'ID', 'student_id', 'OrgDefinedId', 'Org Defined Id');
      const last_name = getField(record, 'last_name', 'lastname', 'Last', 'last', 'surname', 'family_name', 'Last Name');
      const first_name = getField(record, 'first_name', 'firstname', 'First', 'first', 'given_name', 'First Name');
      const email = getField(record, 'email', 'Email', 'e-mail', 'EMAIL');
      const group_name = getField(record, 'group_name', 'group', 'Group', 'team', 'Team', 'Project Groups', 'Project Group');
      const role = getField(record, 'role', 'Role', 'type') || 'student';

      if (!email || !first_name || !last_name) {
        const missing = [];
        if (!email) missing.push('email');
        if (!first_name) missing.push('first_name/First');
        if (!last_name) missing.push('last_name/Last');
        errors.push({
          email: email || 'unknown',
          error: `Missing: ${missing.join(', ')}. Columns found: ${Object.keys(record).join(', ')}`
        });
        continue;
      }

      // Password: use university_id or auto-generate
      let generatedPassword;
      if (university_id) {
        generatedPassword = university_id;
      } else {
        const username = email.split('@')[0];
        generatedPassword = `${username}Pass123`;
      }
      const hashedPassword = bcrypt.hashSync(generatedPassword, 10);

      try {
        const user = await prisma.user.create({
          data: {
            email,
            password: hashedPassword,
            firstName: first_name,
            lastName: last_name,
            universityId: university_id || null,
            role: role || 'student',
            mustChangePassword: 1
          }
        });

        results.push({
          id: user.id,
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
          role: user.role
        });
        credentials.push({ email, password: generatedPassword });

        // If group_name is provided, add user to group
        if (group_name) {
          try {
            let group = await prisma.group.findFirst({
              where: { name: group_name }
            });

            if (!group) {
              group = await prisma.group.create({
                data: { name: group_name }
              });
            }

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
          } catch (groupErr) {
            console.error('Group assignment error:', groupErr);
          }
        }
      } catch (err) {
        if (err.code === 'P2002') {
          errors.push({ email, error: 'Email already exists' });
        } else {
          errors.push({ email, error: err.message });
        }
      }
    }

    res.json({ created: results.length, errors, credentials });
  } catch (err) {
    console.error('CSV parse error:', err);
    res.status(400).json({ error: 'Failed to parse CSV: ' + err.message });
  }
});

// Get pending teacher requests (admin only)
// NOTE: Must be defined BEFORE /:id routes to avoid route conflicts
router.get('/pending-teachers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pendingTeachers = await prisma.user.findMany({
      where: { role: 'pending_teacher' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        university: true,
        department: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(pendingTeachers.map(u => ({
      id: u.id,
      email: u.email,
      first_name: u.firstName,
      last_name: u.lastName,
      university: u.university,
      department: u.department,
      created_at: u.createdAt
    })));
  } catch (err) {
    console.error('Get pending teachers error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const user = await prisma.user.findUnique({
      where: { id },
      select: { protected: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.protected === 1) {
      return res.status(403).json({ error: 'Cannot delete protected admin account' });
    }

    await prisma.user.delete({
      where: { id }
    });

    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Approve pending teacher (admin only)
router.post('/:id/approve-teacher', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const user = await prisma.user.findUnique({
      where: { id },
      select: { role: true, email: true, firstName: true, lastName: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role !== 'pending_teacher') {
      return res.status(400).json({ error: 'User is not a pending teacher' });
    }

    await prisma.user.update({
      where: { id },
      data: { role: 'teacher' }
    });

    // Send approval email
    try {
      await emailService.notifyInstructorApproved({
        instructor: {
          firstName: user.firstName,
          email: user.email
        }
      });
    } catch (emailErr) {
      console.error('Failed to send approval email:', emailErr);
    }

    res.json({
      message: `${user.firstName} ${user.lastName} has been approved as an instructor`,
      user: {
        id,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        role: 'teacher'
      }
    });
  } catch (err) {
    console.error('Approve teacher error:', err);
    res.status(500).json({ error: 'Failed to approve teacher' });
  }
});

// Reject pending teacher (admin only)
router.post('/:id/reject-teacher', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { role: true, email: true, firstName: true, lastName: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role !== 'pending_teacher') {
      return res.status(400).json({ error: 'User is not a pending teacher' });
    }

    // Send rejection email before deleting
    try {
      await emailService.notifyInstructorRejected({
        instructor: {
          firstName: user.firstName,
          email: user.email
        },
        reason
      });
    } catch (emailErr) {
      console.error('Failed to send rejection email:', emailErr);
    }

    // Delete the user
    await prisma.user.delete({
      where: { id }
    });

    res.json({
      message: `${user.firstName} ${user.lastName}'s instructor request has been rejected`
    });
  } catch (err) {
    console.error('Reject teacher error:', err);
    res.status(500).json({ error: 'Failed to reject teacher' });
  }
});

// Generate a secure random password
function generateTempPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Reset user password (admin/teacher)
router.post('/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // Auto-generate a temporary password
    const tempPassword = generateTempPassword();
    const hashedPassword = bcrypt.hashSync(tempPassword, 10);

    // Get user info for email
    const user = await prisma.user.findUnique({
      where: { id },
      select: { email: true, firstName: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await prisma.user.update({
      where: { id },
      data: {
        password: hashedPassword,
        mustChangePassword: 1
      }
    });

    // Send password reset email
    try {
      await emailService.sendPasswordReset({
        user: {
          firstName: user.firstName,
          email: user.email
        },
        temporaryPassword: tempPassword
      });
    } catch (emailErr) {
      console.error('Failed to send password reset email:', emailErr);
    }

    res.json({ message: 'Password reset email sent. User must change password on next login.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;

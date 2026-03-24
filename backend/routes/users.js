const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { parse } = require('csv-parse');
const prisma = require('../lib/prisma');
const { authenticateToken, requireAdmin, JWT_SECRET } = require('../middleware/auth');
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

// ============================================
// Token-based approve/reject from email links
// ============================================

const REJECTION_REASONS = [
  'Not affiliated with a recognized educational institution',
  'Email domain does not match a known university',
  'Duplicate or existing account found',
  'Insufficient information provided',
  'University or department could not be verified',
];

function generateInstructorActionToken(userId) {
  return jwt.sign(
    { userId, purpose: 'instructor-review' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verifyInstructorActionToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.purpose !== 'instructor-review') return null;
    return decoded;
  } catch {
    return null;
  }
}

// One-click approve from email
router.get('/:id/approve-teacher-email', async (req, res) => {
  const token = req.query.token;
  const decoded = verifyInstructorActionToken(token);

  if (!decoded || decoded.userId !== parseInt(req.params.id)) {
    return res.status(400).send(renderActionPage('Invalid or Expired Link',
      'This approval link is invalid or has expired. Please log in to the admin dashboard to review pending instructors.', 'error'));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { role: true, email: true, firstName: true, lastName: true }
    });

    if (!user) {
      return res.send(renderActionPage('User Not Found',
        'This user no longer exists in the system.', 'error'));
    }

    if (user.role !== 'pending_teacher') {
      return res.send(renderActionPage('Already Processed',
        `${user.firstName} ${user.lastName} is no longer pending (current role: ${user.role}).`, 'info'));
    }

    await prisma.user.update({
      where: { id: decoded.userId },
      data: { role: 'teacher' }
    });

    try {
      await emailService.notifyInstructorApproved({
        instructor: { firstName: user.firstName, email: user.email }
      });
    } catch (emailErr) {
      console.error('Failed to send approval email:', emailErr);
    }

    res.send(renderActionPage('Instructor Approved',
      `<strong>${user.firstName} ${user.lastName}</strong> (${user.email}) has been approved as an instructor. They have been notified by email.`, 'success'));
  } catch (err) {
    console.error('Email approve teacher error:', err);
    res.status(500).send(renderActionPage('Error', 'Something went wrong. Please try again from the admin dashboard.', 'error'));
  }
});

// Reject form from email — shows reason picker
router.get('/:id/reject-teacher-email', async (req, res) => {
  const token = req.query.token;
  const decoded = verifyInstructorActionToken(token);

  if (!decoded || decoded.userId !== parseInt(req.params.id)) {
    return res.status(400).send(renderActionPage('Invalid or Expired Link',
      'This rejection link is invalid or has expired. Please log in to the admin dashboard to review pending instructors.', 'error'));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { role: true, email: true, firstName: true, lastName: true, university: true, department: true }
    });

    if (!user) {
      return res.send(renderActionPage('User Not Found',
        'This user no longer exists in the system.', 'error'));
    }

    if (user.role !== 'pending_teacher') {
      return res.send(renderActionPage('Already Processed',
        `${user.firstName} ${user.lastName} is no longer pending (current role: ${user.role}).`, 'info'));
    }

    const reasonOptions = REJECTION_REASONS.map(r =>
      `<option value="${r}">${r}</option>`
    ).join('\n');

    const formHtml = `
      <p>You are about to reject the instructor request from:</p>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <p style="margin: 4px 0;"><strong>Name:</strong> ${user.firstName} ${user.lastName}</p>
        <p style="margin: 4px 0;"><strong>Email:</strong> ${user.email}</p>
        <p style="margin: 4px 0;"><strong>University:</strong> ${user.university || 'Not specified'}</p>
        <p style="margin: 4px 0;"><strong>Department:</strong> ${user.department || 'Not specified'}</p>
      </div>
      <form method="POST" action="/api/users/${decoded.userId}/reject-teacher-email?token=${encodeURIComponent(token)}">
        <label style="display: block; font-weight: 600; margin-bottom: 6px;">Reason for rejection:</label>
        <select name="reason" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 15px; margin-bottom: 12px;">
          <option value="">— Select a reason —</option>
          ${reasonOptions}
          <option value="__other__">Other (specify below)</option>
        </select>
        <label style="display: block; font-weight: 600; margin-bottom: 6px;">Or enter a custom reason:</label>
        <textarea name="customReason" rows="3" placeholder="Optional — custom reason"
          style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 15px; box-sizing: border-box; margin-bottom: 16px;"></textarea>
        <button type="submit"
          style="background: #dc2626; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 16px; cursor: pointer;">
          Reject Instructor
        </button>
      </form>
    `;
    res.send(renderActionPage('Reject Instructor Request', formHtml, 'form'));
  } catch (err) {
    console.error('Email reject teacher form error:', err);
    res.status(500).send(renderActionPage('Error', 'Something went wrong. Please try again from the admin dashboard.', 'error'));
  }
});

// Handle reject form submission
router.post('/:id/reject-teacher-email', express.urlencoded({ extended: false }), async (req, res) => {
  const token = req.query.token;
  const decoded = verifyInstructorActionToken(token);

  if (!decoded || decoded.userId !== parseInt(req.params.id)) {
    return res.status(400).send(renderActionPage('Invalid or Expired Link',
      'This rejection link is invalid or has expired.', 'error'));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { role: true, email: true, firstName: true, lastName: true }
    });

    if (!user || user.role !== 'pending_teacher') {
      return res.send(renderActionPage('Already Processed',
        'This instructor request has already been processed.', 'info'));
    }

    const reason = (req.body.reason === '__other__' || !req.body.reason)
      ? (req.body.customReason || '').trim()
      : req.body.reason;

    try {
      await emailService.notifyInstructorRejected({
        instructor: { firstName: user.firstName, email: user.email },
        reason: reason || undefined
      });
    } catch (emailErr) {
      console.error('Failed to send rejection email:', emailErr);
    }

    await prisma.user.delete({ where: { id: decoded.userId } });

    res.send(renderActionPage('Instructor Rejected',
      `<strong>${user.firstName} ${user.lastName}</strong>'s instructor request has been rejected.${reason ? ` Reason: "${reason}"` : ''} They have been notified by email.`, 'success'));
  } catch (err) {
    console.error('Email reject teacher error:', err);
    res.status(500).send(renderActionPage('Error', 'Something went wrong. Please try again from the admin dashboard.', 'error'));
  }
});

function renderActionPage(title, body, type) {
  const colors = {
    success: { bg: '#f0fdf4', border: '#16a34a', icon: '&#10003;' },
    error: { bg: '#fef2f2', border: '#dc2626', icon: '&#10007;' },
    info: { bg: '#eff6ff', border: '#2563eb', icon: '&#8505;' },
    form: { bg: '#ffffff', border: '#6b7280', icon: '' },
  };
  const c = colors[type] || colors.info;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — PeerEvals</title></head>
<body style="margin:0;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);border-top:4px solid ${c.border};">
  <h2 style="margin:0 0 16px;color:#1a1a1a;">${c.icon ? `<span style="color:${c.border}">${c.icon}</span> ` : ''}${title}</h2>
  <div style="color:#374151;line-height:1.6;">${body}</div>
</div>
</body></html>`;
}

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

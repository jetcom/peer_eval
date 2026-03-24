const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');
const emailService = require('../services/email');
const { logActivityAsync, ACTIONS } = require('../services/activityLogger');

const router = express.Router();

// Helper to format user response
const formatUserResponse = (user) => ({
  id: user.id,
  email: user.email,
  first_name: user.firstName,
  last_name: user.lastName,
  name: `${user.firstName} ${user.lastName}`.trim(),
  role: user.role,
  mustChangePassword: user.mustChangePassword === 1
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if pending teacher
    if (user.role === 'pending_teacher') {
      return res.status(403).json({
        error: 'Your instructor account is pending approval. Please wait for an administrator to approve your registration.',
        pending: true
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.firstName,
        last_name: user.lastName
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log successful login
    logActivityAsync({
      userId: user.id,
      action: ACTIONS.LOGIN,
      req
    });

    res.json({
      token,
      user: formatUserResponse(user)
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        mustChangePassword: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(formatUserResponse(user));
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Register as instructor (pending approval)
router.post('/register-instructor', async (req, res) => {
  try {
    const { email, password, first_name, last_name, university, department } = req.body;

    if (!email || !password || !first_name || !last_name || !university || !department) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName: first_name,
        lastName: last_name,
        university,
        department,
        role: 'pending_teacher'
      }
    });

    // Notify admins about new instructor registration
    try {
      const admins = await prisma.user.findMany({
        where: { role: 'admin' },
        select: { email: true }
      });
      const adminEmails = admins.map(a => a.email);
      console.log('Found admins for new instructor notification:', adminEmails);

      if (adminEmails.length > 0) {
        const actionToken = jwt.sign(
          { userId: user.id, purpose: 'instructor-review' },
          JWT_SECRET,
          { expiresIn: '7d' }
        );
        const appUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
        const approveUrl = `${appUrl}/api/users/${user.id}/approve-teacher-email?token=${encodeURIComponent(actionToken)}`;
        const rejectUrl = `${appUrl}/api/users/${user.id}/reject-teacher-email?token=${encodeURIComponent(actionToken)}`;

        const result = await emailService.notifyAdminNewInstructor({
          adminEmails,
          instructor: {
            firstName: first_name,
            lastName: last_name,
            email,
            university,
            department
          },
          approveUrl,
          rejectUrl
        });
        console.log('Admin notification email result:', result);
      } else {
        console.warn('No admin users found to notify about new instructor registration');
      }
    } catch (emailErr) {
      console.error('Failed to send admin notification email:', emailErr);
      // Don't fail registration if email fails
    }

    res.json({
      message: 'Registration submitted. Your account is pending approval by an administrator.',
      user: {
        id: user.id,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        university: user.university,
        department: user.department,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Register instructor error:', err);
    res.status(500).json({ error: 'Failed to register' });
  }
});

// Change password
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { password: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: 0
      }
    });

    // Log password change
    logActivityAsync({
      userId: req.user.id,
      action: ACTIONS.PASSWORD_CHANGE,
      req
    });

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// Forgot password - request reset link
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If an account with that email exists, you will receive a password reset link.' });
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save token to user
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpires
      }
    });

    // Send email
    try {
      await emailService.sendForgotPasswordEmail({
        user: { firstName: user.firstName, email: user.email },
        resetToken
      });
    } catch (emailErr) {
      console.error('Failed to send forgot password email:', emailErr);
      // Don't expose email sending failure to user
    }

    res.json({ message: 'If an account with that email exists, you will receive a password reset link.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Find user with valid token
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpires: {
          gt: new Date()
        }
      }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    // Update password and clear token
    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
        mustChangePassword: 0
      }
    });

    // Log password reset
    logActivityAsync({
      userId: user.id,
      action: ACTIONS.PASSWORD_CHANGE,
      details: { method: 'forgot_password' }
    });

    res.json({ message: 'Password has been reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Test email endpoint (admin only)
router.post('/test-email', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Generate a dummy token for test email
    const testToken = jwt.sign(
      { userId: 0, purpose: 'instructor-review' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    const appUrl = process.env.FRONTEND_URL || 'http://localhost:3002';

    const result = await emailService.notifyAdminNewInstructor({
      adminEmails: [req.user.email],
      approveUrl: `${appUrl}/api/users/0/approve-teacher-email?token=${encodeURIComponent(testToken)}`,
      rejectUrl: `${appUrl}/api/users/0/reject-teacher-email?token=${encodeURIComponent(testToken)}`,
      instructor: {
        firstName: 'Test',
        lastName: 'Instructor',
        email: 'test@example.com',
        university: 'Test University',
        department: 'Test Department'
      }
    });

    res.json({ message: 'Test email sent', result });
  } catch (err) {
    console.error('Test email error:', err);
    res.status(500).json({ error: 'Failed to send test email', details: err.message });
  }
});

module.exports = router;

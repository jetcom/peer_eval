const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

const APP_URL = process.env.FRONTEND_URL || 'http://localhost:3002';

/**
 * Signed one-click links for reviewing a pending instructor from email.
 * Shared by the new-registration notice and the follow-up digest.
 */
function buildInstructorActionLinks(userId) {
  const token = jwt.sign(
    { userId, purpose: 'instructor-review' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  const t = encodeURIComponent(token);
  return {
    approveUrl: `${APP_URL}/api/users/${userId}/approve-teacher-email?token=${t}`,
    rejectUrl: `${APP_URL}/api/users/${userId}/reject-teacher-email?token=${t}`,
    vetUrl: `${APP_URL}/api/users/${userId}/vet-email?token=${t}`
  };
}

module.exports = { buildInstructorActionLinks };

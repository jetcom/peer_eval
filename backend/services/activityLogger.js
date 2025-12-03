const prisma = require('../lib/prisma');

/**
 * Activity Logger Service
 *
 * Tracks user actions for teacher/admin visibility.
 * Actions are logged asynchronously to avoid blocking requests.
 */

// Action type constants
const ACTIONS = {
  // Authentication
  LOGIN: 'login',
  LOGIN_SSO: 'login_sso',
  LOGOUT: 'logout',
  PASSWORD_CHANGE: 'password_change',

  // Evaluations
  VIEW_EVALUATIONS: 'view_evaluations',
  START_EVALUATION: 'start_evaluation',
  SUBMIT_EVALUATION: 'submit_evaluation',
  UPDATE_EVALUATION: 'update_evaluation',
  SUBMIT_FINAL_COMMENT: 'submit_final_comment',
  UPDATE_FINAL_COMMENT: 'update_final_comment',

  // Navigation
  VIEW_DASHBOARD: 'view_dashboard',
  VIEW_CLASS: 'view_class',
  VIEW_GROUP: 'view_group',
  VIEW_ASSIGNMENT: 'view_assignment',

  // Admin actions
  VIEW_PROGRESS: 'view_progress',
  VIEW_REPORTS: 'view_reports',
  SEND_NUDGE: 'send_nudge',
};

/**
 * Log a user activity
 *
 * @param {Object} params
 * @param {number} params.userId - User ID
 * @param {string} params.action - Action type (from ACTIONS)
 * @param {number} [params.classId] - Optional class context
 * @param {Object} [params.details] - Additional details (will be JSON stringified)
 * @param {Object} [params.req] - Express request object (for IP and user agent)
 */
async function logActivity({ userId, action, classId = null, details = null, req = null }) {
  try {
    // Get IP and user agent from request if provided
    let ipAddress = null;
    let userAgent = null;

    if (req) {
      // Handle proxied requests (Railway, nginx, etc.)
      ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.headers['x-real-ip']
        || req.connection?.remoteAddress
        || req.ip;
      userAgent = req.headers['user-agent'];
    }

    await prisma.activityLog.create({
      data: {
        userId,
        classId,
        action,
        details: details ? JSON.stringify(details) : null,
        ipAddress,
        userAgent: userAgent?.substring(0, 500) // Limit user agent length
      }
    });
  } catch (err) {
    // Log errors but don't throw - activity logging shouldn't break the app
    console.error('[ActivityLogger] Error logging activity:', err);
  }
}

/**
 * Log activity asynchronously (fire and forget)
 * Use this for most cases to avoid blocking the response
 */
function logActivityAsync(params) {
  // Fire and forget - don't await
  logActivity(params).catch(err => {
    console.error('[ActivityLogger] Async logging error:', err);
  });
}

/**
 * Get user's last login time
 */
async function getLastLogin(userId) {
  const lastLogin = await prisma.activityLog.findFirst({
    where: {
      userId,
      action: { in: [ACTIONS.LOGIN, ACTIONS.LOGIN_SSO] }
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, ipAddress: true }
  });
  return lastLogin;
}

/**
 * Get activity summary for a user in a class
 */
async function getUserActivitySummary(userId, classId) {
  const [lastLogin, lastActivity, evaluationCount] = await Promise.all([
    // Last login
    prisma.activityLog.findFirst({
      where: {
        userId,
        action: { in: [ACTIONS.LOGIN, ACTIONS.LOGIN_SSO] }
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    }),

    // Last activity in this class
    prisma.activityLog.findFirst({
      where: { userId, classId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, action: true }
    }),

    // Count of evaluation submissions in this class
    prisma.activityLog.count({
      where: {
        userId,
        classId,
        action: { in: [ACTIONS.SUBMIT_EVALUATION, ACTIONS.UPDATE_EVALUATION] }
      }
    })
  ]);

  return {
    lastLogin: lastLogin?.createdAt,
    lastClassActivity: lastActivity?.createdAt,
    lastAction: lastActivity?.action,
    evaluationSubmissions: evaluationCount
  };
}

module.exports = {
  ACTIONS,
  logActivity,
  logActivityAsync,
  getLastLogin,
  getUserActivitySummary
};

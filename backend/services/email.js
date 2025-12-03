const { Resend } = require('resend');

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY);

// Default from address - use your verified domain
const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || 'PeerEvals <noreply@peerevals.app>';
const APP_URL = process.env.FRONTEND_URL || 'http://localhost:3002';

/**
 * Send an email using Resend
 * @param {Object} options - Email options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} [options.text] - Plain text content (optional)
 * @param {string} [options.from] - From address (optional)
 * @returns {Promise<Object>} - Resend response
 */
async function sendEmail({ to, subject, html, text, from = DEFAULT_FROM }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set - email not sent:', { to, subject });
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || stripHtml(html),
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error };
    }

    console.log('Email sent successfully:', { id: data?.id, to, subject });
    return { success: true, data };
  } catch (err) {
    console.error('Failed to send email:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Delay helper for rate limiting between batch requests
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Strip HTML tags for plain text version
 */
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

// ============================================
// EMAIL TEMPLATES
// ============================================

/**
 * Notify admins when a new instructor registers
 */
async function notifyAdminNewInstructor({ adminEmails, instructor }) {
  const { firstName, lastName, email, university, department } = instructor;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">New Instructor Registration</h2>
      <p>A new instructor has registered and is awaiting approval:</p>

      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Name:</strong> ${firstName} ${lastName}</p>
        <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
        <p style="margin: 5px 0;"><strong>University:</strong> ${university || 'Not specified'}</p>
        <p style="margin: 5px 0;"><strong>Department:</strong> ${department || 'Not specified'}</p>
      </div>

      <p>
        <a href="${APP_URL}/admin/users"
           style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Review Pending Instructors
        </a>
      </p>

      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        — PeerEvals System
      </p>
    </div>
  `;

  return sendEmail({
    to: adminEmails,
    subject: `New Instructor Registration: ${firstName} ${lastName}`,
    html,
  });
}

/**
 * Notify instructor when their account is approved
 */
async function notifyInstructorApproved({ instructor }) {
  const { firstName, email } = instructor;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Your Account Has Been Approved!</h2>
      <p>Hi ${firstName},</p>
      <p>Great news! Your instructor account on PeerEvals has been approved. You can now log in and start creating classes for peer evaluations.</p>

      <p>
        <a href="${APP_URL}/login"
           style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Log In Now
        </a>
      </p>

      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        — The PeerEvals Team
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'Your PeerEvals Instructor Account Has Been Approved',
    html,
  });
}

/**
 * Notify instructor when their account is rejected
 */
async function notifyInstructorRejected({ instructor, reason }) {
  const { firstName, email } = instructor;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Instructor Account Request Update</h2>
      <p>Hi ${firstName},</p>
      <p>Unfortunately, your instructor account request for PeerEvals was not approved at this time.</p>

      ${reason ? `
        <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
          <p style="margin: 0;"><strong>Reason:</strong> ${reason}</p>
        </div>
      ` : ''}

      <p>If you believe this was in error or have questions, please contact your administrator.</p>

      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        — The PeerEvals Team
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'PeerEvals Instructor Account Request Update',
    html,
  });
}

/**
 * Send evaluation reminder to student
 */
async function sendEvaluationReminder({ student, className, dueDate, assignmentName, evaluationsRemaining }) {
  const { firstName, email } = student;
  const formattedDate = new Date(dueDate).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Evaluation Reminder</h2>
      <p>Hi ${firstName},</p>
      <p>This is a friendly reminder that you have peer evaluations due soon:</p>

      <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
        <p style="margin: 5px 0;"><strong>Class:</strong> ${className}</p>
        ${assignmentName ? `<p style="margin: 5px 0;"><strong>Assignment:</strong> ${assignmentName}</p>` : ''}
        <p style="margin: 5px 0;"><strong>Due:</strong> ${formattedDate}</p>
        ${evaluationsRemaining ? `<p style="margin: 5px 0;"><strong>Evaluations Remaining:</strong> ${evaluationsRemaining}</p>` : ''}
      </div>

      <p>
        <a href="${APP_URL}/evaluations"
           style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Complete Your Evaluations
        </a>
      </p>

      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        — PeerEvals System
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `Reminder: Peer Evaluations Due for ${className}`,
    html,
  });
}

/**
 * Send nudge email to student who hasn't completed evaluations
 */
async function sendNudgeEmail({ student, className, assignmentName, message, instructorName }) {
  const { firstName, email } = student;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">A Message About Your Peer Evaluations</h2>
      <p>Hi ${firstName},</p>

      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Class:</strong> ${className}</p>
        ${assignmentName ? `<p style="margin: 5px 0;"><strong>Assignment:</strong> ${assignmentName}</p>` : ''}
      </div>

      ${message ? `
        <div style="background: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
          <p style="margin: 0; white-space: pre-wrap;">${message}</p>
        </div>
      ` : `
        <p>You have incomplete peer evaluations that need your attention. Please log in and complete them as soon as possible.</p>
      `}

      <p>
        <a href="${APP_URL}/evaluations"
           style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Complete Your Evaluations
        </a>
      </p>

      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        — ${instructorName || 'Your Instructor'}
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `Action Required: Incomplete Evaluations for ${className}`,
    html,
  });
}

/**
 * Build nudge email HTML for a student
 */
function buildNudgeEmailHtml({ student, className, assignmentName, message, instructorName }) {
  const { firstName } = student;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">A Message About Your Peer Evaluations</h2>
      <p>Hi ${firstName},</p>

      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Class:</strong> ${className}</p>
        ${assignmentName ? `<p style="margin: 5px 0;"><strong>Assignment:</strong> ${assignmentName}</p>` : ''}
      </div>

      ${message ? `
        <div style="background: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
          <p style="margin: 0; white-space: pre-wrap;">${message}</p>
        </div>
      ` : `
        <p>You have incomplete peer evaluations that need your attention. Please log in and complete them as soon as possible.</p>
      `}

      <p>
        <a href="${APP_URL}/evaluations"
           style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Complete Your Evaluations
        </a>
      </p>

      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        — ${instructorName || 'Your Instructor'}
      </p>
    </div>
  `;
}

/**
 * Send bulk nudge emails to multiple students using Resend batch API
 * Batch API allows up to 100 emails per request
 */
async function sendBulkNudge({ students, className, assignmentName, message, instructorName, subject }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set - bulk emails not sent');
    return { successful: 0, failed: students.length, total: students.length };
  }

  if (students.length === 0) {
    return { successful: 0, failed: 0, total: 0 };
  }

  // Build array of email objects for batch sending
  const emailSubject = subject || `Action Required: Incomplete Evaluations for ${className}`;
  const emails = students.map(student => {
    const html = buildNudgeEmailHtml({ student, className, assignmentName, message, instructorName });
    return {
      from: DEFAULT_FROM,
      to: [student.email],
      subject: emailSubject,
      html,
      text: stripHtml(html),
    };
  });

  // Resend batch API supports up to 100 emails per request
  // Rate limit: 2 requests/second, so we delay 600ms between batches
  const BATCH_SIZE = 100;
  const DELAY_BETWEEN_BATCHES_MS = 600;
  let successful = 0;
  let failed = 0;

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);

    try {
      const { data, error } = await resend.batch.send(batch);

      if (error) {
        console.error('Resend batch error:', error);
        failed += batch.length;
      } else {
        // data is an array of results for each email
        successful += data?.length || batch.length;
        console.log(`Batch sent: ${data?.length || batch.length} emails`);
      }
    } catch (err) {
      console.error('Failed to send batch:', err);
      failed += batch.length;
    }

    // Delay before next batch to respect rate limit (except after the last batch)
    if (i + BATCH_SIZE < emails.length) {
      await delay(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  return { successful, failed, total: students.length };
}

/**
 * Send password reset email
 */
async function sendPasswordReset({ user, temporaryPassword }) {
  const { firstName, email } = user;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Your Password Has Been Reset</h2>
      <p>Hi ${firstName},</p>
      <p>Your password has been reset by an administrator. Please use the temporary password below to log in:</p>

      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
        <p style="margin: 0; font-size: 24px; font-family: monospace; letter-spacing: 2px;">${temporaryPassword}</p>
      </div>

      <p><strong>You will be required to change your password upon login.</strong></p>

      <p>
        <a href="${APP_URL}/login"
           style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Log In Now
        </a>
      </p>

      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        If you did not request this reset, please contact your administrator immediately.
      </p>

      <p style="color: #666; font-size: 14px;">
        — PeerEvals System
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'Your PeerEvals Password Has Been Reset',
    html,
  });
}

/**
 * Send welcome email to new user
 */
async function sendWelcomeEmail({ user, temporaryPassword }) {
  const { firstName, email, role } = user;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Welcome to PeerEvals!</h2>
      <p>Hi ${firstName},</p>
      <p>An account has been created for you on PeerEvals${role === 'student' ? ' for peer evaluation submissions' : ''}.</p>

      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
        <p style="margin: 5px 0;"><strong>Temporary Password:</strong></p>
        <p style="margin: 10px 0; font-size: 20px; font-family: monospace; letter-spacing: 2px;">${temporaryPassword}</p>
      </div>

      <p><strong>You will be required to change your password upon your first login.</strong></p>

      <p>
        <a href="${APP_URL}/login"
           style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Log In Now
        </a>
      </p>

      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        — The PeerEvals Team
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'Welcome to PeerEvals - Your Account is Ready',
    html,
  });
}

/**
 * Build reminder email HTML for a student
 */
function buildReminderEmailHtml({ student, className, dueDate, assignmentName, evaluationsRemaining }) {
  const { firstName } = student;
  const formattedDate = new Date(dueDate).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Evaluation Reminder</h2>
      <p>Hi ${firstName},</p>
      <p>This is a friendly reminder that you have peer evaluations due soon:</p>

      <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
        <p style="margin: 5px 0;"><strong>Class:</strong> ${className}</p>
        ${assignmentName ? `<p style="margin: 5px 0;"><strong>Assignment:</strong> ${assignmentName}</p>` : ''}
        <p style="margin: 5px 0;"><strong>Due:</strong> ${formattedDate}</p>
        ${evaluationsRemaining ? `<p style="margin: 5px 0;"><strong>Evaluations Remaining:</strong> ${evaluationsRemaining}</p>` : ''}
      </div>

      <p>
        <a href="${APP_URL}/evaluations"
           style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Complete Your Evaluations
        </a>
      </p>

      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        — PeerEvals System
      </p>
    </div>
  `;
}

/**
 * Send bulk reminder emails to multiple students using Resend batch API
 */
async function sendBulkReminders({ students, className, dueDate, assignmentName }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set - bulk reminders not sent');
    return { successful: 0, failed: students.length, total: students.length };
  }

  if (students.length === 0) {
    return { successful: 0, failed: 0, total: 0 };
  }

  // Build array of email objects for batch sending
  const emails = students.map(student => {
    const html = buildReminderEmailHtml({ student, className, dueDate, assignmentName });
    return {
      from: DEFAULT_FROM,
      to: [student.email],
      subject: `Reminder: Peer Evaluations Due for ${className}`,
      html,
      text: stripHtml(html),
    };
  });

  // Resend batch API supports up to 100 emails per request
  // Rate limit: 2 requests/second, so we delay 600ms between batches
  const BATCH_SIZE = 100;
  const DELAY_BETWEEN_BATCHES_MS = 600;
  let successful = 0;
  let failed = 0;

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);

    try {
      const { data, error } = await resend.batch.send(batch);

      if (error) {
        console.error('Resend batch error:', error);
        failed += batch.length;
      } else {
        successful += data?.length || batch.length;
        console.log(`Reminder batch sent: ${data?.length || batch.length} emails`);
      }
    } catch (err) {
      console.error('Failed to send reminder batch:', err);
      failed += batch.length;
    }

    // Delay before next batch to respect rate limit (except after the last batch)
    if (i + BATCH_SIZE < emails.length) {
      await delay(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  return { successful, failed, total: students.length };
}

/**
 * Send evaluation completion confirmation
 */
async function sendEvaluationConfirmation({ student, className, assignmentName, phase }) {
  const { firstName, email } = student;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #16a34a;">Evaluation Submitted Successfully</h2>
      <p>Hi ${firstName},</p>
      <p>Your peer evaluation has been successfully submitted.</p>

      <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
        <p style="margin: 5px 0;"><strong>Class:</strong> ${className}</p>
        ${assignmentName ? `<p style="margin: 5px 0;"><strong>Assignment:</strong> ${assignmentName}</p>` : ''}
        ${phase ? `<p style="margin: 5px 0;"><strong>Phase:</strong> ${phase}</p>` : ''}
        <p style="margin: 5px 0;"><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
      </div>

      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        — PeerEvals System
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `Evaluation Submitted: ${className}`,
    html,
  });
}

module.exports = {
  sendEmail,
  notifyAdminNewInstructor,
  notifyInstructorApproved,
  notifyInstructorRejected,
  sendEvaluationReminder,
  sendNudgeEmail,
  sendBulkNudge,
  sendBulkReminders,
  sendPasswordReset,
  sendWelcomeEmail,
  sendEvaluationConfirmation,
};

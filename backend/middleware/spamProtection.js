const rateLimit = require('express-rate-limit');

/**
 * Spam protection for public, unauthenticated endpoints that send email
 * (instructor registration in particular).
 *
 * Layers:
 *  1. Rate limit per IP.
 *  2. Honeypot field: bots fill every input, humans never see it.
 *  3. Content validation: reject URLs / link shorteners in name fields,
 *     malformed emails, and oversized values.
 */

/**
 * Real visitor IP. Traffic path is Cloudflare -> Railway edge -> app, so
 * req.ip (with trust proxy = 1) is Cloudflare's address, not the visitor's.
 * Cloudflare sets CF-Connecting-IP to the true client; fall back to req.ip
 * for requests that bypass Cloudflare (e.g. the raw *.up.railway.app host).
 * IPv6 is collapsed to its /64 so one visitor can't rotate within a block.
 */
function clientIp(req) {
  const raw = (req.headers['cf-connecting-ip'] || req.ip || '').toString().trim();
  if (raw.includes(':') && !raw.startsWith('::ffff:')) {
    // IPv6: keep the first 4 hextets (/64)
    const full = raw.split('%')[0];
    const parts = full.split('::');
    const head = parts[0].split(':').filter(Boolean);
    while (head.length < 4) head.push('0');
    return head.slice(0, 4).join(':') + '::/64';
  }
  return raw.replace(/^::ffff:/, '');
}

const limiterDefaults = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: clientIp
};

const registrationLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  message: { error: 'Too many registration attempts. Please try again later.' }
});

const forgotPasswordLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  message: { error: 'Too many password reset requests. Please try again later.' }
});

// Name of the hidden form field. Anything in it means a bot submitted the form.
const HONEYPOT_FIELD = 'website';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// URLs, link shorteners, and the usual "click here" markers that never
// belong in a person's name, university, or department.
const LINK_RE = /(https?:\/\/|www\.|bit\.ly|tinyurl|t\.co\/|goo\.gl|cutt\.ly|\.[a-z]{2,6}\/\S)/i;

// Emoji / pictographs and other symbol blocks commonly used in spam.
const EMOJI_RE = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/u;

const MAX_LEN = { first_name: 100, last_name: 100, university: 200, department: 200, email: 254 };

/**
 * Returns an error string if the registration payload looks like spam or is
 * malformed, otherwise null.
 */
function validateRegistrationPayload(body) {
  const { email, first_name, last_name, university, department } = body;

  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return 'Please enter a valid email address';
  }

  const textFields = { first_name, last_name, university, department };
  for (const [field, value] of Object.entries(textFields)) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return 'All fields are required';
    }
    if (value.length > MAX_LEN[field]) {
      return `${field.replace('_', ' ')} is too long`;
    }
    if (LINK_RE.test(value) || EMOJI_RE.test(value)) {
      return `${field.replace('_', ' ')} contains invalid characters`;
    }
  }

  if (email.length > MAX_LEN.email) {
    return 'Please enter a valid email address';
  }

  return null;
}

/**
 * Express middleware: silently "accept" honeypot submissions and reject
 * payloads that fail content validation.
 */
function registrationSpamFilter(req, res, next) {
  const honeypot = req.body?.[HONEYPOT_FIELD];
  if (typeof honeypot === 'string' && honeypot.trim().length > 0) {
    console.warn('Honeypot triggered on registration from', req.ip, 'email:', req.body?.email);
    // Look like success so the bot moves on; nothing is stored or emailed.
    return res.json({
      message: 'Registration submitted. Your account is pending approval by an administrator.'
    });
  }

  const error = validateRegistrationPayload(req.body || {});
  if (error) {
    console.warn('Registration rejected by spam filter from', req.ip, ':', error, '| email:', req.body?.email);
    return res.status(400).json({ error });
  }

  next();
}

module.exports = {
  registrationLimiter,
  forgotPasswordLimiter,
  registrationSpamFilter,
  validateRegistrationPayload,
  clientIp,
  HONEYPOT_FIELD,
  LINK_RE,
  EMOJI_RE
};

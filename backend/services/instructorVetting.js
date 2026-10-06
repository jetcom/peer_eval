/**
 * Instructor vetting: cheap, explainable signals about whether a pending
 * instructor request is plausibly a real person at the school they named.
 *
 * Produces { score 0-100, level 'high'|'medium'|'low', signals: [...] }.
 * Each signal is { key, status: 'pass'|'warn'|'fail', label, detail }.
 * No signal is proof; the point is to give an admin a quick, honest read.
 */
const dns = require('dns').promises;
const prisma = require('../lib/prisma');
const { LINK_RE, EMOJI_RE } = require('../middleware/spamProtection');

const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'hotmail.com',
  'hotmail.co.uk', 'outlook.com', 'outlook.co.uk', 'live.com', 'msn.com', 'aol.com',
  'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me', 'pm.me', 'mail.com',
  'yandex.com', 'yandex.ru', 'gmx.com', 'gmx.de', 'zoho.com', 'qq.com', '163.com', '126.com',
  'mail.ru', 'inbox.com', 'fastmail.com', 'hey.com', 'tutanota.com', 'duck.com'
]);

// .edu, .edu.xx, .ac.xx, .edu.au, etc.
const ACADEMIC_DOMAIN_RE = /(^|\.)(edu|ac)(\.[a-z]{2,3})?$/i;

const NAME_RE = /^\p{L}[\p{L}\p{M}\s.'’-]{0,59}$/u;

const UNIVERSITY_STOPWORDS = new Set([
  'the', 'of', 'and', 'for', 'at', 'in', 'de', 'la', 'del', 'des', 'du', 'university', 'universidad',
  'universite', 'université', 'universität', 'college', 'school', 'institute', 'technology', 'state',
  'high', 'community', 'national', 'international', 'department', 'faculty'
]);

const DIRECTORY_URL = 'http://universities.hipolabs.com/search?name=';

function emailDomain(email) {
  const at = String(email || '').lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).trim().toLowerCase();
}

function domainMatches(candidate, listed) {
  candidate = candidate.toLowerCase();
  listed = listed.toLowerCase();
  return candidate === listed || candidate.endsWith('.' + listed) || listed.endsWith('.' + candidate);
}

function registrableLabel(domain) {
  // crude "second-level" label: strip the TLD (and a 2-letter country code if present)
  const parts = domain.split('.');
  if (parts.length >= 3 && parts[parts.length - 1].length === 2) parts.splice(-2, 2);
  else parts.pop();
  return parts.join('');
}

function universityTokens(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t && !UNIVERSITY_STOPWORDS.has(t));
}

async function withTimeout(promise, ms, fallback) {
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(fallback), ms); });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function lookupUniversity(name) {
  if (!name || typeof fetch !== 'function') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(DIRECTORY_URL + encodeURIComponent(name.trim()), { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data.slice(0, 10) : [];
  } catch {
    return null; // directory unavailable; treat as unknown, not as a failure
  } finally {
    clearTimeout(timer);
  }
}

async function hasMxRecords(domain) {
  if (!domain) return false;
  const records = await withTimeout(dns.resolveMx(domain).catch(() => []), 4000, []);
  return Array.isArray(records) && records.length > 0;
}

/**
 * @param {object} user  { email, firstName, lastName, university, department }
 */
async function vetInstructor(user) {
  const signals = [];
  let score = 30; // neutral starting point
  const push = (key, status, label, detail, delta) => {
    signals.push({ key, status, label, detail });
    score += delta;
  };

  const domain = emailDomain(user.email);
  const fields = [user.firstName, user.lastName, user.university, user.department];

  // 1. Spam markers anywhere
  const spammy = fields.some(v => typeof v === 'string' && (LINK_RE.test(v) || EMOJI_RE.test(v)));
  if (spammy) {
    push('spam', 'fail', 'Spam markers present', 'Name, university, or department contains a link or emoji.', -60);
  }

  // 2. Name plausibility
  const namesOk = NAME_RE.test(user.firstName || '') && NAME_RE.test(user.lastName || '');
  push('name', namesOk ? 'pass' : 'fail', 'Name looks like a name',
    namesOk ? 'First and last name contain only letters and normal punctuation.' : 'Name contains digits, symbols, or is unusually long.',
    namesOk ? 5 : -15);

  // 3. Email domain type
  if (!domain) {
    push('domain', 'fail', 'Email address is malformed', 'No domain could be read from the email.', -30);
  } else if (FREE_MAIL_DOMAINS.has(domain)) {
    push('domain', 'warn', 'Personal email provider', `${domain} is a free consumer mail service, not an institutional address.`, -10);
  } else if (ACADEMIC_DOMAIN_RE.test(domain)) {
    push('domain', 'pass', 'Academic email domain', `${domain} uses an education top-level domain.`, 25);
  } else {
    push('domain', 'warn', 'Custom email domain', `${domain} is not a known consumer provider, but is not an .edu/.ac domain either.`, 0);
  }

  // 4. Does the email domain receive mail at all?
  if (domain) {
    const mx = await hasMxRecords(domain);
    push('mx', mx ? 'pass' : 'fail', mx ? 'Domain accepts email' : 'Domain has no mail servers',
      mx ? `${domain} has MX records.` : `${domain} has no MX records, so the address cannot receive mail.`,
      mx ? 5 : -25);
  }

  // 5. University directory lookup + domain match
  let directoryMatched = false;
  const results = await lookupUniversity(user.university);
  if (results === null) {
    push('directory', 'warn', 'University directory unavailable', 'Could not reach the university directory to confirm the school’s domain.', 0);
  } else if (results.length === 0) {
    push('directory', 'warn', 'School not found in directory', `"${user.university}" did not match any institution in the public university directory. Smaller schools and high schools are often missing.`, 0);
  } else {
    const hit = results.find(r => (r.domains || []).some(d => domain && domainMatches(domain, d)));
    if (hit) {
      directoryMatched = true;
      push('directory', 'pass', 'Email domain matches the school', `${domain} is a listed domain for ${hit.name}${hit.country ? ` (${hit.country})` : ''}.`, 35);
    } else {
      const sample = [...new Set(results.flatMap(r => r.domains || []))].slice(0, 4).join(', ');
      push('directory', 'fail', 'Email domain does not match the school',
        `Directory lists ${sample || 'other domains'} for "${results[0].name}". The applicant used ${domain || 'an unreadable address'}.`, -15);
    }
  }

  // 6. Fallback name/domain heuristic when the directory could not confirm
  if (!directoryMatched && domain && !FREE_MAIL_DOMAINS.has(domain)) {
    const label = registrableLabel(domain);
    const tokens = universityTokens(user.university);
    const initials = tokens.map(t => t[0]).join('');
    const tokenHit = tokens.find(t => t.length >= 3 && label.includes(t));
    const initialsHit = initials.length >= 3 && label.includes(initials);
    if (tokenHit || initialsHit) {
      push('heuristic', 'pass', 'Domain resembles the school name',
        `"${label}" ${initialsHit ? `contains the initials "${initials}"` : `contains "${tokenHit}"`} from "${user.university}".`, 15);
    }
  }

  // 7. Known colleagues
  if (domain && !FREE_MAIL_DOMAINS.has(domain)) {
    const colleagues = await prisma.user.count({
      where: { role: 'teacher', email: { endsWith: '@' + domain } }
    }).catch(() => 0);
    if (colleagues > 0) {
      push('colleagues', 'pass', 'Approved instructors share this domain',
        `${colleagues} approved instructor${colleagues === 1 ? '' : 's'} already use @${domain}.`, 15);
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = spammy ? 'low' : score >= 65 ? 'high' : score >= 35 ? 'medium' : 'low';
  return { score, level, signals, checkedAt: new Date().toISOString() };
}

const LEVEL_LABEL = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };
const LEVEL_COLOR = { high: '#16a34a', medium: '#d97706', low: '#dc2626' };

module.exports = { vetInstructor, LEVEL_LABEL, LEVEL_COLOR };

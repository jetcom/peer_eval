/**
 * When someone registers as an instructor but is really a student, find the
 * student account they should be using. Students often sign up with a
 * variant address (g.rit.edu vs rit.edu, mail.school.edu vs school.edu), so
 * we match on the school's base domain plus local part or full name.
 */
const prisma = require('../lib/prisma');

const SECOND_LEVEL = new Set(['edu', 'ac', 'co', 'com', 'org', 'net', 'gov', 'sch']);

function emailParts(email) {
  const s = String(email || '').trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at === -1) return { local: '', domain: '' };
  return { local: s.slice(0, at), domain: s.slice(at + 1) };
}

/** g.rit.edu -> rit.edu ; mail.feuhighschool.edu.ph -> feuhighschool.edu.ph */
function baseDomain(domain) {
  const labels = String(domain || '').toLowerCase().split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  if (tld.length === 2 && SECOND_LEVEL.has(sld) && labels.length >= 3) return labels.slice(-3).join('.');
  return labels.slice(-2).join('.');
}

function sameSchool(domainA, domainB) {
  return baseDomain(domainA) === baseDomain(domainB);
}

function normalizeLocal(local) {
  return local.replace(/[.\-_]/g, '').replace(/\d+$/, '');
}

function normalizeName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const CLASS_SELECT = {
  id: true, name: true, section: true, semester: true, archived: true,
  teacher: { select: { firstName: true, lastName: true, email: true } }
};

/**
 * @returns {Promise<Array<{ id, email, name, matchedBy: 'email'|'name', classes: [] }>>}
 */
async function findStudentMatches({ email, firstName, lastName }) {
  const { local, domain } = emailParts(email);
  const base = baseDomain(domain);
  if (!base) return [];

  // Everyone at the same school (any sub-domain). Bounded by school size.
  const candidates = await prisma.user.findMany({
    where: { role: 'student', email: { endsWith: base } },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      enrollments: { select: { class: { select: CLASS_SELECT } } }
    }
  });

  const wantLocal = normalizeLocal(local);
  const wantName = normalizeName(`${firstName} ${lastName}`);

  const matches = [];
  for (const c of candidates) {
    const parts = emailParts(c.email);
    if (!sameSchool(parts.domain, domain)) continue; // "notrit.edu" guard
    let matchedBy = null;
    if (parts.local === local || (wantLocal && normalizeLocal(parts.local) === wantLocal)) matchedBy = 'email';
    else if (wantName && normalizeName(`${c.firstName} ${c.lastName}`) === wantName) matchedBy = 'name';
    if (!matchedBy) continue;

    const classes = c.enrollments
      .map(e => e.class)
      .filter(Boolean)
      .sort((a, b) => (a.archived - b.archived) || String(b.semester || '').localeCompare(String(a.semester || '')))
      .map(k => ({
        id: k.id,
        name: k.name,
        section: k.section,
        semester: k.semester,
        archived: !!k.archived,
        instructor: {
          name: `${k.teacher.firstName} ${k.teacher.lastName}`.trim(),
          email: k.teacher.email
        }
      }));

    matches.push({
      id: c.id,
      email: c.email,
      name: `${c.firstName} ${c.lastName}`.trim(),
      matchedBy,
      classes
    });
  }

  // Email matches first, then those with active classes
  matches.sort((a, b) => (a.matchedBy === 'email' ? 0 : 1) - (b.matchedBy === 'email' ? 0 : 1)
    || b.classes.filter(k => !k.archived).length - a.classes.filter(k => !k.archived).length);
  return matches.slice(0, 5);
}

function isStudentMistakeReason(reason) {
  return !!reason && reason.toLowerCase().includes('student');
}

module.exports = { findStudentMatches, baseDomain, isStudentMistakeReason };

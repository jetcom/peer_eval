/**
 * Find (and optionally delete) spam instructor registrations.
 *
 * Matches pending_teacher users whose name / university / department contain
 * URLs, link shorteners, or emoji — the signature of bot sign-ups.
 *
 *   node scripts/purgeSpamRegistrations.js            # dry run: list matches
 *   node scripts/purgeSpamRegistrations.js --delete   # actually delete them
 *   node scripts/purgeSpamRegistrations.js --all-pending --delete
 *       # delete EVERY pending_teacher (use only if you know they're all junk)
 */
require('dotenv').config();
const prisma = require('../lib/prisma');
const { LINK_RE, EMOJI_RE } = require('../middleware/spamProtection');

const DELETE = process.argv.includes('--delete');
const ALL_PENDING = process.argv.includes('--all-pending');

function looksLikeSpam(u) {
  return [u.firstName, u.lastName, u.university, u.department]
    .some(v => typeof v === 'string' && (LINK_RE.test(v) || EMOJI_RE.test(v)));
}

async function main() {
  const pending = await prisma.user.findMany({
    where: { role: 'pending_teacher' },
    select: { id: true, email: true, firstName: true, lastName: true, university: true, department: true, createdAt: true },
    orderBy: { createdAt: 'asc' }
  });

  const targets = ALL_PENDING ? pending : pending.filter(looksLikeSpam);
  const keep = pending.length - targets.length;

  console.log(`Pending instructor accounts: ${pending.length}`);
  console.log(`Matched as spam: ${targets.length}  (would keep ${keep})`);
  for (const u of targets) {
    const name = `${u.firstName} ${u.lastName}`.replace(/\s+/g, ' ').slice(0, 60);
    console.log(`  #${u.id}  ${u.createdAt.toISOString().slice(0, 10)}  ${u.email}  | ${name}`);
  }

  if (!DELETE) {
    console.log('\nDry run. Re-run with --delete to remove these accounts.');
    return;
  }
  if (targets.length === 0) return;

  const { count } = await prisma.user.deleteMany({
    where: { id: { in: targets.map(u => u.id) }, role: 'pending_teacher' }
  });
  console.log(`\nDeleted ${count} spam registrations.`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

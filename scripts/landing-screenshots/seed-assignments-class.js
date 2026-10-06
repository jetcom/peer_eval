// Seeds a second, assignment-based fictional class (16 students in 4 teams,
// three presentation assignments with peer and audience evaluations).
// Runs after seed-phases-class.js and extends $WORK/tokens.json.
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const API = 'http://localhost:3001/api';
const prisma = new PrismaClient();
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const tokensPath = path.join(process.env.WORK, 'tokens.json');
const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
const sign = (u) => jwt.sign({ id: u.id, email: u.email, role: u.role, first_name: u.firstName, last_name: u.lastName }, process.env.JWT_SECRET, { expiresIn: '24h' });

const TEAMS = {
  'Team Kestrel': [['Amara', 'Nwosu'], ['Felix', 'Brandt'], ['Yuki', 'Hoshino'], ['Rosa', 'Delgado']],
  'Team Lumen':   [['Omar', 'Siddiqui'], ['Elena', 'Kovac'], ['Jonas', 'Weber'], ['Nia', 'Campbell']],
  'Team Meridian':[['Haruto', 'Sato'], ['Beatriz', 'Almeida'], ['Kwame', 'Mensah'], ['Lily', 'Thornton']],
  'Team Nova':    [['Ravi', 'Menon'], ['Clara', 'Fontaine'], ['Dmitri', 'Volkov'], ['Ayesha', 'Khan']],
};
const AUDIENCE_COMMENTS = ['Clear structure and a confident delivery. The demo at the end made the idea click.', 'Good content, but the slides were text-heavy and a little hard to read from the back.', 'Engaging opening and strong answers in the Q&A.', 'The problem statement could have come earlier, but the walkthrough was convincing.'];
const PEER_COMMENTS = ['Rehearsed with the team twice and handled the transitions smoothly.', 'Built most of the demo and explained it well under questioning.', 'Did a solid job on the slides; could have joined more of the rehearsals.'];

async function main() {
  const auth = { Authorization: `Bearer ${tokens.teacher}` };
  const res = await fetch(`${API}/classes`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({
    name: 'Technical Communication', section: '02', semester: 'Fall 2026', due_date_timezone: 'America/New_York', evaluation_mode: 'assignments',
    assignments: [
      { name: 'Lightning Talks', description: 'Five-minute talks on a tool your team evaluated', due_date: '2026-09-18T23:59', eval_types: ['peer', 'audience'] },
      { name: 'Prototype Demo', description: 'Live demo of the working prototype', due_date: '2026-10-08T23:59', eval_types: ['peer', 'audience'] },
      { name: 'Final Presentation', description: 'Full project presentation and Q&A', due_date: '2026-11-20T23:59', eval_types: ['peer', 'audience'] },
    ],
  }) });
  const cls = await res.json();
  if (!res.ok) throw new Error('class create failed: ' + JSON.stringify(cls));

  let n = 0;
  const rows = ['OrgDefinedId,Last Name,First Name,Email,Project Team,End-of-Line Indicator'];
  for (const [team, members] of Object.entries(TEAMS)) for (const [first, last] of members) rows.push(`#${520000000 + (++n) * 6007},${last},${first},${(first[0] + last).toLowerCase()}@example.edu,${team},#`);
  const form = new FormData();
  form.append('file', new Blob([rows.join('\r\n')], { type: 'text/csv' }), 'roster.csv');
  const upRes = await fetch(`${API}/classes/${cls.id}/upload-students`, { method: 'POST', headers: auth, body: form });
  const up = await upRes.json();
  if (!upRes.ok) throw new Error('upload failed: ' + JSON.stringify(up));
  console.log('import:', { created: up.created, enrolled: up.enrolled, new_groups: up.new_groups, group_column: up.group_column });
  await prisma.user.updateMany({ where: { role: 'student' }, data: { mustChangePassword: 0 } });

  const groups = await prisma.group.findMany({ where: { classId: cls.id }, include: { members: { include: { user: true } } } });
  const assignments = await prisma.assignment.findMany({ where: { classId: cls.id }, orderBy: { orderIndex: 'asc' }, include: { evalTypes: { include: { criteria: true } } } });
  console.log('assignments:', assignments.map(a => `${a.name}: ${a.evalTypes.map(e => `${e.evalType}(${e.criteria.length})`).join(', ')}`).join(' | '));

  const scoresFor = (criteria, base) => criteria.map(c => c.questionType === 'open_response'
    ? { criterionId: c.id, textResponse: pick(AUDIENCE_COMMENTS) }
    : { criterionId: c.id, score: clamp(Math.round(base + (rnd() - 0.5) * 1.6), c.minValue, c.maxValue) });

  // Who has done what: assignment 1 fully, assignment 2 partly, assignment 3 not yet
  const focus = groups.flatMap(g => g.members).find(m => m.user.firstName === 'Elena').user;
  let count = 0;
  for (const [ai, a] of assignments.entries()) {
    const peer = a.evalTypes.find(e => e.evalType === 'peer'), audience = a.evalTypes.find(e => e.evalType === 'audience');
    const when = new Date(`${(a.dueDate || '').slice(0, 10)}T20:00:00Z`);
    for (const g of groups) {
      for (const m of g.members) {
        const me = m.user;
        let doPeer = ai === 0 ? 1 : ai === 1 ? (me.id === focus.id ? 0.66 : rnd() < 0.7 ? 1 : 0) : 0;
        let doAudience = ai === 0 ? true : ai === 1 ? (me.id === focus.id ? false : rnd() < 0.6) : false;
        const mates = g.members.filter(x => x.user.id !== me.id);
        for (const other of mates.slice(0, Math.round(mates.length * doPeer))) {
          const ev = await prisma.assignmentEvaluation.create({ data: { evaluatorId: me.id, evaluateeId: other.user.id, evalTypeId: peer.id, comments: pick(PEER_COMMENTS), submittedAt: when, createdAt: when, updatedAt: when } });
          await prisma.assignmentEvaluationScore.createMany({ data: scoresFor(peer.criteria, 3.6 + rnd() * 1.2).map(s => ({ ...s, evaluationId: ev.id })) });
          count++;
        }
        if (doAudience) for (const og of groups.filter(x => x.id !== g.id)) {
          const ev = await prisma.groupEvaluation.create({ data: { evaluatorId: me.id, groupId: og.id, evalTypeId: audience.id, comments: pick(AUDIENCE_COMMENTS), submittedAt: when, createdAt: when, updatedAt: when } });
          await prisma.groupEvaluationScore.createMany({ data: scoresFor(audience.criteria, 3.4 + rnd() * 1.4).map(s => ({ ...s, groupEvaluationId: ev.id })) });
          count++;
        }
      }
    }
  }
  console.log('evaluations:', count);
  const a2 = assignments[1];
  Object.assign(tokens, { class2Id: cls.id, student2: sign(focus), audienceUrl: `/evaluate-assignment/${a2.id}/${a2.evalTypes.find(e => e.evalType === 'audience').id}?class_id=${cls.id}`, assignment2Id: a2.id });
  fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 1));
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

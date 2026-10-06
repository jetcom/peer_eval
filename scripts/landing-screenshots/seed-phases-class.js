// Seeds the throwaway demo database with a phase-based fictional class
// (teacher, 20 students in 5 teams, three phases of evaluations) through the
// real class-creation and CSV-import APIs. Writes login tokens to $WORK/tokens.json.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const API = 'http://localhost:3001/api';
const prisma = new PrismaClient();
let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sign = (u) => jwt.sign({ id: u.id, email: u.email, role: u.role, first_name: u.firstName, last_name: u.lastName }, process.env.JWT_SECRET, { expiresIn: '24h' });

const TEAMS = {
  'Team Apollo':   [['Maya', 'Okafor'], ['Daniel', 'Reyes'], ['Hannah', 'Lindqvist'], ['Tomas', 'Novak']],
  'Team Borealis': [['Aisha', 'Rahman'], ['Ethan', 'Caldwell'], ['Mei', 'Tanaka'], ['Lucas', 'Ferreira']],
  'Team Cascade':  [['Sofia', 'Marchetti'], ['Noah', 'Abernathy'], ['Priyanka', 'Desai'], ['Owen', 'Fitzgerald']],
  'Team Delta':    [['Zara', 'Haddad'], ['Jacob', 'Sorensen'], ['Chloe', 'Baptiste'], ['Minh', 'Tran']],
  'Team Echo':     [['Grace', 'Adeyemi'], ['Leo', 'Vasquez'], ['Ingrid', 'Petrov'], ['Samir', 'Qureshi']],
};
// Typical rating each student earns from teammates (1-5 scale)
const LEVEL = { 'Noah Abernathy': 2.3, 'Lucas Ferreira': 3.2, 'Minh Tran': 3.4, 'Maya Okafor': 4.8, 'Aisha Rahman': 4.7, 'Grace Adeyemi': 4.6 };
const COMMENTS = {
  high: ['Consistently ahead of schedule and always willing to help others get unblocked.', 'Led our design discussions and kept the whole team organized.', 'Great communicator. Her pull requests were thorough and easy to review.', 'Took ownership of the hardest part of the sprint and delivered on time.'],
  mid: ['Solid contributor. Finished assigned tasks, though sometimes close to the deadline.', 'Good work on the API layer. Could speak up a bit more in meetings.', 'Reliable and easy to work with. Code quality improved a lot this phase.', 'Did their share and responded quickly on chat.'],
  low: ['Missed two team meetings this phase and we had to redistribute his tasks.', 'Work arrived late and needed significant rework before we could merge it.', 'Hard to reach outside of class. Hoping for more engagement next phase.'],
};

async function main() {
  const teacher = await prisma.user.create({ data: {
    email: 'priya.raman@example.edu', firstName: 'Priya', lastName: 'Raman', role: 'teacher',
    password: bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10), university: 'Example University', department: 'Computer Science',
  } });
  const auth = { Authorization: `Bearer ${sign(teacher)}` };

  const classRes = await fetch(`${API}/classes`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({
    name: 'Software Engineering', section: '01', semester: 'Fall 2026', num_phases: 4, has_final_evaluation: 1,
    due_date_timezone: 'America/New_York', evaluation_mode: 'phases',
    phase_due_dates: { 1: '2026-09-11T23:59', 2: '2026-09-25T23:59', 3: '2026-10-09T23:59', 4: '2026-11-06T23:59', 0: '2026-12-04T23:59' },
  }) });
  const cls = await classRes.json();
  if (!classRes.ok) throw new Error('class create failed: ' + JSON.stringify(cls));

  // Roster goes through the real CSV import, LMS-export style headers included
  let n = 0;
  const rows = ['OrgDefinedId,Last Name,First Name,Email,Project Team,End-of-Line Indicator'];
  for (const [team, members] of Object.entries(TEAMS)) {
    for (const [first, last] of members) rows.push(`#${410000000 + (++n) * 7919},${last},${first},${(first[0] + last).toLowerCase()}@example.edu,${team},#`);
  }
  const form = new FormData();
  form.append('file', new Blob([rows.join('\r\n')], { type: 'text/csv' }), 'roster.csv');
  const upRes = await fetch(`${API}/classes/${cls.id}/upload-students`, { method: 'POST', headers: auth, body: form });
  const up = await upRes.json();
  if (!upRes.ok) throw new Error('upload failed: ' + JSON.stringify(up));
  console.log('import:', { created: up.created, enrolled: up.enrolled, new_groups: up.new_groups, group_column: up.group_column, errors: up.errors.length });
  await prisma.user.updateMany({ where: { role: 'student' }, data: { mustChangePassword: 0 } });

  const groups = await prisma.group.findMany({ where: { classId: cls.id }, include: { members: { include: { user: true } } } });
  const students = groups.flatMap(g => g.members.map(m => m.user));
  const level = (u) => LEVEL[`${u.firstName} ${u.lastName}`] ?? (3.7 + rnd() * 0.8);
  const levels = new Map(students.map(u => [u.id, level(u)]));

  // Who has finished which phase: 1 is done, 2 nearly, 3 is under way
  const skipP2 = new Set(['Noah Abernathy']);
  const doneP3 = new Set(['Team Apollo', 'Team Echo']);
  const partialP3 = { 'Aisha Rahman': 4, 'Mei Tanaka': 4, 'Ethan Caldwell': 2, 'Zara Haddad': 4, 'Chloe Baptiste': 4, 'Jacob Sorensen': 1, 'Sofia Marchetti': 4, 'Priyanka Desai': 3 };
  const windows = { 1: ['2026-09-07', 5], 2: ['2026-09-21', 5], 3: ['2026-10-02', 4.6] };

  let count = 0;
  for (const g of groups) {
    for (const m of g.members) {
      const me = m.user, name = `${me.firstName} ${me.lastName}`;
      for (const phase of [1, 2, 3]) {
        let howMany = g.members.length;
        if (phase === 2 && skipP2.has(name)) howMany = 0;
        if (phase === 3) howMany = doneP3.has(g.name) ? g.members.length : (partialP3[name] ?? 0);
        const [start, days] = windows[phase];
        const when = new Date(new Date(`${start}T13:00:00Z`).getTime() + (0.35 + rnd() * 0.65) * days * 86400000 * (phase === 3 ? rnd() : 1));
        for (const other of g.members.slice(0, howMany)) {
          const self = other.user.id === me.id;
          const base = clamp(levels.get(other.user.id) + (self ? 0.3 : 0) + (phase - 1) * (levels.get(other.user.id) < 3 ? 0.25 : 0.05), 1, 5);
          const c = () => clamp(Math.round(base + (rnd() - 0.5) * 1.4), 1, 5);
          const vals = { contribution: c(), communication: c(), reliability: c(), qualityOfWork: c(), collaboration: c() };
          const avg = Object.values(vals).reduce((a, b) => a + b, 0) / 5;
          const tone = avg >= 4.3 ? 'high' : avg >= 3 ? 'mid' : 'low';
          await prisma.evaluation.create({ data: {
            evaluatorId: me.id, evaluateeId: other.user.id, classId: cls.id, phase, ...vals,
            score: clamp(Math.round(avg * 20 + (rnd() - 0.5) * 6), 0, 100),
            comments: self ? 'I kept up with my tasks and tried to support the team where I could.' : pick(COMMENTS[tone]),
            createdAt: when, updatedAt: when,
          } });
          count++;
        }
      }
    }
  }
  console.log('evaluations:', count);

  const student = students.find(u => u.firstName === 'Ethan');
  fs.writeFileSync(path.join(process.env.WORK, 'tokens.json'), JSON.stringify({ classId: cls.id, teacher: sign(teacher), student: sign(student), studentId: student.id }, null, 1));
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

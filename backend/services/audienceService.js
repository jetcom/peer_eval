/**
 * Audience (in-class presentation) evaluations.
 *
 * One place that answers, for an audience eval type:
 *   - who a given student is allowed to evaluate (everyone except themselves
 *     and their own group), as groups or as individual presenters
 *   - when each of those evaluations is due, which can differ per presenter
 *     when the teacher has entered a presentation schedule
 *   - whether a target is open yet (its presentation has happened)
 *   - how many evaluations the student must complete (minCompletion is a
 *     percentage of the eligible targets; empty means all of them)
 *   - which presenters a student has been excused from (absent that day), so
 *     those drop out of the student's required set
 *   - in 'assigned' mode, which presenters were randomly assigned to each
 *     student; only those are owed (and visible)
 *
 * Used by the student page, the student dashboard, the submit routes, the
 * teacher progress view, and the reminder scheduler so they all agree.
 */
const prisma = require('../lib/prisma');
const { getNowInTimezone } = require('../utils/dateUtils');

const DEFAULT_TZ = 'America/New_York';

/** Add hours to a wall-clock "YYYY-MM-DDTHH:mm" string, staying in wall-clock time. */
function addHoursToLocal(dateStr, hours) {
  if (!dateStr) return null;
  const [datePart, timePart = '00:00'] = dateStr.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi) + Number(hours) * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

function isAudienceEvalType(evalType) {
  return evalType && evalType.evalType === 'audience';
}

/**
 * Load everything needed to reason about one audience eval type: the round,
 * its class, the class's groups and students, and the presentation schedule.
 */
async function loadAudienceContext(evalTypeId) {
  const evalType = await prisma.assignmentEvalType.findUnique({
    where: { id: evalTypeId },
    include: {
      assignment: {
        include: { class: { select: { id: true, name: true, dueDateTimezone: true } } }
      },
      presentationSlots: true,
      presentationExcusals: true,
      presentationAssignments: true
    }
  });
  if (!evalType) return null;

  const classId = evalType.assignment.classId;
  const [groups, enrollments] = await Promise.all([
    prisma.group.findMany({
      where: { classId },
      include: {
        members: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } }
        }
      },
      orderBy: { name: 'asc' }
    }),
    prisma.classEnrollment.findMany({
      where: { classId, user: { role: 'student' } },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }]
    })
  ]);

  const slotByGroup = new Map();
  const slotByUser = new Map();
  for (const slot of evalType.presentationSlots) {
    if (slot.groupId) slotByGroup.set(slot.groupId, slot);
    if (slot.userId) slotByUser.set(slot.userId, slot);
  }

  // studentId -> Set of presenter keys ("g<groupId>" / "u<userId>") they are excused from
  const excusedByStudent = new Map();
  for (const ex of evalType.presentationExcusals) {
    const key = ex.groupId ? `g${ex.groupId}` : `u${ex.presenterUserId}`;
    if (!excusedByStudent.has(ex.studentId)) excusedByStudent.set(ex.studentId, new Set());
    excusedByStudent.get(ex.studentId).add(key);
  }

  // studentId -> Set of presenter keys assigned to them ('assigned' mode)
  const assignedByStudent = new Map();
  for (const a of evalType.presentationAssignments) {
    const key = a.groupId ? `g${a.groupId}` : `u${a.presenterUserId}`;
    if (!assignedByStudent.has(a.studentId)) assignedByStudent.set(a.studentId, new Set());
    assignedByStudent.get(a.studentId).add(key);
  }

  const timezone = evalType.assignment.class.dueDateTimezone || DEFAULT_TZ;

  return {
    evalType,
    assignment: evalType.assignment,
    classId,
    timezone,
    nowStr: getNowInTimezone(timezone),
    groups,
    students: enrollments.map(e => e.user),
    slotByGroup,
    slotByUser,
    excusedByStudent,
    assignedByStudent
  };
}

const isAssignedMode = (ctx) => ctx.evalType.audienceAssignmentMode === 'assigned';

const presenterKey = (target) => (target.kind === 'group' ? `g${target.id}` : `u${target.id}`);

function isExcused(ctx, studentId, target) {
  return ctx.excusedByStudent.get(studentId)?.has(presenterKey(target)) || false;
}

/** The due date for evaluating one presenter: slot + window, else the round's date. */
function targetDueDate(ctx, slot) {
  const roundDue = ctx.evalType.dueDate || ctx.assignment.dueDate || null;
  if (slot && ctx.evalType.evalWindowHours != null) {
    return addHoursToLocal(slot.presentationDate, ctx.evalType.evalWindowHours);
  }
  return roundDue;
}

function findOwnGroup(ctx, studentId) {
  return ctx.groups.find(g => g.members.some(m => m.userId === studentId)) || null;
}

function decorateTarget(ctx, target, slot) {
  const presentationDate = slot ? slot.presentationDate : null;
  const dueDate = targetDueDate(ctx, slot);
  const isOpen = !presentationDate || ctx.nowStr >= presentationDate;
  const isPastDue = !!dueDate && ctx.nowStr > dueDate;
  const allowLate = ctx.evalType.allowLate === 1;
  return {
    ...target,
    presentation_date: presentationDate,
    due_date: dueDate,
    is_open: isOpen,
    is_past_due: isPastDue,
    can_submit: isOpen && (!isPastDue || allowLate)
  };
}

/**
 * Everyone this student may evaluate in this round, in presentation order.
 * Excludes the student and, when they are in a group, their group-mates, and
 * (unless includeExcused is set) presenters the student was excused from.
 * Each target carries an `excused` flag.
 */
function buildTargets(ctx, studentId, { includeExcused = false, ignoreAssignments = false } = {}) {
  const ownGroup = findOwnGroup(ctx, studentId);
  let targets;

  if (ctx.evalType.targetType === 'group') {
    targets = ctx.groups
      .filter(g => g.id !== ownGroup?.id)
      .map(g => decorateTarget(ctx, {
        kind: 'group',
        id: g.id,
        name: g.name,
        members: g.members.map(m => ({
          id: m.user.id,
          first_name: m.user.firstName,
          last_name: m.user.lastName
        }))
      }, ctx.slotByGroup.get(g.id)));
  } else {
    const groupMateIds = new Set((ownGroup?.members || []).map(m => m.userId));
    targets = ctx.students
      .filter(s => s.id !== studentId && !groupMateIds.has(s.id))
      .map(s => decorateTarget(ctx, {
        kind: 'individual',
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        first_name: s.firstName,
        last_name: s.lastName
      }, ctx.slotByUser.get(s.id)));
  }

  targets = targets
    .map(t => ({ ...t, excused: isExcused(ctx, studentId, t) }))
    .filter(t => includeExcused || !t.excused);

  // In 'assigned' mode a student only sees (and owes) their assigned presenters
  if (isAssignedMode(ctx) && !ignoreAssignments) {
    const assigned = ctx.assignedByStudent.get(studentId) || new Set();
    targets = targets.filter(t => assigned.has(presenterKey(t)));
  }

  // Scheduled presenters first, in date order; unscheduled keep their list order
  return targets.sort((a, b) => {
    if (a.presentation_date && b.presentation_date) return a.presentation_date.localeCompare(b.presentation_date);
    if (a.presentation_date) return -1;
    if (b.presentation_date) return 1;
    return 0;
  });
}

/** How many of `available` targets the student must complete. */
function requiredCount(evalType, available) {
  const pct = evalType.minCompletion;
  if (!pct || pct >= 100) return available;
  return Math.min(available, Math.ceil(available * pct / 100));
}

async function fetchStudentEvaluations(evalTypeId, studentId) {
  const [groupEvals, individualEvals] = await Promise.all([
    prisma.groupEvaluation.findMany({
      where: { evaluatorId: studentId, evalTypeId },
      select: { id: true, groupId: true, submittedAt: true, isLate: true }
    }),
    prisma.assignmentEvaluation.findMany({
      where: { evaluatorId: studentId, evalTypeId },
      select: { id: true, evaluateeId: true, submittedAt: true, isLate: true }
    })
  ]);
  return { groupEvals, individualEvals };
}

function attachEvaluations(targets, { groupEvals, individualEvals }) {
  const byGroup = new Map(groupEvals.map(e => [e.groupId, e]));
  const byUser = new Map(individualEvals.map(e => [e.evaluateeId, e]));
  return targets.map(t => {
    const e = t.kind === 'group' ? byGroup.get(t.id) : byUser.get(t.id);
    return {
      ...t,
      evaluation: e ? { id: e.id, submitted_at: e.submittedAt, is_late: e.isLate === 1 } : null
    };
  });
}

function summarize(ctx, allTargets, studentId) {
  const targets = allTargets.filter(t => !t.excused);
  const available = targets.length;
  // Assigned presenters are all required; the percentage was applied when assigning
  const required = isAssignedMode(ctx) ? available : requiredCount(ctx.evalType, available);
  const completed = targets.filter(t => t.evaluation).length;
  const openIncomplete = targets.filter(t => !t.evaluation && t.is_open && t.due_date);
  const nextDue = openIncomplete.map(t => t.due_date).sort()[0] || null;
  const upcoming = targets.filter(t => !t.is_open && t.presentation_date);
  const nextPresentation = upcoming.map(t => t.presentation_date).sort()[0] || null;
  return {
    available,
    required,
    completed,
    excused: allTargets.length - targets.length,
    assignment_mode: ctx.evalType.audienceAssignmentMode,
    assigned: isAssignedMode(ctx) ? (ctx.assignedByStudent.get(studentId)?.size || 0) : null,
    is_complete: required > 0 ? completed >= required : true,
    next_due: nextDue,
    next_presentation: nextPresentation
  };
}

/** Full picture for one student: targets with their evaluations, plus counts. */
async function getStudentAudienceStatus(ctx, studentId, evaluations) {
  const evals = evaluations || await fetchStudentEvaluations(ctx.evalType.id, studentId);
  const targets = attachEvaluations(buildTargets(ctx, studentId, { includeExcused: true }), evals);
  return { targets, ...summarize(ctx, targets, studentId) };
}

/** Counts for every enrolled student, for the teacher's progress view. */
async function getClassAudienceProgress(ctx) {
  const [groupEvals, individualEvals] = await Promise.all([
    prisma.groupEvaluation.findMany({
      where: { evalTypeId: ctx.evalType.id },
      select: { id: true, evaluatorId: true, groupId: true, submittedAt: true, isLate: true }
    }),
    prisma.assignmentEvaluation.findMany({
      where: { evalTypeId: ctx.evalType.id },
      select: { id: true, evaluatorId: true, evaluateeId: true, submittedAt: true, isLate: true }
    })
  ]);

  const progress = {};
  for (const student of ctx.students) {
    const mine = {
      groupEvals: groupEvals.filter(e => e.evaluatorId === student.id),
      individualEvals: individualEvals.filter(e => e.evaluatorId === student.id)
    };
    const targets = attachEvaluations(buildTargets(ctx, student.id), mine);
    const { available, required, completed, is_complete } = summarize(ctx, targets, student.id);
    progress[student.id] = { available, required, completed, is_complete };
  }
  return progress;
}

/**
 * Check a submission against the rules before saving it.
 * Returns { ok: true, isLate } or { ok: false, status, error }.
 */
function validateSubmission(ctx, studentId, { groupId, evaluateeId }) {
  const targets = buildTargets(ctx, studentId, { includeExcused: true });
  const target = groupId
    ? targets.find(t => t.kind === 'group' && t.id === groupId)
    : targets.find(t => t.kind === 'individual' && t.id === evaluateeId);

  if (target?.excused) {
    return { ok: false, status: 403, error: 'You were excused from evaluating this presenter' };
  }
  if (!target && isAssignedMode(ctx)) {
    const eligible = buildTargets(ctx, studentId, { ignoreAssignments: true });
    const wouldBeEligible = groupId
      ? eligible.some(t => t.kind === 'group' && t.id === groupId)
      : eligible.some(t => t.kind === 'individual' && t.id === evaluateeId);
    if (wouldBeEligible) {
      return { ok: false, status: 403, error: 'You were not assigned to evaluate this presenter' };
    }
  }
  if (!target) {
    const ownGroup = findOwnGroup(ctx, studentId);
    const isSelf = evaluateeId === studentId;
    const isOwnGroup = groupId
      ? ownGroup?.id === groupId
      : !!ownGroup && ownGroup.members.some(m => m.userId === evaluateeId);
    return {
      ok: false,
      status: 403,
      error: isSelf ? 'You cannot evaluate yourself in an audience evaluation'
        : isOwnGroup ? 'You cannot evaluate your own group'
        : 'That presenter is not part of this evaluation'
    };
  }
  if (!target.is_open) {
    return { ok: false, status: 403, error: 'This presentation has not happened yet' };
  }
  if (target.is_past_due && ctx.evalType.allowLate !== 1) {
    return { ok: false, status: 403, error: 'The deadline for evaluating this presenter has passed' };
  }
  return { ok: true, isLate: target.is_past_due ? 1 : 0 };
}

/**
 * The teacher's schedule view: every presenter in the round with its slot.
 */
function listPresenters(ctx) {
  const excusedFor = (key) => [...ctx.excusedByStudent.entries()]
    .filter(([, keys]) => keys.has(key))
    .map(([studentId]) => studentId);
  const assignedFor = (key) => [...ctx.assignedByStudent.entries()]
    .filter(([, keys]) => keys.has(key))
    .map(([studentId]) => studentId);

  if (ctx.evalType.targetType === 'group') {
    return ctx.groups.map(g => ({
      kind: 'group',
      id: g.id,
      name: g.name,
      members: g.members.map(m => ({ id: m.user.id, first_name: m.user.firstName, last_name: m.user.lastName })),
      presentation_date: ctx.slotByGroup.get(g.id)?.presentationDate || null,
      due_date: targetDueDate(ctx, ctx.slotByGroup.get(g.id)),
      excused_student_ids: excusedFor(`g${g.id}`),
      assigned_student_ids: assignedFor(`g${g.id}`)
    }));
  }
  return ctx.students.map(s => ({
    kind: 'individual',
    id: s.id,
    name: `${s.firstName} ${s.lastName}`.trim(),
    first_name: s.firstName,
    last_name: s.lastName,
    email: s.email,
    presentation_date: ctx.slotByUser.get(s.id)?.presentationDate || null,
    due_date: targetDueDate(ctx, ctx.slotByUser.get(s.id)),
    excused_student_ids: excusedFor(`u${s.id}`),
    assigned_student_ids: assignedFor(`u${s.id}`)
  }));
}

/** Class roster for the teacher's attendance view. */
function listStudents(ctx) {
  return ctx.students.map(s => {
    const assigned = [...(ctx.assignedByStudent.get(s.id) || [])];
    const eligible = buildTargets(ctx, s.id, { ignoreAssignments: true });
    const eligibleKeys = new Set(eligible.map(presenterKey));
    const validAssigned = assigned.filter(k => eligibleKeys.has(k));
    // Required is judged against presenters that can still be evaluated, so a
    // student is not "short" because of windows that have already closed
    const open = eligible.filter(t => !t.is_past_due);
    const required = requiredCount(ctx.evalType, open.length);
    return {
      id: s.id,
      first_name: s.firstName,
      last_name: s.lastName,
      group_id: findOwnGroup(ctx, s.id)?.id || null,
      eligible_count: eligible.length,
      required_count: required,
      // Fewer usable assignments than required (joined after the draw, or
      // group changes made some assignments invalid)
      short: validAssigned.length < required,
      assigned: assigned.map(key => ({ kind: key[0] === 'g' ? 'group' : 'individual', id: parseInt(key.slice(1)) }))
    };
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Randomly assign presenters to students, balancing how many evaluators each
 * presenter gets. Each student receives requiredCount(eligible) presenters
 * from their eligible set (no self, own group, or excused presenters).
 * Presenters a student has already evaluated are always kept.
 *
 * Presenters whose evaluation window has already closed are not handed out
 * (students could no longer complete them), and the percentage is applied to
 * the presenters that are still open.
 *
 * scope: 'all' reassigns everyone; 'fill' only tops up students who have
 * fewer usable assignments than required (late enrollments, or group changes
 * that invalidated some assignments), keeping what they already have and
 * balancing against the existing load.
 */
async function assignPresentersRandomly(evalTypeId, scope = 'all') {
  const ctx = await loadAudienceContext(evalTypeId);
  if (!ctx) return null;

  const [groupEvals, individualEvals] = await Promise.all([
    prisma.groupEvaluation.findMany({ where: { evalTypeId }, select: { evaluatorId: true, groupId: true } }),
    prisma.assignmentEvaluation.findMany({ where: { evalTypeId }, select: { evaluatorId: true, evaluateeId: true } })
  ]);
  const evaluatedByStudent = new Map();
  const noteDone = (studentId, key) => {
    if (!evaluatedByStudent.has(studentId)) evaluatedByStudent.set(studentId, new Set());
    evaluatedByStudent.get(studentId).add(key);
  };
  groupEvals.forEach(e => noteDone(e.evaluatorId, `g${e.groupId}`));
  individualEvals.forEach(e => noteDone(e.evaluatorId, `u${e.evaluateeId}`));

  const fillOnly = scope === 'fill' || scope === 'unassigned';
  const studentsToAssign = fillOnly
    ? listStudents(ctx).filter(s => s.short).map(s => ctx.students.find(x => x.id === s.id))
    : ctx.students;
  const assignIds = new Set(studentsToAssign.map(s => s.id));

  // Load per presenter: assignments we are keeping (students outside the scope)
  const load = new Map();
  const bump = (key) => load.set(key, (load.get(key) || 0) + 1);
  for (const [studentId, keys] of ctx.assignedByStudent.entries()) {
    if (!assignIds.has(studentId)) keys.forEach(bump);
  }

  const plan = new Map(); // studentId -> Set of keys
  for (const student of shuffle(studentsToAssign)) {
    const eligibleTargets = buildTargets(ctx, student.id, { ignoreAssignments: true });
    const eligible = eligibleTargets.map(presenterKey);
    // Only presenters the student can still evaluate are handed out
    const open = eligibleTargets.filter(t => !t.is_past_due).map(presenterKey);
    const want = requiredCount(ctx.evalType, open.length);
    const chosen = new Set();

    // Keep anything already evaluated
    for (const key of evaluatedByStudent.get(student.id) || []) {
      if (eligible.includes(key)) chosen.add(key);
    }
    // When topping up, keep the student's existing valid assignments
    if (fillOnly) {
      for (const key of ctx.assignedByStudent.get(student.id) || []) {
        if (eligible.includes(key)) chosen.add(key);
      }
    }
    // Fill from the least-loaded presenters, random tie-break
    const candidates = shuffle(open.filter(k => !chosen.has(k)))
      .sort((a, b) => (load.get(a) || 0) - (load.get(b) || 0));
    for (const key of candidates) {
      if (chosen.size >= want) break;
      chosen.add(key);
    }
    chosen.forEach(bump);
    plan.set(student.id, chosen);
  }

  const rows = [];
  for (const [studentId, keys] of plan.entries()) {
    for (const key of keys) {
      rows.push({
        evalTypeId,
        studentId,
        groupId: key[0] === 'g' ? parseInt(key.slice(1)) : null,
        presenterUserId: key[0] === 'u' ? parseInt(key.slice(1)) : null
      });
    }
  }

  await prisma.$transaction([
    prisma.presentationAssignment.deleteMany({ where: { evalTypeId, studentId: { in: [...assignIds] } } }),
    ...(rows.length > 0 ? [prisma.presentationAssignment.createMany({ data: rows })] : [])
  ]);

  return { assignedStudents: plan.size, assignments: rows.length };
}

/**
 * After a roster or group change: top up any student who is short in every
 * audience round of the class that is in 'assigned' mode and has already been
 * drawn. Safe to call fire-and-forget.
 */
async function autoAssignForClass(classId) {
  const evalTypes = await prisma.assignmentEvalType.findMany({
    where: {
      evalType: 'audience',
      audienceAssignmentMode: 'assigned',
      assignment: { classId },
      presentationAssignments: { some: {} }
    },
    select: { id: true }
  });
  for (const { id } of evalTypes) {
    try {
      const result = await assignPresentersRandomly(id, 'fill');
      if (result?.assignedStudents > 0) {
        console.log(`[Audience] Auto-assigned presenters to ${result.assignedStudents} student(s) for eval type ${id}`);
      }
    } catch (err) {
      console.error(`[Audience] Auto-assign failed for eval type ${id}:`, err.message);
    }
  }
}

async function clearAssignments(evalTypeId) {
  await prisma.presentationAssignment.deleteMany({ where: { evalTypeId } });
}

/**
 * Replace the excused list for the given presenters.
 * `entries` is [{ group_id | user_id (the presenter), student_ids: [...] }].
 */
async function saveExcusals(evalTypeId, entries) {
  const ops = [];
  for (const e of entries || []) {
    const groupId = e.group_id ? parseInt(e.group_id) : null;
    const presenterUserId = e.user_id ? parseInt(e.user_id) : null;
    if (!groupId && !presenterUserId) continue;
    const studentIds = [...new Set((e.student_ids || []).map(id => parseInt(id)).filter(Boolean))];
    ops.push(prisma.presentationExcusal.deleteMany({ where: { evalTypeId, groupId, presenterUserId } }));
    if (studentIds.length > 0) {
      ops.push(prisma.presentationExcusal.createMany({
        data: studentIds.map(studentId => ({ evalTypeId, studentId, groupId, presenterUserId }))
      }));
    }
  }
  await prisma.$transaction(ops);
}

/**
 * Replace the schedule for a round. `slots` is [{ group_id | user_id, presentation_date }];
 * a null/empty presentation_date removes that presenter's slot.
 */
async function saveSchedule(evalTypeId, slots) {
  const ops = [];
  for (const s of slots || []) {
    const groupId = s.group_id ? parseInt(s.group_id) : null;
    const userId = s.user_id ? parseInt(s.user_id) : null;
    if (!groupId && !userId) continue;
    const where = groupId
      ? { evalTypeId_groupId: { evalTypeId, groupId } }
      : { evalTypeId_userId: { evalTypeId, userId } };
    const date = s.presentation_date ? String(s.presentation_date).slice(0, 16) : null;
    if (!date) {
      ops.push(prisma.presentationSlot.deleteMany({ where: { evalTypeId, groupId, userId } }));
    } else {
      ops.push(prisma.presentationSlot.upsert({
        where,
        update: { presentationDate: date, updatedAt: new Date() },
        create: { evalTypeId, groupId, userId, presentationDate: date }
      }));
    }
  }
  await prisma.$transaction(ops);
}

/**
 * For the reminder scheduler: presenters in this class whose evaluation
 * window closes between nowStr and horizonStr, with the students who still
 * owe that evaluation.
 */
async function audienceRemindersDue(classId, nowStr, horizonStr) {
  const evalTypes = await prisma.assignmentEvalType.findMany({
    where: {
      evalType: 'audience',
      evalWindowHours: { not: null },
      assignment: { classId },
      presentationSlots: { some: {} }
    },
    select: { id: true }
  });

  const results = [];
  for (const { id } of evalTypes) {
    const ctx = await loadAudienceContext(id);
    if (!ctx) continue;
    const progressByStudent = new Map();
    const dueTargets = [];
    for (const presenter of listPresenters(ctx)) {
      if (presenter.presentation_date && presenter.due_date > nowStr && presenter.due_date <= horizonStr) {
        dueTargets.push(presenter);
      }
    }
    if (dueTargets.length === 0) continue;

    const [groupEvals, individualEvals] = await Promise.all([
      prisma.groupEvaluation.findMany({ where: { evalTypeId: id }, select: { evaluatorId: true, groupId: true } }),
      prisma.assignmentEvaluation.findMany({ where: { evalTypeId: id }, select: { evaluatorId: true, evaluateeId: true } })
    ]);
    const done = new Set([
      ...groupEvals.map(e => `g${e.groupId}:${e.evaluatorId}`),
      ...individualEvals.map(e => `u${e.evaluateeId}:${e.evaluatorId}`)
    ]);

    for (const presenter of dueTargets) {
      const key = presenter.kind === 'group' ? `g${presenter.id}` : `u${presenter.id}`;
      const students = ctx.students.filter(s => {
        if (!progressByStudent.has(s.id)) progressByStudent.set(s.id, buildTargets(ctx, s.id));
        const eligible = progressByStudent.get(s.id).some(t => t.kind === presenter.kind && t.id === presenter.id);
        return eligible && !done.has(`${key}:${s.id}`);
      });
      if (students.length > 0) {
        results.push({
          assignment: ctx.assignment,
          evalType: ctx.evalType,
          presenter,
          dueDate: presenter.due_date,
          students
        });
      }
    }
  }
  return results;
}

/**
 * Rough expected-submission count for analytics: each student owes
 * `required` evaluations, where required follows minCompletion.
 */
function estimateExpectedSubmissions(evalType, studentCount, groupCount) {
  const available = evalType.targetType === 'group'
    ? Math.max(groupCount - 1, 0)
    : Math.max(studentCount - 1, 0);
  return studentCount * requiredCount(evalType, available);
}

module.exports = {
  isAudienceEvalType,
  addHoursToLocal,
  loadAudienceContext,
  buildTargets,
  requiredCount,
  getStudentAudienceStatus,
  getClassAudienceProgress,
  validateSubmission,
  listPresenters,
  listStudents,
  saveSchedule,
  saveExcusals,
  assignPresentersRandomly,
  clearAssignments,
  autoAssignForClass,
  audienceRemindersDue,
  estimateExpectedSubmissions
};

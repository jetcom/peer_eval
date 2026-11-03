/**
 * Normalizes every class structure into one shape so the Reports tab can
 * treat them alike:
 *
 *   round      one evaluation round: a phase, the final evaluation, or an
 *              assignment eval type (peer / audience / self)
 *   evaluation one submitted evaluation of a recipient (student or group)
 *
 * Phases-mode classes have fixed criteria plus an overall score out of 100
 * and a points-based final round. Assignment-mode classes have per-round
 * criteria and may target groups instead of individuals.
 */

export const TYPE_LABELS = { audience: 'Audience', peer: 'Peer', self: 'Self', final: 'Final' };
export const typeLabel = (type) => TYPE_LABELS[type] || type;

// Who the evaluations in a round came from, for headings
export const sourceLabel = (round) => {
  if (round.type === 'audience') return 'from the audience';
  if (round.type === 'self') return 'self-evaluation';
  if (round.type === 'final') return 'final comments from teammates';
  return 'from teammates';
};

export const mean = (nums) => {
  const vals = nums.filter(v => v != null && !Number.isNaN(v));
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

const PHASE_CRITERIA = [
  { id: 'contribution', name: 'Contribution' },
  { id: 'communication', name: 'Communication' },
  { id: 'reliability', name: 'Reliability' },
  { id: 'quality_of_work', name: 'Quality of Work' },
  { id: 'collaboration', name: 'Collaboration' }
].map(c => ({ ...c, max_value: 5, question_type: 'likert', in_avg: true }));

// The phases-mode "score out of 100" rides along as a criterion that is
// shown but excluded from the Likert average
const PHASE_SCORE_CRITERION = { id: 'score', name: 'Score /100', max_value: 100, question_type: 'likert', in_avg: false };

function fromPhases(classData, classId, studentIds, evaluations, finalComments) {
  const numPhases = classData?.num_phases || 3;
  const rounds = Array.from({ length: numPhases }, (_, i) => ({
    id: `phase-${i + 1}`,
    label: `Phase ${i + 1}`,
    shortLabel: `P${i + 1}`,
    assignment_name: '',
    name: `Phase ${i + 1}`,
    type: 'peer',
    target: 'individual',
    criteria: [...PHASE_CRITERIA, PHASE_SCORE_CRITERION],
    scaleMax: 5,
    points: false,
    presentation_slots: []
  }));
  if (classData?.has_final_evaluation) {
    rounds.push({
      id: 'final',
      label: 'Final',
      shortLabel: 'Final',
      assignment_name: '',
      name: 'Final',
      type: 'final',
      target: 'individual',
      criteria: [],
      scaleMax: 5,
      points: true,
      presentation_slots: []
    });
  }

  // Older rows have no class_id; fall back to both parties being enrolled
  const inClass = (e) => (e.class_id ? e.class_id === classId : (studentIds.has(e.evaluator_id) && studentIds.has(e.evaluatee_id)));

  const evals = evaluations.filter(inClass).map(e => {
    const scores = PHASE_CRITERIA.map(c => ({
      criterion_id: c.id, criterion_name: c.name, score: e[c.id] ?? null, question_type: 'likert', text_response: null
    }));
    scores.push({ criterion_id: 'score', criterion_name: 'Score /100', score: e.score ?? null, question_type: 'likert', text_response: null });
    return {
      id: `e-${e.id}`,
      round_id: `phase-${e.phase}`,
      evaluator_id: e.evaluator_id,
      evaluator_name: e.evaluator_name,
      recipient_kind: 'student',
      recipient_id: e.evaluatee_id,
      recipient_name: e.evaluatee_name,
      scores,
      avg_score: mean(PHASE_CRITERIA.map(c => e[c.id])),
      points: null,
      comments: e.comments,
      attachments: e.attachments || [],
      submitted_at: e.updated_at || e.created_at,
      is_late: false
    };
  });

  if (classData?.has_final_evaluation) {
    finalComments.filter(inClass).forEach(fc => {
      evals.push({
        id: `f-${fc.id}`,
        round_id: 'final',
        evaluator_id: fc.evaluator_id,
        evaluator_name: fc.evaluator_name,
        recipient_kind: 'student',
        recipient_id: fc.evaluatee_id,
        recipient_name: fc.evaluatee_name,
        scores: [],
        avg_score: null,
        points: fc.final_points || 0,
        comments: fc.comments,
        attachments: [],
        submitted_at: fc.updated_at || fc.created_at,
        is_late: false
      });
    });
  }

  return { rounds, evals };
}

function fromAssignments(assignmentEvaluations) {
  const assignments = assignmentEvaluations?.assignments || [];
  const rounds = assignments.flatMap(a =>
    (a.eval_types || [])
      .filter(et => et.eval_type !== 'paper_review')
      .map(et => {
        const criteria = (et.criteria || []).map(c => ({
          id: c.id,
          name: c.name,
          description: c.description,
          max_value: c.max_value || 5,
          question_type: c.question_type || 'likert',
          in_avg: (c.question_type || 'likert') === 'likert'
        }));
        const likert = criteria.filter(c => c.question_type === 'likert');
        return {
          id: et.id,
          label: `${a.name} – ${et.name}`,
          shortLabel: `${a.name} – ${et.name}`,
          assignment_name: a.name,
          name: et.name,
          type: et.eval_type,
          target: et.target_type === 'group' ? 'group' : 'individual',
          criteria,
          scaleMax: likert.length > 0 ? Math.max(...likert.map(c => c.max_value)) : 5,
          points: false,
          presentation_slots: et.presentation_slots || []
        };
      })
  );
  const roundIds = new Set(rounds.map(r => r.id));

  const convert = (e, kind) => ({
    id: `${kind === 'group' ? 'g' : 'i'}-${e.id}`,
    round_id: e.eval_type_id,
    evaluator_id: e.evaluator_id,
    evaluator_name: e.evaluator_name,
    recipient_kind: kind,
    recipient_id: kind === 'group' ? e.group_id : e.evaluatee_id,
    recipient_name: kind === 'group' ? e.group_name : e.evaluatee_name,
    scores: (e.scores || []).map(s => ({
      criterion_id: s.criterion_id,
      criterion_name: s.criterion_name,
      score: s.score,
      question_type: s.question_type || 'likert',
      text_response: s.text_response || null
    })),
    avg_score: e.avg_score,
    points: null,
    comments: e.comments,
    attachments: e.attachments || [],
    submitted_at: e.submitted_at,
    is_late: !!e.is_late
  });

  const evals = [
    ...(assignmentEvaluations?.individual_evaluations || []).filter(e => roundIds.has(e.eval_type_id)).map(e => convert(e, 'student')),
    ...(assignmentEvaluations?.group_evaluations || []).filter(e => roundIds.has(e.eval_type_id)).map(e => convert(e, 'group'))
  ];

  return { rounds, evals };
}

/**
 * Build the report model for one class.
 */
export function buildModel({ classData, classStudents, classGroups, evaluations, finalComments, assignmentEvaluations }) {
  const classId = classData?.id;
  const isAssignmentMode = classData?.evaluation_mode === 'assignments';

  const groups = (classGroups || []).map(g => ({
    id: g.id,
    name: g.name,
    memberIds: (g.members || []).filter(m => m.role === 'student').map(m => m.id)
  }));
  const groupOfStudent = {};
  groups.forEach(g => g.memberIds.forEach(id => { groupOfStudent[id] = g; }));

  const students = (classStudents || [])
    .filter(s => s.role === 'student')
    .map(s => ({
      id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      email: s.email,
      name: `${s.last_name}, ${s.first_name}`,
      group: groupOfStudent[s.id] || null
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const studentIds = new Set(students.map(s => s.id));

  const { rounds, evals } = isAssignmentMode
    ? fromAssignments(assignmentEvaluations)
    : fromPhases(classData, classId, studentIds, evaluations || [], finalComments || []);

  const evalsByRound = {};
  rounds.forEach(r => { evalsByRound[r.id] = []; });
  evals.forEach(e => { if (evalsByRound[e.round_id]) evalsByRound[e.round_id].push(e); });

  return { isAssignmentMode, students, groups, rounds, evals, evalsByRound, studentById: Object.fromEntries(students.map(s => [s.id, s])), groupById: Object.fromEntries(groups.map(g => [g.id, g])) };
}

/**
 * Evaluations a student received in a round. Group-targeted rounds (such as
 * an audience evaluating a group presentation) count for every member.
 */
export function evalsForStudent(model, round, student) {
  const list = model.evalsByRound[round.id] || [];
  if (round.target === 'group') {
    return student.group ? list.filter(e => e.recipient_kind === 'group' && e.recipient_id === student.group.id) : [];
  }
  return list.filter(e => e.recipient_kind === 'student' && e.recipient_id === student.id);
}

/** Evaluations addressed to the group itself (group-targeted rounds only). */
export function evalsForGroup(model, round, group) {
  if (round.target !== 'group') return [];
  return (model.evalsByRound[round.id] || []).filter(e => e.recipient_kind === 'group' && e.recipient_id === group.id);
}

/** Per-criterion averages over a set of evaluations. */
export function criterionAverages(round, evals) {
  const out = {};
  round.criteria.filter(c => c.question_type === 'likert').forEach(c => {
    out[c.id] = mean(evals.map(e => e.scores.find(s => s.criterion_id === c.id)?.score));
  });
  return out;
}

/**
 * Summary of what a student received in a round: count, average, criterion
 * averages, and (for points rounds) total points.
 */
export function studentRoundCell(model, round, student) {
  const evals = evalsForStudent(model, round, student);
  return {
    count: evals.length,
    avg: round.points ? null : mean(evals.map(e => e.avg_score)),
    points: round.points ? evals.reduce((sum, e) => sum + (e.points || 0), 0) : null,
    criterionAvgs: criterionAverages(round, evals),
    evals
  };
}

/**
 * Summary of a group in a round. Group-targeted rounds use the evaluations
 * of the group itself; individual rounds average the members' averages.
 */
export function groupRoundCell(model, round, group) {
  if (round.target === 'group') {
    const evals = evalsForGroup(model, round, group);
    return { count: evals.length, avg: mean(evals.map(e => e.avg_score)), points: null, criterionAvgs: criterionAverages(round, evals), evals, perMember: false };
  }
  const members = group.memberIds.map(id => model.studentById[id]).filter(Boolean);
  const cells = members.map(m => studentRoundCell(model, round, m));
  const criterionAvgs = {};
  round.criteria.filter(c => c.question_type === 'likert').forEach(c => {
    criterionAvgs[c.id] = mean(cells.map(cell => cell.criterionAvgs[c.id]));
  });
  return {
    count: cells.reduce((sum, c) => sum + c.count, 0),
    avg: round.points ? null : mean(cells.map(c => c.avg)),
    points: round.points ? mean(cells.filter(c => c.count > 0).map(c => c.points)) : null,
    criterionAvgs,
    evals: cells.flatMap(c => c.evals),
    perMember: true
  };
}

/** Overall average across every scored round a student received. */
export function studentOverall(model, rounds, student) {
  const scored = rounds.filter(r => !r.points).flatMap(r => evalsForStudent(model, r, student));
  return mean(scored.map(e => e.avg_score));
}

export function groupOverall(model, rounds, group) {
  const members = group.memberIds.map(id => model.studentById[id]).filter(Boolean);
  return mean(members.map(m => studentOverall(model, rounds, m)));
}

/** How many evaluations a student submitted in the given rounds. */
export function givenCount(model, rounds, studentId) {
  return rounds.reduce((sum, r) => sum + (model.evalsByRound[r.id] || []).filter(e => e.evaluator_id === studentId).length, 0);
}

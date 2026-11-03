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
 *
 * Averages: each evaluation carries a raw average of its Likert scores
 * (avg_score) and the same average as a fraction of each criterion's
 * maximum (norm_score). Rounds whose criteria share one scale display the
 * raw average; rounds that mix scales display the fraction as a percent.
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

/** Raw and normalized averages of an evaluation's scored criteria. */
function averages(round, scores) {
  const scored = round.criteria
    .filter(c => c.question_type === 'likert' && c.in_avg)
    .map(c => ({ c, s: scores.find(s => s.criterion_id === c.id)?.score }))
    .filter(x => x.s != null);
  return {
    avg_score: mean(scored.map(x => x.s)),
    norm_score: mean(scored.map(x => (x.c.max_value > 0 ? x.s / x.c.max_value : null)))
  };
}

function finishRound(round) {
  const inAvg = round.criteria.filter(c => c.question_type === 'likert' && c.in_avg);
  const maxes = [...new Set(inAvg.map(c => c.max_value))];
  return {
    ...round,
    scaleMax: maxes.length > 0 ? Math.max(...maxes) : 5,
    uniformScale: maxes.length <= 1
  };
}

function fromPhases(classData, classId, studentIds, evaluations, finalComments) {
  const numPhases = classData?.num_phases || 3;
  const rounds = Array.from({ length: numPhases }, (_, i) => finishRound({
    id: `phase-${i + 1}`,
    label: `Phase ${i + 1}`,
    assignment_name: '',
    name: `Phase ${i + 1}`,
    multi: false,
    type: 'peer',
    target: 'individual',
    criteria: [...PHASE_CRITERIA, PHASE_SCORE_CRITERION],
    points: false,
    presentation_slots: []
  }));
  if (classData?.has_final_evaluation) {
    rounds.push(finishRound({
      id: 'final',
      label: 'Final',
      assignment_name: '',
      name: 'Final',
      multi: false,
      type: 'final',
      target: 'individual',
      criteria: [],
      points: true,
      presentation_slots: []
    }));
  }
  const roundById = Object.fromEntries(rounds.map(r => [r.id, r]));

  // Older rows have no class_id; fall back to both parties being enrolled
  const inClass = (e) => (e.class_id ? e.class_id === classId : (studentIds.has(e.evaluator_id) && studentIds.has(e.evaluatee_id)));

  const evals = evaluations.filter(inClass).filter(e => roundById[`phase-${e.phase}`]).map(e => {
    const round = roundById[`phase-${e.phase}`];
    const scores = PHASE_CRITERIA.map(c => ({
      criterion_id: c.id, criterion_name: c.name, score: e[c.id] ?? null, question_type: 'likert', text_response: null
    }));
    scores.push({ criterion_id: 'score', criterion_name: 'Score /100', score: e.score ?? null, question_type: 'likert', text_response: null });
    return {
      id: `e-${e.id}`,
      round_id: round.id,
      evaluator_id: e.evaluator_id,
      evaluator_name: e.evaluator_name,
      recipient_kind: 'student',
      recipient_id: e.evaluatee_id,
      recipient_name: e.evaluatee_name,
      scores,
      ...averages(round, scores),
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
        norm_score: null,
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
  const rounds = assignments.flatMap(a => {
    const evalTypes = (a.eval_types || []).filter(et => et.eval_type !== 'paper_review');
    // An assignment with a single round is labeled by the assignment alone
    const multi = evalTypes.length > 1;
    return evalTypes.map(et => finishRound({
      id: et.id,
      label: multi ? `${a.name} – ${et.name}` : a.name,
      assignment_name: a.name,
      name: et.name,
      multi,
      type: et.eval_type,
      target: et.target_type === 'group' ? 'group' : 'individual',
      criteria: (et.criteria || []).map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        max_value: c.max_value || 5,
        question_type: c.question_type || 'likert',
        in_avg: (c.question_type || 'likert') === 'likert'
      })),
      points: false,
      presentation_slots: et.presentation_slots || []
    }));
  });
  const roundById = Object.fromEntries(rounds.map(r => [r.id, r]));

  const convert = (e, kind) => {
    const round = roundById[e.eval_type_id];
    const scores = (e.scores || []).map(s => ({
      criterion_id: s.criterion_id,
      criterion_name: s.criterion_name,
      score: s.score,
      question_type: s.question_type || 'likert',
      text_response: s.text_response || null
    }));
    return {
      id: `${kind === 'group' ? 'g' : 'i'}-${e.id}`,
      round_id: e.eval_type_id,
      evaluator_id: e.evaluator_id,
      evaluator_name: e.evaluator_name,
      recipient_kind: kind,
      recipient_id: kind === 'group' ? e.group_id : e.evaluatee_id,
      recipient_name: kind === 'group' ? e.group_name : e.evaluatee_name,
      scores,
      ...averages(round, scores),
      points: null,
      comments: e.comments,
      attachments: e.attachments || [],
      submitted_at: e.submitted_at,
      is_late: !!e.is_late
    };
  };

  const evals = [
    ...(assignmentEvaluations?.individual_evaluations || []).filter(e => roundById[e.eval_type_id]).map(e => convert(e, 'student')),
    ...(assignmentEvaluations?.group_evaluations || []).filter(e => roundById[e.eval_type_id]).map(e => convert(e, 'group'))
  ];

  return { rounds, evals };
}

function indexEvals(rounds, evals) {
  const evalsByRound = {};
  rounds.forEach(r => { evalsByRound[r.id] = []; });
  evals.forEach(e => { if (evalsByRound[e.round_id]) evalsByRound[e.round_id].push(e); });
  return evalsByRound;
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
  const roundById = Object.fromEntries(rounds.map(r => [r.id, r]));

  // Flag self-evaluations and evaluations between people who are no longer
  // groupmates (group membership only records the present, so a mismatch
  // means one of them has since changed groups)
  evals.forEach(e => {
    const round = roundById[e.round_id];
    e.is_self = e.recipient_kind === 'student' && e.evaluator_id === e.recipient_id;
    e.is_former_group = false;
    if (e.recipient_kind === 'student' && !e.is_self && round && round.type !== 'audience') {
      const recipientGroup = groupOfStudent[e.recipient_id];
      const evaluatorGroup = groupOfStudent[e.evaluator_id];
      if (recipientGroup && evaluatorGroup?.id !== recipientGroup.id) e.is_former_group = true;
    }
  });

  const scoredRounds = rounds.filter(r => !r.points);
  const overallMaxes = [...new Set(scoredRounds.map(r => r.scaleMax))];
  const uniformOverall = scoredRounds.every(r => r.uniformScale) && overallMaxes.length <= 1;

  return {
    isAssignmentMode,
    students,
    groups,
    rounds,
    evals,
    evalsByRound: indexEvals(rounds, evals),
    studentById: Object.fromEntries(students.map(s => [s.id, s])),
    groupById: Object.fromEntries(groups.map(g => [g.id, g])),
    hasSelf: evals.some(e => e.is_self),
    hasFormerGroup: evals.some(e => e.is_former_group),
    uniformOverall,
    overallMax: uniformOverall && overallMaxes.length === 1 ? overallMaxes[0] : 100
  };
}

/** A copy of the model with some evaluations left out of every total. */
export function filterModel(model, { includeSelf = true, includeFormerGroup = true } = {}) {
  if (includeSelf && includeFormerGroup) return model;
  const evals = model.evals.filter(e => (includeSelf || !e.is_self) && (includeFormerGroup || !e.is_former_group));
  return { ...model, evals, evalsByRound: indexEvals(model.rounds, evals) };
}

/**
 * How to present an average for a round (or, with round null, the overall
 * average across rounds): the raw value on its scale, or a percent of the
 * maximum when scales are mixed.
 */
export function scoreDisplay(model, round) {
  if (round) return round.uniformScale ? { percent: false, max: round.scaleMax } : { percent: true, max: 100 };
  return model.uniformOverall ? { percent: false, max: model.overallMax } : { percent: true, max: 100 };
}

/** The displayable average of a set of evaluations under scoreDisplay. */
export function displayAverage(model, round, evals) {
  const { percent } = scoreDisplay(model, round);
  return percent ? pct(mean(evals.map(e => e.norm_score))) : mean(evals.map(e => e.avg_score));
}

const pct = (v) => (v == null ? null : v * 100);

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
 * Summary of what a student received in a round: count, displayable
 * average, criterion averages, and (for points rounds) total points.
 */
export function studentRoundCell(model, round, student) {
  const evals = evalsForStudent(model, round, student);
  return {
    count: evals.length,
    avg: round.points ? null : displayAverage(model, round, evals),
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
    return { count: evals.length, avg: displayAverage(model, round, evals), points: null, criterionAvgs: criterionAverages(round, evals), evals, perMember: false };
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
  return displayAverage(model, null, scored);
}

export function groupOverall(model, rounds, group) {
  const members = group.memberIds.map(id => model.studentById[id]).filter(Boolean);
  return mean(members.map(m => studentOverall(model, rounds, m)));
}

/** How many evaluations a student submitted in the given rounds. */
export function givenCount(model, rounds, studentId) {
  return rounds.reduce((sum, r) => sum + (model.evalsByRound[r.id] || []).filter(e => e.evaluator_id === studentId).length, 0);
}

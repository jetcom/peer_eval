/**
 * The evaluator's side of the report model: for each student, how many
 * evaluations each round asks of them and how many they have turned in.
 *
 * What a round asks follows the same rules as the Progress tab:
 *   audience rounds       the server's required count (minimum completion,
 *                         assignments, and excusals are already applied)
 *   individual rounds     every groupmate, plus themselves when the round
 *                         includes self-evaluation
 *   other group rounds    every group but their own
 */
import { mean } from './model';

const hasText = (v) => !!(v && String(v).trim());

const statusOf = (expected, completed) => {
  if (expected === 0) return 'none';
  if (completed >= expected) return 'complete';
  return completed > 0 ? 'partial' : 'not-started';
};

/** Whether an evaluation carries anything written: comments or an open response. */
export const hasWrittenFeedback = (e) => hasText(e.comments) || e.scores.some(s => hasText(s.text_response));

/** Words in a comment, counted the way the student forms count them. */
export const countWords = (text) => (hasText(text) ? String(text).trim().split(/\s+/).length : 0);

/** Whether an evaluation's comment is shorter than its round requires. */
export const isShort = (round, e) => round.min_words > 0 && countWords(e.comments) < round.min_words;

/** What one student owes in one round and what they have submitted. */
export function workForRound(model, round, student) {
  const evals = (model.evalsByRound[round.id] || []).filter(e => e.evaluator_id === student.id);
  const audience = round.type === 'audience' ? model.audienceProgress[round.id]?.[student.id] : null;

  let expected = 0;
  let completed = 0;
  // People or groups still owed an evaluation, when the round names them
  let missing = [];
  // An audience round with a choice of presenters cannot name who is missing
  let missingUnnamed = 0;

  if (audience) {
    expected = audience.required;
    completed = Math.min(audience.completed, audience.required);
    missingUnnamed = expected - completed;
  } else {
    let targets = [];
    if (round.target === 'group') {
      targets = model.groups
        .filter(g => g.id !== student.group?.id)
        .map(g => ({ kind: 'group', id: g.id, name: g.name }));
    } else if (student.group) {
      targets = student.group.memberIds
        .filter(id => round.include_self || id !== student.id)
        .map(id => ({ kind: 'student', id, name: model.studentById[id]?.name || 'Unknown student' }));
    }
    expected = targets.length;
    completed = Math.min(evals.length, expected);
    if (completed < expected) {
      missing = targets
        .filter(t => !evals.some(e => e.recipient_kind === t.kind && e.recipient_id === t.id))
        .map(t => t.name);
    }
  }

  const short = evals.filter(e => isShort(round, e)).length;
  const status = statusOf(expected, completed);

  return {
    round,
    evals,
    expected,
    completed,
    short,
    // The round at a glance: 'short' is everything submitted but a comment under the minimum
    mark: status === 'complete' && short > 0 ? 'short' : status,
    missing,
    missingUnnamed,
    late: evals.filter(e => e.is_late).length,
    written: evals.filter(hasWrittenFeedback).length
  };
}

/**
 * One row per student across the given rounds: totals, a status, and the
 * per-round breakdown. Teammates sit together, ungrouped students last.
 */
export function evaluatorRows(model, rounds, students) {
  return students
    .map(student => {
      const work = rounds.map(r => workForRound(model, r, student));
      const evals = work.flatMap(w => w.evals);
      const expected = work.reduce((sum, w) => sum + w.expected, 0);
      const completed = work.reduce((sum, w) => sum + w.completed, 0);
      const dates = evals.map(e => e.submitted_at).filter(Boolean).map(d => new Date(d).getTime());
      return {
        student,
        work,
        evals,
        expected,
        completed,
        percentage: expected > 0 ? Math.round((completed / expected) * 100) : null,
        status: statusOf(expected, completed),
        submitted: evals.length,
        late: work.reduce((sum, w) => sum + w.late, 0),
        short: work.reduce((sum, w) => sum + w.short, 0),
        written: work.reduce((sum, w) => sum + w.written, 0),
        lastSubmitted: dates.length > 0 ? new Date(Math.max(...dates)) : null,
        avgNorm: mean(evals.map(e => e.norm_score)),
        avgRaw: mean(evals.map(e => e.avg_score))
      };
    })
    .sort((a, b) => {
      const ga = a.student.group;
      const gb = b.student.group;
      if (!ga !== !gb) return ga ? -1 : 1;
      return (ga?.name || '').localeCompare(gb?.name || '', undefined, { numeric: true })
        || a.student.name.localeCompare(b.student.name);
    });
}

/** Completion totals over a set of evaluator rows. */
export function summarize(rows) {
  const owing = rows.filter(r => r.status !== 'none');
  const expected = rows.reduce((sum, r) => sum + r.expected, 0);
  const completed = rows.reduce((sum, r) => sum + r.completed, 0);
  const submitted = rows.reduce((sum, r) => sum + r.submitted, 0);
  return {
    expected,
    completed,
    percentage: expected > 0 ? Math.round((completed / expected) * 100) : null,
    evaluators: owing.length,
    complete: owing.filter(r => r.status === 'complete').length,
    partial: owing.filter(r => r.status === 'partial').length,
    notStarted: owing.filter(r => r.status === 'not-started').length,
    submitted,
    late: rows.reduce((sum, r) => sum + r.late, 0),
    short: rows.reduce((sum, r) => sum + r.short, 0),
    written: rows.reduce((sum, r) => sum + r.written, 0)
  };
}

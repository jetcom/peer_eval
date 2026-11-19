export function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadCSV(filename, rows) {
  const csvContent = rows.map(r => r.map(escapeCSV).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename.replace(/\s+/g, '_');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export const fmt = (v, digits = 2) => (v == null ? '' : Number(v).toFixed(digits));

const fileName = ({ className, round, scopeName }, suffix) =>
  [className || 'class', round.label, scopeName, suffix].filter(Boolean).join('_').replace(/[\\/:]/g, '-') + '.csv';

const avgCell = (model, round, value) => {
  if (value == null) return '';
  return round.uniformScale ? fmt(value) : `${Math.round(value)}%`;
};

/**
 * One row per student (or group) in the round as shown on screen: how many
 * evaluations they received and their average on each criterion.
 */
export function exportRoundAverages({ model, round, recipients, className, scopeName }) {
  const groupRound = round.target === 'group';
  const likert = round.criteria.filter(c => c.question_type === 'likert');
  const headers = [
    ...(groupRound ? ['Group'] : ['Student', 'Email', 'Group']),
    '# Evaluations',
    ...likert.map(c => c.name),
    round.points ? 'Points' : 'Avg'
  ];
  const rows = recipients.map(r => [
    ...(groupRound ? [r.name] : [r.name, r.email, r.groupName]),
    r.count,
    ...likert.map(c => fmt(r.criterionAvgs[c.id])),
    r.count === 0 ? '' : round.points ? r.points : avgCell(model, round, r.avg)
  ]);
  downloadCSV(fileName({ className, round, scopeName }, 'averages'), [headers, ...rows]);
}

/**
 * One row per evaluation received by the students (or groups) shown on
 * screen: each evaluator's scores, written answers, and comments.
 */
export function exportRoundResponses({ model, round, recipients, className, scopeName }) {
  const groupRound = round.target === 'group';
  const headers = [
    ...(groupRound ? ['Group'] : ['Student', 'Email', 'Group']),
    'Evaluator', 'Evaluator Group',
    ...round.criteria.map(c => c.name),
    round.points ? 'Points' : 'Avg',
    'Comments', 'Submitted', 'Late'
  ];
  const rows = [];
  recipients.forEach(r => {
    [...r.evals].sort((a, b) => a.evaluator_name.localeCompare(b.evaluator_name)).forEach(e => {
      const answer = (c) => {
        const s = e.scores.find(sc => sc.criterion_id === c.id);
        if (!s) return '';
        return c.question_type === 'likert' ? (s.score ?? '') : (s.text_response || '');
      };
      rows.push([
        ...(groupRound ? [r.name] : [r.name, r.email, r.groupName]),
        e.evaluator_name + (e.is_self ? ' (self)' : ''),
        model.studentById[e.evaluator_id]?.group?.name || '',
        ...round.criteria.map(answer),
        round.points ? (e.points ?? 0) : avgCell(model, round, round.uniformScale ? e.avg_score : (e.norm_score == null ? null : e.norm_score * 100)),
        e.comments || '',
        e.submitted_at ? new Date(e.submitted_at).toLocaleString() : '',
        e.is_late ? 'Yes' : 'No'
      ]);
    });
  });
  downloadCSV(fileName({ className, round, scopeName }, 'responses'), [headers, ...rows]);
}

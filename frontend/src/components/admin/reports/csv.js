import { typeLabel } from './model';

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

/**
 * Long-format export: one row per evaluation across every round, with a
 * column for each distinct criterion name. Works for any class structure.
 */
export function exportAllEvaluations(model, className) {
  const criterionNames = [];
  model.rounds.forEach(r => r.criteria.forEach(c => {
    if (!criterionNames.includes(c.name)) criterionNames.push(c.name);
  }));

  const headers = [
    'Assignment', 'Round', 'Type', 'Recipient Type', 'Recipient', 'Recipient Group',
    'Evaluator', 'Evaluator Group', 'Self', 'Former Group', 'Submitted', 'Late',
    ...criterionNames, 'Avg', 'Avg % of Max', 'Points', 'Comments'
  ];

  const rows = [headers];
  model.rounds.forEach(round => {
    (model.evalsByRound[round.id] || []).forEach(e => {
      const recipientGroup = e.recipient_kind === 'group'
        ? e.recipient_name
        : model.studentById[e.recipient_id]?.group?.name || '';
      const evaluatorGroup = model.studentById[e.evaluator_id]?.group?.name || '';
      const byName = {};
      e.scores.forEach(s => {
        const c = round.criteria.find(cr => cr.id === s.criterion_id);
        if (!c) return;
        byName[c.name] = c.question_type === 'likert' ? (s.score ?? '') : (s.text_response || '');
      });
      rows.push([
        round.assignment_name, round.name, typeLabel(round.type),
        e.recipient_kind === 'group' ? 'Group' : 'Student', e.recipient_name, recipientGroup,
        e.evaluator_name, evaluatorGroup, e.is_self ? 'Yes' : 'No', e.is_former_group ? 'Yes' : 'No',
        e.submitted_at ? new Date(e.submitted_at).toLocaleString() : '', e.is_late ? 'Yes' : 'No',
        ...criterionNames.map(n => byName[n] ?? ''),
        fmt(e.avg_score), e.norm_score == null ? '' : fmt(e.norm_score * 100, 1), e.points ?? '', e.comments || ''
      ]);
    });
  });

  downloadCSV(`${className || 'class'}_all_evaluations.csv`, rows);
}

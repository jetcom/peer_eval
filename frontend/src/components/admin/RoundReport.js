import React, { useState } from 'react';
import { formatWallClock } from '../../utils/wallClock';

// Helper to escape CSV values
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCSV(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

const average = (nums) => (nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null);

export const EVAL_TYPE_LABELS = { audience: 'Audience', peer: 'Peer', self: 'Self' };
export const evalTypeLabel = (evalType) => EVAL_TYPE_LABELS[evalType] || evalType;

// Colored score badge; thresholds are relative to the criterion's scale
function ScoreBadge({ value, max, digits = 1 }) {
  if (value == null) return <span style={{ color: '#999' }}>-</span>;
  const ratio = max > 0 ? value / max : 0;
  const background = ratio >= 0.8 ? '#27ae60' : ratio >= 0.6 ? '#f39c12' : '#e74c3c';
  return (
    <span style={{ padding: '2px 8px', borderRadius: '3px', background, color: 'white', fontSize: '0.85rem' }}>
      {value.toFixed(digits)}
    </span>
  );
}

/**
 * Report of one evaluation round (audience, peer, or self) organized by the
 * student or group that received the evaluations: per-criterion averages
 * across all evaluators, then every evaluator's scores and written feedback
 * for each recipient. Peer rounds are grouped by the recipient's group so
 * within-group evaluations read together.
 */
function RoundReport({
  darkMode,
  className,
  assignments,
  individualEvals,
  groupEvals,
  classGroups,
  classStudents,
  showGroups,
  reportGroup,
  openImageViewer
}) {
  const [selectedEvalTypeId, setSelectedEvalTypeId] = useState(null);
  // Follows the page-level "Filter by Group" selector
  const filterGroupId = reportGroup && reportGroup !== 'all' ? parseInt(reportGroup) : null;
  const filterGroup = filterGroupId ? classGroups.find(g => g.id === filterGroupId) : null;

  const rounds = assignments.flatMap(a =>
    (a.eval_types || [])
      .filter(et => et.eval_type !== 'paper_review')
      .map(et => ({ ...et, assignment_name: a.name }))
  );
  if (rounds.length === 0) return null;

  const evalType = rounds.find(et => et.id === selectedEvalTypeId) || rounds[0];
  const isGroupTarget = evalType.target_type === 'group';
  const isAudience = evalType.eval_type === 'audience';
  const isPeer = evalType.eval_type === 'peer';
  const criteria = evalType.criteria || [];
  const likertCriteria = criteria.filter(c => (c.question_type || 'likert') === 'likert');
  const openCriteria = criteria.filter(c => (c.question_type || 'likert') !== 'likert');

  const mutedColor = darkMode ? '#a0a0a0' : '#666';
  const borderColor = darkMode ? '#444' : '#ddd';
  const panelBg = darkMode ? '#1a1a1a' : '#f8f9fa';

  // What to call the party that received the evaluations
  const recipientNoun = isGroupTarget ? 'Group' : isAudience ? 'Presenter' : 'Student';
  const sourceNoun = isAudience ? 'the audience' : isPeer ? 'their peers' : 'themselves';

  const groupOfStudent = (studentId) => classGroups.find(g => g.members?.some(m => m.id === studentId));

  // Evaluations for this round, each tagged with the recipient it was about
  const evals = (isGroupTarget ? groupEvals : individualEvals)
    .filter(e => e.eval_type_id === evalType.id)
    .map(e => ({
      ...e,
      recipient_id: isGroupTarget ? e.group_id : e.evaluatee_id,
      recipient_name: isGroupTarget ? e.group_name : e.evaluatee_name,
      is_self: !isGroupTarget && e.evaluator_id === e.evaluatee_id
    }));

  // Every recipient in the round, even those nobody has evaluated yet
  const slotByRecipient = {};
  (evalType.presentation_slots || []).forEach(s => {
    slotByRecipient[isGroupTarget ? s.group_id : s.user_id] = s.presentation_date;
  });
  const candidateStudents = filterGroup
    ? (filterGroup.members || [])
    : classStudents;
  const recipients = (isGroupTarget
    ? classGroups.filter(g => !filterGroupId || g.id === filterGroupId).map(g => ({ id: g.id, name: g.name, group_name: '' }))
    : candidateStudents
        .filter(s => s.role === 'student')
        .map(s => ({ id: s.id, name: `${s.last_name}, ${s.first_name}`, group_name: groupOfStudent(s.id)?.name || '' }))
  )
    .map(r => {
      const received = evals.filter(e => e.recipient_id === r.id);
      const criterionAvgs = {};
      likertCriteria.forEach(c => {
        criterionAvgs[c.id] = average(
          received.map(e => e.scores.find(s => s.criterion_id === c.id)?.score).filter(v => v != null)
        );
      });
      return {
        ...r,
        presentation_date: slotByRecipient[r.id] || null,
        evaluations: received.sort((a, b) => a.evaluator_name.localeCompare(b.evaluator_name)),
        criterionAvgs,
        overallAvg: average(received.map(e => e.avg_score).filter(v => v != null))
      };
    })
    // Peer rounds read best with each group's members together
    .sort((a, b) => (isPeer ? a.group_name.localeCompare(b.group_name) : 0) || a.name.localeCompare(b.name));

  const showSummary = recipients.length > 1;
  const showGroupColumn = !isGroupTarget && showGroups;

  const maxScale = likertCriteria.length > 0 ? Math.max(...likertCriteria.map(c => c.max_value || 5)) : 5;

  const exportCSV = () => {
    const headers = [recipientNoun];
    if (showGroupColumn) headers.push('Group');
    headers.push('Evaluator', 'Submitted', 'Late');
    likertCriteria.forEach(c => headers.push(c.name));
    headers.push('Avg');
    openCriteria.forEach(c => headers.push(c.name));
    headers.push('Comments');

    const rows = [];
    recipients.forEach(r => {
      r.evaluations.forEach(e => {
        const row = [r.name];
        if (showGroupColumn) row.push(r.group_name);
        row.push(
          e.is_self ? `${e.evaluator_name} (self)` : e.evaluator_name,
          e.submitted_at ? new Date(e.submitted_at).toLocaleString() : '',
          e.is_late ? 'Yes' : 'No'
        );
        likertCriteria.forEach(c => row.push(e.scores.find(s => s.criterion_id === c.id)?.score ?? ''));
        row.push(e.avg_score != null ? e.avg_score.toFixed(2) : '');
        openCriteria.forEach(c => row.push(e.scores.find(s => s.criterion_id === c.id)?.text_response || ''));
        row.push(e.comments || '');
        rows.push(row);
      });
    });

    const csvContent = [headers.map(escapeCSV).join(','), ...rows.map(r => r.map(escapeCSV).join(','))].join('\n');
    const base = `${className || 'class'}_${evalType.assignment_name}_${evalType.name}_${evalTypeLabel(evalType.eval_type)}`.replace(/\s+/g, '_');
    downloadCSV(`${base}_evaluations.csv`, csvContent);
  };

  const th = { textAlign: 'left', padding: '10px' };
  const thCenter = { ...th, textAlign: 'center' };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0 }}>Evaluations by Round</h2>
        <button
          onClick={exportCSV}
          className="btn btn-secondary"
          style={{ fontSize: '0.85rem', padding: '8px 12px' }}
          disabled={evals.length === 0}
        >
          Export CSV
        </button>
      </div>
      <p style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '15px' }}>
        Everything each {recipientNoun.toLowerCase()} received from {sourceNoun} in one round: per-criterion averages, then every evaluator's scores and written feedback.
      </p>

      {/* Round selector; the recipient set follows the page-level group filter */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', fontWeight: '500' }}>Round:</label>
        <select
          value={evalType.id}
          onChange={(e) => setSelectedEvalTypeId(parseInt(e.target.value))}
          style={{ padding: '8px', fontSize: '0.9rem', minWidth: '200px' }}
        >
          {rounds.map(et => (
            <option key={et.id} value={et.id}>
              {et.assignment_name} – {et.name} ({evalTypeLabel(et.eval_type)})
            </option>
          ))}
        </select>
      </div>

      {recipients.length === 0 ? (
        <p>No {isGroupTarget ? 'groups' : 'students'} match the selected group filter.</p>
      ) : evals.length === 0 ? (
        <p>No {evalTypeLabel(evalType.eval_type).toLowerCase()} evaluations have been submitted for this round yet.</p>
      ) : (
        <>
          {/* Summary: one row per recipient, one column per criterion */}
          {showSummary && (
            <div style={{ overflowX: 'auto', marginBottom: '25px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>{recipientNoun}</th>
                    {showGroupColumn && <th style={th}>Group</th>}
                    <th style={thCenter}># Evals</th>
                    {likertCriteria.map(c => (
                      <th key={c.id} style={thCenter} title={c.description || ''}>{c.name}</th>
                    ))}
                    <th style={{ ...thCenter, borderLeft: '2px solid #586e75' }}>Overall</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r, idx) => (
                    <tr key={r.id} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.05)' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold' }}>{r.name}</td>
                      {showGroupColumn && <td style={{ padding: '10px', color: mutedColor }}>{r.group_name || 'No Group'}</td>}
                      <td style={{ textAlign: 'center', padding: '10px' }}>{r.evaluations.length}</td>
                      {likertCriteria.map(c => (
                        <td key={c.id} style={{ textAlign: 'center', padding: '10px' }}>
                          <ScoreBadge value={r.criterionAvgs[c.id]} max={c.max_value || 5} />
                        </td>
                      ))}
                      <td style={{ textAlign: 'center', padding: '10px', borderLeft: '2px solid #586e75', fontWeight: 'bold' }}>
                        {r.overallAvg != null ? r.overallAvg.toFixed(2) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Detail: every evaluator's scores and written feedback per recipient */}
          {recipients.map(r => (
            <div key={r.id} style={{ marginBottom: '30px' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px',
                borderBottom: `2px solid ${borderColor}`, paddingBottom: '8px', marginBottom: '10px'
              }}>
                <h3 style={{ margin: 0 }}>
                  {r.name}
                  {showGroupColumn && r.group_name && (
                    <span style={{ fontSize: '0.85rem', fontWeight: 'normal', color: mutedColor, marginLeft: '10px' }}>{r.group_name}</span>
                  )}
                </h3>
                <span style={{ fontSize: '0.85rem', color: mutedColor }}>
                  {r.presentation_date && <>presented {formatWallClock(r.presentation_date)} · </>}
                  {r.evaluations.length} evaluation{r.evaluations.length === 1 ? '' : 's'}
                  {r.overallAvg != null && <> · overall {r.overallAvg.toFixed(2)} / {maxScale}</>}
                </span>
              </div>

              {r.evaluations.length === 0 ? (
                <p style={{ fontSize: '0.9rem', color: mutedColor, margin: 0 }}>No evaluations received yet.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={th}>Evaluator</th>
                        {likertCriteria.map(c => (
                          <th key={c.id} style={thCenter} title={c.description || ''}>{c.name}</th>
                        ))}
                        <th style={{ ...thCenter, borderLeft: '2px solid #586e75' }}>Avg</th>
                        <th style={th}>Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.evaluations.map((e, idx) => {
                        const openResponses = openCriteria
                          .map(c => ({ name: c.name, text: e.scores.find(s => s.criterion_id === c.id)?.text_response }))
                          .filter(resp => resp.text);
                        const hasFeedback = openResponses.length > 0 || e.comments || (e.attachments && e.attachments.length > 0);
                        const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.05)';
                        return (
                          <React.Fragment key={e.id}>
                            <tr style={{ background: rowBg }}>
                              <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                                {e.evaluator_name}
                                {e.is_self && <span style={{ color: mutedColor, marginLeft: '6px', fontSize: '0.8rem' }}>(self)</span>}
                              </td>
                              {likertCriteria.map(c => {
                                const score = e.scores.find(s => s.criterion_id === c.id)?.score;
                                return (
                                  <td key={c.id} style={{ textAlign: 'center', padding: '10px' }}>
                                    {score != null ? score : <span style={{ color: '#999' }}>-</span>}
                                  </td>
                                );
                              })}
                              <td style={{ textAlign: 'center', padding: '10px', borderLeft: '2px solid #586e75' }}>
                                <ScoreBadge value={e.avg_score} max={maxScale} />
                              </td>
                              <td style={{ padding: '10px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                {e.submitted_at ? new Date(e.submitted_at).toLocaleDateString() : '-'}
                                {e.is_late && <span style={{ color: '#e74c3c', marginLeft: '6px' }}>late</span>}
                              </td>
                            </tr>
                            {hasFeedback && (
                              <tr style={{ background: rowBg }}>
                                <td colSpan={likertCriteria.length + 3} style={{ padding: '0 10px 12px 10px' }}>
                                  <div style={{
                                    padding: '10px 12px', borderRadius: '6px', fontSize: '0.9rem',
                                    background: panelBg, border: `1px solid ${borderColor}`
                                  }}>
                                    {openResponses.map((resp, i) => (
                                      <div key={i} style={{ marginBottom: '6px' }}>
                                        <span style={{ fontSize: '0.8rem', color: mutedColor }}>{resp.name}:</span> {resp.text}
                                      </div>
                                    ))}
                                    {e.comments && (
                                      <div style={{ marginBottom: '6px' }}>
                                        <span style={{ fontSize: '0.8rem', color: mutedColor }}>Comments:</span> {e.comments}
                                      </div>
                                    )}
                                    {e.attachments && e.attachments.length > 0 && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                        {e.attachments.map((att, attIdx) => (
                                          <button
                                            key={att.id}
                                            onClick={() => openImageViewer(e.attachments, attIdx)}
                                            style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                                          >
                                            <img src={att.url} alt={att.fileName} style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px' }} />
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default RoundReport;

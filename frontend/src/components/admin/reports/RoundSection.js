import React from 'react';
import ScoreBadge from './ScoreBadge';
import { typeLabel, sourceLabel, criterionAverages, scoreDisplay, displayAverage } from './model';
import { formatWallClock } from '../../../utils/wallClock';

/**
 * One round's worth of evaluations received by a single recipient: the
 * criterion averages, then every evaluator's scores and written feedback.
 */
function RoundSection({ model, round, evals, note, presentationDate, darkMode, openImageViewer }) {
  const mutedColor = darkMode ? '#a0a0a0' : '#666';
  const borderColor = darkMode ? '#444' : '#ddd';
  const panelBg = darkMode ? '#1a1a1a' : '#f8f9fa';
  const th = { textAlign: 'left', padding: '8px 10px', whiteSpace: 'nowrap' };
  const thCenter = { ...th, textAlign: 'center' };

  const likert = round.criteria.filter(c => c.question_type === 'likert');
  const open = round.criteria.filter(c => c.question_type !== 'likert');
  const sorted = [...evals].sort((a, b) => a.evaluator_name.localeCompare(b.evaluator_name));
  const avgs = criterionAverages(round, evals);
  const display = scoreDisplay(model, round);
  const evalAvg = (e) => (display.percent ? (e.norm_score == null ? null : e.norm_score * 100) : e.avg_score);
  const overall = round.points
    ? evals.reduce((sum, e) => sum + (e.points || 0), 0)
    : displayAverage(model, round, evals);

  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px',
        borderBottom: `2px solid ${borderColor}`, paddingBottom: '6px', marginBottom: '10px'
      }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
          {round.label}
          <span style={{
            marginLeft: '8px', padding: '1px 7px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 'normal',
            background: darkMode ? '#333' : '#e8ecef', color: mutedColor, verticalAlign: 'middle'
          }}>
            {typeLabel(round.type)}
          </span>
        </h3>
        <span style={{ fontSize: '0.85rem', color: mutedColor }}>
          {sourceLabel(round)}
          {presentationDate && <> · presented {formatWallClock(presentationDate)}</>}
          {' · '}{evals.length} evaluation{evals.length === 1 ? '' : 's'}
          {evals.length > 0 && overall != null && (
            round.points
              ? <> · <strong>{overall} pts</strong></>
              : display.percent
                ? <> · avg <strong>{Math.round(overall)}%</strong> of maximum</>
                : <> · avg <strong>{overall.toFixed(2)}</strong> / {round.scaleMax}</>
          )}
        </span>
      </div>
      {note && <p style={{ fontSize: '0.85rem', color: mutedColor, margin: '0 0 10px 0' }}>{note}</p>}
      {!round.points && display.percent && (
        <p style={{ fontSize: '0.8rem', color: mutedColor, margin: '0 0 10px 0' }}>Criteria use different scales, so averages are shown as a percent of the maximum.</p>
      )}

      {evals.length === 0 ? (
        <p style={{ fontSize: '0.9rem', color: mutedColor, margin: 0 }}>No evaluations received yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Evaluator</th>
                {likert.map(c => (
                  <th key={c.id} style={thCenter} title={c.description || ''}>{c.name}</th>
                ))}
                {round.points
                  ? <th style={thCenter}>Points</th>
                  : likert.length > 0 && <th style={{ ...thCenter, borderLeft: '2px solid #586e75' }}>Avg</th>}
                <th style={th}>Submitted</th>
              </tr>
              {/* Averages row sits under the header so it reads like a summary */}
              {likert.length > 0 && evals.length > 1 && (
                <tr style={{ fontSize: '0.85rem', color: mutedColor }}>
                  <td style={{ padding: '4px 10px', fontStyle: 'italic' }}>Average</td>
                  {likert.map(c => (
                    <td key={c.id} style={{ textAlign: 'center', padding: '4px 10px' }}>
                      <ScoreBadge value={avgs[c.id]} max={c.max_value} />
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', padding: '4px 10px', borderLeft: '2px solid #586e75' }}>
                    <ScoreBadge value={overall} max={display.max} digits={2} percent={display.percent} />
                  </td>
                  <td />
                </tr>
              )}
            </thead>
            <tbody>
              {sorted.map((e, idx) => {
                const isSelf = e.is_self;
                const openResponses = open
                  .map(c => ({ name: c.name, text: e.scores.find(s => s.criterion_id === c.id)?.text_response }))
                  .filter(r => r.text);
                const hasFeedback = openResponses.length > 0 || e.comments || (e.attachments && e.attachments.length > 0);
                const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.05)';
                const colSpan = likert.length + 3;
                return (
                  <React.Fragment key={e.id}>
                    <tr style={{ background: rowBg }}>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                        {e.evaluator_name}
                        {isSelf && <span style={{ color: mutedColor, marginLeft: '6px', fontSize: '0.8rem' }}>(self)</span>}
                        {e.is_former_group && <span style={{ color: mutedColor, marginLeft: '6px', fontSize: '0.8rem' }} title="No longer in this student's group">(former group)</span>}
                      </td>
                      {likert.map(c => {
                        const score = e.scores.find(s => s.criterion_id === c.id)?.score;
                        return (
                          <td key={c.id} style={{ textAlign: 'center', padding: '8px 10px' }}>
                            {score != null ? score : <span style={{ color: '#999' }}>-</span>}
                          </td>
                        );
                      })}
                      {round.points
                        ? <td style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 'bold' }}>{e.points ?? 0}</td>
                        : likert.length > 0 && (
                          <td style={{ textAlign: 'center', padding: '8px 10px', borderLeft: '2px solid #586e75' }}>
                            <ScoreBadge value={evalAvg(e)} max={display.max} percent={display.percent} />
                          </td>
                        )}
                      <td style={{ padding: '8px 10px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                        {e.submitted_at ? new Date(e.submitted_at).toLocaleDateString() : '-'}
                        {e.is_late && <span style={{ color: '#e74c3c', marginLeft: '6px' }}>late</span>}
                      </td>
                    </tr>
                    {hasFeedback && (
                      <tr style={{ background: rowBg }}>
                        <td colSpan={colSpan} style={{ padding: '0 10px 10px 10px' }}>
                          <div style={{
                            padding: '8px 12px', borderRadius: '6px', fontSize: '0.9rem',
                            background: panelBg, border: `1px solid ${borderColor}`, whiteSpace: 'pre-wrap'
                          }}>
                            {openResponses.map((r, i) => (
                              <div key={i} style={{ marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.8rem', color: mutedColor }}>{r.name}:</span> {r.text}
                              </div>
                            ))}
                            {e.comments && (
                              <div style={{ marginBottom: openResponses.length > 0 ? '6px' : 0 }}>
                                {openResponses.length > 0 && <span style={{ fontSize: '0.8rem', color: mutedColor }}>Comments: </span>}
                                {e.comments}
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
  );
}

export default RoundSection;

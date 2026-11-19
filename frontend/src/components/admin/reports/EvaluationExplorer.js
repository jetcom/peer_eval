import React, { useState } from 'react';
import ScoreBadge from './ScoreBadge';
import RoundSection from './RoundSection';
import { typeLabel, sourceLabel, recipientsForRound, scoreDisplay, displayAverage } from './model';
import { exportRoundAverages, exportRoundResponses, fmt } from './csv';
import { formatWallClock } from '../../../utils/wallClock';

/**
 * The Reports tab's evaluation report: pick one round (a peer evaluation, an
 * audience evaluation, a phase...), optionally narrow it to one group, and
 * read or export what each student or group received.
 *
 * Props:
 *   reportGroup / setReportGroup  the group filter ('all' or a group id),
 *     kept on the dashboard so it survives tab switches.
 */
function EvaluationExplorer({ model, className, darkMode, reportGroup, setReportGroup, openImageViewer }) {
  const [roundId, setRoundId] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());

  const muted = darkMode ? '#a0a0a0' : '#666';
  const borderColor = darkMode ? '#444' : '#ddd';

  if (model.rounds.length === 0) {
    return (
      <div className="card">
        <h2>Evaluation Reports</h2>
        <p>This class has no evaluation rounds yet.</p>
      </div>
    );
  }

  // Until one is picked, show the first round that has anything in it
  const round = model.rounds.find(r => String(r.id) === String(roundId))
    || model.rounds.find(r => model.evalsByRound[r.id].length > 0)
    || model.rounds[0];

  const hasGroups = model.groups.length > 0;
  const group = hasGroups && reportGroup && reportGroup !== 'all' ? model.groupById[parseInt(reportGroup)] || null : null;

  const recipients = recipientsForRound(model, round, group);
  const groupRound = round.target === 'group';
  const showGroupColumn = !groupRound && hasGroups && !group;
  const likert = round.criteria.filter(c => c.question_type === 'likert');
  const display = scoreDisplay(model, round);
  const fmtAvg = (value) => (value == null ? '-' : display.percent ? `${Math.round(value)}%` : value.toFixed(2));

  const shownEvals = recipients.flatMap(r => r.evals);
  const shownAvg = round.points ? null : displayAverage(model, round, shownEvals);
  const withEvals = recipients.filter(r => r.count > 0);
  const allExpanded = withEvals.length > 0 && withEvals.every(r => expanded.has(r.key));

  const toggle = (key) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleAll = () => setExpanded(allExpanded ? new Set() : new Set(withEvals.map(r => r.key)));
  const changeRound = (id) => { setRoundId(id); setExpanded(new Set()); };
  const changeGroup = (value) => { setReportGroup(value); setExpanded(new Set()); };

  const exportArgs = { model, round, recipients, className, scopeName: group ? group.name : (hasGroups ? 'all groups' : '') };

  const selectStyle = {
    height: '36px', boxSizing: 'border-box', padding: '0 8px', fontSize: '0.9rem',
    border: `1px solid ${darkMode ? '#555' : '#bbb'}`, borderRadius: '4px'
  };
  const labelStyle = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', fontWeight: 500 };
  const btnStyle = { fontSize: '0.85rem', padding: '8px 12px' };
  const td = { padding: '10px', textAlign: 'center' };
  const colCount = 2 + (showGroupColumn ? 1 : 0) + likert.length + (round.points || likert.length > 0 ? 1 : 0);

  const details = (r) => (
    <>
      {r.presentationDate && (
        <p style={{ fontSize: '0.85rem', color: muted, margin: '0 0 8px 0' }}>Presented {formatWallClock(r.presentationDate)}</p>
      )}
      <RoundSection model={model} round={round} evals={r.evals} darkMode={darkMode} openImageViewer={openImageViewer} hideHeading />
    </>
  );

  const summaryCell = (r) => {
    if (r.count === 0) return <span style={{ color: '#999' }}>-</span>;
    return round.points ? <strong>{r.points} pts</strong> : <strong>{fmtAvg(r.avg)}</strong>;
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
        <h2 style={{ margin: 0 }}>Evaluation Reports</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => exportRoundAverages(exportArgs)}
            className="btn btn-primary"
            style={btnStyle}
            disabled={recipients.length === 0}
            title={`One row per ${groupRound ? 'group' : 'student'}: the averages in the table below`}
          >
            Export Averages
          </button>
          <button
            onClick={() => exportRoundResponses(exportArgs)}
            className="btn btn-secondary"
            style={btnStyle}
            disabled={shownEvals.length === 0}
            title="One row per evaluation: every evaluator's scores and comments"
          >
            Export All Responses
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
        <label style={labelStyle}>
          {model.isAssignmentMode ? 'Assignment' : 'Phase'}
          <select value={round.id} onChange={e => changeRound(e.target.value)} style={{ ...selectStyle, minWidth: '220px' }}>
            {model.rounds.map(r => (
              <option key={r.id} value={r.id}>{r.label} ({typeLabel(r.type)})</option>
            ))}
          </select>
        </label>

        {hasGroups && (
          <label style={labelStyle}>
            Group
            <select value={group ? group.id : 'all'} onChange={e => changeGroup(e.target.value)} style={{ ...selectStyle, minWidth: '160px' }}>
              <option value="all">All groups</option>
              {model.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        )}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px',
        borderBottom: `2px solid ${borderColor}`, padding: '18px 0 8px 0', marginBottom: '6px'
      }}>
        <span style={{ fontSize: '0.9rem', color: muted }}>
          {groupRound ? 'Each group' : 'Each student'}'s scores {sourceLabel(round)}
          {' · '}{shownEvals.length} evaluation{shownEvals.length === 1 ? '' : 's'}
          {shownAvg != null && <> · average <strong>{fmtAvg(shownAvg)}</strong>{!display.percent && <> / {round.scaleMax}</>}</>}
        </span>
        {withEvals.length > 0 && (
          <button type="button" onClick={toggleAll} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
            {allExpanded ? 'Hide all responses' : 'Show all responses'}
          </button>
        )}
      </div>
      {!round.points && display.percent && (
        <p style={{ fontSize: '0.8rem', color: muted, margin: '0 0 6px 0' }}>Criteria use different scales, so averages are shown as a percent of the maximum.</p>
      )}

      {recipients.length === 0 ? (
        <p>
          {groupRound
            ? 'This round evaluates groups, and this class has no groups yet.'
            : group ? 'This group has no students.' : 'No students found.'}
        </p>
      ) : (
        <>
          <div className="desktop-table" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px' }}>{groupRound ? 'Group' : 'Student'}</th>
                  {showGroupColumn && <th style={{ textAlign: 'left', padding: '10px' }}>Group</th>}
                  <th style={td}># Evals</th>
                  {likert.map(c => <th key={c.id} style={td} title={c.description || ''}>{c.name}</th>)}
                  {round.points
                    ? <th style={{ ...td, borderLeft: '2px solid #586e75' }}>Points</th>
                    : likert.length > 0 && <th style={{ ...td, borderLeft: '2px solid #586e75' }}>Avg</th>}
                </tr>
              </thead>
              <tbody>
                {recipients.map((r, idx) => {
                  const open = expanded.has(r.key);
                  const canOpen = r.count > 0;
                  const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.04)';
                  return (
                    <React.Fragment key={r.key}>
                      <tr
                        onClick={canOpen ? () => toggle(r.key) : undefined}
                        style={{ background: rowBg, cursor: canOpen ? 'pointer' : 'default' }}
                        title={canOpen ? (open ? 'Click to hide responses' : 'Click to see every evaluator\'s scores and comments') : undefined}
                      >
                        <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-block', width: '1.1em', color: muted }}>{canOpen ? (open ? '▾' : '▸') : ''}</span>
                          <strong>{r.name}</strong>
                          {r.offRoster && <span style={{ color: muted, marginLeft: '6px', fontSize: '0.8rem' }}>(not on roster)</span>}
                        </td>
                        {showGroupColumn && <td style={{ padding: '10px', color: muted }}>{r.groupName || 'No group'}</td>}
                        <td style={td}>{r.count}</td>
                        {likert.map(c => (
                          <td key={c.id} style={td}><ScoreBadge value={r.criterionAvgs[c.id]} max={c.max_value} /></td>
                        ))}
                        {(round.points || likert.length > 0) && (
                          <td style={{ ...td, borderLeft: '2px solid #586e75' }}>{summaryCell(r)}</td>
                        )}
                      </tr>
                      {open && (
                        <tr style={{ background: rowBg }}>
                          <td colSpan={colCount} style={{ padding: '4px 10px 14px 28px' }}>{details(r)}</td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mobile-card-list">
            {recipients.map(r => {
              const open = expanded.has(r.key);
              const canOpen = r.count > 0;
              return (
                <div key={r.key} className="mobile-card">
                  <div className="mobile-card-header" onClick={canOpen ? () => toggle(r.key) : undefined} style={{ cursor: canOpen ? 'pointer' : 'default' }}>
                    {r.name}
                    {canOpen && <span style={{ float: 'right', opacity: 0.6 }}>{open ? '▾' : '▸'}</span>}
                  </div>
                  {showGroupColumn && (
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Group</span>
                      <span className="mobile-card-value">{r.groupName || 'No group'}</span>
                    </div>
                  )}
                  <div className="mobile-card-row">
                    <span className="mobile-card-label"># Evals</span>
                    <span className="mobile-card-value">{r.count}</span>
                  </div>
                  {likert.map(c => (
                    <div key={c.id} className="mobile-card-row">
                      <span className="mobile-card-label">{c.name}</span>
                      <span className="mobile-card-value">{r.count > 0 ? fmt(r.criterionAvgs[c.id], 1) : '-'}</span>
                    </div>
                  ))}
                  {(round.points || likert.length > 0) && (
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">{round.points ? 'Points' : 'Avg'}</span>
                      <span className="mobile-card-value">{summaryCell(r)}</span>
                    </div>
                  )}
                  {open && <div style={{ marginTop: '10px' }}>{details(r)}</div>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default EvaluationExplorer;

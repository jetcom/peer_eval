import React, { useState } from 'react';
import ImageViewer from '../ImageViewer';
import ScoreBadge from './reports/ScoreBadge';
import { buildModel, typeLabel, scoreDisplay } from './reports/model';
import { evaluatorRows, summarize, isShort, countWords } from './reports/evaluators';
import { downloadCSV } from './reports/csv';

const STATUS = {
  complete: { label: 'Complete', color: '#27ae60' },
  partial: { label: 'In progress', color: '#f39c12' },
  'not-started': { label: 'Not started', color: '#e74c3c' },
  none: { label: 'Nothing due', color: '#95a5a6' }
};

// One mark per round, as the old submission indicators had: a green check
// only when everything is in and every comment meets the word count
const MARKS = {
  complete: { symbol: '✓', color: '#27ae60', label: 'all submitted' },
  short: { symbol: '✓', color: '#f39c12', label: 'all submitted, a comment below the word count' },
  partial: { symbol: '◐', color: '#f39c12', label: 'some submitted' },
  'not-started': { symbol: '✗', color: '#e74c3c', label: 'nothing submitted' },
  none: { symbol: '–', color: '#999', label: 'nothing due' }
};

/**
 * Evaluators tab: the Reports tab turned around. Reports shows what each
 * student received; this shows what each student gave: how many of the
 * evaluations asked of them they completed, how many were late or had
 * written feedback, and the evaluations themselves. Narrow it to one
 * assignment (or phase), one group, or one person.
 */
function EvaluatorsTab({
  darkMode,
  selectedClass,
  classes,
  classStudents,
  classGroups,
  evaluations,
  finalCommentsData,
  assignmentEvaluations,
  paperReviewData,
  loading,
  onManageExtensions
}) {
  const [roundId, setRoundId] = useState('all');
  const [groupId, setGroupId] = useState('all');
  const [studentId, setStudentId] = useState('all');
  const [expanded, setExpanded] = useState(() => new Set());
  const [expandedPaperReview, setExpandedPaperReview] = useState(null);
  const [viewer, setViewer] = useState(null); // { images, index }

  if (!selectedClass) {
    return (
      <div className="card">
        <h2>Select a Class</h2>
        <p>Please select a class from the header dropdown to view evaluators.</p>
      </div>
    );
  }

  // The class's evaluations are still on their way: say so rather than
  // report that there are none
  if (loading) {
    return (
      <div className="card">
        <h2>Evaluators</h2>
        <p>Loading evaluations…</p>
      </div>
    );
  }

  const muted = darkMode ? '#a0a0a0' : '#666';
  const borderColor = darkMode ? '#444' : '#ddd';
  const subBg = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';

  const classData = classes.find(c => c.id === parseInt(selectedClass));
  const className = classData?.name || 'class';
  const model = buildModel({
    classData,
    classStudents,
    classGroups,
    evaluations,
    finalComments: finalCommentsData,
    assignmentEvaluations
  });

  const hasGroups = model.groups.length > 0;
  const group = hasGroups && groupId !== 'all' ? model.groupById[parseInt(groupId)] || null : null;
  const round = roundId === 'all' ? null : model.rounds.find(r => String(r.id) === String(roundId)) || null;
  const rounds = round ? [round] : model.rounds;

  const groupStudents = model.students.filter(s => !group || s.group?.id === group.id);
  const person = studentId === 'all' ? null : groupStudents.find(s => s.id === parseInt(studentId)) || null;
  const shownStudents = person ? [person] : groupStudents;

  const rows = evaluatorRows(model, rounds, shownStudents);
  const stats = summarize(rows);
  const showGroupColumn = hasGroups && !group && !person;
  const showLate = model.isAssignmentMode;
  const hasWordMinimum = rounds.some(r => r.min_words > 1);
  const roundsLabel = model.isAssignmentMode ? (rounds.length === 1 ? 'Assignment' : 'Assignments') : (rounds.length === 1 ? 'Phase' : 'Phases');

  const markTitle = (w) => {
    const parts = [w.expected > 0 ? `${w.completed} of ${w.expected} completed` : 'nothing due'];
    if (w.short > 0) parts.push(`${w.short} comment${w.short === 1 ? '' : 's'} under ${w.round.min_words} word${w.round.min_words === 1 ? '' : 's'}`);
    return `${w.round.label}: ${parts.join(', ')}`;
  };
  const roundMarks = (row) => (
    <span style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>
      {row.work.map(w => (
        <span key={w.round.id} title={markTitle(w)} style={{ color: MARKS[w.mark].color, marginRight: '4px', cursor: 'help' }}>
          {MARKS[w.mark].symbol}
        </span>
      ))}
    </span>
  );

  const isOpen = (row) => !!person || expanded.has(row.student.id);
  const toggle = (id) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const changeGroup = (value) => { setGroupId(value); setStudentId('all'); setExpanded(new Set()); };

  // One round on one scale shows the raw average; anything wider is a percent of the maximum
  const rawAverages = !!round && !round.points && round.uniformScale;
  const avgGiven = (row) => (rawAverages
    ? <ScoreBadge value={row.avgRaw} max={round.scaleMax} />
    : <ScoreBadge value={row.avgNorm == null ? null : row.avgNorm * 100} percent />);

  const scopeName = [round?.label, group?.name, person?.name].filter(Boolean).join('_');
  const exportCompletion = () => {
    const headers = ['Student', 'Email', 'Group', 'Expected', 'Completed', '% Complete', 'Status',
      ...(showLate ? ['Late'] : []), 'Below word count', 'With written feedback', 'Last submitted'];
    const csvRows = rows.map(r => [
      r.student.name, r.student.email, r.student.group?.name || '', r.expected, r.completed,
      r.percentage == null ? '' : r.percentage, STATUS[r.status].label,
      ...(showLate ? [r.late] : []), r.short, r.written,
      r.lastSubmitted ? r.lastSubmitted.toLocaleString() : ''
    ]);
    downloadCSV([className, scopeName, 'evaluator_completion'].filter(Boolean).join('_').replace(/[\\/:]/g, '-') + '.csv', [headers, ...csvRows]);
  };

  const selectStyle = {
    height: '36px', boxSizing: 'border-box', padding: '0 8px', fontSize: '0.9rem',
    border: `1px solid ${darkMode ? '#555' : '#bbb'}`, borderRadius: '4px'
  };
  const labelStyle = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', fontWeight: 500 };
  const btnStyle = { fontSize: '0.85rem', padding: '8px 12px' };
  const td = { padding: '10px', textAlign: 'center' };
  const subTd = { padding: '6px 10px', textAlign: 'center', fontSize: '0.9rem' };

  const statusBadge = (status) => (
    <span style={{ padding: '2px 8px', borderRadius: '3px', fontSize: '0.8rem', background: STATUS[status].color, color: 'white', whiteSpace: 'nowrap' }}>
      {STATUS[status].label}
    </span>
  );

  const completionCell = (r) => {
    if (r.expected === 0) return <span style={{ color: '#999' }}>-</span>;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-block', width: '70px', height: '8px', borderRadius: '4px', background: borderColor, overflow: 'hidden' }}>
          <span style={{ display: 'block', height: '100%', width: `${r.percentage}%`, background: STATUS[r.status].color }} />
        </span>
        <strong>{r.completed}/{r.expected}</strong>
        <span style={{ color: muted, fontSize: '0.85rem' }}>{r.percentage}%</span>
      </span>
    );
  };

  // What one evaluator gave in one round: each evaluation's scores and
  // written feedback, then whoever they still owe
  const roundBlock = (w) => {
    const r = w.round;
    const likert = r.criteria.filter(c => c.question_type === 'likert');
    const openEnded = r.criteria.filter(c => c.question_type !== 'likert');
    const display = scoreDisplay(model, r);
    const hasAvg = r.points || likert.length > 0;
    const colCount = 2 + likert.length + (hasAvg ? 1 : 0);
    const sorted = [...w.evals].sort((a, b) => a.recipient_name.localeCompare(b.recipient_name, undefined, { numeric: true }));
    return (
      <div key={r.id} style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px', marginBottom: '4px' }}>
          <strong>{r.label}</strong>
          <span style={{ fontSize: '0.8rem', color: muted }}>{typeLabel(r.type)}</span>
          <span style={{ fontSize: '0.85rem', color: MARKS[w.mark].color, fontWeight: 600 }}>
            {MARKS[w.mark].symbol} {w.expected > 0 ? `${w.completed} of ${w.expected} completed` : 'Nothing due'}
            {w.short > 0 && ` · ${w.short} below the ${r.min_words}-word minimum`}
          </span>
        </div>
        {w.evals.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ fontSize: '0.8rem', color: muted }}>
                  <th style={{ textAlign: 'left', padding: '4px 10px', fontWeight: 500 }}>Evaluated</th>
                  {likert.map(c => <th key={c.id} style={{ padding: '4px 10px', fontWeight: 500 }} title={c.description || ''}>{c.name}</th>)}
                  {hasAvg && <th style={{ padding: '4px 10px', fontWeight: 500 }}>{r.points ? 'Points' : 'Avg'}</th>}
                  <th style={{ textAlign: 'left', padding: '4px 10px', fontWeight: 500 }}>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(e => {
                  const written = openEnded
                    .map(c => ({ name: c.name, text: e.scores.find(sc => sc.criterion_id === c.id)?.text_response }))
                    .filter(x => x.text);
                  const hasFeedback = written.length > 0 || e.comments || (e.attachments && e.attachments.length > 0);
                  const evalAvg = display.percent ? (e.norm_score == null ? null : e.norm_score * 100) : e.avg_score;
                  return (
                    <React.Fragment key={e.id}>
                      <tr>
                        <td style={{ padding: '6px 10px', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                          {e.recipient_name}
                          {e.is_self && <span style={{ color: muted, marginLeft: '6px', fontSize: '0.8rem' }}>(self)</span>}
                          {e.is_former_group && <span style={{ color: muted, marginLeft: '6px', fontSize: '0.8rem' }} title="No longer in this student's group">(former group)</span>}
                        </td>
                        {likert.map(c => {
                          const score = e.scores.find(sc => sc.criterion_id === c.id)?.score;
                          return <td key={c.id} style={subTd}>{score != null ? score : <span style={{ color: '#999' }}>-</span>}</td>;
                        })}
                        {hasAvg && (
                          <td style={subTd}>
                            {r.points ? (e.points ?? 0) : <ScoreBadge value={evalAvg} max={display.max} percent={display.percent} />}
                          </td>
                        )}
                        <td style={{ padding: '6px 10px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                          {e.submitted_at ? new Date(e.submitted_at).toLocaleString() : '-'}
                          {e.is_late && <span style={{ color: '#e74c3c', marginLeft: '6px' }}>late</span>}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={colCount} style={{ padding: '0 10px 8px 10px' }}>
                          <div style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: '10px', fontSize: '0.88rem', color: muted, whiteSpace: 'pre-wrap' }}>
                            {!hasFeedback && <span style={{ fontStyle: 'italic' }}>No written feedback</span>}
                            {r.min_words > 1 && (
                              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: isShort(r, e) ? '#e74c3c' : '#27ae60' }}>
                                {countWords(e.comments)} / {r.min_words} words {isShort(r, e) ? '✗' : '✓'}
                              </div>
                            )}
                            {written.map((x, i) => (
                              <div key={i} style={{ marginBottom: '4px' }}><span style={{ fontSize: '0.8rem', opacity: 0.8 }}>{x.name}:</span> {x.text}</div>
                            ))}
                            {e.comments && <div>{e.comments}</div>}
                            {e.attachments && e.attachments.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                {e.attachments.map((att, attIdx) => (
                                  <button
                                    key={att.id}
                                    onClick={() => setViewer({ images: e.attachments.map(a => ({ id: a.id, url: a.url, fileName: a.fileName })), index: attIdx })}
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
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {w.missing.length > 0 && (
          <div style={{ fontSize: '0.88rem', padding: '2px 10px' }}>
            <span style={{ color: '#e74c3c', fontWeight: 600 }}>Not submitted:</span> {w.missing.join('; ')}
          </div>
        )}
        {w.missingUnnamed > 0 && (
          <div style={{ fontSize: '0.88rem', padding: '2px 10px' }}>
            <span style={{ color: '#e74c3c', fontWeight: 600 }}>Still owed:</span> {w.missingUnnamed} more presenter evaluation{w.missingUnnamed === 1 ? '' : 's'}
          </div>
        )}
      </div>
    );
  };

  const details = (row) => {
    // Rounds that ask nothing of this student and got nothing are left out
    const work = row.work.filter(w => w.expected > 0 || w.evals.length > 0);
    if (work.length === 0) {
      return (
        <p style={{ margin: 0, fontSize: '0.9rem', color: muted }}>
          {hasGroups && !row.student.group ? 'This student is not in a group, so nothing is due from them.' : 'Nothing is due from this student.'}
        </p>
      );
    }
    return work.map(roundBlock);
  };

  // Paper reviews, by reviewer, under the same group and person filters
  const paperRounds = (paperReviewData?.rounds || []).map(pr => {
    const reviews = pr.papers.filter(p => p.review).map(p => ({
      id: `${pr.round_id}-${p.id}`,
      reviewer_id: p.review.reviewer_id,
      reviewer_name: p.review.reviewer_name,
      author_name: p.author_name,
      submitted_at: p.review.submitted_at,
      overall_comments: p.review.overall_comments,
      annotation_count: p.review.annotation_count,
      teacher: false
    })).filter(rv => {
      if (person) return rv.reviewer_id === person.id;
      if (group) return group.memberIds.includes(rv.reviewer_id);
      return true;
    }).sort((a, b) => a.reviewer_name.localeCompare(b.reviewer_name));
    const teacherReviews = (group || person) ? [] : pr.papers.filter(p => p.teacher_review?.overall_comments).map(p => ({
      id: `teacher-${pr.round_id}-${p.id}`,
      reviewer_name: 'Teacher',
      author_name: p.author_name,
      submitted_at: null,
      overall_comments: p.teacher_review.overall_comments,
      annotation_count: p.teacher_review.annotation_count,
      teacher: true
    }));
    return { ...pr, reviews, teacherReviews };
  }).filter(pr => pr.reviews.length + pr.teacherReviews.length > 0);

  const pctClass = stats.percentage == null ? 'info' : stats.percentage === 100 ? 'success' : stats.percentage >= 50 ? 'warning' : 'danger';
  const colCount = 7 + (showGroupColumn ? 1 : 0) + (showLate ? 1 : 0);

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          <h2 style={{ margin: 0 }}>
            Evaluators
            <span style={{ fontSize: '1rem', fontWeight: 'normal', color: muted, marginLeft: '10px' }}>{className}</span>
          </h2>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              style={btnStyle}
              onClick={exportCompletion}
              disabled={rows.length === 0}
              title="One row per student: the completion figures in the table below"
            >
              Export Completion
            </button>
            <button
              className="btn btn-secondary"
              style={btnStyle}
              onClick={onManageExtensions}
              title="Manage individual student deadline extensions"
            >
              Extensions
            </button>
          </div>
        </div>

        {model.rounds.length === 0 ? (
          <p>This class has no evaluation rounds yet.</p>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end', marginBottom: '18px' }}>
              <label style={labelStyle}>
                {model.isAssignmentMode ? 'Assignment' : 'Phase'}
                <select value={round ? round.id : 'all'} onChange={e => setRoundId(e.target.value)} style={{ ...selectStyle, minWidth: '220px' }}>
                  <option value="all">{model.isAssignmentMode ? 'All assignments' : 'All phases'}</option>
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

              <label style={labelStyle}>
                Student
                <select value={person ? person.id : 'all'} onChange={e => setStudentId(e.target.value)} style={{ ...selectStyle, minWidth: '200px' }}>
                  <option value="all">{group ? `Everyone in ${group.name}` : 'All students'}</option>
                  {groupStudents.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            </div>

            <div className="admin-stats-grid" style={{ marginBottom: '18px' }}>
              <div className={`admin-stat-card ${pctClass}`}>
                <div className="admin-stat-value">{stats.percentage == null ? '-' : `${stats.percentage}%`}</div>
                <div className="admin-stat-label">Complete</div>
                <div className="admin-stat-sublabel">{stats.completed} of {stats.expected} evaluations</div>
              </div>
              {!person && (
                <>
                  <div className="admin-stat-card success">
                    <div className="admin-stat-value">{stats.complete}</div>
                    <div className="admin-stat-label">Finished</div>
                    <div className="admin-stat-sublabel">of {stats.evaluators} student{stats.evaluators === 1 ? '' : 's'} with evaluations due</div>
                  </div>
                  <div className="admin-stat-card warning">
                    <div className="admin-stat-value">{stats.partial}</div>
                    <div className="admin-stat-label">In progress</div>
                    <div className="admin-stat-sublabel">started but not finished</div>
                  </div>
                  <div className="admin-stat-card danger">
                    <div className="admin-stat-value">{stats.notStarted}</div>
                    <div className="admin-stat-label">Not started</div>
                    <div className="admin-stat-sublabel">nothing submitted</div>
                  </div>
                </>
              )}
              {showLate && (
                <div className={`admin-stat-card ${stats.late > 0 ? 'warning' : 'info'}`}>
                  <div className="admin-stat-value">{stats.late}</div>
                  <div className="admin-stat-label">Late</div>
                  <div className="admin-stat-sublabel">of {stats.submitted} submitted</div>
                </div>
              )}
              {hasWordMinimum && (
                <div className={`admin-stat-card ${stats.short > 0 ? 'warning' : 'success'}`}>
                  <div className="admin-stat-value">{stats.short}</div>
                  <div className="admin-stat-label">Below word count</div>
                  <div className="admin-stat-sublabel">of {stats.submitted} submitted</div>
                </div>
              )}
              <div className="admin-stat-card purple">
                <div className="admin-stat-value">{stats.submitted > 0 ? `${Math.round((stats.written / stats.submitted) * 100)}%` : '-'}</div>
                <div className="admin-stat-label">Written feedback</div>
                <div className="admin-stat-sublabel">{stats.written} of {stats.submitted} submitted include comments</div>
              </div>
            </div>

            {rows.length === 0 ? (
              <p>{group ? 'This group has no students.' : 'No students found.'}</p>
            ) : (
              <>
                <p style={{ fontSize: '0.8rem', color: muted, margin: '0 0 8px 0' }}>
                  {roundsLabel}:{' '}
                  <span style={{ color: MARKS.complete.color, fontWeight: 700 }}>✓</span> all submitted{hasWordMinimum && ' and comments meet the word count'}
                  {hasWordMinimum && <> · <span style={{ color: MARKS.short.color, fontWeight: 700 }}>✓</span> all submitted but a comment is below the word count</>}
                  {' · '}<span style={{ color: MARKS.partial.color, fontWeight: 700 }}>◐</span> some submitted
                  {' · '}<span style={{ color: MARKS['not-started'].color, fontWeight: 700 }}>✗</span> nothing submitted
                  {' · '}<span style={{ color: MARKS.none.color, fontWeight: 700 }}>–</span> nothing due
                </p>
                <div className="desktop-table" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '10px' }}>Evaluator</th>
                        {showGroupColumn && <th style={{ textAlign: 'left', padding: '10px' }}>Group</th>}
                        <th style={{ textAlign: 'left', padding: '10px' }}>Completed</th>
                        <th style={td}>Status</th>
                        <th style={td} title="One mark per round, in order; hover a mark for its round">{roundsLabel}</th>
                        {showLate && <th style={td}>Late</th>}
                        <th style={td} title="Submitted evaluations that include comments or an answer to an open question">Written feedback</th>
                        <th style={td} title={rawAverages ? 'Average score this student gave' : 'Average score this student gave, as a percent of the maximum'}>Avg given</th>
                        <th style={{ textAlign: 'left', padding: '10px' }}>Last submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => {
                        const open = isOpen(r);
                        const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.04)';
                        return (
                          <React.Fragment key={r.student.id}>
                            <tr onClick={person ? undefined : () => toggle(r.student.id)} style={{ background: rowBg, cursor: person ? 'default' : 'pointer' }}>
                              <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                                <span style={{ display: 'inline-block', width: '1.1em', color: muted }}>{person ? '' : open ? '▾' : '▸'}</span>
                                <strong>{r.student.name}</strong>
                              </td>
                              {showGroupColumn && <td style={{ padding: '10px', color: muted }}>{r.student.group?.name || 'No group'}</td>}
                              <td style={{ padding: '10px' }}>{completionCell(r)}</td>
                              <td style={td}>{statusBadge(r.status)}</td>
                              <td style={td}>{roundMarks(r)}</td>
                              {showLate && <td style={td}>{r.late > 0 ? <span style={{ color: '#e74c3c' }}>{r.late}</span> : <span style={{ color: '#999' }}>0</span>}</td>}
                              <td style={td}>{r.submitted > 0 ? `${r.written}/${r.submitted}` : <span style={{ color: '#999' }}>-</span>}</td>
                              <td style={td}>{avgGiven(r)}</td>
                              <td style={{ padding: '10px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{r.lastSubmitted ? r.lastSubmitted.toLocaleString() : '-'}</td>
                            </tr>
                            {open && (
                              <tr style={{ background: subBg }}>
                                <td colSpan={colCount} style={{ padding: '12px 16px 4px 38px' }}>{details(r)}</td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mobile-card-list">
                  {rows.map(r => {
                    const open = isOpen(r);
                    return (
                      <div key={r.student.id} className="mobile-card">
                        <div className="mobile-card-header" onClick={person ? undefined : () => toggle(r.student.id)} style={{ cursor: person ? 'default' : 'pointer' }}>
                          {r.student.name}
                          {!person && <span style={{ float: 'right', opacity: 0.6 }}>{open ? '▾' : '▸'}</span>}
                        </div>
                        {showGroupColumn && (
                          <div className="mobile-card-row">
                            <span className="mobile-card-label">Group</span>
                            <span className="mobile-card-value">{r.student.group?.name || 'No group'}</span>
                          </div>
                        )}
                        <div className="mobile-card-row">
                          <span className="mobile-card-label">Completed</span>
                          <span className="mobile-card-value">{r.expected > 0 ? `${r.completed}/${r.expected} (${r.percentage}%)` : '-'}</span>
                        </div>
                        <div className="mobile-card-row">
                          <span className="mobile-card-label">Status</span>
                          <span className="mobile-card-value">{statusBadge(r.status)}</span>
                        </div>
                        <div className="mobile-card-row">
                          <span className="mobile-card-label">{roundsLabel}</span>
                          <span className="mobile-card-value">{roundMarks(r)}</span>
                        </div>
                        {showLate && (
                          <div className="mobile-card-row">
                            <span className="mobile-card-label">Late</span>
                            <span className="mobile-card-value">{r.late}</span>
                          </div>
                        )}
                        <div className="mobile-card-row">
                          <span className="mobile-card-label">Written feedback</span>
                          <span className="mobile-card-value">{r.submitted > 0 ? `${r.written}/${r.submitted}` : '-'}</span>
                        </div>
                        {open && <div style={{ marginTop: '10px' }}>{details(r)}</div>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {paperRounds.length > 0 && (
        <div className="card" style={{ marginTop: '20px' }}>
          <h2 style={{ marginBottom: '15px' }}>Paper Reviewers</h2>
          {paperRounds.map(pr => {
            const done = pr.reviews.filter(rv => rv.submitted_at).length;
            return (
              <div key={pr.round_id} style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0 }}>{pr.assignment_name}</h3>
                  <span style={{
                    padding: '2px 8px', borderRadius: '3px', fontSize: '0.8rem', color: 'white',
                    background: pr.status === 'completed' ? '#27ae60' : pr.status === 'review' ? '#3498db' : '#f39c12'
                  }}>
                    {pr.status}
                  </span>
                  {pr.reviews.length > 0 && (
                    <span style={{ fontSize: '0.85rem', color: muted }}>
                      {done} of {pr.reviews.length} assigned review{pr.reviews.length === 1 ? '' : 's'} submitted
                      {' '}({Math.round((done / pr.reviews.length) * 100)}%)
                    </span>
                  )}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '10px' }}>Reviewer</th>
                        <th style={{ textAlign: 'left', padding: '10px' }}>Paper Author</th>
                        <th style={td}>Status</th>
                        <th style={td}>Annotations</th>
                        <th style={{ textAlign: 'left', padding: '10px' }}>Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...pr.reviews, ...pr.teacherReviews].map((rv, idx) => {
                        const open = expandedPaperReview === rv.id;
                        const finished = rv.teacher || !!rv.submitted_at;
                        return (
                          <React.Fragment key={rv.id}>
                            <tr
                              style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.04)', cursor: rv.overall_comments ? 'pointer' : 'default' }}
                              onClick={() => rv.overall_comments && setExpandedPaperReview(open ? null : rv.id)}
                              title={rv.overall_comments ? 'Click to view comments' : ''}
                            >
                              <td style={{ padding: '10px' }}>
                                <span style={{ display: 'inline-block', width: '1.1em', color: muted }}>{rv.overall_comments ? (open ? '▾' : '▸') : ''}</span>
                                {rv.reviewer_name}
                              </td>
                              <td style={{ padding: '10px' }}>{rv.author_name}</td>
                              <td style={td}>{statusBadge(finished ? 'complete' : 'not-started')}</td>
                              <td style={td}>{rv.annotation_count}</td>
                              <td style={{ padding: '10px', fontSize: '0.85rem' }}>{rv.submitted_at ? new Date(rv.submitted_at).toLocaleString() : '-'}</td>
                            </tr>
                            {open && rv.overall_comments && (
                              <tr style={{ background: subBg }}>
                                <td colSpan="5" style={{ padding: '12px 16px 12px 38px' }}>
                                  <div style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: '10px', fontSize: '0.88rem', color: muted, whiteSpace: 'pre-wrap' }}>
                                    {rv.overall_comments}
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
              </div>
            );
          })}
        </div>
      )}

      {viewer && (
        <ImageViewer images={viewer.images} initialIndex={viewer.index} onClose={() => setViewer(null)} />
      )}
    </>
  );
}

export default EvaluatorsTab;

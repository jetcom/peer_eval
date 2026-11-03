import React, { useState, useEffect } from 'react';
import ScoreBadge from './ScoreBadge';
import RoundSection from './RoundSection';
import {
  typeLabel, studentRoundCell, groupRoundCell, studentOverall, groupOverall, givenCount,
  evalsForStudent, evalsForGroup
} from './model';
import { downloadCSV, exportAllEvaluations, fmt } from './csv';

/**
 * Columns are declared once and drive both the on-screen grid and the
 * "Export view" CSV, so what you see is what you download.
 *
 * With "All rounds" selected there is one column per round; with a single
 * round selected there is one column per criterion of that round.
 */
function buildColumns({ viewBy, rounds, singleRound, showGroups, darkMode }) {
  const muted = darkMode ? '#a0a0a0' : '#666';
  const cols = [];

  if (viewBy === 'students') {
    cols.push({ key: 'name', header: 'Student', align: 'left', render: r => <strong>{r.name}</strong>, csv: r => r.name });
    if (showGroups) {
      cols.push({ key: 'group', header: 'Group', align: 'left', render: r => <span style={{ color: muted }}>{r.groupName || 'No Group'}</span>, csv: r => r.groupName });
    }
  } else {
    cols.push({ key: 'name', header: 'Group', align: 'left', render: r => <strong>{r.name}</strong>, csv: r => r.name });
    cols.push({ key: 'members', header: 'Members', align: 'center', render: r => r.memberCount, csv: r => r.memberCount });
  }

  if (singleRound) {
    const likert = singleRound.criteria.filter(c => c.question_type === 'likert');
    cols.push({ key: 'count', header: '# Evals', align: 'center', render: r => r.cells[singleRound.id].count, csv: r => r.cells[singleRound.id].count });
    likert.forEach(c => {
      cols.push({
        key: `c-${c.id}`, header: c.name, align: 'center', title: c.description,
        render: r => <ScoreBadge value={r.cells[singleRound.id].criterionAvgs[c.id]} max={c.max_value} />,
        csv: r => fmt(r.cells[singleRound.id].criterionAvgs[c.id])
      });
    });
    if (singleRound.points) {
      cols.push({
        key: 'points', header: viewBy === 'groups' ? 'Avg Points' : 'Points', align: 'center', divider: true,
        render: r => <strong>{r.cells[singleRound.id].count > 0 ? fmt(r.cells[singleRound.id].points, viewBy === 'groups' ? 1 : 0) : '-'}</strong>,
        csv: r => (r.cells[singleRound.id].count > 0 ? fmt(r.cells[singleRound.id].points, viewBy === 'groups' ? 1 : 0) : '')
      });
    } else if (likert.length > 0) {
      cols.push({
        key: 'avg', header: 'Avg', align: 'center', divider: true,
        render: r => <strong>{fmt(r.cells[singleRound.id].avg) || '-'}</strong>,
        csv: r => fmt(r.cells[singleRound.id].avg)
      });
    }
  } else {
    rounds.forEach(round => {
      const scoreCriterion = round.criteria.find(c => c.question_type === 'likert' && c.in_avg === false);
      cols.push({
        key: `r-${round.id}`,
        header: round.assignment_name || round.label,
        sub: round.assignment_name ? `${round.name} · ${typeLabel(round.type)}` : typeLabel(round.type),
        align: 'center',
        render: r => {
          const cell = r.cells[round.id];
          if (cell.count === 0) return <span style={{ color: '#999' }}>-</span>;
          if (round.points) return <strong>{fmt(cell.points, viewBy === 'groups' ? 1 : 0)} pts</strong>;
          return (
            <>
              <ScoreBadge value={cell.avg} max={round.scaleMax} />
              {scoreCriterion && cell.criterionAvgs[scoreCriterion.id] != null && (
                <div style={{ fontSize: '0.72rem', color: muted, marginTop: '2px' }}>
                  {fmt(cell.criterionAvgs[scoreCriterion.id], 0)}/{scoreCriterion.max_value}
                </div>
              )}
            </>
          );
        },
        csv: r => {
          const cell = r.cells[round.id];
          if (cell.count === 0) return '';
          return round.points ? fmt(cell.points, viewBy === 'groups' ? 1 : 0) : fmt(cell.avg);
        },
        // Extra CSV-only column for the phases-mode score out of 100
        extraCsv: scoreCriterion ? {
          header: `${round.label} ${scoreCriterion.name}`,
          value: r => (r.cells[round.id].count > 0 ? fmt(r.cells[round.id].criterionAvgs[scoreCriterion.id], 1) : '')
        } : null
      });
    });
    cols.push({ key: 'overall', header: 'Overall', align: 'center', divider: true, render: r => <strong>{fmt(r.overall) || '-'}</strong>, csv: r => fmt(r.overall) });
  }

  if (viewBy === 'students') {
    cols.push({ key: 'given', header: 'Given', align: 'center', title: 'Evaluations this student submitted', render: r => r.given, csv: r => r.given });
  }
  return cols;
}

function buildStudentRows(model, students, rounds) {
  return students.map(s => ({
    kind: 'student',
    id: s.id,
    name: s.name,
    email: s.email,
    groupName: s.group?.name || '',
    cells: Object.fromEntries(rounds.map(r => [r.id, studentRoundCell(model, r, s)])),
    overall: studentOverall(model, rounds, s),
    given: givenCount(model, rounds, s.id)
  }));
}

function buildGroupRows(model, groups, rounds) {
  return groups.map(g => ({
    kind: 'group',
    id: g.id,
    name: g.name,
    memberCount: g.memberIds.length,
    cells: Object.fromEntries(rounds.map(r => [r.id, groupRoundCell(model, r, g)])),
    overall: groupOverall(model, rounds, g)
  }));
}

/** Desktop table plus mobile card list, both driven by the column list. */
function Grid({ columns, rows, onSelect, darkMode, emptyText }) {
  if (rows.length === 0) return <p>{emptyText}</p>;
  const clickable = typeof onSelect === 'function';
  const hoverBg = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  return (
    <>
      <div className="desktop-table" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c.key} title={c.title || ''} style={{ textAlign: c.align, padding: '10px', borderLeft: c.divider ? '2px solid #586e75' : undefined, verticalAlign: 'bottom' }}>
                  {c.header}
                  {c.sub && <div style={{ fontSize: '0.72rem', fontWeight: 'normal', opacity: 0.7 }}>{c.sub}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.id}
                onClick={clickable ? () => onSelect(row) : undefined}
                style={{ cursor: clickable ? 'pointer' : 'default', background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.04)' }}
                onMouseEnter={clickable ? e => { e.currentTarget.style.background = hoverBg; } : undefined}
                onMouseLeave={clickable ? e => { e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.04)'; } : undefined}
                title={clickable ? 'Click for details' : undefined}
              >
                {columns.map(c => (
                  <td key={c.key} style={{ textAlign: c.align, padding: '10px', borderLeft: c.divider ? '2px solid #586e75' : undefined }}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-card-list">
        {rows.map(row => (
          <div key={row.id} className="mobile-card" onClick={clickable ? () => onSelect(row) : undefined} style={{ cursor: clickable ? 'pointer' : 'default' }}>
            <div className="mobile-card-header">{row.name} {clickable && <span style={{ float: 'right', opacity: 0.6 }}>›</span>}</div>
            {columns.filter(c => c.key !== 'name').map(c => (
              <div key={c.key} className="mobile-card-row">
                <span className="mobile-card-label">{c.header}{c.sub ? ` (${c.sub})` : ''}</span>
                <span className="mobile-card-value">{c.render(row)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/** Detail view for one student: every round they received, one section each. */
function StudentDetail({ model, student, rounds, darkMode, openImageViewer, compact = false }) {
  const muted = darkMode ? '#a0a0a0' : '#666';
  const overall = studentOverall(model, rounds, student);
  const Heading = compact ? 'h3' : 'h2';
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px', marginBottom: '18px' }}>
        <Heading style={{ margin: 0 }}>
          {student.name}
          {student.group && <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: muted, marginLeft: '10px' }}>{student.group.name}</span>}
        </Heading>
        <span style={{ fontSize: '0.9rem', color: muted }}>
          {student.email}{overall != null && <> · overall <strong>{overall.toFixed(2)}</strong></>}
        </span>
      </div>
      {rounds.map(round => {
        const slot = round.presentation_slots.find(s => (round.target === 'group' ? s.group_id === student.group?.id : s.user_id === student.id));
        return (
          <RoundSection
            key={round.id}
            round={round}
            evals={evalsForStudent(model, round, student)}
            note={round.target === 'group'
              ? (student.group ? `Received by ${student.group.name} as a group; counts for every member.` : 'This round evaluates groups, and this student is not in one.')
              : null}
            presentationDate={slot?.presentation_date}
            darkMode={darkMode}
            openImageViewer={openImageViewer}
          />
        );
      })}
    </>
  );
}

/**
 * Summary view for one group: the group's own row of averages, then a
 * members grid to drill further. Evaluator-level tables are in Full detail.
 */
function GroupDetail({ model, group, rounds, columns, groupColumns, darkMode, onSelectStudent }) {
  const muted = darkMode ? '#a0a0a0' : '#666';
  const members = group.memberIds.map(id => model.studentById[id]).filter(Boolean);
  const groupRounds = rounds.filter(r => r.target === 'group');
  const memberRounds = rounds.filter(r => r.target !== 'group');
  const overall = groupOverall(model, rounds, group);
  const groupRows = buildGroupRows(model, [group], rounds);
  const memberRows = buildStudentRows(model, members, rounds);
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px', marginBottom: '18px' }}>
        <h2 style={{ margin: 0 }}>{group.name}</h2>
        <span style={{ fontSize: '0.9rem', color: muted }}>
          {members.length} member{members.length === 1 ? '' : 's'}{overall != null && <> · members' overall <strong>{overall.toFixed(2)}</strong></>}
        </span>
      </div>

      <h3 style={{ marginBottom: '6px' }}>Group summary</h3>
      <p style={{ fontSize: '0.85rem', color: muted, marginTop: 0 }}>
        {groupRounds.length > 0 && memberRounds.length > 0
          ? 'Group-level rounds use evaluations of the group itself; individual rounds average the members. '
          : groupRounds.length > 0
            ? 'Averages of the evaluations the group received as a whole. '
            : 'Average of what the members received. '}
        Switch to Full detail for every evaluator's scores and comments.
      </p>
      <Grid columns={groupColumns} rows={groupRows} darkMode={darkMode} emptyText="" />

      <h3 style={{ marginBottom: '6px', marginTop: '24px' }}>Members</h3>
      <p style={{ fontSize: '0.85rem', color: muted, marginTop: 0 }}>
        Click a member to see every evaluator.
      </p>
      <Grid columns={columns} rows={memberRows} onSelect={onSelectStudent} darkMode={darkMode} emptyText="This group has no students." />
    </>
  );
}

/**
 * Every recipient's evaluator-level detail on one page: the way to read all
 * within-group peer evaluations for every member together.
 */
function FullDetailList({ model, viewBy, students, groups, rounds, darkMode, openImageViewer }) {
  const muted = darkMode ? '#a0a0a0' : '#666';
  const borderColor = darkMode ? '#444' : '#ddd';
  const block = { border: `1px solid ${borderColor}`, borderRadius: '8px', padding: '16px', marginBottom: '20px' };

  if (viewBy === 'students') {
    if (students.length === 0) return <p>No students found.</p>;
    return students.map(s => (
      <div key={s.id} style={block}>
        <StudentDetail model={model} student={s} rounds={rounds} darkMode={darkMode} openImageViewer={openImageViewer} compact />
      </div>
    ));
  }

  if (groups.length === 0) return <p>No groups found.</p>;
  const groupRounds = rounds.filter(r => r.target === 'group');
  const memberRounds = rounds.filter(r => r.target !== 'group');
  return groups.map(g => {
    const members = g.memberIds.map(id => model.studentById[id]).filter(Boolean);
    return (
      <div key={g.id} style={block}>
        <h2 style={{ marginTop: 0, borderBottom: `2px solid ${borderColor}`, paddingBottom: '8px' }}>
          {g.name}
          <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: muted, marginLeft: '10px' }}>{members.length} member{members.length === 1 ? '' : 's'}</span>
        </h2>
        {groupRounds.map(round => (
          <RoundSection
            key={round.id}
            round={round}
            evals={evalsForGroup(model, round, g)}
            note="Evaluations of the group as a whole."
            presentationDate={round.presentation_slots.find(s => s.group_id === g.id)?.presentation_date}
            darkMode={darkMode}
            openImageViewer={openImageViewer}
          />
        ))}
        {memberRounds.length > 0 && members.map(s => (
          <div key={s.id} style={{ marginLeft: '12px', paddingLeft: '12px', borderLeft: `3px solid ${borderColor}`, marginBottom: '16px' }}>
            <StudentDetail model={model} student={s} rounds={memberRounds} darkMode={darkMode} openImageViewer={openImageViewer} compact />
          </div>
        ))}
      </div>
    );
  });
}

/**
 * Props:
 *   reportGroup / setReportGroup  the row scope, kept on the dashboard so it
 *     survives tab switches: 'all' (every student), 'groups' (one row per
 *     group), or a group id (that group's members).
 */
function EvaluationExplorer({ model, className, darkMode, showGroups, reportGroup, setReportGroup, openImageViewer }) {
  const hasGroups = showGroups && model.groups.length > 0;
  const [roundId, setRoundId] = useState('all');
  // 'summary' is the grid; 'detail' lists every evaluator for every row at once
  const [detailMode, setDetailMode] = useState('summary');
  // A student opened from the grid, or null
  const [selectedStudentId, setSelectedStudentId] = useState(null);

  const scope = reportGroup || 'all';
  const scopeGroup = scope !== 'all' && scope !== 'groups' ? model.groupById[parseInt(scope)] : null;
  const scopeIsGroups = scope === 'groups';

  // Fall back to all students if groups are hidden or the group vanished
  useEffect(() => {
    if (scope !== 'all' && (!hasGroups || (!scopeIsGroups && !scopeGroup))) setReportGroup('all');
  }, [scope, hasGroups, scopeIsGroups, scopeGroup, setReportGroup]);

  const muted = darkMode ? '#a0a0a0' : '#666';
  const borderColor = darkMode ? '#444' : '#ddd';

  const singleRound = roundId === 'all' ? null : model.rounds.find(r => String(r.id) === String(roundId)) || null;
  const rounds = singleRound ? [singleRound] : model.rounds;

  const students = scopeGroup ? model.students.filter(s => s.group?.id === scopeGroup.id) : model.students;

  const studentColumns = buildColumns({ viewBy: 'students', rounds, singleRound, showGroups: hasGroups && !scopeGroup, darkMode });
  const groupColumns = buildColumns({ viewBy: 'groups', rounds, singleRound, showGroups: hasGroups, darkMode });
  const columns = scopeIsGroups ? groupColumns : studentColumns;
  const rows = scopeIsGroups ? buildGroupRows(model, model.groups, rounds) : buildStudentRows(model, students, rounds);

  const selectedStudent = selectedStudentId ? model.studentById[selectedStudentId] : null;

  const changeScope = (value) => { setReportGroup(value); setSelectedStudentId(null); };

  const exportView = () => {
    const headers = [];
    const cellFns = [];
    columns.forEach(c => {
      headers.push(c.sub ? `${c.header} – ${c.sub}` : c.header);
      cellFns.push(c.csv);
      if (c.extraCsv) { headers.push(c.extraCsv.header); cellFns.push(c.extraCsv.value); }
    });
    if (!scopeIsGroups) { headers.splice(1, 0, 'Email'); cellFns.splice(1, 0, r => r.email); }
    const out = [headers, ...rows.map(r => cellFns.map(fn => fn(r)))];
    const who = scopeGroup ? scopeGroup.name : scopeIsGroups ? 'groups' : 'students';
    const what = singleRound ? singleRound.label : 'all_rounds';
    downloadCSV(`${className || 'class'}_${who}_${what}.csv`, out);
  };

  const selectStyle = { padding: '8px', fontSize: '0.9rem' };
  const segBtn = (active) => ({
    padding: '7px 12px', fontSize: '0.85rem', cursor: 'pointer',
    border: `1px solid ${darkMode ? '#555' : '#bbb'}`,
    background: active ? (darkMode ? '#3498db' : '#2c3e50') : (darkMode ? '#2a2a2a' : '#fff'),
    color: active ? '#fff' : 'inherit'
  });
  const labelStyle = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', fontWeight: 500 };

  const scopeDescription = scopeGroup
    ? <>members of <strong>{scopeGroup.name}</strong></>
    : scopeIsGroups ? 'each group' : 'each student';
  const roundDescription = singleRound ? <> in <strong>{singleRound.label}</strong></> : ' in every round';

  // What the main card shows when no student is open
  let body;
  if (selectedStudent) {
    body = <StudentDetail model={model} student={selectedStudent} rounds={rounds} darkMode={darkMode} openImageViewer={openImageViewer} />;
  } else if (model.rounds.length === 0) {
    body = <p>This class has no evaluation rounds yet.</p>;
  } else if (detailMode === 'detail') {
    body = (
      <FullDetailList
        model={model}
        viewBy={scopeIsGroups || scopeGroup ? 'groups' : 'students'}
        students={students}
        groups={scopeGroup ? [scopeGroup] : model.groups}
        rounds={rounds}
        darkMode={darkMode}
        openImageViewer={openImageViewer}
      />
    );
  } else if (scopeGroup) {
    body = (
      <GroupDetail
        model={model}
        group={scopeGroup}
        rounds={rounds}
        columns={studentColumns}
        groupColumns={groupColumns}
        darkMode={darkMode}
        onSelectStudent={row => setSelectedStudentId(row.id)}
      />
    );
  } else {
    body = (
      <>
        <h3 style={{ marginTop: 0, borderBottom: `2px solid ${borderColor}`, paddingBottom: '8px' }}>
          {scopeIsGroups ? 'Scores by Group' : 'Scores Received by Student'}
        </h3>
        <Grid
          columns={columns}
          rows={rows}
          onSelect={row => (scopeIsGroups ? changeScope(String(row.id)) : setSelectedStudentId(row.id))}
          darkMode={darkMode}
          emptyText={scopeIsGroups ? 'No groups found.' : 'No students found.'}
        />
      </>
    );
  }

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          <h2 style={{ margin: 0 }}>Evaluation Reports</h2>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={exportView} className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '8px 12px' }} disabled={rows.length === 0}>
              Export View
            </button>
            <button onClick={() => exportAllEvaluations(model, className)} className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '8px 12px' }} disabled={model.evals.length === 0}>
              Export All Evaluations
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
          <label style={labelStyle}>
            Round
            <select value={roundId} onChange={e => setRoundId(e.target.value)} style={{ ...selectStyle, minWidth: '200px' }}>
              <option value="all">All rounds</option>
              {model.rounds.map(r => (
                <option key={r.id} value={r.id}>{r.label} ({typeLabel(r.type)})</option>
              ))}
            </select>
          </label>

          {hasGroups && (
            <label style={labelStyle}>
              Rows
              <select value={scope} onChange={e => changeScope(e.target.value)} style={{ ...selectStyle, minWidth: '160px' }}>
                <option value="all">All students</option>
                <option value="groups">Groups</option>
                <optgroup label="One group">
                  {model.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </optgroup>
              </select>
            </label>
          )}

          <div style={labelStyle}>
            Show
            <div style={{ display: 'flex' }}>
              <button type="button" onClick={() => { setDetailMode('summary'); setSelectedStudentId(null); }} style={{ ...segBtn(detailMode === 'summary'), borderRadius: '4px 0 0 4px' }}>Summary</button>
              <button type="button" onClick={() => { setDetailMode('detail'); setSelectedStudentId(null); }} style={{ ...segBtn(detailMode === 'detail'), borderRadius: '0 4px 4px 0', borderLeft: 'none' }}>Full detail</button>
            </div>
          </div>
        </div>
        <p style={{ margin: '12px 0 0 0', fontSize: '0.85rem', color: muted }}>
          {detailMode === 'detail'
            ? <>Every evaluator's scores and comments for {scopeDescription}{roundDescription}. </>
            : <>{singleRound ? 'Per-criterion averages' : 'Average received'} for {scopeDescription}{roundDescription}. Click a row for every evaluator's scores and comments. </>}
          “Export View” downloads the summary table; “Export All Evaluations” downloads one row per evaluation across every round.
        </p>
      </div>

      <div className="card">
        {selectedStudent ? (
          <button type="button" onClick={() => setSelectedStudentId(null)} className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '6px 10px', marginBottom: '14px' }}>
            ← Back to {scopeGroup ? scopeGroup.name : 'all students'}
          </button>
        ) : scopeGroup && (
          <button type="button" onClick={() => changeScope('groups')} className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '6px 10px', marginBottom: '14px' }}>
            ← Back to all groups
          </button>
        )}
        {body}
      </div>
    </>
  );
}

export default EvaluationExplorer;

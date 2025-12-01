import React, { useState } from 'react';

function EvaluationsTab({
  selectedClass,
  classes,
  classStudents,
  classGroups,
  evaluations,
  assignmentEvaluations,
  onManageExtensions
}) {
  const [filterAssignment, setFilterAssignment] = useState('all');
  const [filterEvalType, setFilterEvalType] = useState('all');

  if (!selectedClass) {
    return (
      <div className="card">
        <h2>Select a Class</h2>
        <p>Please select a class from the header dropdown to view evaluations.</p>
      </div>
    );
  }

  const currentClass = classes.find(c => c.id === parseInt(selectedClass));
  const isAssignmentMode = currentClass?.evaluation_mode === 'assignments';

  // Assignment-based class evaluations view
  if (isAssignmentMode) {
    const assignments = assignmentEvaluations?.assignments || [];
    const individualEvals = assignmentEvaluations?.individual_evaluations || [];
    const groupEvals = assignmentEvaluations?.group_evaluations || [];

    // Combine all evaluations
    let allEvals = [
      ...individualEvals.map(e => ({ ...e, type: 'individual' })),
      ...groupEvals.map(e => ({ ...e, type: 'group' }))
    ];

    // Filter by assignment
    if (filterAssignment !== 'all') {
      allEvals = allEvals.filter(e => e.assignment_id === parseInt(filterAssignment));
    }

    // Filter by eval type
    if (filterEvalType !== 'all') {
      allEvals = allEvals.filter(e => e.eval_type === filterEvalType);
    }

    // Sort by submitted_at desc
    allEvals.sort((a, b) => {
      if (!a.submitted_at) return 1;
      if (!b.submitted_at) return -1;
      return new Date(b.submitted_at) - new Date(a.submitted_at);
    });

    // Get unique eval types for filter
    const evalTypes = [...new Set([...individualEvals, ...groupEvals].map(e => e.eval_type))];

    return (
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ margin: 0 }}>Evaluations for {currentClass?.name}</h2>
          <button
            className="btn btn-secondary"
            onClick={onManageExtensions}
            title="Manage individual student deadline extensions"
          >
            Extensions
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', fontWeight: '500' }}>Assignment:</label>
            <select
              value={filterAssignment}
              onChange={(e) => setFilterAssignment(e.target.value)}
              style={{ padding: '8px', fontSize: '0.9rem', minWidth: '200px' }}
            >
              <option value="all">All Assignments</option>
              {assignments.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', fontWeight: '500' }}>Eval Type:</label>
            <select
              value={filterEvalType}
              onChange={(e) => setFilterEvalType(e.target.value)}
              style={{ padding: '8px', fontSize: '0.9rem', minWidth: '150px' }}
            >
              <option value="all">All Types</option>
              {evalTypes.map(et => (
                <option key={et} value={et}>{et}</option>
              ))}
            </select>
          </div>
        </div>

        {allEvals.length === 0 ? (
          <p>No evaluations submitted yet for this class.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Assignment</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Evaluator</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Target</th>
                  <th style={{ textAlign: 'center', padding: '10px' }}>Avg Score</th>
                  <th style={{ textAlign: 'center', padding: '10px' }}>Late</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {allEvals.map((e, idx) => (
                  <tr key={`${e.type}-${e.id}`} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.05)' }}>
                    <td style={{ padding: '10px' }}>{e.assignment_name}</td>
                    <td style={{ padding: '10px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '3px',
                        fontSize: '0.8rem',
                        background: e.type === 'individual' ? '#3498db' : '#9b59b6',
                        color: 'white'
                      }}>
                        {e.eval_type}
                      </span>
                    </td>
                    <td style={{ padding: '10px' }}>{e.evaluator_name}</td>
                    <td style={{ padding: '10px' }}>
                      {e.type === 'individual' ? e.evaluatee_name : e.group_name}
                    </td>
                    <td style={{ textAlign: 'center', padding: '10px' }}>
                      {e.avg_score != null ? e.avg_score.toFixed(1) : '-'}
                    </td>
                    <td style={{ textAlign: 'center', padding: '10px' }}>
                      {e.is_late ? (
                        <span style={{ color: '#e74c3c' }}>Yes</span>
                      ) : (
                        <span style={{ color: '#27ae60' }}>No</span>
                      )}
                    </td>
                    <td style={{ padding: '10px', fontSize: '0.85rem' }}>
                      {e.submitted_at ? new Date(e.submitted_at).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ marginTop: '15px', fontSize: '0.85rem', opacity: 0.7 }}>
          Showing {allEvals.length} evaluations ({individualEvals.length} individual, {groupEvals.length} group)
        </p>
      </div>
    );
  }

  // Phase-based class evaluations view (existing logic)
  const classStudentIds = new Set(classStudents.map(s => s.id));
  const classEvaluations = evaluations.filter(e =>
    e.class_id
      ? e.class_id === parseInt(selectedClass)
      : (classStudentIds.has(e.evaluator_id) && classStudentIds.has(e.evaluatee_id))
  );

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2 style={{ margin: 0 }}>Evaluations for {currentClass?.name}</h2>
        <button
          className="btn btn-secondary"
          onClick={onManageExtensions}
          title="Manage individual student deadline extensions"
        >
          Extensions
        </button>
      </div>
      {classEvaluations.length === 0 ? (
        <p>No evaluations submitted yet for this class.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Group</th>
              <th>Phase</th>
              <th>Evaluator</th>
              <th>Evaluatee</th>
              <th>Score</th>
              <th>Avg Likert</th>
            </tr>
          </thead>
          <tbody>
            {classEvaluations.map(e => {
              const avgLikert = (
                (e.contribution + e.communication + e.reliability +
                 e.quality_of_work + e.collaboration) / 5
              ).toFixed(1);
              return (
                <tr key={e.id}>
                  <td>{e.group_name || 'N/A'}</td>
                  <td>{e.phase}</td>
                  <td>{e.evaluator_name}</td>
                  <td>{e.evaluatee_name}</td>
                  <td>{e.score}/100</td>
                  <td>{avgLikert}/5</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default EvaluationsTab;

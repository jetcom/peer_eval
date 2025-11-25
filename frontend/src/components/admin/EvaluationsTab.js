import React from 'react';

function EvaluationsTab({
  selectedClass,
  classes,
  classStudents,
  evaluations,
  onManageExtensions
}) {
  if (!selectedClass) {
    return (
      <div className="card">
        <h2>Select a Class</h2>
        <p>Please select a class from the header dropdown to view evaluations.</p>
      </div>
    );
  }

  // Filter evaluations to only show those from this class
  // Use class_id if available (new evaluations), otherwise check if BOTH evaluator and evaluatee are in this class
  const classStudentIds = new Set(classStudents.map(s => s.id));
  const classEvaluations = evaluations.filter(e =>
    e.class_id
      ? e.class_id === parseInt(selectedClass)
      : (classStudentIds.has(e.evaluator_id) && classStudentIds.has(e.evaluatee_id))
  );

  const currentClass = classes.find(c => c.id === parseInt(selectedClass));

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

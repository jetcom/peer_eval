import React from 'react';

function EvaluationsTab({
  selectedClass,
  classes,
  classStudents,
  evaluations
}) {
  if (!selectedClass) {
    return (
      <div className="card">
        <h2>Select a Class</h2>
        <p>Please select a class from the header dropdown to view evaluations.</p>
      </div>
    );
  }

  // Filter evaluations to only show those from students in this class
  const classStudentIds = new Set(classStudents.map(s => s.id));
  const classEvaluations = evaluations.filter(e =>
    classStudentIds.has(e.evaluator_id) || classStudentIds.has(e.evaluatee_id)
  );

  return (
    <div className="card">
      <h2>Evaluations for {classes.find(c => c.id === parseInt(selectedClass))?.name}</h2>
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

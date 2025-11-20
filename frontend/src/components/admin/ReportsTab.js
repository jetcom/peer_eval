import React from 'react';

function ReportsTab({
  selectedClass,
  classes,
  classStudents,
  classGroups,
  evaluations,
  finalCommentsData,
  reportGroup,
  setReportGroup
}) {
  if (!selectedClass) {
    return (
      <div className="card">
        <h2>Select a Class</h2>
        <p>Please select a class from the header dropdown to view reports.</p>
      </div>
    );
  }

  // Get students in selected group (filtered to class)
  const getStudentsInGroup = () => {
    if (reportGroup === 'all') return classStudents;

    // Find students in the selected group
    const groupId = parseInt(reportGroup);
    const selectedGroupData = classGroups.find(g => g.id === groupId);
    if (!selectedGroupData || !selectedGroupData.members) return [];

    return selectedGroupData.members;
  };

  // Calculate summaries per student
  const students = getStudentsInGroup();
  const studentSummaries = students.map(student => {
    const studentEvals = evaluations.filter(e => e.evaluatee_id === student.id);
    const phases = [1, 2, 3].map(phase => {
      const phaseEvals = studentEvals.filter(e => e.phase === phase);
      if (phaseEvals.length === 0) return null;

      const avgScore = phaseEvals.reduce((sum, e) => sum + e.score, 0) / phaseEvals.length;
      const avgLikert = phaseEvals.reduce((sum, e) =>
        sum + (e.contribution + e.communication + e.reliability + e.quality_of_work + e.collaboration) / 5, 0
      ) / phaseEvals.length;

      // Calculate individual criteria averages
      const criteria = {
        contribution: phaseEvals.reduce((sum, e) => sum + e.contribution, 0) / phaseEvals.length,
        communication: phaseEvals.reduce((sum, e) => sum + e.communication, 0) / phaseEvals.length,
        reliability: phaseEvals.reduce((sum, e) => sum + e.reliability, 0) / phaseEvals.length,
        quality_of_work: phaseEvals.reduce((sum, e) => sum + e.quality_of_work, 0) / phaseEvals.length,
        collaboration: phaseEvals.reduce((sum, e) => sum + e.collaboration, 0) / phaseEvals.length
      };

      const comments = phaseEvals.map(e => ({
        from: e.evaluator_name,
        text: e.comments
      })).filter(c => c.text);

      return { phase, avgScore, avgLikert, criteria, comments, count: phaseEvals.length };
    });

    // Get final comments and points for this student
    const studentFinalComments = finalCommentsData.filter(fc => fc.evaluatee_id === student.id);
    const totalFinalPoints = studentFinalComments.reduce((sum, fc) => sum + (fc.final_points || 0), 0);
    const finalCommentsList = studentFinalComments.map(fc => ({
      from: fc.evaluator_name,
      text: fc.comments,
      points: fc.final_points || 0
    })).filter(c => c.text || c.points > 0);

    return { ...student, phases, totalFinalPoints, finalComments: finalCommentsList };
  });

  const criteriaLabels = {
    contribution: 'Contribution',
    communication: 'Communication',
    reliability: 'Reliability',
    quality_of_work: 'Quality of Work',
    collaboration: 'Collaboration'
  };

  const criteriaColors = {
    contribution: '#3498db',
    communication: '#9b59b6',
    reliability: '#e67e22',
    quality_of_work: '#27ae60',
    collaboration: '#e74c3c'
  };

  return (
    <>
      <div className="card">
        <h2>Filter by Group</h2>
        <select
          value={reportGroup}
          onChange={(e) => setReportGroup(e.target.value)}
          style={{ width: '100%', padding: '10px', fontSize: '1rem' }}
        >
          <option value="all">All Groups in Class</option>
          {classGroups.map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      <div className="card">
        <h2>Student Comparison - Average Scores by Phase</h2>
        {students.length === 0 ? (
          <p>No students found.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Phase 1 Score</th>
                  <th>Phase 1 Likert</th>
                  <th>Phase 2 Score</th>
                  <th>Phase 2 Likert</th>
                  <th>Phase 3 Score</th>
                  <th>Phase 3 Likert</th>
                  <th>Final Points</th>
                </tr>
              </thead>
              <tbody>
                {studentSummaries.map(student => (
                  <tr key={student.id}>
                    <td><strong>{student.last_name}, {student.first_name}</strong></td>
                    {[0, 1, 2].map(i => {
                      const phase = student.phases[i];
                      return phase ? (
                        <React.Fragment key={i}>
                          <td>{phase.avgScore.toFixed(1)}</td>
                          <td>{phase.avgLikert.toFixed(2)}</td>
                        </React.Fragment>
                      ) : (
                        <React.Fragment key={i}>
                          <td>-</td>
                          <td>-</td>
                        </React.Fragment>
                      );
                    })}
                    <td style={{ fontWeight: 'bold', color: '#9b59b6' }}>
                      {student.totalFinalPoints || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Visual Comparison - Average Likert Scores</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          {studentSummaries.map(student => (
            <div key={student.id} className="report-student-card">
              <h3>{student.last_name}, {student.first_name}</h3>
              {[1, 2, 3].map(phaseNum => {
                const phase = student.phases[phaseNum - 1];
                const percentage = phase ? (phase.avgLikert / 5) * 100 : 0;
                return (
                  <div key={phaseNum} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span>Phase {phaseNum}</span>
                      <span>{phase ? `${phase.avgLikert.toFixed(2)}/5` : '-'}</span>
                    </div>
                    <div className="report-progress-bg" style={{ height: '20px' }}>
                      <div style={{
                        background: percentage >= 80 ? '#27ae60' : percentage >= 60 ? '#f39c12' : '#e74c3c',
                        width: `${percentage}%`,
                        height: '100%',
                        transition: 'width 0.3s'
                      }} />
                    </div>
                  </div>
                );
              })}
              <div className="report-muted-text" style={{ marginTop: '10px', fontSize: '0.9rem' }}>
                Avg Score: {
                  student.phases.filter(p => p).length > 0
                    ? (student.phases.filter(p => p).reduce((sum, p) => sum + p.avgScore, 0) / student.phases.filter(p => p).length).toFixed(1)
                    : '-'
                }/100
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Detailed Criteria Breakdown by Phase</h2>
        <p className="report-muted-text" style={{ marginBottom: '20px' }}>Compare individual criteria scores across all students for each phase.</p>

        {[1, 2, 3].map(phaseNum => (
          <div key={phaseNum} style={{ marginBottom: '40px' }}>
            <h3 className="report-phase-header">
              Phase {phaseNum}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
              {studentSummaries.map(student => {
                const phase = student.phases[phaseNum - 1];
                return (
                  <div key={student.id} className="report-student-card">
                    <h4>
                      {student.last_name}, {student.first_name}
                      {phase && <span> (Score: {phase.avgScore.toFixed(0)}/100)</span>}
                    </h4>
                    {!phase ? (
                      <p className="report-empty-text">No evaluations yet</p>
                    ) : (
                      Object.entries(phase.criteria).map(([key, value]) => {
                        const percentage = (value / 5) * 100;
                        return (
                          <div key={key} style={{ marginBottom: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontSize: '0.85rem' }}>
                              <span>{criteriaLabels[key]}</span>
                              <span style={{ fontWeight: '500' }}>{value.toFixed(2)}/5</span>
                            </div>
                            <div className="report-progress-bg" style={{ height: '16px', borderRadius: '3px' }}>
                              <div style={{
                                background: criteriaColors[key],
                                width: `${percentage}%`,
                                height: '100%',
                                transition: 'width 0.3s'
                              }} />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>All Comments by Phase</h2>
        {[1, 2, 3].map(phaseNum => (
          <div key={phaseNum} style={{ marginBottom: '30px' }}>
            <h3 className="report-phase-header" style={{ marginBottom: '15px' }}>Phase {phaseNum}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
              {studentSummaries.map(student => {
                const phase = student.phases[phaseNum - 1];
                const comments = phase?.comments || [];
                return (
                  <div key={student.id} className="report-student-card">
                    <h4 style={{ marginBottom: '10px' }}>
                      {student.last_name}, {student.first_name}
                      {phase && <span> ({phase.avgScore.toFixed(0)}/100)</span>}
                    </h4>
                    {comments.length === 0 ? (
                      <p className="report-empty-text" style={{ margin: 0 }}>No comments</p>
                    ) : (
                      comments.map((comment, idx) => (
                        <div key={idx} className={idx < comments.length - 1 ? 'report-comment-border' : ''} style={{ marginBottom: '10px', paddingBottom: '10px' }}>
                          <div className="report-muted-text" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>
                            From: {comment.from}
                          </div>
                          <div style={{ fontSize: '0.9rem' }}>{comment.text}</div>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Final Evaluation - Points & Comments</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
          {studentSummaries.map(student => (
            <div key={student.id} className="report-student-card">
              <h4 style={{ marginBottom: '10px' }}>
                {student.last_name}, {student.first_name}
                <span style={{ color: '#9b59b6', marginLeft: '10px' }}>
                  Total: {student.totalFinalPoints || 0} pts
                </span>
              </h4>
              {(!student.finalComments || student.finalComments.length === 0) ? (
                <p className="report-empty-text" style={{ margin: 0 }}>No final evaluations</p>
              ) : (
                student.finalComments.map((comment, idx) => (
                  <div key={idx} className={idx < student.finalComments.length - 1 ? 'report-comment-border' : ''} style={{ marginBottom: '10px', paddingBottom: '10px' }}>
                    <div className="report-muted-text" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>
                      From: {comment.from} - <strong>{comment.points} pts</strong>
                    </div>
                    {comment.text && <div style={{ fontSize: '0.9rem' }}>{comment.text}</div>}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default ReportsTab;

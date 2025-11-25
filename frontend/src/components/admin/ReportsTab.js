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

  // Filter out teachers and admins - only show students in reports
  const studentsOnly = classStudents.filter(s => s.role === 'student');

  // Filter evaluations and final comments by class
  // Use class_id if available (new data), otherwise check if BOTH evaluator and evaluatee are in this class
  const classStudentIds = new Set(studentsOnly.map(s => s.id));
  const classEvaluations = evaluations.filter(e =>
    e.class_id
      ? e.class_id === parseInt(selectedClass)
      : (classStudentIds.has(e.evaluator_id) && classStudentIds.has(e.evaluatee_id))
  );
  const classFinalComments = finalCommentsData.filter(fc =>
    fc.class_id
      ? fc.class_id === parseInt(selectedClass)
      : (classStudentIds.has(fc.evaluator_id) && classStudentIds.has(fc.evaluatee_id))
  );

  // Get students in selected group (filtered to class, excluding teachers/admins)
  const getStudentsInGroup = () => {
    if (reportGroup === 'all') return studentsOnly;

    // Find students in the selected group
    const groupId = parseInt(reportGroup);
    const selectedGroupData = classGroups.find(g => g.id === groupId);
    if (!selectedGroupData || !selectedGroupData.members) return [];

    // Filter out non-students from group members
    return selectedGroupData.members.filter(m => m.role === 'student');
  };

  // Get class config for number of phases and min word count
  const selectedClassData = classes.find(c => c.id.toString() === selectedClass);
  const numPhases = selectedClassData?.num_phases || 3;
  const minCommentWords = parseInt(selectedClassData?.min_comment_words) || 0;
  const phaseNumbers = Array.from({ length: numPhases }, (_, i) => i + 1);

  // Word count helper
  const countWords = (text) => {
    if (!text || !text.trim()) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  // Calculate summaries per student
  const students = getStudentsInGroup();
  const studentSummaries = students.map(student => {
    // Check what this student has SUBMITTED (as evaluator)
    const submittedEvals = classEvaluations.filter(e => e.evaluator_id === student.id);

    // Track submission status and word count compliance per phase
    // Status: 'none' | 'incomplete' (below word count) | 'complete'
    const phaseStatus = {};
    phaseNumbers.forEach(phase => {
      const phaseEvals = submittedEvals.filter(e => e.phase === phase);
      if (phaseEvals.length === 0) {
        phaseStatus[phase] = 'none';
      } else if (minCommentWords > 0) {
        // Check if ALL comments for this phase meet the minimum
        const allMeetMinimum = phaseEvals.every(e => countWords(e.comments) >= minCommentWords);
        phaseStatus[phase] = allMeetMinimum ? 'complete' : 'incomplete';
      } else {
        phaseStatus[phase] = 'complete';
      }
    });

    // Check final evaluation status
    const studentFinalEvals = classFinalComments.filter(fc => fc.evaluator_id === student.id);
    let finalStatus = 'none';
    if (studentFinalEvals.length > 0) {
      if (minCommentWords > 0) {
        const allMeetMinimum = studentFinalEvals.every(fc => countWords(fc.comments) >= minCommentWords);
        finalStatus = allMeetMinimum ? 'complete' : 'incomplete';
      } else {
        finalStatus = 'complete';
      }
    }

    // Legacy compatibility
    const submittedPhases = {};
    phaseNumbers.forEach(phase => {
      submittedPhases[phase] = phaseStatus[phase] !== 'none';
    });
    const submittedFinal = finalStatus !== 'none';

    const studentEvals = classEvaluations.filter(e => e.evaluatee_id === student.id);
    const phases = phaseNumbers.map(phase => {
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
    const studentFinalComments = classFinalComments.filter(fc => fc.evaluatee_id === student.id);
    const totalFinalPoints = studentFinalComments.reduce((sum, fc) => sum + (fc.final_points || 0), 0);
    const finalCommentsList = studentFinalComments.map(fc => ({
      from: fc.evaluator_name,
      text: fc.comments,
      points: fc.final_points || 0
    })).filter(c => c.text || c.points > 0);

    return { ...student, phases, totalFinalPoints, finalComments: finalCommentsList, submittedPhases, submittedFinal, phaseStatus, finalStatus };
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
        <p className="report-muted-text" style={{ marginBottom: '10px', fontSize: '0.85rem' }}>
          <span style={{ color: '#27ae60' }}>✓</span> = submitted{minCommentWords > 0 && ' & meets word count'} |
          {minCommentWords > 0 && <><span style={{ color: '#f39c12' }}> ✗</span> = submitted but below {minCommentWords} words | </>}
          <span style={{ color: '#e74c3c' }}>✗</span> = not submitted
        </p>
        {students.length === 0 ? (
          <p>No students found.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  {phaseNumbers.map(p => (
                    <React.Fragment key={p}>
                      <th>P{p} Score</th>
                      <th>P{p} Likert</th>
                    </React.Fragment>
                  ))}
                  <th>Final Pts</th>
                  <th style={{ borderLeft: '2px solid #586e75' }}>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {studentSummaries.map(student => (
                  <tr key={student.id}>
                    <td><strong>{student.last_name}, {student.first_name}</strong></td>
                    {phaseNumbers.map((phaseNum, i) => {
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
                    <td style={{ borderLeft: '2px solid #586e75', whiteSpace: 'nowrap' }}>
                      {phaseNumbers.map(p => {
                        const status = student.phaseStatus[p];
                        const color = status === 'complete' ? '#27ae60' : status === 'incomplete' ? '#f39c12' : '#e74c3c';
                        const symbol = status === 'complete' ? '✓' : '✗';
                        const title = status === 'complete' ? 'Submitted' : status === 'incomplete' ? 'Submitted but below word count' : 'Not submitted';
                        return (
                          <span
                            key={p}
                            title={`Phase ${p}: ${title}`}
                            style={{ color, marginRight: '4px' }}
                          >
                            {symbol}
                          </span>
                        );
                      })}
                      {selectedClassData?.has_final_evaluation && (
                        <span
                          title={`Final: ${student.finalStatus === 'complete' ? 'Submitted' : student.finalStatus === 'incomplete' ? 'Submitted but below word count' : 'Not submitted'}`}
                          style={{
                            color: student.finalStatus === 'complete' ? '#27ae60' : student.finalStatus === 'incomplete' ? '#f39c12' : '#e74c3c',
                            marginLeft: '4px'
                          }}
                        >
                          F:{student.finalStatus === 'complete' ? '✓' : '✗'}
                        </span>
                      )}
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
              {phaseNumbers.map(phaseNum => {
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

        {phaseNumbers.map(phaseNum => (
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
        {phaseNumbers.map(phaseNum => (
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

import React, { useState } from 'react';
import ImageViewer from '../ImageViewer';
// Helper to escape CSV values
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Helper to trigger CSV download
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

function ReportsTab({
  darkMode,
  selectedClass,
  classes,
  classStudents,
  classGroups,
  evaluations,
  finalCommentsData,
  reportGroup,
  setReportGroup,
  assignmentEvaluations,
  paperReviewData
}) {
  const showGroups = !!classes?.find(c => c.id === parseInt(selectedClass))?.show_groups;

  // Image viewer state
  const [viewerImages, setViewerImages] = useState(null);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Open image viewer with a set of images
  const openImageViewer = (attachments, startIndex = 0) => {
    const images = attachments.map(att => ({
      id: att.id,
      url: att.url,
      fileName: att.fileName
    }));
    setViewerImages(images);
    setViewerIndex(startIndex);
  };

  const closeImageViewer = () => {
    setViewerImages(null);
    setViewerIndex(0);
  };

  if (!selectedClass) {
    return (
      <div className="card">
        <h2>Select a Class</h2>
        <p>Please select a class from the header dropdown to view reports.</p>
      </div>
    );
  }

  // Get class config
  const selectedClassData = classes.find(c => c.id.toString() === selectedClass);
  const isAssignmentMode = selectedClassData?.evaluation_mode === 'assignments';

  // Filter out teachers and admins - only show students in reports
  const studentsOnly = classStudents.filter(s => s.role === 'student');

  // Get students in selected group
  const getStudentsInGroup = () => {
    if (reportGroup === 'all') return studentsOnly;
    const groupId = parseInt(reportGroup);
    const selectedGroupData = classGroups.find(g => g.id === groupId);
    if (!selectedGroupData || !selectedGroupData.members) return [];
    return selectedGroupData.members.filter(m => m.role === 'student');
  };

  // Find which group a student belongs to
  const getStudentGroup = (studentId) => {
    return classGroups.find(g => g.members?.some(m => m.id === studentId));
  };

  // Assignment-based class reports view
  if (isAssignmentMode) {
    const assignments = assignmentEvaluations?.assignments || [];
    const individualEvals = assignmentEvaluations?.individual_evaluations || [];
    const groupEvals = assignmentEvaluations?.group_evaluations || [];
    const students = getStudentsInGroup();

    // Build student summaries for assignment mode
    const studentSummaries = students.map(student => {
      const studentGroup = getStudentGroup(student.id);

      // Get evaluations received by this student (individual)
      const receivedEvals = individualEvals.filter(e => e.evaluatee_id === student.id);

      // Get evaluations submitted by this student
      const submittedIndividual = individualEvals.filter(e => e.evaluator_id === student.id);
      const submittedGroup = groupEvals.filter(e => e.evaluator_id === student.id);

      // Calculate scores per assignment
      const assignmentScores = {};
      assignments.forEach(assignment => {
        const assignmentEvals = receivedEvals.filter(e => e.assignment_id === assignment.id);
        if (assignmentEvals.length > 0) {
          const avgScore = assignmentEvals.reduce((sum, e) => sum + (e.avg_score || 0), 0) / assignmentEvals.length;
          assignmentScores[assignment.id] = {
            avgScore,
            count: assignmentEvals.length,
            comments: assignmentEvals.filter(e => e.comments || (e.attachments && e.attachments.length > 0)).map(e => ({
              from: e.evaluator_name,
              text: e.comments,
              attachments: e.attachments || []
            }))
          };
        }
      });

      // Overall average
      const allReceivedScores = receivedEvals.filter(e => e.avg_score != null);
      const overallAvg = allReceivedScores.length > 0
        ? allReceivedScores.reduce((sum, e) => sum + e.avg_score, 0) / allReceivedScores.length
        : null;

      return {
        ...student,
        group: studentGroup,
        assignmentScores,
        overallAvg,
        submittedCount: submittedIndividual.length + submittedGroup.length
      };
    });

    // Export scores to CSV
    const exportAssignmentScoresCSV = () => {
      const className = selectedClassData?.name || 'class';
      const headers = ['Last Name', 'First Name', 'Email', 'Group'];
      assignments.forEach(a => headers.push(a.name));
      headers.push('Overall Avg');

      const rows = studentSummaries.map(student => {
        const row = [student.last_name, student.first_name, student.email, student.group?.name || ''];
        assignments.forEach(a => {
          const score = student.assignmentScores[a.id]?.avgScore;
          row.push(score != null ? score.toFixed(2) : '');
        });
        row.push(student.overallAvg != null ? student.overallAvg.toFixed(2) : '');
        return row;
      });

      const csvContent = [headers.map(escapeCSV).join(','), ...rows.map(r => r.map(escapeCSV).join(','))].join('\n');
      downloadCSV(`${className.replace(/\s+/g, '_')}_assignment_scores.csv`, csvContent);
    };

    // Export comments to CSV (includes open response text)
    const exportAssignmentCommentsCSV = () => {
      const className = selectedClassData?.name || 'class';
      const headers = ['Student Last Name', 'Student First Name', 'Assignment', 'From', 'Comment', 'Open Responses'];
      const rows = [];

      studentSummaries.forEach(student => {
        assignments.forEach(assignment => {
          const assignmentEvals = individualEvals.filter(e => e.evaluatee_id === student.id && e.assignment_id === assignment.id);
          assignmentEvals.forEach(evalItem => {
            // Collect open response texts
            const openResponses = (evalItem.scores || [])
              .filter(s => s.question_type === 'open_response' && s.text_response)
              .map(s => `${s.criterion_name}: ${s.text_response}`)
              .join(' | ');

            if (evalItem.comments || openResponses) {
              rows.push([
                student.last_name,
                student.first_name,
                assignment.name,
                evalItem.evaluator_name,
                evalItem.comments || '',
                openResponses
              ]);
            }
          });
        });
      });

      const csvContent = [headers.map(escapeCSV).join(','), ...rows.map(r => r.map(escapeCSV).join(','))].join('\n');
      downloadCSV(`${className.replace(/\s+/g, '_')}_assignment_comments.csv`, csvContent);
    };

    return (
      <>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h2 style={{ margin: 0 }}>Export Data (Assignment Mode)</h2>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={exportAssignmentScoresCSV}
                className="btn btn-primary"
                style={{ fontSize: '0.85rem', padding: '8px 12px' }}
              >
                Export Scores
              </button>
              <button
                onClick={exportAssignmentCommentsCSV}
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem', padding: '8px 12px' }}
              >
                Export Comments
              </button>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.8 }}>
            Download CSV files for the currently selected group ({reportGroup === 'all' ? 'All Groups' : classGroups.find(g => g.id.toString() === reportGroup)?.name || 'Selected Group'})
          </p>
        </div>

        {showGroups && (
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
        )}

        <div className="card">
          <h2>Student Scores by Assignment</h2>
          {students.length === 0 ? (
            <p>No students found.</p>
          ) : (
            <>
              {/* Desktop table view */}
              <div className="desktop-table" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Student</th>
                      {showGroups && <th style={{ textAlign: 'left', padding: '10px' }}>Group</th>}
                      {assignments.map(a => (
                        <th key={a.id} style={{ textAlign: 'center', padding: '10px' }}>{a.name}</th>
                      ))}
                      <th style={{ textAlign: 'center', padding: '10px', borderLeft: '2px solid #586e75' }}>Overall</th>
                      <th style={{ textAlign: 'center', padding: '10px' }}>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentSummaries.map(student => (
                      <tr key={student.id}>
                        <td style={{ padding: '10px' }}><strong>{student.last_name}, {student.first_name}</strong></td>
                        {showGroups && <td style={{ padding: '10px', color: darkMode ? '#a0a0a0' : '#666' }}>{student.group?.name || 'No Group'}</td>}
                        {assignments.map(a => {
                          const score = student.assignmentScores[a.id];
                          return (
                            <td key={a.id} style={{ textAlign: 'center', padding: '10px' }}>
                              {score?.avgScore != null ? (
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '3px',
                                  background: score.avgScore >= 4 ? '#27ae60' : score.avgScore >= 3 ? '#f39c12' : '#e74c3c',
                                  color: 'white',
                                  fontSize: '0.85rem'
                                }}>
                                  {score.avgScore.toFixed(1)}
                                </span>
                              ) : '-'}
                            </td>
                          );
                        })}
                        <td style={{ textAlign: 'center', padding: '10px', borderLeft: '2px solid #586e75', fontWeight: 'bold' }}>
                          {student.overallAvg != null ? student.overallAvg.toFixed(2) : '-'}
                        </td>
                        <td style={{ textAlign: 'center', padding: '10px' }}>
                          {student.submittedCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card view */}
              <div className="mobile-card-list">
                {studentSummaries.map(student => (
                  <div key={student.id} className="mobile-card">
                    <div className="mobile-card-header">
                      {student.last_name}, {student.first_name}
                    </div>
                    {showGroups && (
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Group</span>
                        <span className="mobile-card-value">{student.group?.name || 'No Group'}</span>
                      </div>
                    )}

                    {/* Assignment scores */}
                    {assignments.map(a => {
                      const score = student.assignmentScores[a.id];
                      return (
                        <div key={a.id} className="mobile-card-row">
                          <span className="mobile-card-label">{a.name}</span>
                          {score?.avgScore != null ? (
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '3px',
                              background: score.avgScore >= 4 ? '#27ae60' : score.avgScore >= 3 ? '#f39c12' : '#e74c3c',
                              color: 'white',
                              fontSize: '0.85rem'
                            }}>
                              {score.avgScore.toFixed(1)}
                            </span>
                          ) : (
                            <span style={{ color: '#999' }}>-</span>
                          )}
                        </div>
                      );
                    })}

                    {/* Summary row */}
                    <div className="mobile-card-row" style={{ borderTop: '1px solid #e0e0e0', paddingTop: '8px', marginTop: '4px' }}>
                      <span className="mobile-card-label">Overall Avg</span>
                      <span className="mobile-card-value" style={{ fontWeight: 'bold' }}>
                        {student.overallAvg != null ? student.overallAvg.toFixed(2) : '-'}
                      </span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Submitted</span>
                      <span className="mobile-card-value">{student.submittedCount}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Group Scores Section - for audience/group evaluations */}
        {groupEvals.length > 0 && (
          <div className="card">
            <h2>Group Scores (Audience Evaluations)</h2>
            <p style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '15px' }}>
              Scores received by groups from audience evaluations
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '10px' }}>Group</th>
                    <th style={{ textAlign: 'left', padding: '10px' }}>Assignment</th>
                    <th style={{ textAlign: 'center', padding: '10px' }}>Avg Score</th>
                    <th style={{ textAlign: 'center', padding: '10px' }}># Evaluations</th>
                    <th style={{ textAlign: 'left', padding: '10px' }}>Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Group evaluations by group and assignment
                    const groupSummaries = {};
                    groupEvals.forEach(e => {
                      const key = `${e.group_id}-${e.assignment_id}`;
                      if (!groupSummaries[key]) {
                        groupSummaries[key] = {
                          group_id: e.group_id,
                          group_name: e.group_name,
                          assignment_id: e.assignment_id,
                          assignment_name: e.assignment_name,
                          scores: [],
                          comments: []
                        };
                      }
                      if (e.avg_score != null) {
                        groupSummaries[key].scores.push(e.avg_score);
                      }
                      if (e.comments || (e.attachments && e.attachments.length > 0)) {
                        groupSummaries[key].comments.push({
                          from: e.evaluator_name,
                          text: e.comments,
                          attachments: e.attachments || []
                        });
                      }
                    });

                    return Object.values(groupSummaries).map((summary, idx) => {
                      const avgScore = summary.scores.length > 0
                        ? summary.scores.reduce((a, b) => a + b, 0) / summary.scores.length
                        : null;
                      return (
                        <tr key={`${summary.group_id}-${summary.assignment_id}`} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.05)' }}>
                          <td style={{ padding: '10px', fontWeight: 'bold' }}>{summary.group_name}</td>
                          <td style={{ padding: '10px' }}>{summary.assignment_name}</td>
                          <td style={{ textAlign: 'center', padding: '10px' }}>
                            {avgScore != null ? (
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '3px',
                                background: avgScore >= 4 ? '#27ae60' : avgScore >= 3 ? '#f39c12' : '#e74c3c',
                                color: 'white',
                                fontSize: '0.85rem'
                              }}>
                                {avgScore.toFixed(2)}
                              </span>
                            ) : '-'}
                          </td>
                          <td style={{ textAlign: 'center', padding: '10px' }}>{summary.scores.length}</td>
                          <td style={{ padding: '10px', fontSize: '0.85rem' }}>
                            {summary.comments.length > 0 ? (
                              <details>
                                <summary style={{ cursor: 'pointer' }}>{summary.comments.length} comment(s)</summary>
                                <div style={{ marginTop: '8px' }}>
                                  {summary.comments.map((c, i) => (
                                    <div key={i} style={{ marginBottom: '10px', paddingLeft: '10px', borderLeft: '2px solid #ddd' }}>
                                      <span style={{ color: darkMode ? '#a0a0a0' : '#666', fontSize: '0.8rem' }}>{c.from}:</span> {c.text}
                                      {c.attachments && c.attachments.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                          {c.attachments.map((att, attIdx) => (
                                            <button
                                              key={att.id}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                openImageViewer(c.attachments, attIdx);
                                              }}
                                              style={{
                                                padding: 0,
                                                border: 'none',
                                                background: 'none',
                                                cursor: 'pointer'
                                              }}
                                            >
                                              <img src={att.url} alt={att.fileName} style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px' }} />
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </details>
                            ) : '-'}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="card">
          <h2>All Comments by Assignment</h2>
          {assignments.map(assignment => {
            const allComments = studentSummaries.flatMap(student =>
              (student.assignmentScores[assignment.id]?.comments || []).map(c => ({
                ...c,
                studentName: `${student.last_name}, ${student.first_name}`
              }))
            );

            if (allComments.length === 0) return null;

            return (
              <div key={assignment.id} style={{ marginBottom: '30px' }}>
                <h3 style={{ borderBottom: `2px solid ${darkMode ? '#444' : '#ddd'}`, paddingBottom: '10px', marginBottom: '15px' }}>
                  {assignment.name}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
                  {studentSummaries.map(student => {
                    const comments = student.assignmentScores[assignment.id]?.comments || [];
                    if (comments.length === 0) return null;
                    return (
                      <div key={student.id} style={{
                        padding: '15px',
                        borderRadius: '8px',
                        background: darkMode ? '#1a1a1a' : '#f8f9fa',
                        border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
                      }}>
                        <h4 style={{ marginTop: 0, marginBottom: '10px' }}>
                          {student.last_name}, {student.first_name}
                        </h4>
                        {comments.map((comment, idx) => (
                          <div key={idx} style={{
                            marginBottom: idx < comments.length - 1 ? '10px' : 0,
                            paddingBottom: idx < comments.length - 1 ? '10px' : 0,
                            borderBottom: idx < comments.length - 1 ? `1px solid ${darkMode ? '#333' : '#ddd'}` : 'none'
                          }}>
                            <div style={{ fontSize: '0.8rem', color: darkMode ? '#a0a0a0' : '#666', marginBottom: '4px' }}>
                              From: {comment.from}
                            </div>
                            <div style={{ fontSize: '0.9rem' }}>{comment.text}</div>
                            {/* Display attached images */}
                            {comment.attachments && comment.attachments.length > 0 && (
                              <div style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '8px',
                                marginTop: '10px'
                              }}>
                                {comment.attachments.map((att, attIdx) => (
                                  <button
                                    key={att.id}
                                    onClick={() => openImageViewer(comment.attachments, attIdx)}
                                    style={{
                                      display: 'block',
                                      width: '80px',
                                      height: '80px',
                                      borderRadius: '4px',
                                      overflow: 'hidden',
                                      border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                                      padding: 0,
                                      background: 'none',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <img
                                      src={att.url}
                                      alt={att.fileName}
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover'
                                      }}
                                    />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Paper Reviews Section */}
        {paperReviewData?.rounds?.length > 0 && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h2 style={{ margin: 0 }}>Paper Reviews</h2>
              <button
                onClick={() => {
                  const className = selectedClassData?.name || 'class';
                  const headers = ['Round', 'Student', 'Paper Submitted', 'Late', 'Review Completed', 'Reviewer', 'Comments Received', 'Teacher Reviewed'];
                  const rows = [];
                  paperReviewData.rounds.forEach(round => {
                    round.papers.forEach(paper => {
                      rows.push([
                        round.assignment_name,
                        paper.author_name,
                        paper.submitted_at ? 'Yes' : 'No',
                        paper.is_late ? 'Yes' : 'No',
                        paper.review?.submitted_at ? 'Yes' : 'No',
                        paper.review?.reviewer_name || '',
                        paper.review?.overall_comments || '',
                        paper.teacher_review ? 'Yes' : 'No'
                      ]);
                    });
                    round.students_without_papers.forEach(student => {
                      rows.push([
                        round.assignment_name,
                        student.name,
                        'No', '', 'No', '', '', 'No'
                      ]);
                    });
                  });
                  const csvContent = [headers.map(escapeCSV).join(','), ...rows.map(r => r.map(escapeCSV).join(','))].join('\n');
                  downloadCSV(`${className.replace(/\s+/g, '_')}_paper_reviews.csv`, csvContent);
                }}
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem', padding: '8px 12px' }}
              >
                Export Paper Reviews
              </button>
            </div>

            {paperReviewData.rounds.map(round => (
              <div key={round.round_id} style={{ marginBottom: '25px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0 }}>{round.assignment_name}</h3>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '3px',
                    fontSize: '0.8rem',
                    background: round.status === 'completed' ? '#27ae60' : round.status === 'review' ? '#3498db' : '#f39c12',
                    color: 'white'
                  }}>
                    {round.status}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '10px' }}>
                  {round.submission_deadline && <span>Submit by: {new Date(round.submission_deadline).toLocaleDateString()}</span>}
                  {round.review_deadline && <span style={{ marginLeft: '15px' }}>Review by: {new Date(round.review_deadline).toLocaleDateString()}</span>}
                  {round.feedback_released_at && <span style={{ marginLeft: '15px', color: '#27ae60' }}>Feedback released</span>}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '10px' }}>Student</th>
                        <th style={{ textAlign: 'center', padding: '10px' }}>Paper</th>
                        <th style={{ textAlign: 'center', padding: '10px' }}>Peer Review</th>
                        <th style={{ textAlign: 'left', padding: '10px' }}>Reviewer</th>
                        <th style={{ textAlign: 'left', padding: '10px' }}>Comments Received</th>
                        <th style={{ textAlign: 'center', padding: '10px' }}>Teacher</th>
                      </tr>
                    </thead>
                    <tbody>
                      {round.papers.map((paper, idx) => (
                        <tr key={paper.id} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.05)' }}>
                          <td style={{ padding: '10px' }}><strong>{paper.author_name}</strong></td>
                          <td style={{ textAlign: 'center', padding: '10px' }}>
                            <span style={{ color: '#27ae60' }}>Submitted</span>
                            {paper.is_late && <span style={{ color: '#e74c3c', marginLeft: '4px', fontSize: '0.8rem' }}>(late)</span>}
                          </td>
                          <td style={{ textAlign: 'center', padding: '10px' }}>
                            {paper.review?.submitted_at ? (
                              <span style={{ color: '#27ae60' }}>Done</span>
                            ) : paper.review ? (
                              <span style={{ color: '#f39c12' }}>Pending</span>
                            ) : (
                              <span style={{ color: '#999' }}>-</span>
                            )}
                          </td>
                          <td style={{ padding: '10px', fontSize: '0.9rem' }}>
                            {paper.review?.reviewer_name || '-'}
                          </td>
                          <td style={{ padding: '10px', fontSize: '0.85rem' }}>
                            {paper.review?.overall_comments ? (
                              <details>
                                <summary style={{ cursor: 'pointer' }}>
                                  {paper.review.annotation_count > 0
                                    ? `Comments + ${paper.review.annotation_count} annotation${paper.review.annotation_count !== 1 ? 's' : ''}`
                                    : 'View comments'}
                                </summary>
                                <div style={{ marginTop: '6px', whiteSpace: 'pre-wrap', padding: '8px', background: 'rgba(0,0,0,0.03)', borderRadius: '4px' }}>
                                  {paper.review.overall_comments}
                                </div>
                              </details>
                            ) : paper.review?.annotation_count > 0 ? (
                              <span style={{ fontSize: '0.85rem' }}>{paper.review.annotation_count} annotation{paper.review.annotation_count !== 1 ? 's' : ''}</span>
                            ) : '-'}
                          </td>
                          <td style={{ textAlign: 'center', padding: '10px' }}>
                            {paper.teacher_review ? (
                              <span style={{ color: '#27ae60' }}>Done</span>
                            ) : '-'}
                          </td>
                        </tr>
                      ))}
                      {round.students_without_papers.map(student => (
                        <tr key={`no-paper-${student.id}`} style={{ background: 'rgba(231,76,60,0.05)' }}>
                          <td style={{ padding: '10px' }}><strong>{student.name}</strong></td>
                          <td style={{ textAlign: 'center', padding: '10px' }}>
                            <span style={{ color: '#e74c3c' }}>Not submitted</span>
                          </td>
                          <td style={{ textAlign: 'center', padding: '10px' }}><span style={{ color: '#999' }}>-</span></td>
                          <td style={{ padding: '10px' }}>-</td>
                          <td style={{ padding: '10px' }}>-</td>
                          <td style={{ textAlign: 'center', padding: '10px' }}>-</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: '8px' }}>
                  {round.papers.length} paper{round.papers.length !== 1 ? 's' : ''} submitted,{' '}
                  {round.papers.filter(p => p.review?.submitted_at).length} peer review{round.papers.filter(p => p.review?.submitted_at).length !== 1 ? 's' : ''} completed
                  {round.students_without_papers.length > 0 && `, ${round.students_without_papers.length} student${round.students_without_papers.length !== 1 ? 's' : ''} missing papers`}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Image Viewer */}
        {viewerImages && (
          <ImageViewer
            images={viewerImages}
            initialIndex={viewerIndex}
            onClose={closeImageViewer}
          />
        )}
      </>
    );
  }

  // Phase-based class reports view (existing logic below)

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

  // Phase-based config (uses selectedClassData defined above)
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
        text: e.comments,
        attachments: e.attachments || []
      })).filter(c => c.text || (c.attachments && c.attachments.length > 0));

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

  // Export scores to CSV
  const exportScoresCSV = () => {
    const className = selectedClassData?.name || 'class';
    const headers = ['Last Name', 'First Name', 'Email'];
    phaseNumbers.forEach(p => {
      headers.push(`P${p} Score`, `P${p} Likert`, `P${p} Contribution`, `P${p} Communication`, `P${p} Reliability`, `P${p} Quality`, `P${p} Collaboration`);
    });
    headers.push('Final Points');

    const rows = studentSummaries.map(student => {
      const row = [student.last_name, student.first_name, student.email];
      phaseNumbers.forEach(phaseNum => {
        const phase = student.phases[phaseNum - 1];
        if (phase) {
          row.push(
            phase.avgScore.toFixed(1),
            phase.avgLikert.toFixed(2),
            phase.criteria.contribution.toFixed(2),
            phase.criteria.communication.toFixed(2),
            phase.criteria.reliability.toFixed(2),
            phase.criteria.quality_of_work.toFixed(2),
            phase.criteria.collaboration.toFixed(2)
          );
        } else {
          row.push('', '', '', '', '', '', '');
        }
      });
      row.push(student.totalFinalPoints || 0);
      return row;
    });

    const csvContent = [headers.map(escapeCSV).join(','), ...rows.map(r => r.map(escapeCSV).join(','))].join('\n');
    downloadCSV(`${className.replace(/\s+/g, '_')}_scores.csv`, csvContent);
  };

  // Export comments to CSV
  const exportCommentsCSV = () => {
    const className = selectedClassData?.name || 'class';
    const headers = ['Student Last Name', 'Student First Name', 'Phase', 'From', 'Score', 'Comment'];
    const rows = [];

    studentSummaries.forEach(student => {
      phaseNumbers.forEach(phaseNum => {
        const phase = student.phases[phaseNum - 1];
        if (phase && phase.comments) {
          phase.comments.forEach(comment => {
            rows.push([
              student.last_name,
              student.first_name,
              `Phase ${phaseNum}`,
              comment.from,
              phase.avgScore.toFixed(1),
              comment.text
            ]);
          });
        }
      });
      // Add final comments
      if (student.finalComments && student.finalComments.length > 0) {
        student.finalComments.forEach(comment => {
          rows.push([
            student.last_name,
            student.first_name,
            'Final',
            comment.from,
            comment.points,
            comment.text
          ]);
        });
      }
    });

    const csvContent = [headers.map(escapeCSV).join(','), ...rows.map(r => r.map(escapeCSV).join(','))].join('\n');
    downloadCSV(`${className.replace(/\s+/g, '_')}_comments.csv`, csvContent);
  };

  // Export submission status to CSV
  const exportSubmissionStatusCSV = () => {
    const className = selectedClassData?.name || 'class';
    const headers = ['Last Name', 'First Name', 'Email'];
    phaseNumbers.forEach(p => headers.push(`P${p} Status`));
    if (selectedClassData?.has_final_evaluation) {
      headers.push('Final Status');
    }

    const rows = studentSummaries.map(student => {
      const row = [student.last_name, student.first_name, student.email];
      phaseNumbers.forEach(p => {
        const status = student.phaseStatus[p];
        row.push(status === 'complete' ? 'Complete' : status === 'incomplete' ? 'Incomplete' : 'Not Submitted');
      });
      if (selectedClassData?.has_final_evaluation) {
        row.push(student.finalStatus === 'complete' ? 'Complete' : student.finalStatus === 'incomplete' ? 'Incomplete' : 'Not Submitted');
      }
      return row;
    });

    const csvContent = [headers.map(escapeCSV).join(','), ...rows.map(r => r.map(escapeCSV).join(','))].join('\n');
    downloadCSV(`${className.replace(/\s+/g, '_')}_submission_status.csv`, csvContent);
  };

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 style={{ margin: 0 }}>Export Data</h2>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={exportScoresCSV}
              className="btn btn-primary"
              style={{ fontSize: '0.85rem', padding: '8px 12px' }}
            >
              Export Scores
            </button>
            <button
              onClick={exportCommentsCSV}
              className="btn btn-secondary"
              style={{ fontSize: '0.85rem', padding: '8px 12px' }}
            >
              Export Comments
            </button>
            <button
              onClick={exportSubmissionStatusCSV}
              className="btn btn-secondary"
              style={{ fontSize: '0.85rem', padding: '8px 12px' }}
            >
              Export Status
            </button>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.8 }}>
          Download CSV files for the currently selected group ({reportGroup === 'all' ? 'All Groups' : classGroups.find(g => g.id.toString() === reportGroup)?.name || 'Selected Group'})
        </p>
      </div>

      {showGroups && (
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
      )}

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
          <>
            {/* Desktop table view */}
            <div className="desktop-table" style={{ overflowX: 'auto' }}>
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

            {/* Mobile card view */}
            <div className="mobile-card-list">
              {studentSummaries.map(student => (
                <div key={student.id} className="mobile-card">
                  <div className="mobile-card-header">
                    {student.last_name}, {student.first_name}
                  </div>

                  {/* Submission status */}
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Status</span>
                    <span>
                      {phaseNumbers.map(p => {
                        const status = student.phaseStatus[p];
                        const color = status === 'complete' ? '#27ae60' : status === 'incomplete' ? '#f39c12' : '#e74c3c';
                        const symbol = status === 'complete' ? '✓' : '✗';
                        return (
                          <span key={p} style={{ color, marginRight: '6px', fontWeight: 'bold' }}>
                            P{p}:{symbol}
                          </span>
                        );
                      })}
                      {selectedClassData?.has_final_evaluation && (
                        <span style={{
                          color: student.finalStatus === 'complete' ? '#27ae60' : student.finalStatus === 'incomplete' ? '#f39c12' : '#e74c3c',
                          fontWeight: 'bold'
                        }}>
                          F:{student.finalStatus === 'complete' ? '✓' : '✗'}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Phase scores */}
                  {phaseNumbers.map((phaseNum, i) => {
                    const phase = student.phases[i];
                    return (
                      <div key={phaseNum} className="mobile-card-row">
                        <span className="mobile-card-label">Phase {phaseNum}</span>
                        <span className="mobile-card-value">
                          {phase ? (
                            <>Score: {phase.avgScore.toFixed(1)} · Likert: {phase.avgLikert.toFixed(2)}</>
                          ) : (
                            <span style={{ color: '#999' }}>No data</span>
                          )}
                        </span>
                      </div>
                    );
                  })}

                  {/* Final points */}
                  <div className="mobile-card-row" style={{ borderTop: '1px solid #e0e0e0', paddingTop: '8px', marginTop: '4px' }}>
                    <span className="mobile-card-label">Final Points</span>
                    <span className="mobile-card-value" style={{ color: '#9b59b6', fontWeight: 'bold' }}>
                      {student.totalFinalPoints || 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
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
                          {/* Display attached images */}
                          {comment.attachments && comment.attachments.length > 0 && (
                            <div style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '8px',
                              marginTop: '10px'
                            }}>
                              {comment.attachments.map((att, attIdx) => (
                                <button
                                  key={att.id}
                                  onClick={() => openImageViewer(comment.attachments, attIdx)}
                                  style={{
                                    display: 'block',
                                    width: '80px',
                                    height: '80px',
                                    borderRadius: '4px',
                                    overflow: 'hidden',
                                    border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                                    padding: 0,
                                    background: 'none',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <img
                                    src={att.url}
                                    alt={att.fileName}
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'cover'
                                    }}
                                  />
                                </button>
                              ))}
                            </div>
                          )}
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

      {/* Image Viewer */}
      {viewerImages && (
        <ImageViewer
          images={viewerImages}
          initialIndex={viewerIndex}
          onClose={closeImageViewer}
        />
      )}
    </>
  );
}

export default ReportsTab;

import React, { useState } from 'react';
import ImageViewer from '../ImageViewer';
import EvaluationExplorer from './reports/EvaluationExplorer';
import { buildModel } from './reports/model';
import { downloadCSV } from './reports/csv';

/**
 * Reports tab: one explorer for every class structure (phase-based peer
 * evaluations, assignment rounds of any type), plus paper review status.
 */
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
  // Image viewer state
  const [viewerImages, setViewerImages] = useState(null);
  const [viewerIndex, setViewerIndex] = useState(0);

  const openImageViewer = (attachments, startIndex = 0) => {
    setViewerImages(attachments.map(att => ({ id: att.id, url: att.url, fileName: att.fileName })));
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

  const selectedClassData = classes.find(c => c.id.toString() === selectedClass);
  const showGroups = !!selectedClassData?.show_groups;
  const className = selectedClassData?.name || 'class';

  const model = buildModel({
    classData: selectedClassData,
    classStudents,
    classGroups,
    evaluations,
    finalComments: finalCommentsData,
    assignmentEvaluations
  });

  return (
    <>
      {/* Keyed by class so drill-down state resets when the class changes */}
      <EvaluationExplorer
        key={selectedClass}
        model={model}
        className={className}
        darkMode={darkMode}
        showGroups={showGroups}
        reportGroup={reportGroup}
        setReportGroup={setReportGroup}
        openImageViewer={openImageViewer}
      />

      {/* Paper Reviews Section */}
      {paperReviewData?.rounds?.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h2 style={{ margin: 0 }}>Paper Reviews</h2>
            <button
              onClick={() => {
                const className = selectedClassData?.name || 'class';
                const headers = ['Round', 'Student', 'Paper Submitted', 'Review Completed', 'Reviewer', 'Comments Received', 'Teacher Reviewed'];
                const rows = [];
                paperReviewData.rounds.forEach(round => {
                  round.papers.forEach(paper => {
                    rows.push([
                      round.assignment_name,
                      paper.author_name,
                      paper.submitted_at ? 'Yes' : 'No',
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
                      'No', 'No', '', '', 'No'
                    ]);
                  });
                });
                downloadCSV(`${className}_paper_reviews.csv`, [headers, ...rows]);
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

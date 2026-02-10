import React, { useState, useEffect } from 'react';
import axios from 'axios';

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
  const [expandedEval, setExpandedEval] = useState(null); // { type: 'individual'|'group'|'phase', id: number }
  const [attachments, setAttachments] = useState([]); // Attachments for expanded eval
  const [loadingAttachments, setLoadingAttachments] = useState(false);

  // Fetch attachments when an evaluation is expanded
  useEffect(() => {
    if (!expandedEval) {
      setAttachments([]);
      return;
    }

    const fetchAttachments = async () => {
      setLoadingAttachments(true);
      try {
        let endpoint;
        if (expandedEval.type === 'phase') {
          endpoint = `/api/evaluations/${expandedEval.id}/attachments`;
        } else if (expandedEval.type === 'individual') {
          endpoint = `/api/assignments/evaluations/individual/${expandedEval.id}/attachments`;
        } else if (expandedEval.type === 'group') {
          endpoint = `/api/assignments/evaluations/group/${expandedEval.id}/attachments`;
        }
        const res = await axios.get(endpoint);
        setAttachments(res.data);
      } catch (err) {
        console.log('No attachments or error fetching:', err);
        setAttachments([]);
      } finally {
        setLoadingAttachments(false);
      }
    };

    fetchAttachments();
  }, [expandedEval]);

  const toggleExpand = (type, id) => {
    if (expandedEval?.type === type && expandedEval?.id === id) {
      setExpandedEval(null);
    } else {
      setExpandedEval({ type, id });
    }
  };

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
                {allEvals.map((e, idx) => {
                  const isExpanded = expandedEval?.type === e.type && expandedEval?.id === e.id;
                  return (
                    <React.Fragment key={`${e.type}-${e.id}`}>
                      <tr
                        style={{
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.05)',
                          cursor: 'pointer'
                        }}
                        onClick={() => toggleExpand(e.type, e.id)}
                        title="Click to view details"
                      >
                        <td style={{ padding: '10px' }}>
                          <span style={{ marginRight: '8px' }}>{isExpanded ? '▼' : '▶'}</span>
                          {e.assignment_name}
                        </td>
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
                      {isExpanded && (
                        <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                          <td colSpan="7" style={{ padding: '15px 20px' }}>
                            {/* Scores */}
                            {e.scores && e.scores.length > 0 && (
                              <div style={{ marginBottom: '15px' }}>
                                <strong>Scores:</strong>
                                <div style={{ display: 'flex', gap: '15px', marginTop: '8px', flexWrap: 'wrap' }}>
                                  {e.scores.filter(s => (s.question_type || 'likert') === 'likert').map(s => (
                                    <div key={s.criterion_id} style={{
                                      padding: '8px 12px',
                                      background: 'rgba(0,0,0,0.05)',
                                      borderRadius: '4px',
                                      fontSize: '0.9rem'
                                    }}>
                                      <span style={{ fontWeight: '500' }}>{s.criterion_name}:</span> {s.score}/{s.max_value}
                                    </div>
                                  ))}
                                </div>
                                {e.scores.some(s => s.question_type === 'open_response') && (
                                  <div style={{ marginTop: '12px' }}>
                                    <strong>Open Responses:</strong>
                                    {e.scores.filter(s => s.question_type === 'open_response').map(s => (
                                      <div key={s.criterion_id} style={{
                                        marginTop: '8px',
                                        padding: '10px 12px',
                                        background: 'rgba(0,0,0,0.03)',
                                        borderRadius: '4px',
                                        fontSize: '0.9rem'
                                      }}>
                                        <span style={{ fontWeight: '500' }}>{s.criterion_name}:</span>
                                        <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                                          {s.text_response || <span style={{ fontStyle: 'italic', color: '#888' }}>No response</span>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Comments */}
                            <div style={{ marginBottom: '15px' }}>
                              <strong>Comments:</strong>
                              <div style={{
                                marginTop: '8px',
                                padding: '12px',
                                background: 'rgba(0,0,0,0.03)',
                                borderRadius: '4px',
                                whiteSpace: 'pre-wrap',
                                fontStyle: e.comments ? 'normal' : 'italic',
                                color: e.comments ? 'inherit' : '#888'
                              }}>
                                {e.comments || 'No comments provided'}
                              </div>
                            </div>

                            {/* Attachments */}
                            <div>
                              <strong>Attached Images:</strong>
                              {loadingAttachments ? (
                                <div style={{ marginTop: '8px', color: '#888' }}>Loading...</div>
                              ) : attachments.length > 0 ? (
                                <div style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                                  gap: '12px',
                                  marginTop: '10px'
                                }}>
                                  {attachments.map(att => (
                                    <div key={att.id} style={{
                                      border: '1px solid #ddd',
                                      borderRadius: '6px',
                                      overflow: 'hidden',
                                      background: '#fff'
                                    }}>
                                      <a href={att.url} target="_blank" rel="noopener noreferrer">
                                        <img
                                          src={att.url}
                                          alt={att.fileName}
                                          style={{
                                            width: '100%',
                                            height: '120px',
                                            objectFit: 'cover'
                                          }}
                                        />
                                      </a>
                                      <div style={{
                                        padding: '6px 8px',
                                        fontSize: '0.75rem',
                                        color: '#666',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                      }}>
                                        {att.fileName}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ marginTop: '8px', color: '#888', fontStyle: 'italic' }}>
                                  No images attached
                                </div>
                              )}
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
              const isExpanded = expandedEval?.type === 'phase' && expandedEval?.id === e.id;
              return (
                <React.Fragment key={e.id}>
                  <tr
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleExpand('phase', e.id)}
                    title="Click to view details"
                  >
                    <td>
                      <span style={{ marginRight: '8px' }}>{isExpanded ? '▼' : '▶'}</span>
                      {e.group_name || 'N/A'}
                    </td>
                    <td>{e.phase}</td>
                    <td>{e.evaluator_name}</td>
                    <td>{e.evaluatee_name}</td>
                    <td>{e.score}/100</td>
                    <td>{avgLikert}/5</td>
                  </tr>
                  {isExpanded && (
                    <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                      <td colSpan="6" style={{ padding: '15px 20px' }}>
                        {/* Criteria Scores */}
                        <div style={{ marginBottom: '15px' }}>
                          <strong>Criteria Scores:</strong>
                          <div style={{ display: 'flex', gap: '15px', marginTop: '8px', flexWrap: 'wrap' }}>
                            <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', fontSize: '0.9rem' }}>
                              <span style={{ fontWeight: '500' }}>Contribution:</span> {e.contribution}/5
                            </div>
                            <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', fontSize: '0.9rem' }}>
                              <span style={{ fontWeight: '500' }}>Communication:</span> {e.communication}/5
                            </div>
                            <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', fontSize: '0.9rem' }}>
                              <span style={{ fontWeight: '500' }}>Reliability:</span> {e.reliability}/5
                            </div>
                            <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', fontSize: '0.9rem' }}>
                              <span style={{ fontWeight: '500' }}>Quality of Work:</span> {e.quality_of_work}/5
                            </div>
                            <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', fontSize: '0.9rem' }}>
                              <span style={{ fontWeight: '500' }}>Collaboration:</span> {e.collaboration}/5
                            </div>
                          </div>
                        </div>

                        {/* Comments */}
                        <div style={{ marginBottom: '15px' }}>
                          <strong>Comments:</strong>
                          <div style={{
                            marginTop: '8px',
                            padding: '12px',
                            background: 'rgba(0,0,0,0.03)',
                            borderRadius: '4px',
                            whiteSpace: 'pre-wrap',
                            fontStyle: e.comments ? 'normal' : 'italic',
                            color: e.comments ? 'inherit' : '#888'
                          }}>
                            {e.comments || 'No comments provided'}
                          </div>
                        </div>

                        {/* Attachments */}
                        <div>
                          <strong>Attached Images:</strong>
                          {loadingAttachments ? (
                            <div style={{ marginTop: '8px', color: '#888' }}>Loading...</div>
                          ) : attachments.length > 0 ? (
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                              gap: '12px',
                              marginTop: '10px'
                            }}>
                              {attachments.map(att => (
                                <div key={att.id} style={{
                                  border: '1px solid #ddd',
                                  borderRadius: '6px',
                                  overflow: 'hidden',
                                  background: '#fff'
                                }}>
                                  <a href={att.url} target="_blank" rel="noopener noreferrer">
                                    <img
                                      src={att.url}
                                      alt={att.fileName}
                                      style={{
                                        width: '100%',
                                        height: '120px',
                                        objectFit: 'cover'
                                      }}
                                    />
                                  </a>
                                  <div style={{
                                    padding: '6px 8px',
                                    fontSize: '0.75rem',
                                    color: '#666',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {att.fileName}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ marginTop: '8px', color: '#888', fontStyle: 'italic' }}>
                              No images attached
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default EvaluationsTab;

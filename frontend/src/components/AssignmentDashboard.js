import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
function AssignmentDashboard({ classId, currentClass, masqueradeUser, darkMode }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [assignmentData, setAssignmentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedAssignment, setExpandedAssignment] = useState(null);

  useEffect(() => {
    if (classId) {
      fetchAssignmentData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, masqueradeUser]);

  const fetchAssignmentData = async () => {
    setLoading(true);
    setError('');
    try {
      const userIdParam = masqueradeUser ? `?user_id=${masqueradeUser}` : '';
      const res = await axios.get(`/api/assignments/evaluations/my/${classId}${userIdParam}`);
      setAssignmentData(res.data);
      // Auto-expand first assignment
      if (res.data.assignments?.length > 0 && !expandedAssignment) {
        setExpandedAssignment(res.data.assignments[0].id);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setError('You are not assigned to a group in this class yet.');
      } else {
        setError('Failed to load assignment data');
      }
    } finally {
      setLoading(false);
    }
  };

  // Get status label and color for an eval type
  const getEvalTypeStatus = (assignment, evalType) => {
    const evals = assignment.evaluations;
    const group = assignmentData?.group;

    if (!group) return { label: 'Not Ready', color: '#95a5a6' };

    let totalRequired = 0;
    let completed = 0;

    if (evalType.target_type === 'individual') {
      // Peer evaluations: evaluate group members
      totalRequired = evalType.include_self
        ? group.members.length
        : group.members.filter(m => m.id !== (masqueradeUser || user?.id)).length;

      // Count completed individual evals
      completed = evals.individual.filter(e => e.eval_type_id === evalType.id).length;
    } else {
      // Group/audience evaluations: evaluate other groups
      // For now, simplified - we'd need to fetch all groups
      totalRequired = 1; // Placeholder
      completed = evals.group.filter(e => e.eval_type_id === evalType.id).length;
    }

    if (completed >= totalRequired) {
      return { label: 'Complete', color: '#27ae60', icon: '✓' };
    } else if (completed > 0) {
      return { label: `${completed}/${totalRequired}`, color: '#f39c12', icon: '' };
    }
    return { label: 'Pending', color: '#95a5a6', icon: '' };
  };

  // Calculate overall assignment progress
  const getAssignmentProgress = (assignment) => {
    if (!assignment.eval_types || assignment.eval_types.length === 0) {
      return { completed: 0, total: 0, percentage: 0 };
    }

    let totalComplete = 0;
    let totalEvalTypes = assignment.eval_types.length;

    assignment.eval_types.forEach(et => {
      const status = getEvalTypeStatus(assignment, et);
      if (status.label === 'Complete') {
        totalComplete++;
      }
    });

    return {
      completed: totalComplete,
      total: totalEvalTypes,
      percentage: Math.round((totalComplete / totalEvalTypes) * 100)
    };
  };

  if (loading) {
    return <div className="loading">Loading assignments...</div>;
  }

  if (error) {
    return <div className="message error">{error}</div>;
  }

  if (!assignmentData || !assignmentData.assignments || assignmentData.assignments.length === 0) {
    return (
      <div className="card">
        <h2>No Assignments</h2>
        <p>No assignments have been created for this class yet.</p>
      </div>
    );
  }

  return (
    <>
      {/* Group Info */}
      {currentClass?.show_groups && assignmentData.group && (
        <div className="card">
          <h2>Your Group: {assignmentData.group.name}</h2>
          <p>Members:</p>
          <ul>
            {assignmentData.group.members.map(member => (
              <li key={member.id}>
                {member.last_name}, {member.first_name}
                {member.id === (masqueradeUser || user?.id) && ' (You)'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Assignments List */}
      <div className="card">
        <h2>Assignments</h2>
        <p>Click on an assignment to view and complete its evaluations.</p>

        <div style={{ marginTop: '20px' }}>
          {assignmentData.assignments.map(assignment => {
            const progress = getAssignmentProgress(assignment);
            const isExpanded = expandedAssignment === assignment.id;

            return (
              <div
                key={assignment.id}
                style={{
                  border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                  borderRadius: '8px',
                  marginBottom: '15px',
                  overflow: 'hidden'
                }}
              >
                {/* Assignment Header */}
                <div
                  onClick={() => setExpandedAssignment(isExpanded ? null : assignment.id)}
                  className="assignment-header"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '15px 20px',
                    background: darkMode ? '#2a2a2a' : '#f8f9fa',
                    cursor: 'pointer',
                    borderBottom: isExpanded ? `1px solid ${darkMode ? '#444' : '#ddd'}` : 'none',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 auto', minWidth: '200px' }}>
                    <span style={{
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                      display: 'inline-block',
                      flexShrink: 0
                    }}>
                      ▶
                    </span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{assignment.name}</h3>
                      {assignment.description && (
                        <p style={{ margin: '4px 0 0', color: darkMode ? '#a0a0a0' : '#666', fontSize: '0.9rem' }}>
                          {assignment.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {assignment.due_date && (
                      <span style={{
                        fontSize: '0.85rem',
                        color: darkMode ? '#f39c12' : '#d68910'
                      }}>
                        Due: {new Date(assignment.due_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                    )}
                    <div className="assignment-status-badge" style={{
                      padding: '6px 12px',
                      borderRadius: '20px',
                      textAlign: 'center',
                      fontSize: '0.85rem',
                      fontWeight: '500',
                      whiteSpace: 'nowrap',
                      background: progress.percentage === 100
                        ? (darkMode ? '#1a3d1a' : '#d4edda')
                        : progress.percentage > 0
                          ? (darkMode ? '#3d3a1a' : '#fff3cd')
                          : (darkMode ? '#2a2a2a' : '#f0f0f0'),
                      color: progress.percentage === 100
                        ? '#27ae60'
                        : progress.percentage > 0
                          ? '#f39c12'
                          : '#95a5a6'
                    }}>
                      {progress.percentage === 100 ? '✓ Complete' : `${progress.completed}/${progress.total}`}
                    </div>
                  </div>
                </div>

                {/* Expanded Eval Types */}
                {isExpanded && (
                  <div style={{ padding: '15px 20px' }}>
                    {assignment.eval_types.length === 0 ? (
                      <p style={{ color: darkMode ? '#a0a0a0' : '#666', margin: 0 }}>
                        No evaluation types configured for this assignment.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {assignment.eval_types.map(evalType => {
                          const status = getEvalTypeStatus(assignment, evalType);

                          // Special handling for paper_review eval type
                          if (evalType.eval_type === 'paper_review') {
                            return (
                              <div
                                key={evalType.id}
                                style={{
                                  padding: '12px 15px',
                                  background: darkMode ? '#333' : '#fff',
                                  border: `1px solid ${darkMode ? '#444' : '#e0e0e0'}`,
                                  borderRadius: '6px',
                                }}
                              >
                                <div style={{ fontWeight: '500', marginBottom: '8px' }}>
                                  {evalType.name}
                                </div>
                                <div style={{
                                  fontSize: '0.85rem',
                                  color: darkMode ? '#a0a0a0' : '#666',
                                  marginBottom: '12px'
                                }}>
                                  Paper review workflow
                                </div>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => navigate(`/paper-review/${evalType.id}/submit${masqueradeUser ? `?user_id=${masqueradeUser}` : ''}`)}
                                    style={{ fontSize: '0.85rem' }}
                                  >
                                    📄 Submit Paper
                                  </button>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => navigate(`/paper-review/${evalType.id}/review${masqueradeUser ? `?user_id=${masqueradeUser}` : ''}`)}
                                    style={{ fontSize: '0.85rem' }}
                                  >
                                    ✏️ Review Paper
                                  </button>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => navigate(`/paper-review/${evalType.id}/feedback${masqueradeUser ? `?user_id=${masqueradeUser}` : ''}`)}
                                    style={{ fontSize: '0.85rem' }}
                                  >
                                    💬 View Feedback
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={evalType.id}
                              className="eval-type-row"
                              onClick={() => navigate(`/evaluate-assignment/${assignment.id}/${evalType.id}?class_id=${classId}${masqueradeUser ? `&user_id=${masqueradeUser}` : ''}`)}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '12px 15px',
                                background: darkMode ? '#333' : '#fff',
                                border: `1px solid ${darkMode ? '#444' : '#e0e0e0'}`,
                                borderRadius: '6px',
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                                flexWrap: 'wrap',
                                gap: '10px'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = darkMode ? '#3a3a3a' : '#f5f5f5'}
                              onMouseLeave={(e) => e.currentTarget.style.background = darkMode ? '#333' : '#fff'}
                            >
                              <div style={{ flex: '1 1 auto', minWidth: '150px' }}>
                                <div style={{ fontWeight: '500' }}>
                                  {evalType.name}
                                </div>
                                <div style={{
                                  fontSize: '0.85rem',
                                  color: darkMode ? '#a0a0a0' : '#666',
                                  marginTop: '2px'
                                }}>
                                  {evalType.eval_type === 'peer' && 'Evaluate your group members'}
                                  {evalType.eval_type === 'audience' && 'Evaluate other groups'}
                                  {evalType.eval_type === 'self' && 'Self evaluation'}
                                  {evalType.target_type === 'group' && ' (group-based)'}
                                </div>
                              </div>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                flexWrap: 'wrap'
                              }}>
                                {evalType.due_date && (
                                  <span style={{
                                    fontSize: '0.8rem',
                                    color: darkMode ? '#a0a0a0' : '#888'
                                  }}>
                                    Due {new Date(evalType.due_date).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </span>
                                )}
                                <span style={{
                                  padding: '4px 10px',
                                  borderRadius: '12px',
                                  fontSize: '0.8rem',
                                  fontWeight: '500',
                                  whiteSpace: 'nowrap',
                                  background: status.color === '#27ae60'
                                    ? (darkMode ? '#1a3d1a' : '#d4edda')
                                    : status.color === '#f39c12'
                                      ? (darkMode ? '#3d3a1a' : '#fff3cd')
                                      : (darkMode ? '#2a2a2a' : '#f0f0f0'),
                                  color: status.color
                                }}>
                                  {status.icon} {status.label}
                                </span>
                                <span style={{ color: darkMode ? '#666' : '#ccc' }}>→</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Overall Progress Summary */}
      <div className="card">
        <h2>Overall Progress</h2>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Assignment</th>
                <th>Evaluation Types</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {assignmentData.assignments.map(assignment => {
                const progress = getAssignmentProgress(assignment);
                return (
                  <tr key={assignment.id}>
                    <td>{assignment.name}</td>
                    <td>
                      {assignment.eval_types.map(et => et.name).join(', ') || 'None'}
                    </td>
                    <td>
                      {progress.percentage === 100 ? (
                        <span style={{ color: '#27ae60' }}>✓ Complete</span>
                      ) : progress.completed > 0 ? (
                        <span style={{ color: '#f39c12' }}>
                          {progress.completed}/{progress.total} Complete
                        </span>
                      ) : (
                        <span style={{ color: '#95a5a6' }}>Pending</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default AssignmentDashboard;

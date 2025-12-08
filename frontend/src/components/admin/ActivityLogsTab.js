import React, { useState, useEffect } from 'react';
import axios from 'axios';

function ActivityLogsTab({
  darkMode,
  selectedClass,
  classes
}) {
  const [loading, setLoading] = useState(false);
  const [activitySummary, setActivitySummary] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userLogs, setUserLogs] = useState([]);
  const [loadingUserLogs, setLoadingUserLogs] = useState(false);
  const [error, setError] = useState(null);

  const fetchActivitySummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/activity-logs/${selectedClass}/summary`);
      setActivitySummary(res.data);
    } catch (err) {
      console.error('Failed to fetch activity summary:', err);
      setError('Failed to load activity data');
    } finally {
      setLoading(false);
    }
  };

  // Fetch activity summary when class changes
  useEffect(() => {
    if (selectedClass) {
      fetchActivitySummary();
    } else {
      setActivitySummary([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass]);

  const fetchUserLogs = async (userId) => {
    setLoadingUserLogs(true);
    try {
      const res = await axios.get(`/api/activity-logs/user/${userId}`, {
        params: { classId: selectedClass, limit: 50 }
      });
      setUserLogs(res.data.logs);
      setSelectedUser(res.data.user);
    } catch (err) {
      console.error('Failed to fetch user logs:', err);
    } finally {
      setLoadingUserLogs(false);
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatRelativeTime = (dateStr, includeTime = false) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    const remainingHours = diffHours % 24;

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays === 1) {
      return includeTime ? `Yesterday at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` : `1 day, ${remainingHours}h ago`;
    }
    if (diffDays < 7) return `${diffDays} days ago`;
    return formatDateTime(dateStr);
  };

  const formatAction = (action) => {
    const actionLabels = {
      'login': 'Logged in',
      'login_sso': 'Logged in (SSO)',
      'logout': 'Logged out',
      'password_change': 'Changed password',
      'view_evaluations': 'Viewed evaluations',
      'start_evaluation': 'Started evaluation',
      'submit_evaluation': 'Submitted evaluation',
      'update_evaluation': 'Updated evaluation',
      'submit_final_comment': 'Submitted final comment',
      'update_final_comment': 'Updated final comment',
      'view_dashboard': 'Viewed dashboard',
      'view_class': 'Viewed class',
      'view_group': 'Viewed group',
      'view_assignment': 'Viewed assignment'
    };
    return actionLabels[action] || action;
  };

  const getActivityStatus = (student) => {
    if (!student.last_class_activity) return 'never';
    const lastActivity = new Date(student.last_class_activity);
    const now = new Date();
    const diffDays = Math.floor((now - lastActivity) / 86400000);

    if (diffDays < 1) return 'active';
    if (diffDays < 7) return 'recent';
    if (diffDays < 30) return 'inactive';
    return 'dormant';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return '#22c55e';
      case 'recent': return '#3b82f6';
      case 'inactive': return '#f59e0b';
      case 'dormant': return '#ef4444';
      case 'never': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const selectedClassData = classes.find(c => c.id.toString() === selectedClass);

  if (!selectedClass) {
    return (
      <div className="admin-section">
        <h2>Activity Logs</h2>
        <p style={{ color: '#666', fontStyle: 'italic' }}>
          Please select a class to view student activity.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Activity Logs - {selectedClassData?.name}</h2>
        <button
          className="btn btn-secondary"
          onClick={fetchActivitySummary}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="message error">{error}</div>
      )}

      {/* Summary Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        {['active', 'recent', 'inactive', 'dormant', 'never'].map(status => {
          const count = activitySummary.filter(s => getActivityStatus(s) === status).length;
          const labels = {
            'active': 'Active (today)',
            'recent': 'Recent (this week)',
            'inactive': 'Inactive (1-30 days)',
            'dormant': 'Dormant (30+ days)',
            'never': 'No activity'
          };
          return (
            <div
              key={status}
              style={{
                padding: '1rem',
                borderRadius: '8px',
                backgroundColor: darkMode ? '#1e293b' : '#f8fafc',
                border: `2px solid ${getStatusColor(status)}`,
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: getStatusColor(status) }}>
                {count}
              </div>
              <div style={{ fontSize: '0.75rem', color: darkMode ? '#94a3b8' : '#64748b' }}>
                {labels[status]}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedUser ? '1fr 1fr' : '1fr', gap: '1.5rem' }}>
        {/* Student List */}
        <div>
          <h3 style={{ marginBottom: '0.75rem' }}>Students ({activitySummary.length})</h3>
          {loading ? (
            <p>Loading...</p>
          ) : activitySummary.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>No students enrolled in this class.</p>
          ) : (
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <table className="admin-table" style={{ fontSize: '0.875rem' }}>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Last Activity</th>
                    <th>Submissions</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activitySummary
                    .sort((a, b) => {
                      // Sort by status priority, then by last activity
                      const statusOrder = { never: 0, dormant: 1, inactive: 2, recent: 3, active: 4 };
                      const aStatus = getActivityStatus(a);
                      const bStatus = getActivityStatus(b);
                      if (statusOrder[aStatus] !== statusOrder[bStatus]) {
                        return statusOrder[aStatus] - statusOrder[bStatus];
                      }
                      // Then by last activity (null last)
                      if (!a.last_class_activity && !b.last_class_activity) return 0;
                      if (!a.last_class_activity) return 1;
                      if (!b.last_class_activity) return -1;
                      return new Date(b.last_class_activity) - new Date(a.last_class_activity);
                    })
                    .map(student => {
                      const status = getActivityStatus(student);
                      return (
                        <tr
                          key={student.user_id}
                          onClick={() => fetchUserLogs(student.user_id)}
                          style={{
                            cursor: 'pointer',
                            backgroundColor: selectedUser?.id === student.user_id
                              ? (darkMode ? '#334155' : '#e0f2fe')
                              : 'transparent'
                          }}
                        >
                          <td>
                            <div style={{ fontWeight: 500 }}>
                              {student.first_name} {student.last_name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#666' }}>
                              {student.email}
                            </div>
                          </td>
                          <td>
                            <span title={formatDateTime(student.last_class_activity)}>
                              {formatRelativeTime(student.last_class_activity)}
                            </span>
                            {student.last_action && (
                              <div style={{ fontSize: '0.7rem', color: '#888' }}>
                                {formatAction(student.last_action)}
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {student.evaluation_submissions}
                          </td>
                          <td>
                            <span
                              style={{
                                display: 'inline-block',
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                backgroundColor: getStatusColor(status),
                                marginRight: '0.5rem'
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* User Detail Panel */}
        {selectedUser && (
          <div style={{
            padding: '1rem',
            borderRadius: '8px',
            backgroundColor: darkMode ? '#1e293b' : '#f8fafc',
            border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ marginBottom: '0.25rem' }}>
                  {selectedUser.first_name} {selectedUser.last_name}
                </h3>
                <div style={{ fontSize: '0.875rem', color: '#666' }}>{selectedUser.email}</div>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setSelectedUser(null);
                  setUserLogs([]);
                }}
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
              >
                Close
              </button>
            </div>

            <h4 style={{ marginBottom: '0.5rem' }}>Recent Activity</h4>
            {loadingUserLogs ? (
              <p>Loading activity...</p>
            ) : userLogs.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic' }}>No activity recorded for this class.</p>
            ) : (
              <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                {userLogs.map(log => (
                  <div
                    key={log.id}
                    style={{
                      padding: '0.5rem',
                      marginBottom: '0.5rem',
                      borderRadius: '4px',
                      backgroundColor: darkMode ? '#0f172a' : '#fff',
                      border: `1px solid ${darkMode ? '#1e293b' : '#e2e8f0'}`,
                      fontSize: '0.875rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: 500 }}>
                        {formatAction(log.action)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#666' }} title={formatDateTime(log.created_at)}>
                        {formatRelativeTime(log.created_at, true)}
                      </div>
                    </div>
                    {log.details && (
                      <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                        {log.details.phase && `Phase ${log.details.phase}`}
                        {log.details.evaluatee_id && ` - Evaluatee #${log.details.evaluatee_id}`}
                      </div>
                    )}
                    {log.ip_address && (
                      <div style={{ fontSize: '0.7rem', color: '#999', marginTop: '0.25rem' }}>
                        IP: {log.ip_address}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ActivityLogsTab;

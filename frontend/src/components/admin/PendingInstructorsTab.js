import React, { useState, useEffect } from 'react';
import axios from 'axios';

function PendingInstructorsTab({ darkMode, onRefreshUsers }) {
  const [pendingTeachers, setPendingTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchPendingTeachers();
  }, []);

  const fetchPendingTeachers = async () => {
    try {
      const res = await axios.get('/api/users/pending-teachers');
      setPendingTeachers(res.data);
    } catch (err) {
      console.error('Failed to fetch pending teachers:', err);
      setMessage({ type: 'error', text: 'Failed to load pending instructor requests' });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId) => {
    try {
      const res = await axios.post(`/api/users/${userId}/approve-teacher`);
      setMessage({ type: 'success', text: res.data.message });
      setPendingTeachers(pendingTeachers.filter(t => t.id !== userId));
      if (onRefreshUsers) onRefreshUsers();
    } catch (err) {
      console.error('Failed to approve teacher:', err);
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to approve' });
    }
  };

  const handleReject = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to reject ${userName}'s instructor request? This will delete their account.`)) {
      return;
    }

    try {
      const res = await axios.post(`/api/users/${userId}/reject-teacher`);
      setMessage({ type: 'success', text: res.data.message });
      setPendingTeachers(pendingTeachers.filter(t => t.id !== userId));
    } catch (err) {
      console.error('Failed to reject teacher:', err);
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to reject' });
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return <div className="admin-section">Loading pending requests...</div>;
  }

  return (
    <div className="admin-section">
      <h3>Pending Instructor Requests</h3>
      <p style={{ marginBottom: '20px', color: darkMode ? '#93a1a1' : '#666' }}>
        Review and approve instructor registration requests. Approved users will be able to create and manage classes.
      </p>

      {message.text && (
        <div className={`message ${message.type}`} style={{ marginBottom: '20px' }}>
          {message.text}
        </div>
      )}

      {pendingTeachers.length === 0 ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          background: darkMode ? '#1a3350' : '#f8f9fa',
          borderRadius: '8px',
          border: `1px dashed ${darkMode ? '#2d4a6f' : '#ddd'}`
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '10px' }}>&#10003;</div>
          <div style={{ color: darkMode ? '#93a1a1' : '#666' }}>
            No pending instructor requests
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {pendingTeachers.map(teacher => (
            <div
              key={teacher.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                background: darkMode ? '#1a3350' : '#fff',
                borderRadius: '8px',
                border: `1px solid ${darkMode ? '#2d4a6f' : '#e0e0e0'}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
            >
              <div>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                  {teacher.first_name} {teacher.last_name}
                </div>
                <div style={{ fontSize: '0.9rem', color: darkMode ? '#839496' : '#666' }}>
                  {teacher.email}
                </div>
                {(teacher.university || teacher.department) && (
                  <div style={{ fontSize: '0.85rem', color: darkMode ? '#839496' : '#555', marginTop: '4px' }}>
                    {teacher.department && <span>{teacher.department}</span>}
                    {teacher.department && teacher.university && <span> - </span>}
                    {teacher.university && <span>{teacher.university}</span>}
                  </div>
                )}
                <div style={{ fontSize: '0.8rem', color: darkMode ? '#657b83' : '#999', marginTop: '4px' }}>
                  Requested: {formatDate(teacher.created_at)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => handleApprove(teacher.id)}
                  style={{
                    padding: '8px 16px',
                    background: darkMode ? '#27ae60' : '#2ecc71',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(teacher.id, `${teacher.first_name} ${teacher.last_name}`)}
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    color: darkMode ? '#e74c3c' : '#c0392b',
                    border: `1px solid ${darkMode ? '#e74c3c' : '#c0392b'}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{
        marginTop: '30px',
        padding: '15px',
        borderRadius: '6px',
        background: darkMode ? 'rgba(38, 139, 210, 0.1)' : 'rgba(52, 152, 219, 0.1)',
        border: `1px solid ${darkMode ? '#268bd2' : '#3498db'}`,
        fontSize: '0.9rem'
      }}>
        <strong>Instructor Registration Link</strong>
        <p style={{ margin: '8px 0 0', color: darkMode ? '#93a1a1' : '#666' }}>
          Share this link with instructors who need access: <br />
          <code style={{
            display: 'inline-block',
            marginTop: '8px',
            padding: '4px 8px',
            background: darkMode ? '#001e27' : '#f0f0f0',
            borderRadius: '4px',
            fontSize: '0.85rem'
          }}>
            https://peerevals.app/register-instructor
          </code>
        </p>
      </div>
    </div>
  );
}

export default PendingInstructorsTab;

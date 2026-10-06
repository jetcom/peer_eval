import React, { useState } from 'react';

function RejectInstructorModal({ darkMode, teacher, reasons = [], studentMatches = [], studentMatchesLoading = false, onConfirm, onClose, submitting }) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [spam, setSpam] = useState(false);

  const finalReason = reason === '__other__' ? customReason.trim() : reason;
  const muted = darkMode ? '#a0a0a0' : '#666';
  const studentReason = reasons.find(r => r.toLowerCase().includes('student'));
  const usingStudentReason = !!finalReason && finalReason.toLowerCase().includes('student');

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm({ reason: spam ? undefined : (finalReason || undefined), spam });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: darkMode ? '#1a1a1a' : '#fff',
        padding: '30px',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '90vh',
        overflow: 'auto',
        border: darkMode ? '1px solid #333' : '1px solid #e0e0e0',
        boxShadow: darkMode ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.15)'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '10px' }}>Reject Instructor Request</h2>
        <p style={{ marginTop: 0, marginBottom: '15px', color: muted, fontSize: '0.9rem' }}>
          This deletes the pending account. It cannot be undone.
        </p>

        <div style={{
          background: darkMode ? '#242424' : '#f5f5f5',
          padding: '12px 15px',
          borderRadius: '8px',
          marginBottom: '15px',
          fontSize: '0.9rem',
          wordBreak: 'break-word'
        }}>
          <div style={{ fontWeight: 600 }}>{teacher.first_name} {teacher.last_name}</div>
          <div style={{ color: muted }}>{teacher.email}</div>
          {(teacher.department || teacher.university) && (
            <div style={{ color: muted }}>
              {[teacher.department, teacher.university].filter(Boolean).join(' - ')}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '12px',
            marginBottom: '15px',
            background: darkMode ? 'rgba(231, 76, 60, 0.12)' : '#fef2f2',
            border: `1px solid ${darkMode ? '#e74c3c' : '#fecaca'}`,
            borderRadius: '6px',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={spam}
              onChange={(e) => setSpam(e.target.checked)}
              style={{ marginTop: '3px' }}
            />
            <span>
              <strong>This is spam.</strong> Delete without sending any email.
              <span style={{ display: 'block', color: muted, fontSize: '0.8rem', marginTop: '2px' }}>
                Rejection emails include the applicant's name, so emailing a spam sign-up forwards the spammer's message to their target.
              </span>
            </span>
          </label>

          {!spam && studentMatchesLoading && (
            <p style={{ color: muted, fontSize: '0.85rem', margin: '0 0 12px' }}>Checking for an existing student account...</p>
          )}
          {!spam && !studentMatchesLoading && studentMatches.length > 0 && (
            <div style={{
              background: darkMode ? 'rgba(38, 139, 210, 0.12)' : '#eff6ff',
              border: `1px solid ${darkMode ? '#268bd2' : '#bfdbfe'}`,
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '15px',
              fontSize: '0.85rem'
            }}>
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>Looks like an existing student</div>
              {studentMatches.map(m => (
                <div key={m.id} style={{ marginBottom: '8px' }}>
                  <div><strong>{m.email}</strong> <span style={{ color: muted }}>({m.name}, matched by {m.matchedBy})</span></div>
                  <div style={{ color: muted }}>
                    {m.classes.filter(k => !k.archived).length === 0
                      ? 'No active classes'
                      : m.classes.filter(k => !k.archived).map(k => (
                        <div key={k.id}>{k.name}{k.section ? ` (${k.section})` : ''}{k.semester ? `, ${k.semester}` : ''} — {k.instructor.name}</div>
                      ))}
                  </div>
                </div>
              ))}
              {studentReason && !usingStudentReason && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setReason(studentReason)}
                  style={{ marginTop: '4px', fontSize: '0.85rem', padding: '6px 10px' }}
                >
                  Reject as a student and send them these sign-in details
                </button>
              )}
              {usingStudentReason && (
                <div style={{ marginTop: '4px', color: darkMode ? '#93a1a1' : '#1d4ed8' }}>
                  The email will tell them to sign in as <strong>{studentMatches[0].email}</strong> and list the classes above.
                </div>
              )}
            </div>
          )}

          <fieldset disabled={spam} style={{ border: 'none', padding: 0, margin: 0, opacity: spam ? 0.45 : 1 }}>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Reason for rejection (included in the email)</label>
              <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%' }}>
                <option value="">No specific reason</option>
                {reasons.map(r => <option key={r} value={r}>{r}</option>)}
                <option value="__other__">Other (specify below)</option>
              </select>
            </div>
            {reason === '__other__' && (
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Custom reason</label>
                <textarea
                  rows={3}
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            )}
          </fieldset>

          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button
              type="submit"
              className="btn"
              disabled={submitting}
              style={{ background: darkMode ? '#c0392b' : '#dc2626', color: '#fff', border: 'none' }}
            >
              {submitting ? 'Working...' : (spam ? 'Delete as Spam' : 'Reject and Notify')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RejectInstructorModal;

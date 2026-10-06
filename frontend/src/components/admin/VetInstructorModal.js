import React from 'react';

const LEVEL = {
  high: { label: 'High confidence', color: '#16a34a' },
  medium: { label: 'Medium confidence', color: '#d97706' },
  low: { label: 'Low confidence', color: '#dc2626' }
};
const STATUS = {
  pass: { icon: '\u2713', color: '#16a34a' },
  warn: { icon: '!', color: '#d97706' },
  fail: { icon: '\u2717', color: '#dc2626' }
};

function VetInstructorModal({ darkMode, teacher, result, loading, error, onApprove, onReject, onClose }) {
  const muted = darkMode ? '#a0a0a0' : '#666';
  const level = result ? LEVEL[result.level] : null;

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
        maxWidth: '560px',
        maxHeight: '90vh',
        overflow: 'auto',
        border: darkMode ? '1px solid #333' : '1px solid #e0e0e0',
        boxShadow: darkMode ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.15)'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '10px' }}>Vet Instructor Request</h2>
        <div style={{ fontSize: '0.9rem', marginBottom: '15px', wordBreak: 'break-word' }}>
          <div style={{ fontWeight: 600 }}>{teacher.first_name} {teacher.last_name}</div>
          <div style={{ color: muted }}>{teacher.email}</div>
          {(teacher.department || teacher.university) && (
            <div style={{ color: muted }}>{[teacher.department, teacher.university].filter(Boolean).join(' - ')}</div>
          )}
        </div>

        {loading && <p style={{ color: muted }}>Checking email domain, school directory, and mail servers...</p>}
        {error && <p className="error">{error}</p>}

        {result && (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '10px',
              padding: '12px 15px',
              borderRadius: '8px',
              borderLeft: `4px solid ${level.color}`,
              background: darkMode ? '#242424' : '#fafafa',
              marginBottom: '15px'
            }}>
              <strong style={{ color: level.color, fontSize: '1.1rem' }}>{level.label}</strong>
              <span style={{ color: muted, fontSize: '0.9rem' }}>{result.score}/100 that this is a real instructor at the named school</span>
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px' }}>
              {result.signals.map(s => (
                <li key={s.key} style={{ padding: '8px 0', borderTop: `1px solid ${darkMode ? '#2a2a2a' : '#f0f0f0'}` }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <span style={{ width: '18px', fontWeight: 700, color: STATUS[s.status].color, flexShrink: 0 }}>{STATUS[s.status].icon}</span>
                    <div>
                      <div style={{ fontWeight: 600 }}>{s.label}</div>
                      <div style={{ color: muted, fontSize: '0.85rem' }}>{s.detail}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <p style={{ color: muted, fontSize: '0.8rem', margin: '0 0 15px' }}>
              These are automated signals, not proof. Use your judgement.
            </p>
          </>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '15px', flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={onApprove} disabled={loading}
            style={{ background: darkMode ? '#27ae60' : '#2ecc71', color: '#fff', border: 'none' }}>
            Approve
          </button>
          <button type="button" className="btn" onClick={onReject} disabled={loading}
            style={{ background: 'transparent', color: darkMode ? '#e74c3c' : '#c0392b', border: `1px solid ${darkMode ? '#e74c3c' : '#c0392b'}` }}>
            Reject...
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{ marginLeft: 'auto' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default VetInstructorModal;

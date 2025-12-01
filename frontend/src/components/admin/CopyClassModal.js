import React, { useState } from 'react';

function CopyClassModal({ darkMode, sourceClass, onSubmit, onClose }) {
  const [formData, setFormData] = useState({
    name: sourceClass.name,
    section: sourceClass.section || '',
    semester: '',
    phase_due_dates: {}
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(sourceClass.id, formData);
    } finally {
      setLoading(false);
    }
  };

  const numPhases = sourceClass.num_phases || 3;
  const hasFinalEval = sourceClass.has_final_evaluation;

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
    }} onClick={onClose}>
      <div style={{
        background: darkMode ? '#1e3a5f' : '#fff',
        color: darkMode ? '#e0e0e0' : '#333',
        padding: '25px',
        borderRadius: '8px',
        width: '100%',
        maxWidth: '500px',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
      }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0, marginBottom: '10px' }}>Copy Class for New Term</h2>
        <p style={{
          marginBottom: '1.5rem',
          color: darkMode ? '#a0a0a0' : '#666',
          fontSize: '0.9rem'
        }}>
          Copies settings, templates, and criteria from <strong>"{sourceClass.name}"</strong>.
          Students, groups, and evaluations will not be copied.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label>Class Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '4px',
                border: `1px solid ${darkMode ? '#4a6785' : '#ddd'}`,
                background: darkMode ? '#0d2137' : '#fff',
                color: darkMode ? '#e0e0e0' : '#333'
              }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label>Section (optional)</label>
            <input
              type="text"
              value={formData.section}
              onChange={(e) => setFormData({ ...formData, section: e.target.value })}
              placeholder="e.g., 001, A, Morning"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '4px',
                border: `1px solid ${darkMode ? '#4a6785' : '#ddd'}`,
                background: darkMode ? '#0d2137' : '#fff',
                color: darkMode ? '#e0e0e0' : '#333'
              }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label>New Semester/Term</label>
            <input
              type="text"
              value={formData.semester}
              onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
              placeholder="e.g., Spring 2025, Fall 2025"
              required
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '4px',
                border: `1px solid ${darkMode ? '#4a6785' : '#ddd'}`,
                background: darkMode ? '#0d2137' : '#fff',
                color: darkMode ? '#e0e0e0' : '#333'
              }}
            />
          </div>

          {sourceClass.evaluation_mode === 'phases' && (
            <>
              <h4 style={{
                marginTop: '1.5rem',
                marginBottom: '0.5rem',
                fontSize: '0.95rem',
                fontWeight: 600
              }}>
                Phase Due Dates (optional)
              </h4>
              <p style={{
                fontSize: '0.85rem',
                color: darkMode ? '#a0a0a0' : '#666',
                marginBottom: '1rem'
              }}>
                Leave blank to configure later in Class Settings.
              </p>

              {Array.from({ length: numPhases }, (_, i) => i + 1).map(phase => (
                <div className="form-group" key={phase} style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '0.9rem' }}>Phase {phase}</label>
                  <input
                    type="datetime-local"
                    value={formData.phase_due_dates[phase] || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      phase_due_dates: {
                        ...formData.phase_due_dates,
                        [phase]: e.target.value
                      }
                    })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: `1px solid ${darkMode ? '#4a6785' : '#ddd'}`,
                      background: darkMode ? '#0d2137' : '#fff',
                      color: darkMode ? '#e0e0e0' : '#333'
                    }}
                  />
                </div>
              ))}

              {hasFinalEval === 1 && (
                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '0.9rem' }}>Final Evaluation</label>
                  <input
                    type="datetime-local"
                    value={formData.phase_due_dates[0] || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      phase_due_dates: {
                        ...formData.phase_due_dates,
                        0: e.target.value
                      }
                    })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: `1px solid ${darkMode ? '#4a6785' : '#ddd'}`,
                      background: darkMode ? '#0d2137' : '#fff',
                      color: darkMode ? '#e0e0e0' : '#333'
                    }}
                  />
                </div>
              )}
            </>
          )}

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '20px',
            paddingTop: '15px',
            borderTop: `1px solid ${darkMode ? '#4a6785' : '#eee'}`
          }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                padding: '10px 20px',
                borderRadius: '4px',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Copying...' : 'Copy Class'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CopyClassModal;

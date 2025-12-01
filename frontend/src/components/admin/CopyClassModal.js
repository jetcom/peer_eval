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
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-content ${darkMode ? 'dark' : ''}`} onClick={(e) => e.stopPropagation()}>
        <h2>Copy Class for New Term</h2>
        <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
          This will copy all settings, templates, criteria, and assignments from "{sourceClass.name}"
          but with no students, groups, or evaluations.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Class Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Section (optional)</label>
            <input
              type="text"
              value={formData.section}
              onChange={(e) => setFormData({ ...formData, section: e.target.value })}
              placeholder="e.g., 001, A, Morning"
            />
          </div>

          <div className="form-group">
            <label>New Semester/Term</label>
            <input
              type="text"
              value={formData.semester}
              onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
              placeholder="e.g., Spring 2025, Fall 2025"
              required
            />
          </div>

          {sourceClass.evaluation_mode === 'phases' && (
            <>
              <h3 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>Phase Due Dates (optional)</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Set new due dates or leave blank to configure later.
              </p>

              {Array.from({ length: numPhases }, (_, i) => i + 1).map(phase => (
                <div className="form-group" key={phase}>
                  <label>Phase {phase} Due Date</label>
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
                  />
                </div>
              ))}

              {hasFinalEval === 1 && (
                <div className="form-group">
                  <label>Final Evaluation Due Date</label>
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
                  />
                </div>
              )}
            </>
          )}

          <div className="modal-buttons">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Copying...' : 'Copy Class'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CopyClassModal;

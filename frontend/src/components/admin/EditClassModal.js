import React from 'react';

// Helper function to calculate effective due date for a phase using cascading logic
function getEffectiveDueDate(phase, numPhases, hasFinalEvaluation, phaseDueDates) {
  // If this phase has a due date, use it
  if (phaseDueDates[phase]) {
    return phaseDueDates[phase];
  }

  // Otherwise, look forward to find the next set date
  if (phase > 0) {
    for (let p = phase + 1; p <= numPhases; p++) {
      if (phaseDueDates[p]) {
        return phaseDueDates[p];
      }
    }
    // If still no date and there's a final evaluation, check phase 0
    if (hasFinalEvaluation && phaseDueDates[0]) {
      return phaseDueDates[0];
    }
  }

  return null;
}

function EditClassModal({ darkMode, editingClass, setEditingClass, onSubmit, onClose }) {
  if (!editingClass) return null;

  const availableInstructors = editingClass.enrolledTeachers || [];

  // Helper to format date for display
  const formatDueDate = (dateStr, timezone) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        timeZone: timezone || 'America/New_York',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return dateStr;
    }
  };

  // Get list of phases including final evaluation
  const getPhases = () => {
    const phases = [];
    for (let i = 1; i <= (editingClass.num_phases || 3); i++) {
      phases.push({ phase: i, label: `Phase ${i}` });
    }
    if (editingClass.has_final_evaluation) {
      phases.push({ phase: 0, label: 'Final Evaluation' });
    }
    return phases;
  };

  // Determine the last required phase
  const getLastRequiredPhase = () => {
    if (editingClass.has_final_evaluation) {
      return 0; // Final evaluation
    }
    return editingClass.num_phases || 3; // Last numbered phase
  };

  // Handle phase due date change
  const handlePhaseDueDateChange = (phase, value) => {
    setEditingClass({
      ...editingClass,
      phase_due_dates: {
        ...editingClass.phase_due_dates,
        [phase]: value || null
      }
    });
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
        background: darkMode ? '#1e3a5f' : '#fff',
        padding: '25px',
        borderRadius: '8px',
        width: '100%',
        maxWidth: '850px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '15px' }}>Edit Class</h2>
        <form onSubmit={onSubmit}>
          <div style={{ display: 'flex', gap: '30px' }}>
            {/* Left column: Class info and instructors */}
            <div style={{ flex: 1 }}>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Class Name</label>
                <input
                  type="text"
                  value={editingClass.name}
                  onChange={(e) => setEditingClass({ ...editingClass, name: e.target.value })}
                  required
                  placeholder="e.g., Software Engineering"
                />
              </div>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Section</label>
                <input
                  type="text"
                  value={editingClass.section || ''}
                  onChange={(e) => setEditingClass({ ...editingClass, section: e.target.value })}
                  placeholder="e.g., 001"
                />
              </div>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Semester</label>
                <input
                  type="text"
                  value={editingClass.semester || ''}
                  onChange={(e) => setEditingClass({ ...editingClass, semester: e.target.value })}
                  placeholder="e.g., Fall 2024"
                />
              </div>
              {/* Instructors */}
              {availableInstructors.length > 0 && (
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Instructors ({(editingClass.instructor_ids || []).length} selected)</label>
                  <div style={{
                    maxHeight: '120px',
                    overflowY: 'auto',
                    border: `1px solid ${darkMode ? '#586e75' : '#ddd'}`,
                    borderRadius: '4px',
                    padding: '8px',
                    backgroundColor: darkMode ? '#001e27' : '#fff'
                  }}>
                    {availableInstructors.map(u => (
                      <label
                        key={u.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          cursor: 'pointer',
                          color: darkMode ? '#93a1a1' : '#333',
                          fontSize: '0.9rem',
                          padding: '2px 0'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={(editingClass.instructor_ids || []).includes(u.id)}
                          onChange={() => {
                            const currentIds = editingClass.instructor_ids || [];
                            const newIds = currentIds.includes(u.id)
                              ? currentIds.filter(id => id !== u.id)
                              : [...currentIds, u.id];
                            setEditingClass({ ...editingClass, instructor_ids: newIds });
                          }}
                          style={{ marginRight: '5px', width: 'auto' }}
                        />
                        {u.last_name}, {u.first_name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right column: Phases and due dates */}
            <div style={{ flex: 1 }}>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Number of Phases</label>
                <select
                  value={editingClass.num_phases || 3}
                  onChange={(e) => setEditingClass({ ...editingClass, num_phases: parseInt(e.target.value) })}
                >
                  <option value={1}>1 Phase</option>
                  <option value={2}>2 Phases</option>
                  <option value={3}>3 Phases</option>
                  <option value={4}>4 Phases</option>
                  <option value={5}>5 Phases</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editingClass.has_final_evaluation}
                    onChange={(e) => setEditingClass({ ...editingClass, has_final_evaluation: e.target.checked })}
                    style={{ width: '18px', height: '18px' }}
                  />
                  Final Evaluation (23-pt)
                </label>
              </div>

              {/* Timezone */}
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Timezone</label>
                <select
                  value={editingClass.due_date_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
                  onChange={(e) => setEditingClass({ ...editingClass, due_date_timezone: e.target.value })}
                >
                  <option value="America/New_York">Eastern (ET)</option>
                  <option value="America/Chicago">Central (CT)</option>
                  <option value="America/Denver">Mountain (MT)</option>
                  <option value="America/Phoenix">Arizona (MST)</option>
                  <option value="America/Los_Angeles">Pacific (PT)</option>
                  <option value="America/Anchorage">Alaska (AKT)</option>
                  <option value="Pacific/Honolulu">Hawaii (HST)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>

              {/* Phase Due Dates */}
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Phase Due Dates</label>
                <small style={{ display: 'block', marginBottom: '6px', opacity: 0.8, fontSize: '0.8rem' }}>
                  Empty phases inherit from next set date
                </small>
                <div style={{
                  border: `1px solid ${darkMode ? '#586e75' : '#ddd'}`,
                  borderRadius: '4px',
                  padding: '8px',
                  backgroundColor: darkMode ? '#001e27' : '#f9f9f9'
                }}>
                  {getPhases().map(({ phase, label }) => {
                    const phaseDueDates = editingClass.phase_due_dates || {};
                    const effectiveDate = getEffectiveDueDate(
                      phase,
                      editingClass.num_phases || 3,
                      editingClass.has_final_evaluation,
                      phaseDueDates
                    );
                    const hasOwnDate = !!phaseDueDates[phase];
                    const isLastPhase = phase === getLastRequiredPhase();

                    return (
                      <div key={phase} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '6px'
                      }}>
                        <span style={{
                          minWidth: '75px',
                          fontWeight: isLastPhase ? 'bold' : 'normal',
                          fontSize: '0.85rem'
                        }}>
                          {label}{isLastPhase ? '*' : ''}:
                        </span>
                        <input
                          type="datetime-local"
                          value={phaseDueDates[phase] || ''}
                          onChange={(e) => handlePhaseDueDateChange(phase, e.target.value)}
                          required={isLastPhase}
                          style={{ flex: 1, fontSize: '0.8rem', padding: '3px 5px' }}
                        />
                        {hasOwnDate && !isLastPhase && (
                          <button
                            type="button"
                            onClick={() => handlePhaseDueDateChange(phase, null)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '2px 6px',
                              fontSize: '1rem',
                              color: darkMode ? '#839496' : '#666'
                            }}
                            title="Clear date"
                          >
                            ×
                          </button>
                        )}
                        {!hasOwnDate && effectiveDate && (
                          <span style={{
                            color: darkMode ? '#839496' : '#888',
                            fontSize: '0.75rem'
                          }}>
                            ({formatDueDate(effectiveDate, editingClass.due_date_timezone)})
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button type="submit" className="btn btn-primary">Save Changes</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditClassModal;

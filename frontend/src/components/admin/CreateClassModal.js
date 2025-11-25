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

function CreateClassModal({ darkMode, newClass, setNewClass, currentUser, onSubmit, onClose }) {
  // For new classes, only show the current user as an instructor option
  const availableInstructors = currentUser ? [currentUser] : [];

  // Helper to format date for display
  const formatDueDate = (dateStr, timezone) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        timeZone: timezone || 'America/New_York',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
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
    for (let i = 1; i <= (newClass.num_phases || 3); i++) {
      phases.push({ phase: i, label: `Phase ${i}` });
    }
    if (newClass.has_final_evaluation) {
      phases.push({ phase: 0, label: 'Final Evaluation' });
    }
    return phases;
  };

  // Determine the last required phase
  const getLastRequiredPhase = () => {
    if (newClass.has_final_evaluation) {
      return 0; // Final evaluation
    }
    return newClass.num_phases || 3; // Last numbered phase
  };

  // Handle phase due date change
  const handlePhaseDueDateChange = (phase, value) => {
    setNewClass({
      ...newClass,
      phase_due_dates: {
        ...newClass.phase_due_dates,
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
        padding: '30px',
        borderRadius: '8px',
        width: '100%',
        maxWidth: '500px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '20px' }}>Create New Class</h2>
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label>Class Name</label>
            <input
              type="text"
              value={newClass.name}
              onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
              required
              placeholder="e.g., Software Engineering"
            />
          </div>
          <div className="form-group">
            <label>Section (optional)</label>
            <input
              type="text"
              value={newClass.section}
              onChange={(e) => setNewClass({ ...newClass, section: e.target.value })}
              placeholder="e.g., 001"
            />
          </div>
          <div className="form-group">
            <label>Semester (optional)</label>
            <input
              type="text"
              value={newClass.semester}
              onChange={(e) => setNewClass({ ...newClass, semester: e.target.value })}
              placeholder="e.g., Fall 2024"
            />
          </div>
          <div className="form-group">
            <label>Instructors (select one or more)</label>
            <div style={{
              maxHeight: '150px',
              overflowY: 'auto',
              border: `1px solid ${darkMode ? '#586e75' : '#ddd'}`,
              borderRadius: '4px',
              padding: '10px',
              backgroundColor: darkMode ? '#001e27' : '#fff',
              textAlign: 'left'
            }}>
              {availableInstructors.map(u => (
                <div
                  key={u.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    padding: '5px 0',
                    cursor: 'pointer',
                    color: darkMode ? '#93a1a1' : '#333'
                  }}
                  onClick={() => {
                    const currentIds = newClass.instructor_ids || [];
                    const newIds = currentIds.includes(u.id)
                      ? currentIds.filter(id => id !== u.id)
                      : [...currentIds, u.id];
                    setNewClass({ ...newClass, instructor_ids: newIds });
                  }}
                >
                  <input
                    type="checkbox"
                    checked={(newClass.instructor_ids || []).includes(u.id)}
                    onChange={() => {}}
                    style={{ margin: '0 8px 0 0', cursor: 'pointer', width: 'auto' }}
                  />
                  <span>{u.last_name}, {u.first_name} ({u.email})</span>
                </div>
              ))}
            </div>
            <small style={{ display: 'block', marginTop: '5px', opacity: 0.8 }}>
              Selected: {(newClass.instructor_ids || []).length} instructor(s)
            </small>
          </div>
          <div className="form-group">
            <label>Number of Phases</label>
            <select
              value={newClass.num_phases}
              onChange={(e) => setNewClass({ ...newClass, num_phases: parseInt(e.target.value) })}
            >
              <option value={1}>1 Phase</option>
              <option value={2}>2 Phases</option>
              <option value={3}>3 Phases</option>
              <option value={4}>4 Phases</option>
              <option value={5}>5 Phases</option>
            </select>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={newClass.has_final_evaluation}
                onChange={(e) => setNewClass({ ...newClass, has_final_evaluation: e.target.checked })}
                style={{ width: '20px', height: '20px' }}
              />
              Include Final Evaluation (23-point distribution)
            </label>
          </div>
          <div className="form-group">
            <label>Due Date Timezone</label>
            <select
              value={newClass.due_date_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
              onChange={(e) => setNewClass({ ...newClass, due_date_timezone: e.target.value })}
            >
              <option value="America/New_York">Eastern Time (ET)</option>
              <option value="America/Chicago">Central Time (CT)</option>
              <option value="America/Denver">Mountain Time (MT)</option>
              <option value="America/Phoenix">Arizona Time (MST - no DST)</option>
              <option value="America/Los_Angeles">Pacific Time (PT)</option>
              <option value="America/Anchorage">Alaska Time (AKT)</option>
              <option value="Pacific/Honolulu">Hawaii Time (HST)</option>
              <option value="UTC">UTC (Coordinated Universal Time)</option>
            </select>
          </div>
          <div className="form-group">
            <label>Phase Due Dates</label>
            <small style={{ display: 'block', marginBottom: '10px', opacity: 0.8 }}>
              Set a due date for each phase. Empty phases will use the next set date.
              The last phase ({newClass.has_final_evaluation ? 'Final Evaluation' : `Phase ${newClass.num_phases || 3}`}) is required.
            </small>
            <div style={{
              border: `1px solid ${darkMode ? '#586e75' : '#ddd'}`,
              borderRadius: '4px',
              padding: '15px',
              backgroundColor: darkMode ? '#001e27' : '#f9f9f9'
            }}>
              {getPhases().map(({ phase, label }) => {
                const phaseDueDates = newClass.phase_due_dates || {};
                const effectiveDate = getEffectiveDueDate(
                  phase,
                  newClass.num_phases || 3,
                  newClass.has_final_evaluation,
                  phaseDueDates
                );
                const hasOwnDate = !!phaseDueDates[phase];
                const isLastPhase = phase === getLastRequiredPhase();

                return (
                  <div key={phase} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: phase === getPhases()[getPhases().length - 1].phase ? 0 : '10px',
                    flexWrap: 'wrap'
                  }}>
                    <span style={{
                      minWidth: '120px',
                      fontWeight: isLastPhase ? 'bold' : 'normal'
                    }}>
                      {label}{isLastPhase ? ' *' : ''}:
                    </span>
                    <input
                      type="datetime-local"
                      value={phaseDueDates[phase] || ''}
                      onChange={(e) => handlePhaseDueDateChange(phase, e.target.value)}
                      required={isLastPhase}
                      style={{ flex: 1, minWidth: '200px' }}
                    />
                    {!hasOwnDate && effectiveDate && (
                      <span style={{
                        color: darkMode ? '#839496' : '#666',
                        fontSize: '0.85rem',
                        fontStyle: 'italic'
                      }}>
                        uses {formatDueDate(effectiveDate, newClass.due_date_timezone)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button type="submit" className="btn btn-primary">Create Class</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateClassModal;

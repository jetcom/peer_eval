import React from 'react';

// Helper function to calculate effective due date for a phase using cascading logic
function getEffectiveDueDate(phase, numPhases, hasFinalEvaluation, phaseDueDates) {
  if (phaseDueDates[phase]) {
    return phaseDueDates[phase];
  }

  if (phase > 0) {
    for (let p = phase + 1; p <= numPhases; p++) {
      if (phaseDueDates[p]) {
        return phaseDueDates[p];
      }
    }
    if (hasFinalEvaluation && phaseDueDates[0]) {
      return phaseDueDates[0];
    }
  }

  return null;
}

function DueDatesStep({ darkMode, classData, updateClassData }) {
  const isPhaseBased = classData.evaluation_mode === 'phases';

  const handlePhaseDateChange = (phase, date) => {
    updateClassData({
      phase_due_dates: {
        ...classData.phase_due_dates,
        [phase]: date ? (date.includes('T') ? date : `${date}T23:59`) : null
      }
    });
  };

  const handleAssignmentDateChange = (assignmentId, date) => {
    const assignments = classData.assignments.map(a =>
      a.id === assignmentId ? { ...a, due_date: date ? (date.includes('T') ? date : `${date}T23:59`) : null } : a
    );
    updateClassData({ assignments });
  };

  // Get list of phases including final evaluation
  const getPhases = () => {
    const phases = [];
    for (let i = 1; i <= (classData.num_phases || 3); i++) {
      phases.push({ phase: i, label: `Phase ${i}` });
    }
    if (classData.has_final_evaluation) {
      phases.push({ phase: 0, label: 'Final Evaluation' });
    }
    return phases;
  };

  // Determine the last required phase
  const getLastRequiredPhase = () => {
    if (classData.has_final_evaluation) {
      return 0; // Final evaluation
    }
    return classData.num_phases || 3;
  };

  if (isPhaseBased) {
    const phases = getPhases();
    const phaseDueDates = classData.phase_due_dates || {};

    return (
      <div>
        <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
          Phase Due Dates
        </h3>
        <p style={{
          marginBottom: '25px',
          color: darkMode ? '#a0a0a0' : '#666',
          fontSize: '0.95rem'
        }}>
          Set due dates for each phase. Empty phases will inherit the due date from the next phase with a date set.
        </p>

        <div style={{
          maxWidth: '600px',
          padding: '20px',
          borderRadius: '8px',
          background: darkMode ? '#1a1a1a' : '#f8f9fa',
          border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
        }}>
          {phases.map(({ phase, label }) => {
            const effectiveDate = getEffectiveDueDate(
              phase,
              classData.num_phases || 3,
              classData.has_final_evaluation,
              phaseDueDates
            );
            const hasOwnDate = !!phaseDueDates[phase];
            const isLastPhase = phase === getLastRequiredPhase();

            return (
              <div key={phase} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '15px',
                marginBottom: '15px',
                paddingBottom: '15px',
                borderBottom: phase !== getLastRequiredPhase() ? `1px solid ${darkMode ? '#333' : '#e0e0e0'}` : 'none'
              }}>
                <span style={{
                  minWidth: '130px',
                  fontWeight: isLastPhase ? 'bold' : 'normal',
                  color: phase === 0 ? '#9b59b6' : 'inherit'
                }}>
                  {label}{isLastPhase ? ' *' : ''}
                </span>
                <input
                  type="date"
                  value={(phaseDueDates[phase] || effectiveDate || '').split('T')[0]}
                  onChange={(e) => {
                    const date = e.target.value;
                    const currentTime = (phaseDueDates[phase] || '').split('T')[1] || '23:59';
                    updateClassData({
                      phase_due_dates: {
                        ...classData.phase_due_dates,
                        [phase]: date ? `${date}T${currentTime}` : null
                      }
                    });
                  }}
                  required={isLastPhase}
                  style={{
                    opacity: hasOwnDate ? 1 : 0.6,
                    width: 'auto'
                  }}
                  title={!hasOwnDate && effectiveDate ? 'Inherited from later phase' : ''}
                />
                <input
                  type="time"
                  value={(phaseDueDates[phase] || effectiveDate || 'T23:59').split('T')[1] || '23:59'}
                  onChange={(e) => {
                    const time = e.target.value || '23:59';
                    const currentDate = (phaseDueDates[phase] || '').split('T')[0];
                    if (currentDate) {
                      updateClassData({
                        phase_due_dates: {
                          ...classData.phase_due_dates,
                          [phase]: `${currentDate}T${time}`
                        }
                      });
                    }
                  }}
                  style={{
                    opacity: hasOwnDate ? 1 : 0.6,
                    width: 'auto'
                  }}
                />
                {hasOwnDate && !isLastPhase && (
                  <button
                    type="button"
                    onClick={() => handlePhaseDateChange(phase, null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '5px 10px',
                      fontSize: '1.2rem',
                      color: darkMode ? '#888' : '#666'
                    }}
                    title="Clear date (inherit from later phase)"
                  >
                    ×
                  </button>
                )}
                {!hasOwnDate && effectiveDate && (
                  <span style={{
                    fontSize: '0.8rem',
                    color: darkMode ? '#888' : '#888',
                    fontStyle: 'italic'
                  }}>
                    (inherited)
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <p style={{
          marginTop: '15px',
          fontSize: '0.85rem',
          color: darkMode ? '#888' : '#888'
        }}>
          * Required field. Timezone: {classData.due_date_timezone}
        </p>
      </div>
    );
  }

  // Assignment-based mode
  const assignments = classData.assignments || [];

  return (
    <div>
      <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
        Assignment Due Dates
      </h3>
      <p style={{
        marginBottom: '25px',
        color: darkMode ? '#a0a0a0' : '#666',
        fontSize: '0.95rem'
      }}>
        Set or update due dates for each assignment's evaluations.
      </p>

      {assignments.length === 0 ? (
        <div style={{
          padding: '30px',
          textAlign: 'center',
          color: darkMode ? '#888' : '#888',
          background: darkMode ? '#1a1a1a' : '#f8f9fa',
          borderRadius: '8px',
          border: `1px dashed ${darkMode ? '#333' : '#ddd'}`
        }}>
          No assignments have been added. You can add assignments and set due dates after creating the class.
        </div>
      ) : (
        <div style={{
          maxWidth: '600px',
          padding: '20px',
          borderRadius: '8px',
          background: darkMode ? '#1a1a1a' : '#f8f9fa',
          border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
        }}>
          {assignments.map((assignment, index) => (
            <div key={assignment.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '15px',
              marginBottom: index < assignments.length - 1 ? '15px' : 0,
              paddingBottom: index < assignments.length - 1 ? '15px' : 0,
              borderBottom: index < assignments.length - 1 ? `1px solid ${darkMode ? '#333' : '#e0e0e0'}` : 'none'
            }}>
              <span style={{
                minWidth: '180px',
                fontWeight: 500
              }}>
                {assignment.name}
              </span>
              <input
                type="date"
                value={(assignment.due_date || '').split('T')[0]}
                onChange={(e) => {
                  const date = e.target.value;
                  const currentTime = (assignment.due_date || '').split('T')[1] || '23:59';
                  const dueDate = date ? `${date}T${currentTime}` : null;
                  const updatedAssignments = classData.assignments.map(a =>
                    a.id === assignment.id ? { ...a, due_date: dueDate } : a
                  );
                  updateClassData({ assignments: updatedAssignments });
                }}
                style={{ width: 'auto' }}
              />
              <input
                type="time"
                value={(assignment.due_date || 'T23:59').split('T')[1] || '23:59'}
                onChange={(e) => {
                  const time = e.target.value || '23:59';
                  const currentDate = (assignment.due_date || '').split('T')[0];
                  if (currentDate) {
                    const updatedAssignments = classData.assignments.map(a =>
                      a.id === assignment.id ? { ...a, due_date: `${currentDate}T${time}` } : a
                    );
                    updateClassData({ assignments: updatedAssignments });
                  }
                }}
                style={{ width: 'auto' }}
              />
              {assignment.due_date && (
                <button
                  type="button"
                  onClick={() => handleAssignmentDateChange(assignment.id, null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '5px 10px',
                    fontSize: '1.2rem',
                    color: darkMode ? '#888' : '#666'
                  }}
                  title="Clear date"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <p style={{
        marginTop: '15px',
        fontSize: '0.85rem',
        color: darkMode ? '#888' : '#888'
      }}>
        Timezone: {classData.due_date_timezone}
      </p>
    </div>
  );
}

export default DueDatesStep;

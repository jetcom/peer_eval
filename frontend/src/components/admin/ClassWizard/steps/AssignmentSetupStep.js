import React, { useState } from 'react';

const EVAL_TYPES = [
  { value: 'peer', label: 'Peer Evaluation', desc: 'Teammates rate each other', group: 'rating' },
  { value: 'audience', label: 'Audience Evaluation', desc: 'Class rates presenting groups', group: 'rating' },
  { value: 'paper_review', label: 'Paper Review', desc: 'Upload papers, 1:1 peer review with annotations', group: 'paper', exclusive: true }
];

function AssignmentSetupStep({ darkMode, classData, updateClassData }) {
  const [newAssignment, setNewAssignment] = useState({
    name: '',
    eval_types: ['peer'],
    due_date: '',
    due_time: '23:59'
  });

  const assignments = classData.assignments || [];

  const addAssignment = () => {
    if (!newAssignment.name.trim()) return;

    // Build due_date from date and time if provided
    const dueDate = newAssignment.due_date
      ? `${newAssignment.due_date}T${newAssignment.due_time || '23:59'}`
      : null;

    const assignment = {
      id: Date.now(), // Temporary ID for UI
      name: newAssignment.name.trim(),
      eval_types: newAssignment.eval_types,
      due_date: dueDate,
      order_index: assignments.length
    };

    updateClassData({
      assignments: [...assignments, assignment]
    });

    setNewAssignment({
      name: '',
      eval_types: ['peer'],
      due_date: '',
      due_time: '23:59'
    });
  };

  const removeAssignment = (index) => {
    const updated = assignments.filter((_, i) => i !== index)
      .map((a, i) => ({ ...a, order_index: i }));
    updateClassData({ assignments: updated });
  };

  const moveAssignment = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= assignments.length) return;

    const updated = [...assignments];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    updated.forEach((a, i) => a.order_index = i);
    updateClassData({ assignments: updated });
  };

  const updateAssignmentDueDate = (index, date, time) => {
    const updated = [...assignments];
    updated[index] = {
      ...updated[index],
      due_date: date ? `${date}T${time || '23:59'}` : null
    };
    updateClassData({ assignments: updated });
  };

  const toggleEvalType = (type) => {
    const types = newAssignment.eval_types;

    if (types.includes(type)) {
      // Unchecking - only allow if there's at least one other type selected
      if (types.length > 1) {
        setNewAssignment({ ...newAssignment, eval_types: types.filter(t => t !== type) });
      }
    } else {
      // Checking - paper_review is mutually exclusive with peer/audience
      if (type === 'paper_review') {
        // Selecting paper_review - clear peer and audience
        setNewAssignment({ ...newAssignment, eval_types: ['paper_review'] });
      } else {
        // Selecting peer or audience - remove paper_review if present
        const newTypes = types.filter(t => t !== 'paper_review');
        setNewAssignment({ ...newAssignment, eval_types: [...newTypes, type] });
      }
    }
  };

  return (
    <div>
      <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
        Assignment Setup
      </h3>
      <p style={{
        marginBottom: '25px',
        color: darkMode ? '#a0a0a0' : '#666',
        fontSize: '0.95rem'
      }}>
        Add assignments that will have evaluations. Each assignment can have different evaluation types.
        You can also add assignments later after the class is created.
      </p>

      {/* Add new assignment form */}
      <div style={{
        background: darkMode ? '#1a1a1a' : '#f8f9fa',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '25px',
        border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
      }}>
        <h4 style={{ marginTop: 0, marginBottom: '15px', fontSize: '1rem' }}>
          Add Assignment
        </h4>

        <div className="form-group" style={{ margin: 0, marginBottom: '15px' }}>
          <label>Assignment Name</label>
          <input
            type="text"
            value={newAssignment.name}
            onChange={(e) => setNewAssignment({ ...newAssignment, name: e.target.value })}
            placeholder="e.g., Presentation 1, Paper Draft"
            style={{ maxWidth: '400px' }}
          />
        </div>

        <div className="form-group" style={{ marginTop: '15px', marginBottom: '15px' }}>
          <label>Due Date (optional)</label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="date"
              value={newAssignment.due_date}
              onChange={(e) => setNewAssignment({ ...newAssignment, due_date: e.target.value })}
              style={{ width: 'auto' }}
            />
            <input
              type="time"
              value={newAssignment.due_time}
              onChange={(e) => setNewAssignment({ ...newAssignment, due_time: e.target.value || '23:59' })}
              style={{ width: 'auto' }}
            />
            {newAssignment.due_date && (
              <button
                type="button"
                onClick={() => setNewAssignment({ ...newAssignment, due_date: '', due_time: '23:59' })}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  color: darkMode ? '#888' : '#666'
                }}
                title="Clear due date"
              >
                ×
              </button>
            )}
          </div>
          <small style={{
            display: 'block',
            marginTop: '6px',
            color: darkMode ? '#888' : '#888'
          }}>
            You can also set due dates after creating the class
          </small>
        </div>

        <div className="form-group" style={{ marginTop: '15px', marginBottom: '15px' }}>
          <label>Evaluation Type</label>
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginTop: '8px', alignItems: 'flex-start' }}>
            {/* Rating-based eval types (can be combined) */}
            {EVAL_TYPES.filter(t => t.group === 'rating').map(type => (
              <label
                key={type.value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  background: newAssignment.eval_types.includes(type.value)
                    ? (darkMode ? 'rgba(38, 139, 210, 0.2)' : 'rgba(52, 152, 219, 0.15)')
                    : 'transparent',
                  border: `1px solid ${newAssignment.eval_types.includes(type.value)
                    ? '#3498db'
                    : (darkMode ? '#333' : '#ddd')}`
                }}
              >
                <input
                  type="checkbox"
                  checked={newAssignment.eval_types.includes(type.value)}
                  onChange={() => toggleEvalType(type.value)}
                  style={{ width: 'auto' }}
                />
                <div>
                  <div style={{ fontWeight: 500 }}>{type.label}</div>
                  <div style={{
                    fontSize: '0.8rem',
                    color: darkMode ? '#888' : '#888'
                  }}>
                    {type.desc}
                  </div>
                </div>
              </label>
            ))}

            {/* Separator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              color: darkMode ? '#666' : '#999',
              fontSize: '0.85rem',
              padding: '0 5px'
            }}>
              or
            </div>

            {/* Paper review (exclusive) */}
            {EVAL_TYPES.filter(t => t.group === 'paper').map(type => (
              <label
                key={type.value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  background: newAssignment.eval_types.includes(type.value)
                    ? (darkMode ? 'rgba(38, 139, 210, 0.2)' : 'rgba(52, 152, 219, 0.15)')
                    : 'transparent',
                  border: `1px solid ${newAssignment.eval_types.includes(type.value)
                    ? '#3498db'
                    : (darkMode ? '#333' : '#ddd')}`
                }}
              >
                <input
                  type="checkbox"
                  checked={newAssignment.eval_types.includes(type.value)}
                  onChange={() => toggleEvalType(type.value)}
                  style={{ width: 'auto' }}
                />
                <div>
                  <div style={{ fontWeight: 500 }}>{type.label}</div>
                  <div style={{
                    fontSize: '0.8rem',
                    color: darkMode ? '#888' : '#888'
                  }}>
                    {type.desc}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={addAssignment}
          disabled={!newAssignment.name.trim()}
        >
          Add Assignment
        </button>
      </div>

      {/* Assignment list */}
      <h4 style={{ marginBottom: '15px' }}>
        Assignments ({assignments.length})
      </h4>

      {assignments.length === 0 ? (
        <div style={{
          padding: '30px',
          textAlign: 'center',
          color: darkMode ? '#888' : '#888',
          background: darkMode ? '#1a1a1a' : '#f8f9fa',
          borderRadius: '8px',
          border: `1px dashed ${darkMode ? '#333' : '#ddd'}`
        }}>
          No assignments added yet. Add assignments above or skip this step to add them later.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {assignments.map((assignment, index) => (
            <div
              key={assignment.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '15px',
                padding: '15px',
                borderRadius: '6px',
                background: darkMode ? '#1a3350' : '#fff',
                border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => moveAssignment(index, -1)}
                  disabled={index === 0}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: index === 0 ? 'not-allowed' : 'pointer',
                    opacity: index === 0 ? 0.3 : 1,
                    padding: '2px',
                    fontSize: '0.8rem'
                  }}
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => moveAssignment(index, 1)}
                  disabled={index === assignments.length - 1}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: index === assignments.length - 1 ? 'not-allowed' : 'pointer',
                    opacity: index === assignments.length - 1 ? 0.3 : 1,
                    padding: '2px',
                    fontSize: '0.8rem'
                  }}
                >
                  ▼
                </button>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: '8px' }}>
                  {index + 1}. {assignment.name}
                </div>
                <div style={{
                  fontSize: '0.85rem',
                  color: darkMode ? '#888' : '#888',
                  display: 'flex',
                  gap: '8px',
                  flexWrap: 'wrap',
                  marginBottom: '10px'
                }}>
                  {assignment.eval_types.map(type => (
                    <span
                      key={type}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '3px',
                        background: darkMode ? '#333' : '#e0e0e0',
                        fontSize: '0.8rem'
                      }}
                    >
                      {EVAL_TYPES.find(t => t.value === type)?.label || type}
                    </span>
                  ))}
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.85rem' }}>Due Date</label>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <input
                      type="date"
                      value={(assignment.due_date || '').split('T')[0]}
                      onChange={(e) => {
                        const date = e.target.value;
                        const currentTime = (assignment.due_date || '').split('T')[1] || '23:59';
                        updateAssignmentDueDate(index, date, currentTime);
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
                          updateAssignmentDueDate(index, currentDate, time);
                        }
                      }}
                      style={{ width: 'auto' }}
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => removeAssignment(index)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#e74c3c',
                  fontSize: '1.2rem',
                  padding: '5px 10px'
                }}
                title="Remove assignment"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AssignmentSetupStep;

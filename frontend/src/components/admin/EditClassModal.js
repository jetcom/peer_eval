import React from 'react';

function EditClassModal({ darkMode, editingClass, setEditingClass, onSubmit, onClose }) {
  if (!editingClass) return null;

  const availableInstructors = editingClass.enrolledTeachers || [];

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
        <h2 style={{ marginTop: 0, marginBottom: '20px' }}>Edit Class</h2>
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label>Class Name</label>
            <input
              type="text"
              value={editingClass.name}
              onChange={(e) => setEditingClass({ ...editingClass, name: e.target.value })}
              required
              placeholder="e.g., Software Engineering"
            />
          </div>
          <div className="form-group">
            <label>Section (optional)</label>
            <input
              type="text"
              value={editingClass.section || ''}
              onChange={(e) => setEditingClass({ ...editingClass, section: e.target.value })}
              placeholder="e.g., 001"
            />
          </div>
          <div className="form-group">
            <label>Semester (optional)</label>
            <input
              type="text"
              value={editingClass.semester || ''}
              onChange={(e) => setEditingClass({ ...editingClass, semester: e.target.value })}
              placeholder="e.g., Fall 2024"
            />
          </div>
          <div className="form-group">
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
                    const currentIds = editingClass.instructor_ids || [];
                    const newIds = currentIds.includes(u.id)
                      ? currentIds.filter(id => id !== u.id)
                      : [...currentIds, u.id];
                    setEditingClass({ ...editingClass, instructor_ids: newIds });
                  }}
                >
                  <input
                    type="checkbox"
                    checked={(editingClass.instructor_ids || []).includes(u.id)}
                    onChange={() => {}}
                    style={{ margin: '0 8px 0 0', cursor: 'pointer', width: 'auto' }}
                  />
                  <span>{u.last_name}, {u.first_name} ({u.email})</span>
                </div>
              ))}
            </div>
            <small style={{ display: 'block', marginTop: '5px', opacity: 0.8 }}>
              Selected: {(editingClass.instructor_ids || []).length} instructor(s)
            </small>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={editingClass.has_final_evaluation}
                onChange={(e) => setEditingClass({ ...editingClass, has_final_evaluation: e.target.checked })}
                style={{ width: '20px', height: '20px' }}
              />
              Include Final Evaluation (23-point distribution)
            </label>
          </div>
          <div className="form-group">
            <label>Peer Evaluation Due Date (optional)</label>
            <input
              type="datetime-local"
              value={editingClass.due_date || ''}
              onChange={(e) => setEditingClass({ ...editingClass, due_date: e.target.value })}
            />
            <small style={{ display: 'block', marginTop: '5px', opacity: 0.8 }}>
              After this time, peer evaluations will be read-only
            </small>
          </div>
          <div className="form-group">
            <label>Due Date Timezone</label>
            <select
              value={editingClass.due_date_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
              onChange={(e) => setEditingClass({ ...editingClass, due_date_timezone: e.target.value })}
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
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
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

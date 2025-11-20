import React from 'react';

function CreateClassModal({ darkMode, newClass, setNewClass, users, onSubmit, onClose }) {
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
            <label>Assign to Teacher (optional)</label>
            <select
              value={newClass.teacher_id}
              onChange={(e) => setNewClass({ ...newClass, teacher_id: e.target.value })}
            >
              <option value="">Myself (Admin)</option>
              {users.filter(u => u.role === 'teacher' || u.role === 'admin').map(u => (
                <option key={u.id} value={u.id}>
                  {u.last_name}, {u.first_name} ({u.email})
                </option>
              ))}
            </select>
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

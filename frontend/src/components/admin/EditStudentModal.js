import React from 'react';

function EditStudentModal({ darkMode, editingStudent, setEditingStudent, onSubmit, onClose }) {
  if (!editingStudent) return null;

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
        maxWidth: '400px',
        border: darkMode ? '1px solid #333' : '1px solid #e0e0e0',
        boxShadow: darkMode ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.15)'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '15px' }}>Edit Student Name</h2>
        <form onSubmit={onSubmit}>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label>First Name</label>
            <input
              type="text"
              value={editingStudent.first_name}
              onChange={(e) => setEditingStudent({ ...editingStudent, first_name: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label>Last Name</label>
            <input
              type="text"
              value={editingStudent.last_name}
              onChange={(e) => setEditingStudent({ ...editingStudent, last_name: e.target.value })}
              required
            />
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

export default EditStudentModal;

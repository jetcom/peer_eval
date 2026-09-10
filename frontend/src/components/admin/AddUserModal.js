import React from 'react';

// Rarely used — most accounts are created via CSV import, not this form.
function AddUserModal({ darkMode, newUser, setNewUser, onSubmit, onClose }) {
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
        maxWidth: '420px',
        border: darkMode ? '1px solid #333' : '1px solid #e0e0e0',
        boxShadow: darkMode ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.15)'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '10px' }}>Add a Single User</h2>
        <p style={{ marginTop: 0, marginBottom: '15px', color: darkMode ? '#a0a0a0' : '#666', fontSize: '0.9rem' }}>
          Most students are added via CSV import — use this only to create one account by hand
          (e.g. a teacher or admin account).
        </p>
        <form onSubmit={async (e) => { await onSubmit(e); onClose(); }}>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label>Email</label>
            <input
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label>Password</label>
            <input
              type="password"
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label>First Name</label>
            <input
              type="text"
              value={newUser.first_name}
              onChange={(e) => setNewUser({ ...newUser, first_name: e.target.value })}
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label>Last Name</label>
            <input
              type="text"
              value={newUser.last_name}
              onChange={(e) => setNewUser({ ...newUser, last_name: e.target.value })}
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label>Role</label>
            <select
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button type="submit" className="btn btn-primary">Add User</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddUserModal;

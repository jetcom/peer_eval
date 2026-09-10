import React from 'react';

// Rarely used — most rosters come from CSV import, not this search.
function AddExistingUserModal({ darkMode, targetClassName, userSearchQuery, onUserSearch, userSearchResults, onAddToClass, onClose }) {
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
        maxWidth: '480px',
        maxHeight: '80vh',
        overflow: 'auto',
        border: darkMode ? '1px solid #333' : '1px solid #e0e0e0',
        boxShadow: darkMode ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.15)'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '10px' }}>Add an Existing User to {targetClassName}</h2>
        <p style={{ marginTop: 0, marginBottom: '15px', color: darkMode ? '#a0a0a0' : '#666', fontSize: '0.9rem' }}>
          Most rosters come from CSV import — use this only to add someone who already has an
          account (a teacher, admin, or a student from another class) directly to this class.
        </p>
        <input
          type="text"
          placeholder="Search by name or email..."
          value={userSearchQuery}
          onChange={(e) => onUserSearch(e.target.value)}
          autoFocus
          style={{
            width: '100%',
            padding: '10px',
            marginBottom: '10px',
            background: darkMode ? '#0f0f0f' : '#fff',
            color: darkMode ? '#e0e0e0' : '#333',
            border: `1px solid ${darkMode ? '#444' : '#ccc'}`
          }}
        />
        {userSearchResults.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {userSearchResults.map(u => (
                <tr key={u.id}>
                  <td>{u.last_name}, {u.first_name}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>
                    <button
                      className="btn btn-primary"
                      onClick={async () => {
                        await onAddToClass(u.id, `${u.first_name} ${u.last_name}`);
                        onClose();
                      }}
                      style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                    >
                      Add and Close
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {userSearchQuery.length >= 2 && userSearchResults.length === 0 && (
          <p style={{ color: darkMode ? '#888' : '#999', fontStyle: 'italic' }}>
            No matching users found (or all matches are already in this class).
          </p>
        )}
        <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddExistingUserModal;

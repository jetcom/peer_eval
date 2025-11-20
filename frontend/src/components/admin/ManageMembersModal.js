import React from 'react';

function ManageMembersModal({
  darkMode,
  selectedGroup,
  classGroups,
  groupMembers,
  classStudents,
  onClose,
  onAddMember,
  onRemoveMember
}) {
  if (!selectedGroup) return null;

  const group = classGroups.find(g => g.id === selectedGroup);

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
        maxWidth: '600px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>Manage Group: {group?.name}</h2>
          <button
            className="btn btn-secondary"
            onClick={onClose}
            style={{ padding: '8px 16px' }}
          >
            Close
          </button>
        </div>

        <h3>Current Members ({groupMembers.length})</h3>
        {groupMembers.length === 0 ? (
          <p>No members in this group yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groupMembers.map(member => (
                <tr key={member.id}>
                  <td>{member.last_name}, {member.first_name}</td>
                  <td>{member.email}</td>
                  <td>
                    <button
                      className="btn btn-danger"
                      onClick={() => onRemoveMember(selectedGroup, member.id)}
                      style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 style={{ marginTop: '20px' }}>Add Member from Class</h3>
        <select
          onChange={(e) => {
            if (e.target.value) {
              onAddMember(selectedGroup, e.target.value);
              e.target.value = '';
            }
          }}
          style={{ width: '100%', padding: '10px' }}
        >
          <option value="">Select a student to add...</option>
          {classStudents
            .filter(s => !groupMembers.some(m => m.id === s.id))
            .map(s => (
              <option key={s.id} value={s.id}>{s.last_name}, {s.first_name} ({s.email})</option>
            ))
          }
        </select>
      </div>
    </div>
  );
}

export default ManageMembersModal;

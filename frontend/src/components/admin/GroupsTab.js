import React from 'react';

function GroupsTab({
  selectedClass,
  classes,
  classGroups,
  newGroup,
  setNewGroup,
  onCreateGroup,
  onSelectGroup,
  onDeleteGroup
}) {
  if (!selectedClass) {
    return (
      <div className="card">
        <h2>Select a Class</h2>
        <p>Please select a class from the header dropdown to manage groups.</p>
      </div>
    );
  }

  return (
    <>
      <div className="admin-grid">
        <div className="card">
          <h2>Create Group</h2>
          <form onSubmit={onCreateGroup}>
            <div className="form-group">
              <label>Group Name</label>
              <input
                type="text"
                value={newGroup.name}
                onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary">Create Group</button>
          </form>
        </div>
      </div>

      <div className="card">
        <h2>Groups in {classes.find(c => c.id === parseInt(selectedClass))?.name} ({classGroups.length})</h2>
        {classGroups.length === 0 ? (
          <p>No groups in this class yet.</p>
        ) : (
          <>
            {/* Desktop table view */}
            <table className="desktop-table">
              <thead>
                <tr>
                  <th>Group Name</th>
                  <th>Members</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {classGroups.map(g => (
                  <tr key={g.id}>
                    <td>{g.name}</td>
                    <td>{g.member_count || 0}</td>
                    <td>
                      <button
                        className="btn btn-primary"
                        onClick={() => onSelectGroup(g.id)}
                        style={{ marginRight: '10px' }}
                      >
                        Manage Members
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => onDeleteGroup(g.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile card view */}
            <div className="mobile-card-list">
              {classGroups.map(g => (
                <div key={g.id} className="mobile-card">
                  <div className="mobile-card-header">{g.name}</div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Members</span>
                    <span className="mobile-card-value">{g.member_count || 0}</span>
                  </div>
                  <div className="mobile-card-actions">
                    <button
                      className="btn btn-primary"
                      onClick={() => onSelectGroup(g.id)}
                    >
                      Manage Members
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => onDeleteGroup(g.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default GroupsTab;

import React from 'react';

function UsersTab({
  darkMode,
  selectedClass,
  classes,
  users,
  classStudents,
  classGroups,
  newUser,
  setNewUser,
  uploadedCredentials,
  setUploadedCredentials,
  userSearchQuery,
  setUserSearchQuery,
  userSearchResults,
  onCreateUser,
  onUploadStudents,
  onUserSearch,
  onAddToClass,
  onResetPassword,
  onRemoveFromClass,
  onDeleteUser,
  onViewGroup,
  currentUser
}) {
  // Find which group a student belongs to
  const getStudentGroup = (studentId) => {
    if (!classGroups) return null;
    return classGroups.find(g => g.members?.some(m => m.id === studentId));
  };

  if (!selectedClass) {
    return (
      <div className="card">
        <h2>Select a Class</h2>
        <p>Please select a class from the header dropdown to manage users.</p>
      </div>
    );
  }

  return (
    <>
      <div className="admin-grid">
        <div className="card">
          <h2>Add User to System</h2>
          <form onSubmit={onCreateUser}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>First Name</label>
              <input
                type="text"
                value={newUser.first_name}
                onChange={(e) => setNewUser({ ...newUser, first_name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input
                type="text"
                value={newUser.last_name}
                onChange={(e) => setNewUser({ ...newUser, last_name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
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
            <button type="submit" className="btn btn-primary">Add User</button>
          </form>
        </div>

        <div className="card">
          <h2>Upload Students to Class</h2>
          <p style={{ marginBottom: '15px', fontWeight: '500' }}>
            Uploading to: {classes.find(c => c.id === parseInt(selectedClass))?.name}
          </p>
          <p style={{ fontSize: '0.9rem', color: darkMode ? '#a0a0a0' : '#666' }}>
            CSV columns: <code>university_id, last_name, first_name, email, group_name</code>
          </p>
          <p style={{ fontSize: '0.85rem', color: darkMode ? '#888' : '#999', marginTop: '4px' }}>
            Lines can start/end with #. Existing users are enrolled without new password.<br />
            Groups are created per-class (no duplicates).
          </p>
          <label className="file-upload">
            <input type="file" accept=".csv" onChange={onUploadStudents} />
            <p>Click to upload CSV file</p>
          </label>

          {uploadedCredentials.length > 0 && (
            <div style={{ marginTop: '15px' }}>
              <h3 style={{ marginBottom: '10px' }}>Generated Credentials (New Users Only)</h3>
              <div style={{
                maxHeight: '200px',
                overflow: 'auto',
                background: darkMode ? '#1a2744' : '#f8f9fa',
                padding: '10px',
                borderRadius: '4px',
                fontSize: '0.85rem',
                color: darkMode ? '#e0e0e0' : 'inherit'
              }}>
                <table style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Email</th>
                      <th style={{ textAlign: 'left' }}>Temporary Password</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadedCredentials.map((cred, idx) => (
                      <tr key={idx}>
                        <td>{cred.email}</td>
                        <td><code style={{ background: darkMode ? '#2a3a5a' : '#e9ecef', padding: '2px 6px', borderRadius: '3px' }}>{cred.password}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="btn btn-secondary"
                style={{ marginTop: '10px', fontSize: '0.85rem' }}
                onClick={() => setUploadedCredentials([])}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search for existing users to add to class */}
      <div className="card">
        <h2>Add Existing User to Class</h2>
        <p style={{ marginBottom: '15px', color: darkMode ? '#a0a0a0' : '#666' }}>
          Search for existing users (teachers, admins, or students from other classes) to add to this class.
        </p>
        <input
          type="text"
          placeholder="Search by name or email..."
          value={userSearchQuery}
          onChange={(e) => onUserSearch(e.target.value)}
          style={{ width: '100%', padding: '10px', marginBottom: '10px' }}
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
                      onClick={() => onAddToClass(u.id, `${u.first_name} ${u.last_name}`)}
                      style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                    >
                      Add to Class
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
      </div>

      {/* Users in current class */}
      <div className="card">
        <h2>Users in {classes.find(c => c.id === parseInt(selectedClass))?.name} ({classStudents.length})</h2>
        {classStudents.length === 0 ? (
          <p>No users enrolled in this class yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Group</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {classStudents.map(u => {
                const studentGroup = getStudentGroup(u.id);
                return (
                <tr key={u.id}>
                  <td>
                    {u.last_name}, {u.first_name}
                    {u.protected === 1 && <span style={{ marginLeft: '8px', color: '#7f8c8d', fontSize: '12px' }}>(protected)</span>}
                  </td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>
                    {studentGroup ? (
                      <span
                        onClick={() => onViewGroup && onViewGroup(studentGroup.id)}
                        style={{
                          color: '#3498db',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                        title="Click to view group members"
                      >
                        {studentGroup.name}
                      </span>
                    ) : (
                      <span style={{ color: '#999', fontStyle: 'italic' }}>—</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      onClick={() => onResetPassword(u.id, `${u.first_name} ${u.last_name}`)}
                      style={{ marginRight: '5px', fontSize: '0.8rem', padding: '4px 8px' }}
                    >
                      Reset Password
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => onRemoveFromClass(u.id, `${u.first_name} ${u.last_name}`)}
                      style={{ marginRight: '5px', fontSize: '0.8rem', padding: '4px 8px' }}
                    >
                      Remove
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => onDeleteUser(u.id)}
                      disabled={u.id === currentUser?.id || u.protected === 1}
                      title={u.protected === 1 ? 'Cannot delete protected admin' : 'Delete user from system'}
                      style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export default UsersTab;

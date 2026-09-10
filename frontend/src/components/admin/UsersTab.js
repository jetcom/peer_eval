import React from 'react';
import ClassRoster from './ClassRoster';

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
  sendEmailsOnUpload,
  setSendEmailsOnUpload,
  userSearchQuery,
  setUserSearchQuery,
  userSearchResults,
  onCreateUser,
  onUploadStudents,
  fileInputRef,
  uploading,
  onUserSearch,
  onAddToClass,
  onResetPassword,
  onRemoveFromClass,
  onDeleteUser,
  onSendInvite,
  onSendAllInvites,
  onEditStudent,
  onViewGroup,
  onBulkRemove,
  onBulkResetPasswords,
  currentUser
}) {
  const showGroups = !!classes?.find(c => c.id === parseInt(selectedClass))?.show_groups;

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
            CSV columns: <code>university_id, last_name, first_name, email{showGroups ? ', group_name' : ''}</code>
          </p>
          <details style={{ fontSize: '0.85rem', color: darkMode ? '#888' : '#999', marginTop: '4px' }}>
            <summary style={{ cursor: 'pointer', marginBottom: '6px' }}>Column name options & notes</summary>
            <div style={{ paddingLeft: '12px', lineHeight: '1.6' }}>
              <strong>Accepted column names (case-insensitive):</strong><br />
              • ID: <code>university_id</code>, <code>student_id</code>, <code>id</code>, <code>OrgDefinedId</code><br />
              • Last: <code>last_name</code>, <code>lastname</code>, <code>Last</code>, <code>surname</code>, <code>Last Name</code><br />
              • First: <code>first_name</code>, <code>firstname</code>, <code>First</code>, <code>First Name</code><br />
              • Email: <code>email</code>, <code>Email</code>, <code>e-mail</code><br />
              {showGroups && <>• Group: <code>group_name</code>, <code>group</code>, <code>team</code>, <code>Project</code>, <code>Project Groups</code><br /></>}
              <br />
              <strong>Notes:</strong><br />
              • Lines starting/ending with # are ignored<br />
              • Existing users are enrolled without new password
              {showGroups && <><br />• Groups are created per-class (no duplicates)</>}
            </div>
          </details>
          {setSendEmailsOnUpload && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '12px 0', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={sendEmailsOnUpload}
                onChange={(e) => setSendEmailsOnUpload(e.target.checked)}
                style={{ width: 'auto' }}
              />
              <span style={{ fontSize: '0.9rem' }}>Send notification emails to uploaded students</span>
            </label>
          )}
          <label className="file-upload" style={uploading ? { opacity: 0.6, pointerEvents: 'none' } : {}}>
            <input type="file" accept=".csv" ref={fileInputRef} onChange={onUploadStudents} disabled={uploading} />
            <p>{uploading ? 'Uploading...' : 'Click to upload CSV file'}</p>
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

      {/* Search for existing users to add to class — collapsed by default since
          most rosters come in via CSV import above, not this rarer path */}
      <div className="card">
        <details>
          <summary style={{ cursor: 'pointer', fontSize: '1.17rem', fontWeight: 'bold' }}>
            Add an Existing User to This Class
          </summary>
          <p style={{ margin: '10px 0 15px', color: darkMode ? '#a0a0a0' : '#666' }}>
            Most rosters are added via CSV import above. Use this only to add someone who already
            has an account (a teacher, admin, or a student from another class) directly to this class.
          </p>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={userSearchQuery}
            onChange={(e) => onUserSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '10px',
              background: darkMode ? '#1a1a1a' : '#fff',
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
        </details>
      </div>

      {/* Users in current class */}
      <ClassRoster
        darkMode={darkMode}
        title={`Users in ${classes.find(c => c.id === parseInt(selectedClass))?.name}`}
        students={classStudents}
        groups={classGroups}
        showGroups={showGroups}
        showRoleColumn
        onEditStudent={onEditStudent}
        onSendInvite={onSendInvite}
        onResetPassword={onResetPassword}
        onRemoveStudent={onRemoveFromClass}
        onViewGroup={onViewGroup}
        onDeleteUser={onDeleteUser}
        currentUser={currentUser}
        onBulkRemove={onBulkRemove}
        onBulkResetPasswords={onBulkResetPasswords}
        onSendAllInvites={onSendAllInvites}
        resetKey={selectedClass}
      />
    </>
  );
}

export default UsersTab;

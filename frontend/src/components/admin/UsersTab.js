import React, { useState } from 'react';
import ClassRoster from './ClassRoster';
import AddUserModal from './AddUserModal';
import AddExistingUserModal from './AddExistingUserModal';

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
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showAddExistingUserModal, setShowAddExistingUserModal] = useState(false);
  const showGroups = !!classes?.find(c => c.id === parseInt(selectedClass))?.show_groups;
  const currentClassName = classes.find(c => c.id === parseInt(selectedClass))?.name;

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

      {/* Secondary, rarely-used ways to add someone — most rosters come from
          CSV import above, so these stay out of the way as plain buttons */}
      <div style={{ display: 'flex', gap: '10px', margin: '15px 0 20px' }}>
        <button className="btn btn-secondary" onClick={() => setShowAddUserModal(true)}>
          + Add a Single User
        </button>
        <button className="btn btn-secondary" onClick={() => setShowAddExistingUserModal(true)}>
          + Add an Existing User to This Class
        </button>
      </div>

      {showAddUserModal && (
        <AddUserModal
          darkMode={darkMode}
          newUser={newUser}
          setNewUser={setNewUser}
          onSubmit={onCreateUser}
          onClose={() => setShowAddUserModal(false)}
        />
      )}

      {showAddExistingUserModal && (
        <AddExistingUserModal
          darkMode={darkMode}
          targetClassName={currentClassName}
          userSearchQuery={userSearchQuery}
          onUserSearch={onUserSearch}
          userSearchResults={userSearchResults}
          onAddToClass={onAddToClass}
          onClose={() => {
            setShowAddExistingUserModal(false);
            onUserSearch('');
          }}
        />
      )}

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

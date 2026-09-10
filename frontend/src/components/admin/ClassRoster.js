import React, { useState, useEffect, useMemo } from 'react';

// Shared roster table used by both the teacher dashboard's "Students in Class"
// card and the admin dashboard's "Users in <class>" card. The two call sites
// differ in a few ways (admin shows Role/Delete/protected-badge and a
// read-only group link, teacher shows a split Last/First name column and an
// editable group dropdown) — those differences are controlled via props
// rather than forked into two components, so features like Edit or the
// search box below don't need to be built twice.
function ClassRoster({
  darkMode,
  title = 'Students in Class',
  students,
  groups,
  showGroups,
  showRoleColumn = false,
  splitNameColumns = false,
  onEditStudent,
  onSendInvite,
  onResetPassword,
  onRemoveStudent,
  onAddToGroup,
  onViewGroup,
  onDeleteUser,
  currentUser,
  onBulkRemove,
  onBulkResetPasswords,
  onSendAllInvites,
  resetKey
}) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState('');

  // Clear search + selection when the underlying class changes
  useEffect(() => {
    setSelectedIds(new Set());
    setSearch('');
  }, [resetKey]);

  const getStudentGroup = (studentId) => {
    if (!groups) return null;
    return groups.find(g => g.members?.some(m => m.id === studentId));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(s =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q)
    );
  }, [students, search]);

  const neverLoggedInCount = students.filter(s => s.role === 'student' && s.must_change_password === 1).length;
  const studentCount = students.filter(s => s.role === 'student').length;

  const renderGroupCell = (student) => {
    const studentGroup = getStudentGroup(student.id);
    if (onAddToGroup) {
      return (
        <select
          value={studentGroup?.id || ''}
          onChange={(e) => {
            const newGroupId = e.target.value;
            if (newGroupId) onAddToGroup(student.id, newGroupId);
          }}
        >
          <option value="">Unassigned</option>
          {groups.map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      );
    }
    if (studentGroup) {
      return (
        <span
          onClick={() => onViewGroup && onViewGroup(studentGroup.id)}
          style={{ color: '#3498db', cursor: onViewGroup ? 'pointer' : 'default', textDecoration: onViewGroup ? 'underline' : 'none' }}
          title={onViewGroup ? 'Click to view group members' : undefined}
        >
          {studentGroup.name}
        </span>
      );
    }
    return <span style={{ color: '#999', fontStyle: 'italic' }}>—</span>;
  };

  const renderActions = (student, fullName) => (
    <>
      {onEditStudent && (
        <button
          className="btn btn-secondary"
          style={{ fontSize: '0.8rem', padding: '4px 8px', marginRight: '5px' }}
          onClick={() => onEditStudent(student)}
        >
          Edit
        </button>
      )}
      {onSendInvite && (
        <button
          className="btn btn-secondary"
          style={{ fontSize: '0.8rem', padding: '4px 8px', marginRight: '5px' }}
          onClick={() => onSendInvite(student.id, fullName)}
          title="Send enrollment notification email"
        >
          Send Invite
        </button>
      )}
      <button
        className="btn btn-secondary"
        style={{ fontSize: '0.8rem', padding: '4px 8px', marginRight: '5px' }}
        onClick={() => onResetPassword(student.id, fullName)}
      >
        Reset Password
      </button>
      <button
        className="btn btn-danger"
        style={{ fontSize: '0.8rem', padding: '4px 8px', marginRight: '5px' }}
        onClick={() => onRemoveStudent(student.id, fullName)}
      >
        Remove
      </button>
      {onDeleteUser && (
        <button
          className="btn btn-danger"
          onClick={() => onDeleteUser(student.id)}
          disabled={student.id === currentUser?.id || student.protected === 1}
          title={student.protected === 1 ? 'Cannot delete protected admin' : 'Delete user from system'}
          style={{ fontSize: '0.8rem', padding: '4px 8px' }}
        >
          Delete
        </button>
      )}
    </>
  );

  const renderMobileActions = (student, fullName) => (
    <>
      {onEditStudent && (
        <button className="btn btn-secondary" onClick={() => onEditStudent(student)}>
          Edit
        </button>
      )}
      {onSendInvite && (
        <button className="btn btn-secondary" onClick={() => onSendInvite(student.id, fullName)} title="Send enrollment notification email">
          Send Invite
        </button>
      )}
      <button className="btn btn-secondary" onClick={() => onResetPassword(student.id, fullName)}>
        Reset Password
      </button>
      <button className="btn btn-danger" onClick={() => onRemoveStudent(student.id, fullName)}>
        Remove
      </button>
      {onDeleteUser && (
        <button
          className="btn btn-danger"
          onClick={() => onDeleteUser(student.id)}
          disabled={student.id === currentUser?.id || student.protected === 1}
          title={student.protected === 1 ? 'Cannot delete protected admin' : 'Delete user from system'}
        >
          Delete
        </button>
      )}
    </>
  );

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>
        <h2 style={{ margin: 0 }}>{title} ({students.length})</h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {onBulkResetPasswords && neverLoggedInCount > 0 && (
            <button
              className="btn btn-secondary"
              onClick={onBulkResetPasswords}
              style={{ fontSize: '0.85rem', padding: '8px 16px' }}
              title="Reset passwords and send credential emails to students who have never logged in"
            >
              Reset Unsent Passwords ({neverLoggedInCount})
            </button>
          )}
          {onSendAllInvites && studentCount > 0 && (
            <button
              className="btn btn-primary"
              onClick={onSendAllInvites}
              style={{ fontSize: '0.85rem', padding: '8px 16px' }}
              title="Send enrollment/invite email to all students"
            >
              Send All Invites
            </button>
          )}
        </div>
      </div>

      {students.length === 0 ? (
        <p>No students enrolled yet.</p>
      ) : (
        <>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '10px',
              background: darkMode ? '#1a1a1a' : '#fff',
              color: darkMode ? '#e0e0e0' : '#333',
              border: `1px solid ${darkMode ? '#444' : '#ccc'}`
            }}
          />

          {selectedIds.size > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '8px 12px', marginBottom: '10px',
              background: darkMode ? '#1a3a6e' : '#e8f4fc',
              borderRadius: '6px', fontSize: '0.9rem'
            }}>
              <span>{selectedIds.size} selected</span>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  if (onBulkRemove) onBulkRemove([...selectedIds], () => setSelectedIds(new Set()));
                }}
              >
                Remove Selected
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds(new Set())}>
                Clear
              </button>
            </div>
          )}

          {filtered.length === 0 ? (
            <p style={{ color: darkMode ? '#888' : '#999', fontStyle: 'italic' }}>No students match "{search}".</p>
          ) : (
            <>
              {/* Desktop table view */}
              <table className="desktop-table">
                <thead>
                  <tr>
                    <th style={{ width: '30px' }}>
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && filtered.every(s => selectedIds.has(s.id))}
                        onChange={(e) => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) filtered.forEach(s => next.add(s.id));
                          else filtered.forEach(s => next.delete(s.id));
                          setSelectedIds(next);
                        }}
                        style={{ width: 'auto' }}
                      />
                    </th>
                    {splitNameColumns ? (
                      <>
                        <th>Last Name</th>
                        <th>First Name</th>
                      </>
                    ) : (
                      <th>Name</th>
                    )}
                    <th>Email</th>
                    {showRoleColumn && <th>Role</th>}
                    {showGroups && <th>Group</th>}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(student => {
                    const fullName = `${student.first_name} ${student.last_name}`;
                    return (
                      <tr key={student.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(student.id)}
                            onChange={(e) => {
                              const next = new Set(selectedIds);
                              if (e.target.checked) next.add(student.id);
                              else next.delete(student.id);
                              setSelectedIds(next);
                            }}
                            style={{ width: 'auto' }}
                          />
                        </td>
                        {splitNameColumns ? (
                          <>
                            <td>{student.last_name}</td>
                            <td>{student.first_name}</td>
                          </>
                        ) : (
                          <td>
                            {student.last_name}, {student.first_name}
                            {student.protected === 1 && <span style={{ marginLeft: '8px', color: '#7f8c8d', fontSize: '12px' }}>(protected)</span>}
                          </td>
                        )}
                        <td>{student.email}</td>
                        {showRoleColumn && <td>{student.role}</td>}
                        {showGroups && <td>{renderGroupCell(student)}</td>}
                        <td>{renderActions(student, fullName)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile card view */}
              <div className="mobile-card-list">
                {filtered.map(student => {
                  const fullName = `${student.first_name} ${student.last_name}`;
                  return (
                    <div key={student.id} className="mobile-card">
                      <div className="mobile-card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(student.id)}
                          onChange={(e) => {
                            const next = new Set(selectedIds);
                            if (e.target.checked) next.add(student.id);
                            else next.delete(student.id);
                            setSelectedIds(next);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: 'auto' }}
                        />
                        {student.last_name}, {student.first_name}
                        {student.protected === 1 && <span style={{ marginLeft: '8px', color: '#7f8c8d', fontSize: '12px' }}>(protected)</span>}
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Email</span>
                        <span className="mobile-card-value" style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>
                          {student.email}
                        </span>
                      </div>
                      {showRoleColumn && (
                        <div className="mobile-card-row">
                          <span className="mobile-card-label">Role</span>
                          <span className="mobile-card-value">{student.role}</span>
                        </div>
                      )}
                      {showGroups && (
                        <div className="mobile-card-row">
                          <span className="mobile-card-label">Group</span>
                          <span className="mobile-card-value" style={{ flex: 1, maxWidth: '150px' }}>
                            {renderGroupCell(student)}
                          </span>
                        </div>
                      )}
                      <div className="mobile-card-actions">
                        {renderMobileActions(student, fullName)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default ClassRoster;

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ChangePasswordModal from '../components/ChangePasswordModal';

function AdminDashboard() {
  const { user, logout, mustChangePassword } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Form states
  const [newUser, setNewUser] = useState({ email: '', password: '', name: '', role: 'student' });
  const [newGroup, setNewGroup] = useState({ name: '' });
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);
  const [reportGroup, setReportGroup] = useState('all');
  const [groupsWithMembers, setGroupsWithMembers] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [usersRes, groupsRes, evalsRes, groupsWithMembersRes] = await Promise.all([
        axios.get('/api/users'),
        axios.get('/api/groups'),
        axios.get('/api/evaluations/all'),
        axios.get('/api/groups/with-members')
      ]);
      setUsers(usersRes.data);
      setGroups(groupsRes.data);
      setEvaluations(evalsRes.data);
      setGroupsWithMembers(groupsWithMembersRes.data);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/users', newUser);
      setNewUser({ email: '', password: '', name: '', role: 'student' });
      setMessage({ type: 'success', text: 'User created successfully' });
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to create user' });
    }
  };

  const [uploadedCredentials, setUploadedCredentials] = useState([]);

  const handleUploadUsers = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post('/api/users/upload-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMessage({
        type: 'success',
        text: `Created ${res.data.created} users. ${res.data.errors.length} errors.`
      });
      // Store generated credentials to display
      if (res.data.credentials && res.data.credentials.length > 0) {
        setUploadedCredentials(res.data.credentials);
      }
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to upload CSV' });
    }
    e.target.value = '';
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await axios.delete(`/api/users/${id}`);
      setMessage({ type: 'success', text: 'User deleted' });
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete user' });
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/groups', newGroup);
      setNewGroup({ name: '' });
      setMessage({ type: 'success', text: 'Group created successfully' });
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to create group' });
    }
  };

  const handleUploadGroups = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post('/api/groups/upload-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMessage({
        type: 'success',
        text: `Created ${res.data.created} groups. ${res.data.errors.length} errors.`
      });
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to upload CSV' });
    }
    e.target.value = '';
  };

  const fetchGroupMembers = async (groupId) => {
    try {
      const res = await axios.get(`/api/groups/${groupId}`);
      setGroupMembers(res.data.members || []);
    } catch (err) {
      setGroupMembers([]);
    }
  };

  const handleSelectGroup = async (groupId) => {
    if (selectedGroup === groupId) {
      setSelectedGroup(null);
      setGroupMembers([]);
    } else {
      setSelectedGroup(groupId);
      await fetchGroupMembers(groupId);
    }
  };

  const handleAddMember = async (groupId, userId) => {
    try {
      await axios.post(`/api/groups/${groupId}/members`, { userId });
      setMessage({ type: 'success', text: 'Member added to group' });
      fetchData();
      await fetchGroupMembers(groupId);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to add member' });
    }
  };

  const handleRemoveMember = async (groupId, userId) => {
    try {
      await axios.delete(`/api/groups/${groupId}/members/${userId}`);
      setMessage({ type: 'success', text: 'Member removed from group' });
      await fetchGroupMembers(groupId);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to remove member' });
    }
  };

  const handleDeleteGroup = async (id) => {
    if (!window.confirm('Are you sure you want to delete this group?')) return;
    try {
      await axios.delete(`/api/groups/${id}`);
      setMessage({ type: 'success', text: 'Group deleted' });
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete group' });
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div>
      {mustChangePassword && <ChangePasswordModal />}
      <div className="header">
        <h1>Admin Dashboard</h1>
        <div className="header-right">
          <span>Welcome, {user?.name}</span>
          <button className="theme-toggle" onClick={toggleDarkMode}>
            {darkMode ? 'Light' : 'Dark'}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
            Student View
          </button>
          <button className="btn btn-secondary" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="container">
        {message.text && (
          <div className={`message ${message.type}`}>{message.text}</div>
        )}

        <div className="tabs">
          <button
            className={`tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            Users
          </button>
          <button
            className={`tab ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => setActiveTab('groups')}
          >
            Groups
          </button>
          <button
            className={`tab ${activeTab === 'evaluations' ? 'active' : ''}`}
            onClick={() => setActiveTab('evaluations')}
          >
            Evaluations
          </button>
          <button
            className={`tab ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            Reports
          </button>
        </div>

        {activeTab === 'users' && (
          <>
            <div className="admin-grid">
              <div className="card">
                <h2>Add User</h2>
                <form onSubmit={handleCreateUser}>
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
                    <label>Name</label>
                    <input
                      type="text"
                      value={newUser.name}
                      onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
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
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primary">Add User</button>
                </form>
              </div>

              <div className="card">
                <h2>Upload Users CSV</h2>
                <p>CSV format: <code>email,name,role</code></p>
                <p style={{ fontSize: '0.85rem', color: '#666' }}>
                  Passwords auto-generated as: username + "Pass123"<br />
                  Students must change password on first login.
                </p>
                <label className="file-upload">
                  <input type="file" accept=".csv" onChange={handleUploadUsers} />
                  <p>Click to upload CSV file</p>
                </label>

                {uploadedCredentials.length > 0 && (
                  <div style={{ marginTop: '15px' }}>
                    <h3 style={{ marginBottom: '10px' }}>Generated Credentials</h3>
                    <div style={{ maxHeight: '200px', overflow: 'auto', background: '#f8f9fa', padding: '10px', borderRadius: '4px', fontSize: '0.85rem' }}>
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
                              <td><code>{cred.password}</code></td>
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

            <div className="card">
              <h2>All Users ({users.length})</h2>
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
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>
                        {u.name}
                        {u.protected === 1 && <span style={{ marginLeft: '8px', color: '#7f8c8d', fontSize: '12px' }}>(protected)</span>}
                      </td>
                      <td>{u.email}</td>
                      <td>{u.role}</td>
                      <td>
                        <button
                          className="btn btn-danger"
                          onClick={() => handleDeleteUser(u.id)}
                          disabled={u.id === user?.id || u.protected === 1}
                          title={u.protected === 1 ? 'Cannot delete protected admin' : ''}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'groups' && (
          <>
            <div className="admin-grid">
              <div className="card">
                <h2>Create Group</h2>
                <form onSubmit={handleCreateGroup}>
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

              <div className="card">
                <h2>Upload Groups CSV</h2>
                <p>CSV format: group_name,user_email</p>
                <label className="file-upload">
                  <input type="file" accept=".csv" onChange={handleUploadGroups} />
                  <p>Click to upload CSV file</p>
                </label>
              </div>
            </div>

            <div className="card">
              <h2>All Groups ({groups.length})</h2>
              <table>
                <thead>
                  <tr>
                    <th>Group Name</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(g => (
                    <tr key={g.id}>
                      <td>{g.name}</td>
                      <td>
                        <button
                          className="btn btn-primary"
                          onClick={() => handleSelectGroup(g.id)}
                          style={{ marginRight: '10px' }}
                        >
                          {selectedGroup === g.id ? 'Hide Members' : 'Manage Members'}
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => handleDeleteGroup(g.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedGroup && (
              <div className="card">
                <h2>Manage Group: {groups.find(g => g.id === selectedGroup)?.name}</h2>

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
                          <td>{member.name}</td>
                          <td>{member.email}</td>
                          <td>
                            <button
                              className="btn btn-danger"
                              onClick={() => handleRemoveMember(selectedGroup, member.id)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <h3 style={{ marginTop: '20px' }}>Add Member</h3>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddMember(selectedGroup, e.target.value);
                      e.target.value = '';
                    }
                  }}
                  style={{ width: '100%', padding: '10px' }}
                >
                  <option value="">Select a student to add...</option>
                  {users
                    .filter(u => u.role === 'student' && !groupMembers.some(m => m.id === u.id))
                    .map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))
                  }
                </select>
              </div>
            )}
          </>
        )}

        {activeTab === 'evaluations' && (
          <div className="card">
            <h2>All Evaluations ({evaluations.length})</h2>
            {evaluations.length === 0 ? (
              <p>No evaluations submitted yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Phase</th>
                    <th>Evaluator</th>
                    <th>Evaluatee</th>
                    <th>Score</th>
                    <th>Avg Likert</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluations.map(e => {
                    const avgLikert = (
                      (e.contribution + e.communication + e.reliability +
                       e.quality_of_work + e.collaboration) / 5
                    ).toFixed(1);
                    return (
                      <tr key={e.id}>
                        <td>{e.group_name || 'N/A'}</td>
                        <td>{e.phase}</td>
                        <td>{e.evaluator_name}</td>
                        <td>{e.evaluatee_name}</td>
                        <td>{e.score}/100</td>
                        <td>{avgLikert}/5</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'reports' && (
          <>
            <div className="card">
              <h2>Select Group</h2>
              <select
                value={reportGroup}
                onChange={(e) => setReportGroup(e.target.value)}
                style={{ width: '100%', padding: '10px', fontSize: '1rem' }}
              >
                <option value="all">All Groups</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            {(() => {
              // Get students in selected group
              const getStudentsInGroup = () => {
                const allStudents = users.filter(u => u.role === 'student');
                if (reportGroup === 'all') return allStudents;

                // Find students in the selected group using groupsWithMembers
                const groupId = parseInt(reportGroup);
                const selectedGroupData = groupsWithMembers.find(g => g.id === groupId);
                if (!selectedGroupData || !selectedGroupData.members) return [];

                const memberIds = new Set(selectedGroupData.members.map(m => m.id));
                return allStudents.filter(s => memberIds.has(s.id));
              };

              // Calculate summaries per student
              const students = getStudentsInGroup();
              const studentSummaries = students.map(student => {
                const studentEvals = evaluations.filter(e => e.evaluatee_id === student.id);
                const phases = [1, 2, 3].map(phase => {
                  const phaseEvals = studentEvals.filter(e => e.phase === phase);
                  if (phaseEvals.length === 0) return null;

                  const avgScore = phaseEvals.reduce((sum, e) => sum + e.score, 0) / phaseEvals.length;
                  const avgLikert = phaseEvals.reduce((sum, e) =>
                    sum + (e.contribution + e.communication + e.reliability + e.quality_of_work + e.collaboration) / 5, 0
                  ) / phaseEvals.length;

                  // Calculate individual criteria averages
                  const criteria = {
                    contribution: phaseEvals.reduce((sum, e) => sum + e.contribution, 0) / phaseEvals.length,
                    communication: phaseEvals.reduce((sum, e) => sum + e.communication, 0) / phaseEvals.length,
                    reliability: phaseEvals.reduce((sum, e) => sum + e.reliability, 0) / phaseEvals.length,
                    quality_of_work: phaseEvals.reduce((sum, e) => sum + e.quality_of_work, 0) / phaseEvals.length,
                    collaboration: phaseEvals.reduce((sum, e) => sum + e.collaboration, 0) / phaseEvals.length
                  };

                  const comments = phaseEvals.map(e => ({
                    from: e.evaluator_name,
                    text: e.comments
                  })).filter(c => c.text);

                  return { phase, avgScore, avgLikert, criteria, comments, count: phaseEvals.length };
                });

                return { ...student, phases };
              });

              const criteriaLabels = {
                contribution: 'Contribution',
                communication: 'Communication',
                reliability: 'Reliability',
                quality_of_work: 'Quality of Work',
                collaboration: 'Collaboration'
              };

              const criteriaColors = {
                contribution: '#3498db',
                communication: '#9b59b6',
                reliability: '#e67e22',
                quality_of_work: '#27ae60',
                collaboration: '#e74c3c'
              };

              return (
                <>
                  <div className="card">
                    <h2>Student Comparison - Average Scores by Phase</h2>
                    {students.length === 0 ? (
                      <p>No students found.</p>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table>
                          <thead>
                            <tr>
                              <th>Student</th>
                              <th>Phase 1 Score</th>
                              <th>Phase 1 Likert</th>
                              <th>Phase 2 Score</th>
                              <th>Phase 2 Likert</th>
                              <th>Phase 3 Score</th>
                              <th>Phase 3 Likert</th>
                            </tr>
                          </thead>
                          <tbody>
                            {studentSummaries.map(student => (
                              <tr key={student.id}>
                                <td><strong>{student.name}</strong></td>
                                {[0, 1, 2].map(i => {
                                  const phase = student.phases[i];
                                  return phase ? (
                                    <React.Fragment key={i}>
                                      <td>{phase.avgScore.toFixed(1)}</td>
                                      <td>{phase.avgLikert.toFixed(2)}</td>
                                    </React.Fragment>
                                  ) : (
                                    <React.Fragment key={i}>
                                      <td>-</td>
                                      <td>-</td>
                                    </React.Fragment>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="card">
                    <h2>Visual Comparison - Average Likert Scores</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                      {studentSummaries.map(student => (
                        <div key={student.id} className="report-student-card">
                          <h3>{student.name}</h3>
                          {[1, 2, 3].map(phaseNum => {
                            const phase = student.phases[phaseNum - 1];
                            const percentage = phase ? (phase.avgLikert / 5) * 100 : 0;
                            return (
                              <div key={phaseNum} style={{ marginBottom: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                  <span>Phase {phaseNum}</span>
                                  <span>{phase ? `${phase.avgLikert.toFixed(2)}/5` : '-'}</span>
                                </div>
                                <div className="report-progress-bg" style={{ height: '20px' }}>
                                  <div style={{
                                    background: percentage >= 80 ? '#27ae60' : percentage >= 60 ? '#f39c12' : '#e74c3c',
                                    width: `${percentage}%`,
                                    height: '100%',
                                    transition: 'width 0.3s'
                                  }} />
                                </div>
                              </div>
                            );
                          })}
                          <div className="report-muted-text" style={{ marginTop: '10px', fontSize: '0.9rem' }}>
                            Avg Score: {
                              student.phases.filter(p => p).length > 0
                                ? (student.phases.filter(p => p).reduce((sum, p) => sum + p.avgScore, 0) / student.phases.filter(p => p).length).toFixed(1)
                                : '-'
                            }/100
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card">
                    <h2>Detailed Criteria Breakdown by Phase</h2>
                    <p className="report-muted-text" style={{ marginBottom: '20px' }}>Compare individual criteria scores across all students for each phase.</p>

                    {[1, 2, 3].map(phaseNum => (
                      <div key={phaseNum} style={{ marginBottom: '40px' }}>
                        <h3 className="report-phase-header">
                          Phase {phaseNum}
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
                          {studentSummaries.map(student => {
                            const phase = student.phases[phaseNum - 1];
                            return (
                              <div key={student.id} className="report-student-card">
                                <h4>
                                  {student.name}
                                  {phase && <span> (Score: {phase.avgScore.toFixed(0)}/100)</span>}
                                </h4>
                                {!phase ? (
                                  <p className="report-empty-text">No evaluations yet</p>
                                ) : (
                                  Object.entries(phase.criteria).map(([key, value]) => {
                                    const percentage = (value / 5) * 100;
                                    return (
                                      <div key={key} style={{ marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontSize: '0.85rem' }}>
                                          <span>{criteriaLabels[key]}</span>
                                          <span style={{ fontWeight: '500' }}>{value.toFixed(2)}/5</span>
                                        </div>
                                        <div className="report-progress-bg" style={{ height: '16px', borderRadius: '3px' }}>
                                          <div style={{
                                            background: criteriaColors[key],
                                            width: `${percentage}%`,
                                            height: '100%',
                                            transition: 'width 0.3s'
                                          }} />
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="card">
                    <h2>All Comments by Phase</h2>
                    {[1, 2, 3].map(phaseNum => (
                      <div key={phaseNum} style={{ marginBottom: '30px' }}>
                        <h3 className="report-phase-header" style={{ marginBottom: '15px' }}>Phase {phaseNum}</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
                          {studentSummaries.map(student => {
                            const phase = student.phases[phaseNum - 1];
                            const comments = phase?.comments || [];
                            return (
                              <div key={student.id} className="report-student-card">
                                <h4 style={{ marginBottom: '10px' }}>
                                  {student.name}
                                  {phase && <span> ({phase.avgScore.toFixed(0)}/100)</span>}
                                </h4>
                                {comments.length === 0 ? (
                                  <p className="report-empty-text" style={{ margin: 0 }}>No comments</p>
                                ) : (
                                  comments.map((comment, idx) => (
                                    <div key={idx} className={idx < comments.length - 1 ? 'report-comment-border' : ''} style={{ marginBottom: '10px', paddingBottom: '10px' }}>
                                      <div className="report-muted-text" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>
                                        From: {comment.from}
                                      </div>
                                      <div style={{ fontSize: '0.9rem' }}>{comment.text}</div>
                                    </div>
                                  ))
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;

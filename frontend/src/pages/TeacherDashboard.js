import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ChangePasswordModal from '../components/ChangePasswordModal';

function TeacherDashboard() {
  const { user, logout, mustChangePassword } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Form states
  const [newClass, setNewClass] = useState({ name: '', section: '', semester: '' });
  const [newGroup, setNewGroup] = useState({ name: '' });
  const [activeTab, setActiveTab] = useState('students');

  const fetchClasses = useCallback(async () => {
    try {
      const res = await axios.get('/api/classes');
      setClasses(res.data);
      if (res.data.length > 0 && !selectedClass) {
        setSelectedClass(res.data[0].id);
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load classes' });
    } finally {
      setLoading(false);
    }
  }, [selectedClass]);

  const fetchClassData = useCallback(async () => {
    try {
      const [studentsRes, groupsRes] = await Promise.all([
        axios.get(`/api/classes/${selectedClass}/students`),
        axios.get(`/api/classes/${selectedClass}/groups`)
      ]);
      setStudents(studentsRes.data);
      setGroups(groupsRes.data);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load class data' });
    }
  }, [selectedClass]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  useEffect(() => {
    if (selectedClass) {
      fetchClassData();
    }
  }, [selectedClass, fetchClassData]);

  const handleCreateClass = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('/api/classes', newClass);
      setNewClass({ name: '', section: '', semester: '' });
      setMessage({ type: 'success', text: 'Class created successfully' });
      fetchClasses();
      setSelectedClass(res.data.id);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to create class' });
    }
  };

  const handleDeleteClass = async (id) => {
    if (!window.confirm('Are you sure? This will delete all students, groups, and evaluations in this class.')) return;
    try {
      await axios.delete(`/api/classes/${id}`);
      setMessage({ type: 'success', text: 'Class deleted' });
      if (selectedClass === id) {
        setSelectedClass(null);
      }
      fetchClasses();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to delete class' });
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/groups', { ...newGroup, class_id: selectedClass });
      setNewGroup({ name: '' });
      setMessage({ type: 'success', text: 'Group created successfully' });
      fetchClassData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to create group' });
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post(`/api/classes/${selectedClass}/upload-students`, formData);
      setMessage({
        type: 'success',
        text: `Uploaded: ${res.data.enrolled} enrolled, ${res.data.created} new users created`
      });
      fetchClassData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to upload' });
    }

    e.target.value = '';
  };

  const handleAddToGroup = async (userId, groupId) => {
    try {
      await axios.post(`/api/groups/${groupId}/members`, { userId });
      setMessage({ type: 'success', text: 'Student added to group' });
      fetchClassData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to add to group' });
    }
  };

  const handleResetPassword = async (userId, studentName) => {
    const newPassword = window.prompt(`Enter new password for ${studentName}:`);
    if (!newPassword) return;

    try {
      await axios.post(`/api/classes/${selectedClass}/students/${userId}/reset-password`, { password: newPassword });
      setMessage({ type: 'success', text: `Password reset for ${studentName}. They must change it on next login.` });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to reset password' });
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  const currentClass = classes.find(c => c.id === selectedClass);

  return (
    <div>
      {mustChangePassword && <ChangePasswordModal />}
      <div className="header">
        <h1>Teacher Dashboard</h1>
        <div className="header-right">
          <span>Welcome, {user?.name}</span>
          <button className="theme-toggle" onClick={toggleDarkMode}>
            {darkMode ? 'Light' : 'Dark'}
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

        <div className="admin-grid">
          {/* Create Class */}
          <div className="card">
            <h2>Create Class</h2>
            <form onSubmit={handleCreateClass}>
              <div className="form-group">
                <label>Class Name</label>
                <input
                  type="text"
                  value={newClass.name}
                  onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                  required
                  placeholder="e.g., Software Engineering"
                />
              </div>
              <div className="form-group">
                <label>Section (optional)</label>
                <input
                  type="text"
                  value={newClass.section}
                  onChange={(e) => setNewClass({ ...newClass, section: e.target.value })}
                  placeholder="e.g., 001"
                />
              </div>
              <div className="form-group">
                <label>Semester (optional)</label>
                <input
                  type="text"
                  value={newClass.semester}
                  onChange={(e) => setNewClass({ ...newClass, semester: e.target.value })}
                  placeholder="e.g., Fall 2024"
                />
              </div>
              <button type="submit" className="btn btn-primary">Create Class</button>
            </form>
          </div>

          {/* Class List */}
          <div className="card">
            <h2>Your Classes</h2>
            {classes.length === 0 ? (
              <p>No classes yet. Create one to get started.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Section</th>
                    <th>Students</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map(c => (
                    <tr key={c.id} style={{ background: selectedClass === c.id ? (darkMode ? '#1a3a6e' : '#e8f4fc') : 'transparent' }}>
                      <td>
                        <button
                          onClick={() => setSelectedClass(c.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: selectedClass === c.id ? 'bold' : 'normal' }}
                        >
                          {c.name}
                        </button>
                      </td>
                      <td>{c.section || '-'}</td>
                      <td>{c.student_count}</td>
                      <td>
                        <button className="btn btn-danger" onClick={() => handleDeleteClass(c.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {selectedClass && currentClass && (
          <>
            <div className="card">
              <h2>Managing: {currentClass.name} {currentClass.section && `(${currentClass.section})`}</h2>
              <div className="tabs">
                <button
                  className={`tab ${activeTab === 'students' ? 'active' : ''}`}
                  onClick={() => setActiveTab('students')}
                >
                  Students ({students.length})
                </button>
                <button
                  className={`tab ${activeTab === 'groups' ? 'active' : ''}`}
                  onClick={() => setActiveTab('groups')}
                >
                  Groups ({groups.length})
                </button>
                <button
                  className={`tab ${activeTab === 'reports' ? 'active' : ''}`}
                  onClick={() => setActiveTab('reports')}
                >
                  Reports
                </button>
              </div>
            </div>

            {activeTab === 'students' && (
              <div className="admin-grid">
                <div className="card">
                  <h2>Upload Students (CSV)</h2>
                  <p style={{ fontSize: '0.9rem', color: darkMode ? '#a0a0a0' : '#666' }}>
                    CSV columns: university_id, last_name, first_name, email, group_name
                  </p>
                  <p style={{ fontSize: '0.85rem', color: darkMode ? '#888' : '#999', marginTop: '4px' }}>
                    Lines can start/end with #. Password = university_id or auto-generated.
                  </p>
                  <label className="file-upload">
                    <input type="file" accept=".csv" onChange={handleFileUpload} />
                    <p>Click to upload CSV file</p>
                  </label>
                </div>

                <div className="card">
                  <h2>Students in Class</h2>
                  {students.length === 0 ? (
                    <p>No students enrolled yet.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Last Name</th>
                          <th>First Name</th>
                          <th>Email</th>
                          <th>Group</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map(student => {
                          const studentGroup = groups.find(g =>
                            g.members?.some(m => m.id === student.id)
                          );
                          const fullName = `${student.first_name} ${student.last_name}`;
                          return (
                            <tr key={student.id}>
                              <td>{student.last_name}</td>
                              <td>{student.first_name}</td>
                              <td>{student.email}</td>
                              <td>
                                <select
                                  value={studentGroup?.id || ''}
                                  onChange={(e) => {
                                    const newGroupId = e.target.value;
                                    if (newGroupId) {
                                      handleAddToGroup(student.id, newGroupId);
                                    }
                                  }}
                                >
                                  <option value="">Unassigned</option>
                                  {groups.map(g => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <button
                                  className="btn btn-secondary"
                                  style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                                  onClick={() => handleResetPassword(student.id, fullName)}
                                >
                                  Reset Password
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'groups' && (
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
                        placeholder="e.g., Team Alpha"
                      />
                    </div>
                    <button type="submit" className="btn btn-primary">Create Group</button>
                  </form>
                </div>

                <div className="card">
                  <h2>Groups</h2>
                  {groups.length === 0 ? (
                    <p>No groups created yet.</p>
                  ) : (
                    <div>
                      {groups.map(group => (
                        <div key={group.id} style={{ marginBottom: '20px', padding: '15px', background: darkMode ? '#16213e' : '#f8f9fa', borderRadius: '8px' }}>
                          <h3 style={{ margin: '0 0 10px 0' }}>{group.name}</h3>
                          <p style={{ fontSize: '0.9rem', color: darkMode ? '#a0a0a0' : '#666' }}>
                            {group.member_count || 0} members
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="card">
                <h2>Reports</h2>
                <p>Evaluation reports for this class will appear here.</p>
                {/* TODO: Add reports similar to AdminDashboard but scoped to this class */}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default TeacherDashboard;

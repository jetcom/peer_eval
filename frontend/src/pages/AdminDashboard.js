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
  const [, setGroups] = useState([]);
  const [classes, setClasses] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Form states
  const [newUser, setNewUser] = useState({ email: '', password: '', first_name: '', last_name: '', role: 'student' });
  const [newGroup, setNewGroup] = useState({ name: '' });
  const [newClass, setNewClass] = useState({ name: '', section: '', semester: '', teacher_id: '', num_phases: 3, has_final_evaluation: true });
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);
  const [reportGroup, setReportGroup] = useState('all');
  const [, setGroupsWithMembers] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [classGroups, setClassGroups] = useState([]);
  const [classStudents, setClassStudents] = useState([]);
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);
  const [showManageMembersModal, setShowManageMembersModal] = useState(false);
  const [showEditClassModal, setShowEditClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [showClassDropdown, setShowClassDropdown] = useState(false);
  const [finalCommentsData, setFinalCommentsData] = useState([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch class-specific data when selectedClass changes
  useEffect(() => {
    const fetchClassData = async () => {
      if (!selectedClass) {
        setClassGroups([]);
        setClassStudents([]);
        return;
      }
      try {
        const [groupsRes, studentsRes] = await Promise.all([
          axios.get(`/api/classes/${selectedClass}/groups`),
          axios.get(`/api/classes/${selectedClass}/students`)
        ]);
        setClassGroups(groupsRes.data);
        setClassStudents(studentsRes.data);
      } catch (err) {
        console.error('Failed to fetch class data:', err);
      }
    };
    fetchClassData();
  }, [selectedClass]);

  const fetchData = async () => {
    try {
      const [usersRes, groupsRes, evalsRes, groupsWithMembersRes, classesRes, finalCommentsRes] = await Promise.all([
        axios.get('/api/users'),
        axios.get('/api/groups'),
        axios.get('/api/evaluations/all'),
        axios.get('/api/groups/with-members'),
        axios.get('/api/classes'),
        axios.get('/api/evaluations/all-final-comments')
      ]);
      setUsers(usersRes.data);
      setGroups(groupsRes.data);
      setEvaluations(evalsRes.data);
      setGroupsWithMembers(groupsWithMembersRes.data);
      setClasses(classesRes.data);
      setFinalCommentsData(finalCommentsRes.data);
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
      setNewUser({ email: '', password: '', first_name: '', last_name: '', role: 'student' });
      setMessage({ type: 'success', text: 'User created successfully' });
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to create user' });
    }
  };

  const [uploadedCredentials, setUploadedCredentials] = useState([]);

  const handleUploadStudents = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!selectedClass) {
      setMessage({ type: 'error', text: 'Please select a class from the header first' });
      e.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post(`/api/classes/${selectedClass}/upload-students`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      let messageText = `Created ${res.data.created} new users, enrolled ${res.data.enrolled} total.`;
      if (res.data.errors.length > 0) {
        const errorDetails = res.data.errors.slice(0, 5).map(e =>
          `${e.email || 'unknown'}: ${e.error}`
        ).join('; ');
        const moreErrors = res.data.errors.length > 5 ? ` (and ${res.data.errors.length - 5} more)` : '';
        messageText += ` ${res.data.errors.length} errors: ${errorDetails}${moreErrors}`;
      }
      setMessage({
        type: res.data.errors.length > 0 && res.data.created === 0 && res.data.enrolled === 0 ? 'error' : 'success',
        text: messageText
      });
      // Store generated credentials to display (only for new users)
      if (res.data.credentials && res.data.credentials.length > 0) {
        setUploadedCredentials(res.data.credentials);
      } else {
        setUploadedCredentials([]);
      }
      // Log full errors to console for debugging
      if (res.data.errors.length > 0) {
        console.log('CSV Upload Errors:', res.data.errors);
      }
      fetchData();
      // Refresh class-specific data
      if (selectedClass) {
        const [groupsRes, studentsRes] = await Promise.all([
          axios.get(`/api/classes/${selectedClass}/groups`),
          axios.get(`/api/classes/${selectedClass}/students`)
        ]);
        setClassGroups(groupsRes.data);
        setClassStudents(studentsRes.data);
      }
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

  const handleResetPassword = async (userId, userName) => {
    const newPassword = window.prompt(`Enter new password for ${userName}:`);
    if (!newPassword) return;

    try {
      await axios.post(`/api/users/${userId}/reset-password`, { password: newPassword });
      setMessage({ type: 'success', text: `Password reset for ${userName}. They must change it on next login.` });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to reset password' });
    }
  };

  const handleAddToClass = async (userId, userName) => {
    if (!selectedClass) {
      setMessage({ type: 'error', text: 'Please select a class first' });
      return;
    }

    try {
      await axios.post(`/api/classes/${selectedClass}/students`, { user_id: userId });
      setMessage({ type: 'success', text: `${userName} added to class` });
      // Refresh class students
      const studentsRes = await axios.get(`/api/classes/${selectedClass}/students`);
      setClassStudents(studentsRes.data);
      // Clear search results after adding
      setUserSearchResults(userSearchResults.filter(u => u.id !== userId));
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to add to class' });
    }
  };

  const handleUserSearch = (query) => {
    setUserSearchQuery(query);
    if (query.length < 2) {
      setUserSearchResults([]);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const results = users.filter(u =>
      // Not already in the class
      !classStudents.some(s => s.id === u.id) &&
      // Match search query
      (u.email.toLowerCase().includes(lowerQuery) ||
       u.first_name.toLowerCase().includes(lowerQuery) ||
       u.last_name.toLowerCase().includes(lowerQuery) ||
       `${u.first_name} ${u.last_name}`.toLowerCase().includes(lowerQuery) ||
       `${u.last_name}, ${u.first_name}`.toLowerCase().includes(lowerQuery))
    ).slice(0, 10); // Limit to 10 results

    setUserSearchResults(results);
  };

  const handleRemoveFromClass = async (userId, userName) => {
    if (!window.confirm(`Remove ${userName} from this class?`)) return;

    try {
      await axios.delete(`/api/classes/${selectedClass}/students/${userId}`);
      setMessage({ type: 'success', text: `${userName} removed from class` });
      // Refresh class students
      const studentsRes = await axios.get(`/api/classes/${selectedClass}/students`);
      setClassStudents(studentsRes.data);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to remove from class' });
    }
  };

  const handleCreateClass = async (e) => {
    e.preventDefault();
    try {
      const classData = {
        name: newClass.name,
        section: newClass.section || null,
        semester: newClass.semester || null,
        num_phases: newClass.num_phases || 3,
        has_final_evaluation: newClass.has_final_evaluation ? 1 : 0
      };
      // If teacher_id is specified and not empty, include it
      if (newClass.teacher_id) {
        classData.teacher_id = parseInt(newClass.teacher_id);
      }
      const res = await axios.post('/api/classes', classData);
      setNewClass({ name: '', section: '', semester: '', teacher_id: '', num_phases: 3, has_final_evaluation: true });
      setMessage({ type: 'success', text: 'Class created successfully' });
      setShowCreateClassModal(false);
      fetchData();
      // Select the newly created class
      setSelectedClass(res.data.id.toString());
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to create class' });
    }
  };

  const handleEditClass = async (e) => {
    e.preventDefault();
    try {
      const classData = {
        name: editingClass.name,
        section: editingClass.section || null,
        semester: editingClass.semester || null,
        num_phases: editingClass.num_phases || 3,
        has_final_evaluation: editingClass.has_final_evaluation ? 1 : 0
      };
      await axios.put(`/api/classes/${editingClass.id}`, classData);
      setMessage({ type: 'success', text: 'Class updated successfully' });
      setShowEditClassModal(false);
      setEditingClass(null);
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to update class' });
    }
  };

  const openEditClassModal = (classItem) => {
    setEditingClass({
      ...classItem,
      has_final_evaluation: classItem.has_final_evaluation === 1 || classItem.has_final_evaluation === true
    });
    setShowEditClassModal(true);
  };

  // eslint-disable-next-line no-unused-vars
  const handleDeleteClass = async (id) => {
    if (!window.confirm('Are you sure? This will delete all students, groups, and evaluations in this class.')) return;
    try {
      await axios.delete(`/api/classes/${id}`);
      setMessage({ type: 'success', text: 'Class deleted' });
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to delete class' });
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!selectedClass) {
      setMessage({ type: 'error', text: 'Please select a class first' });
      return;
    }
    try {
      await axios.post('/api/groups', { ...newGroup, class_id: selectedClass });
      setNewGroup({ name: '' });
      setMessage({ type: 'success', text: 'Group created successfully' });
      fetchData();
      // Refresh class-specific data
      const groupsRes = await axios.get(`/api/classes/${selectedClass}/groups`);
      setClassGroups(groupsRes.data);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to create group' });
    }
  };


  // eslint-disable-next-line no-unused-vars
  const fetchGroupMembers = async (groupId) => {
    try {
      const res = await axios.get(`/api/groups/${groupId}`);
      setGroupMembers(res.data.members || []);
    } catch (err) {
      setGroupMembers([]);
    }
  };

  const handleSelectGroup = async (groupId) => {
    setSelectedGroup(groupId);
    // Get members from classGroups which already has the data
    const group = classGroups.find(g => g.id === groupId);
    setGroupMembers(group?.members || []);
    setShowManageMembersModal(true);
  };

  const handleAddMember = async (groupId, userId) => {
    try {
      await axios.post(`/api/groups/${groupId}/members`, { userId });
      setMessage({ type: 'success', text: 'Member added to group' });
      // Refresh class groups to get updated members
      const groupsRes = await axios.get(`/api/classes/${selectedClass}/groups`);
      setClassGroups(groupsRes.data);
      // Update groupMembers for the modal
      const updatedGroup = groupsRes.data.find(g => g.id === groupId);
      setGroupMembers(updatedGroup?.members || []);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to add member' });
    }
  };

  const handleRemoveMember = async (groupId, userId) => {
    try {
      await axios.delete(`/api/groups/${groupId}/members/${userId}`);
      setMessage({ type: 'success', text: 'Member removed from group' });
      // Refresh class groups to get updated members
      const groupsRes = await axios.get(`/api/classes/${selectedClass}/groups`);
      setClassGroups(groupsRes.data);
      // Update groupMembers for the modal
      const updatedGroup = groupsRes.data.find(g => g.id === groupId);
      setGroupMembers(updatedGroup?.members || []);
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
          <div style={{ position: 'relative', marginRight: '10px' }}>
            <button
              onClick={() => setShowClassDropdown(!showClassDropdown)}
              style={{
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid #ccc',
                background: darkMode ? '#2a3a5a' : '#fff',
                color: darkMode ? '#e0e0e0' : '#333',
                minWidth: '300px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>
                {selectedClass
                  ? classes.find(c => c.id.toString() === selectedClass)?.name +
                    (classes.find(c => c.id.toString() === selectedClass)?.section
                      ? ` (${classes.find(c => c.id.toString() === selectedClass)?.section})`
                      : '')
                  : '-- Select Class --'}
              </span>
              <span>▼</span>
            </button>
            {showClassDropdown && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: darkMode ? '#2a3a5a' : '#fff',
                border: '1px solid #ccc',
                borderRadius: '4px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                zIndex: 1001,
                maxHeight: '300px',
                overflowY: 'auto'
              }}>
                {classes.map(c => (
                  <div
                    key={c.id}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: selectedClass === c.id.toString() ? (darkMode ? '#3a4a6a' : '#e3f2fd') : 'transparent'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = darkMode ? '#3a4a6a' : '#f5f5f5'}
                    onMouseLeave={(e) => e.currentTarget.style.background = selectedClass === c.id.toString() ? (darkMode ? '#3a4a6a' : '#e3f2fd') : 'transparent'}
                  >
                    <span
                      onClick={() => {
                        setSelectedClass(c.id.toString());
                        setShowClassDropdown(false);
                      }}
                      style={{ flex: 1 }}
                    >
                      {c.name} {c.section ? `(${c.section})` : ''} {c.semester ? `- ${c.semester}` : ''}
                    </span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditClassModal(c);
                        setShowClassDropdown(false);
                      }}
                      style={{
                        cursor: 'pointer',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '0.9rem'
                      }}
                      title="Edit class settings"
                    >
                      ⚙️
                    </span>
                  </div>
                ))}
                <div
                  onClick={() => {
                    setShowCreateClassModal(true);
                    setShowClassDropdown(false);
                  }}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderTop: '1px solid #ccc',
                    color: '#3498db',
                    fontWeight: '500'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = darkMode ? '#3a4a6a' : '#f5f5f5'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  + Create New Class
                </div>
              </div>
            )}
          </div>
          <span>Welcome, {user?.first_name || user?.name}</span>
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

      {/* Create Class Modal */}
      {showCreateClassModal && (
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
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{ marginTop: 0, marginBottom: '20px' }}>Create New Class</h2>
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
              <div className="form-group">
                <label>Assign to Teacher (optional)</label>
                <select
                  value={newClass.teacher_id}
                  onChange={(e) => setNewClass({ ...newClass, teacher_id: e.target.value })}
                >
                  <option value="">Myself (Admin)</option>
                  {users.filter(u => u.role === 'teacher' || u.role === 'admin').map(u => (
                    <option key={u.id} value={u.id}>
                      {u.last_name}, {u.first_name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Number of Phases</label>
                <select
                  value={newClass.num_phases}
                  onChange={(e) => setNewClass({ ...newClass, num_phases: parseInt(e.target.value) })}
                >
                  <option value={1}>1 Phase</option>
                  <option value={2}>2 Phases</option>
                  <option value={3}>3 Phases</option>
                  <option value={4}>4 Phases</option>
                  <option value={5}>5 Phases</option>
                </select>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newClass.has_final_evaluation}
                    onChange={(e) => setNewClass({ ...newClass, has_final_evaluation: e.target.checked })}
                    style={{ width: '20px', height: '20px' }}
                  />
                  Include Final Evaluation (23-point distribution)
                </label>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary">Create Class</button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreateClassModal(false);
                    setNewClass({ name: '', section: '', semester: '', teacher_id: '', num_phases: 3, has_final_evaluation: true });
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Class Modal */}
      {showEditClassModal && editingClass && (
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
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{ marginTop: 0, marginBottom: '20px' }}>Edit Class</h2>
            <form onSubmit={handleEditClass}>
              <div className="form-group">
                <label>Class Name</label>
                <input
                  type="text"
                  value={editingClass.name}
                  onChange={(e) => setEditingClass({ ...editingClass, name: e.target.value })}
                  required
                  placeholder="e.g., Software Engineering"
                />
              </div>
              <div className="form-group">
                <label>Section (optional)</label>
                <input
                  type="text"
                  value={editingClass.section || ''}
                  onChange={(e) => setEditingClass({ ...editingClass, section: e.target.value })}
                  placeholder="e.g., 001"
                />
              </div>
              <div className="form-group">
                <label>Semester (optional)</label>
                <input
                  type="text"
                  value={editingClass.semester || ''}
                  onChange={(e) => setEditingClass({ ...editingClass, semester: e.target.value })}
                  placeholder="e.g., Fall 2024"
                />
              </div>
              <div className="form-group">
                <label>Number of Phases</label>
                <select
                  value={editingClass.num_phases || 3}
                  onChange={(e) => setEditingClass({ ...editingClass, num_phases: parseInt(e.target.value) })}
                >
                  <option value={1}>1 Phase</option>
                  <option value={2}>2 Phases</option>
                  <option value={3}>3 Phases</option>
                  <option value={4}>4 Phases</option>
                  <option value={5}>5 Phases</option>
                </select>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editingClass.has_final_evaluation}
                    onChange={(e) => setEditingClass({ ...editingClass, has_final_evaluation: e.target.checked })}
                    style={{ width: '20px', height: '20px' }}
                  />
                  Include Final Evaluation (23-point distribution)
                </label>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary">Save Changes</button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowEditClassModal(false);
                    setEditingClass(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
            {!selectedClass ? (
              <div className="card">
                <h2>Select a Class</h2>
                <p>Please select a class from the header dropdown to manage users.</p>
              </div>
            ) : (
              <>
                <div className="admin-grid">
                  <div className="card">
                    <h2>Add User to System</h2>
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
                      <input type="file" accept=".csv" onChange={handleUploadStudents} />
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
                    onChange={(e) => handleUserSearch(e.target.value)}
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
                                onClick={() => handleAddToClass(u.id, `${u.first_name} ${u.last_name}`)}
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
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classStudents.map(u => (
                          <tr key={u.id}>
                            <td>
                              {u.last_name}, {u.first_name}
                              {u.protected === 1 && <span style={{ marginLeft: '8px', color: '#7f8c8d', fontSize: '12px' }}>(protected)</span>}
                            </td>
                            <td>{u.email}</td>
                            <td>{u.role}</td>
                            <td>
                              <button
                                className="btn btn-secondary"
                                onClick={() => handleResetPassword(u.id, `${u.first_name} ${u.last_name}`)}
                                style={{ marginRight: '5px', fontSize: '0.8rem', padding: '4px 8px' }}
                              >
                                Reset Password
                              </button>
                              <button
                                className="btn btn-danger"
                                onClick={() => handleRemoveFromClass(u.id, `${u.first_name} ${u.last_name}`)}
                                style={{ marginRight: '5px', fontSize: '0.8rem', padding: '4px 8px' }}
                              >
                                Remove
                              </button>
                              <button
                                className="btn btn-danger"
                                onClick={() => handleDeleteUser(u.id)}
                                disabled={u.id === user?.id || u.protected === 1}
                                title={u.protected === 1 ? 'Cannot delete protected admin' : 'Delete user from system'}
                                style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {activeTab === 'groups' && (
          <>
            {!selectedClass ? (
              <div className="card">
                <h2>Select a Class</h2>
                <p>Please select a class from the header dropdown to manage groups.</p>
              </div>
            ) : (
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
                </div>

                <div className="card">
                  <h2>Groups in {classes.find(c => c.id === parseInt(selectedClass))?.name} ({classGroups.length})</h2>
                  {classGroups.length === 0 ? (
                    <p>No groups in this class yet.</p>
                  ) : (
                    <table>
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
                                onClick={() => handleSelectGroup(g.id)}
                                style={{ marginRight: '10px' }}
                              >
                                Manage Members
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
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* Manage Members Modal */}
        {showManageMembersModal && selectedGroup && (
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
                <h2 style={{ margin: 0 }}>Manage Group: {classGroups.find(g => g.id === selectedGroup)?.name}</h2>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowManageMembersModal(false);
                    setSelectedGroup(null);
                  }}
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
                            onClick={() => handleRemoveMember(selectedGroup, member.id)}
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
                    handleAddMember(selectedGroup, e.target.value);
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
        )}

        {activeTab === 'evaluations' && (
          <>
            {!selectedClass ? (
              <div className="card">
                <h2>Select a Class</h2>
                <p>Please select a class from the header dropdown to view evaluations.</p>
              </div>
            ) : (
              <div className="card">
                <h2>Evaluations for {classes.find(c => c.id === parseInt(selectedClass))?.name}</h2>
                {(() => {
                  // Filter evaluations to only show those from students in this class
                  const classStudentIds = new Set(classStudents.map(s => s.id));
                  const classEvaluations = evaluations.filter(e =>
                    classStudentIds.has(e.evaluator_id) || classStudentIds.has(e.evaluatee_id)
                  );

                  if (classEvaluations.length === 0) {
                    return <p>No evaluations submitted yet for this class.</p>;
                  }

                  return (
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
                        {classEvaluations.map(e => {
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
                  );
                })()}
              </div>
            )}
          </>
        )}

        {activeTab === 'reports' && (
          <>
            {!selectedClass ? (
              <div className="card">
                <h2>Select a Class</h2>
                <p>Please select a class from the header dropdown to view reports.</p>
              </div>
            ) : (
              <>
                <div className="card">
                  <h2>Filter by Group</h2>
                  <select
                    value={reportGroup}
                    onChange={(e) => setReportGroup(e.target.value)}
                    style={{ width: '100%', padding: '10px', fontSize: '1rem' }}
                  >
                    <option value="all">All Groups in Class</option>
                    {classGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>

                {(() => {
                  // Get students in selected group (filtered to class)
                  const getStudentsInGroup = () => {
                    if (reportGroup === 'all') return classStudents;

                    // Find students in the selected group
                    const groupId = parseInt(reportGroup);
                    const selectedGroupData = classGroups.find(g => g.id === groupId);
                    if (!selectedGroupData || !selectedGroupData.members) return [];

                    return selectedGroupData.members;
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

                // Get final comments and points for this student
                const studentFinalComments = finalCommentsData.filter(fc => fc.evaluatee_id === student.id);
                const totalFinalPoints = studentFinalComments.reduce((sum, fc) => sum + (fc.final_points || 0), 0);
                const finalCommentsList = studentFinalComments.map(fc => ({
                  from: fc.evaluator_name,
                  text: fc.comments,
                  points: fc.final_points || 0
                })).filter(c => c.text || c.points > 0);

                return { ...student, phases, totalFinalPoints, finalComments: finalCommentsList };
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
                              <th>Final Points</th>
                            </tr>
                          </thead>
                          <tbody>
                            {studentSummaries.map(student => (
                              <tr key={student.id}>
                                <td><strong>{student.last_name}, {student.first_name}</strong></td>
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
                                <td style={{ fontWeight: 'bold', color: '#9b59b6' }}>
                                  {student.totalFinalPoints || 0}
                                </td>
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
                          <h3>{student.last_name}, {student.first_name}</h3>
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
                                  {student.last_name}, {student.first_name}
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
                                  {student.last_name}, {student.first_name}
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

                  <div className="card">
                    <h2>Final Evaluation - Points & Comments</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
                      {studentSummaries.map(student => (
                        <div key={student.id} className="report-student-card">
                          <h4 style={{ marginBottom: '10px' }}>
                            {student.last_name}, {student.first_name}
                            <span style={{ color: '#9b59b6', marginLeft: '10px' }}>
                              Total: {student.totalFinalPoints || 0} pts
                            </span>
                          </h4>
                          {(!student.finalComments || student.finalComments.length === 0) ? (
                            <p className="report-empty-text" style={{ margin: 0 }}>No final evaluations</p>
                          ) : (
                            student.finalComments.map((comment, idx) => (
                              <div key={idx} className={idx < student.finalComments.length - 1 ? 'report-comment-border' : ''} style={{ marginBottom: '10px', paddingBottom: '10px' }}>
                                <div className="report-muted-text" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>
                                  From: {comment.from} - <strong>{comment.points} pts</strong>
                                </div>
                                {comment.text && <div style={{ fontSize: '0.9rem' }}>{comment.text}</div>}
                              </div>
                            ))
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;

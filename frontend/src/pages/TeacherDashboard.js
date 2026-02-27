import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ChangePasswordModal from '../components/ChangePasswordModal';
import ProgressTab from '../components/admin/ProgressTab';
import EvaluationsTab from '../components/admin/EvaluationsTab';
import ReportsTab from '../components/admin/ReportsTab';
import ManageExtensionsModal from '../components/admin/ManageExtensionsModal';
import ClassSettingsPanel from '../components/admin/ClassSettingsPanel';
import TemplatesTab from '../components/admin/TemplatesTab';
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
  const [evaluations, setEvaluations] = useState([]);
  const [finalCommentsData, setFinalCommentsData] = useState([]);
  const [assignmentEvaluations, setAssignmentEvaluations] = useState(null);

  // Form states
  const [newClass, setNewClass] = useState({ name: '', section: '', semester: '' });
  const [newGroup, setNewGroup] = useState({ name: '' });
  const [activeTab, setActiveTab] = useState('progress');
  const [editingClass, setEditingClass] = useState(null);
  const [topLevelView, setTopLevelView] = useState('classes'); // 'classes' or 'templates'
  const [sendEmailsOnUpload, setSendEmailsOnUpload] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState(new Set());
  const [reportGroup, setReportGroup] = useState('all');
  const [showExtensionsModal, setShowExtensionsModal] = useState(false);

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
      const [studentsRes, groupsRes, evalsRes, finalCommentsRes] = await Promise.all([
        axios.get(`/api/classes/${selectedClass}/students`),
        axios.get(`/api/classes/${selectedClass}/groups`),
        axios.get('/api/evaluations/all'),
        axios.get('/api/evaluations/all-final-comments')
      ]);
      setStudents(studentsRes.data);
      setGroups(groupsRes.data);
      setEvaluations(evalsRes.data);
      setFinalCommentsData(finalCommentsRes.data);

      // Check if this is an assignment-based class
      const currentClass = classes.find(c => c.id === selectedClass);
      if (currentClass?.evaluation_mode === 'assignments') {
        try {
          const assignmentEvalsRes = await axios.get(`/api/assignments/evaluations/admin/${selectedClass}`);
          setAssignmentEvaluations(assignmentEvalsRes.data);
        } catch (err) {
          console.error('Failed to fetch assignment evaluations:', err);
          setAssignmentEvaluations(null);
        }
      } else {
        setAssignmentEvaluations(null);
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load class data' });
    }
  }, [selectedClass, classes]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  useEffect(() => {
    if (selectedClass) {
      fetchClassData();
    }
    setSelectedStudents(new Set());
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

  const handleEditClass = async (classData) => {
    try {
      // Fetch full class details, instructors, and enrolled users
      const [classRes, instructorsRes, studentsRes] = await Promise.all([
        axios.get(`/api/classes/${classData.id}`),
        axios.get(`/api/classes/${classData.id}/instructors`),
        axios.get(`/api/classes/${classData.id}/students`)
      ]);

      // Filter enrolled users to only teachers/admins
      const enrolledTeachers = studentsRes.data.filter(u => u.role === 'teacher' || u.role === 'admin');

      // Fetch assignments if this is an assignment-based class
      let assignments = [];
      if (classRes.data.evaluation_mode === 'assignments') {
        try {
          const assignmentsRes = await axios.get(`/api/assignments/class/${classData.id}`);
          assignments = assignmentsRes.data;
        } catch (err) {
          console.error('Failed to fetch assignments:', err);
        }
      }

      setEditingClass({
        ...classRes.data,
        has_final_evaluation: classRes.data.has_final_evaluation === 1 || classRes.data.has_final_evaluation === true,
        allow_late: classRes.data.allow_late === 1 || classRes.data.allow_late === true,
        include_self_eval: classRes.data.include_self_eval === 1 || classRes.data.include_self_eval === true,
        show_groups: classRes.data.show_groups === 1 || classRes.data.show_groups === true,
        instructor_ids: instructorsRes.data.map(i => i.id),
        enrolledTeachers: enrolledTeachers,
        assignments: assignments
      });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load class settings' });
    }
  };

  const handleUpdateClass = async (e) => {
    if (e) e.preventDefault();
    try {
      const classData = {
        name: editingClass.name,
        section: editingClass.section || null,
        semester: editingClass.semester || null,
        evaluation_mode: editingClass.evaluation_mode || 'phases',
        num_phases: editingClass.num_phases || 3,
        has_final_evaluation: editingClass.has_final_evaluation ? 1 : 0,
        due_date_timezone: editingClass.due_date_timezone || null,
        instructor_ids: editingClass.instructor_ids || [],
        phase_due_dates: editingClass.phase_due_dates || {},
        min_comment_words: editingClass.min_comment_words || 0,
        allow_late: editingClass.allow_late ? 1 : 0,
        late_window_hours: editingClass.allow_late ? (editingClass.late_window_hours || 48) : 0,
        include_self_eval: editingClass.include_self_eval ? 1 : 0,
        show_groups: editingClass.show_groups ? 1 : 0,
        peer_template_id: editingClass.peer_template_id || null,
        audience_template_id: editingClass.audience_template_id || null,
        self_template_id: editingClass.self_template_id || null,
        paper_review_template_id: editingClass.paper_review_template_id || null
      };
      await axios.put(`/api/classes/${editingClass.id}`, classData);
      setMessage({ type: 'success', text: 'Class updated successfully' });
      setEditingClass(null);
      fetchClasses();
      if (selectedClass === editingClass.id) {
        fetchClassData();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to update class' });
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

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('send_emails', sendEmailsOnUpload);

    try {
      const res = await axios.post(`/api/classes/${selectedClass}/upload-students`, formData);
      const allFailed = res.data.errors?.length > 0 && res.data.created === 0 && res.data.enrolled === 0;
      let messageText = allFailed
        ? 'Upload failed — no students were enrolled.'
        : `Uploaded: ${res.data.enrolled} enrolled, ${res.data.created} new users created.`;
      if (res.data.group_changes > 0) {
        messageText += ` Updated ${res.data.group_changes} group assignment${res.data.group_changes !== 1 ? 's' : ''}.`;
      }
      if (res.data.emails_sent > 0) {
        messageText += ` Sent ${res.data.emails_sent} welcome email${res.data.emails_sent !== 1 ? 's' : ''}.`;
      }
      if (res.data.errors?.length > 0) {
        const errorDetails = res.data.errors.slice(0, 5).map(e =>
          `${e.email || 'unknown'}: ${e.error}`
        ).join('; ');
        const moreErrors = res.data.errors.length > 5 ? ` (and ${res.data.errors.length - 5} more)` : '';
        messageText += ` ${res.data.errors.length} error${res.data.errors.length !== 1 ? 's' : ''}: ${errorDetails}${moreErrors}`;
      }
      setMessage({ type: allFailed ? 'error' : 'success', text: messageText });
      fetchClassData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to upload' });
    }

    setUploading(false);
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

  const handleSendInvite = async (userId, studentName) => {
    try {
      await axios.post(`/api/classes/${selectedClass}/students/${userId}/send-invite`);
      setMessage({ type: 'success', text: `Enrollment email sent to ${studentName}.` });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to send invite' });
    }
  };

  const handleSendAllInvites = async () => {
    const studentCount = students.filter(s => s.role === 'student').length;
    if (!window.confirm(`Send enrollment/invite emails to all ${studentCount} students in this class?`)) return;
    try {
      const res = await axios.post(`/api/classes/${selectedClass}/students/send-invites`);
      setMessage({ type: 'success', text: res.data.message });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to send invites' });
    }
  };

  const handleBulkResetPasswords = async () => {
    const neverLoggedIn = students.filter(s => s.role === 'student' && s.must_change_password === 1);
    if (neverLoggedIn.length === 0) return;
    if (!window.confirm(`Reset passwords and send credential emails to ${neverLoggedIn.length} student${neverLoggedIn.length !== 1 ? 's' : ''} who have never logged in?`)) return;
    try {
      const res = await axios.post(`/api/classes/${selectedClass}/students/bulk-reset-passwords`);
      setMessage({ type: 'success', text: res.data.message });
      fetchClassData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to reset passwords' });
    }
  };

  const handleRemoveStudent = async (userId, studentName) => {
    if (!window.confirm(`Remove ${studentName} from this class? This will unenroll them but not delete their account.`)) return;
    try {
      await axios.delete(`/api/classes/${selectedClass}/students/${userId}`);
      setMessage({ type: 'success', text: `${studentName} removed from class.` });
      fetchClassData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to remove student' });
    }
  };

  const handleBulkRemove = async () => {
    if (selectedStudents.size === 0) return;
    if (!window.confirm(`Remove ${selectedStudents.size} student${selectedStudents.size !== 1 ? 's' : ''} from this class? This will unenroll them but not delete their accounts.`)) return;
    try {
      await axios.post(`/api/classes/${selectedClass}/students/bulk-remove`, { user_ids: [...selectedStudents] });
      setMessage({ type: 'success', text: `Removed ${selectedStudents.size} student${selectedStudents.size !== 1 ? 's' : ''} from class.` });
      setSelectedStudents(new Set());
      fetchClassData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to remove students' });
    }
  };

  const handleResetPassword = async (userId, studentName) => {
    if (!window.confirm(`Send a password reset email to ${studentName}?`)) return;

    try {
      await axios.post(`/api/classes/${selectedClass}/students/${userId}/reset-password`);
      setMessage({ type: 'success', text: `Password reset email sent to ${studentName}.` });
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
          <button className="btn btn-secondary" onClick={() => setShowHelp(true)}>
            Help
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            View as Student
          </button>
          <button className="btn btn-secondary" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="modal-overlay" onClick={() => setShowHelp(false)}>
          <div
            className={`modal ${darkMode ? 'dark' : ''}`}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '700px', maxHeight: '85vh', overflow: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Teacher Dashboard Help</h2>
              <button
                onClick={() => setShowHelp(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: darkMode ? '#fff' : '#000' }}
              >
                &times;
              </button>
            </div>

            <div style={{ lineHeight: '1.7' }}>
              <h3 style={{ color: '#3498db', marginTop: 0 }}>Getting Started</h3>
              <ol style={{ paddingLeft: '20px' }}>
                <li><strong>Create a class</strong> using the form on this page</li>
                <li><strong>Upload students</strong> via CSV (Students tab) or add them individually</li>
                <li><strong>Set up evaluation templates</strong> (Templates tab) to define your rubric criteria</li>
                <li><strong>Configure class settings</strong> (click Settings on your class) to assign templates and set due dates</li>
              </ol>

              <h3 style={{ color: '#3498db' }}>Inviting Students</h3>
              <ul style={{ paddingLeft: '20px' }}>
                <li><strong>Send All Invites:</strong> Go to the <strong>Students</strong> tab and click the <strong>"Send All Invites"</strong> button to email all enrolled students with login instructions</li>
                <li><strong>Individual invite:</strong> Click <strong>"Send Invite"</strong> next to any student's name</li>
                <li><strong>On CSV upload:</strong> Check the "Send notification emails" checkbox before uploading to automatically email new students</li>
              </ul>

              <h3 style={{ color: '#3498db' }}>Managing Assignments</h3>
              <ul style={{ paddingLeft: '20px' }}>
                <li><strong>Create assignments:</strong> Click <strong>Settings</strong> on your class, go to the <strong>Assignments</strong> tab, and add assignments with evaluation types and due dates</li>
                <li><strong>Delete assignments:</strong> In Settings &gt; Assignments, click the <strong>Delete</strong> button on any assignment</li>
                <li><strong>Assign rubric/template:</strong> When creating an assignment, each eval type has a <strong>template dropdown</strong> to select which rubric to use. You can also set a class-wide default in Settings &gt; Templates</li>
              </ul>

              <h3 style={{ color: '#3498db' }}>Managing Templates (Rubrics)</h3>
              <ul style={{ paddingLeft: '20px' }}>
                <li>Switch to the <strong>Templates</strong> view (top tab) to create, edit, or delete evaluation templates</li>
                <li>Templates define the criteria students use to evaluate each other</li>
                <li>System templates cannot be deleted but can be cloned and modified</li>
              </ul>

              <h3 style={{ color: '#3498db' }}>Tracking Progress</h3>
              <ul style={{ paddingLeft: '20px' }}>
                <li>The <strong>Progress</strong> tab shows which students have completed their evaluations</li>
                <li>Use the <strong>"Who Needs a Nudge?"</strong> section to select students and send reminder emails</li>
              </ul>

              <h3 style={{ color: '#3498db' }}>Other Actions</h3>
              <ul style={{ paddingLeft: '20px' }}>
                <li><strong>Reset student password:</strong> Click <strong>"Reset Password"</strong> next to their name in the Students tab</li>
                <li><strong>View as student:</strong> Click <strong>"View as Student"</strong> in the header, then select a student to see their dashboard</li>
              </ul>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button className="btn btn-primary" onClick={() => setShowHelp(false)}>Got it</button>
            </div>
          </div>
        </div>
      )}

      <div className="container">
        {message.text && (
          <div className={`message ${message.type}`}>{message.text}</div>
        )}

        {/* Top-level view toggle */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="tabs">
            <button
              className={`tab ${topLevelView === 'classes' ? 'active' : ''}`}
              onClick={() => setTopLevelView('classes')}
            >
              Classes
            </button>
            <button
              className={`tab ${topLevelView === 'templates' ? 'active' : ''}`}
              onClick={() => setTopLevelView('templates')}
            >
              Templates
            </button>
          </div>
        </div>

        {topLevelView === 'templates' ? (
          <TemplatesTab darkMode={darkMode} />
        ) : (
          <>
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
              <>
                {/* Desktop table view */}
                <table className="desktop-table">
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
                          <button className="btn btn-secondary btn-sm" style={{ marginRight: '0.5rem' }} onClick={() => handleEditClass(c)}>
                            Settings
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteClass(c.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile card view */}
                <div className="mobile-card-list">
                  {classes.map(c => (
                    <div
                      key={c.id}
                      className="mobile-card"
                      style={{
                        background: selectedClass === c.id ? (darkMode ? '#1a3a6e' : '#e8f4fc') : undefined,
                        borderColor: selectedClass === c.id ? '#3498db' : undefined
                      }}
                      onClick={() => setSelectedClass(c.id)}
                    >
                      <div className="mobile-card-header" style={{ fontWeight: selectedClass === c.id ? 'bold' : 'normal' }}>
                        {c.name}
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Section</span>
                        <span className="mobile-card-value">{c.section || '-'}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Students</span>
                        <span className="mobile-card-value">{c.student_count}</span>
                      </div>
                      <div className="mobile-card-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-secondary btn-sm" style={{ marginRight: '0.5rem' }} onClick={() => handleEditClass(c)}>
                          Settings
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteClass(c.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {selectedClass && currentClass && (
          <>
            <div className="card">
              <h2>Managing: {currentClass.name} {currentClass.section && `(${currentClass.section})`}</h2>
              <div className="tabs">
                <button
                  className={`tab ${activeTab === 'progress' ? 'active' : ''}`}
                  onClick={() => setActiveTab('progress')}
                >
                  Progress
                </button>
                <button
                  className={`tab ${activeTab === 'students' ? 'active' : ''}`}
                  onClick={() => setActiveTab('students')}
                >
                  Students ({students.length})
                </button>
                {!!currentClass?.show_groups && (
                  <button
                    className={`tab ${activeTab === 'groups' ? 'active' : ''}`}
                    onClick={() => setActiveTab('groups')}
                  >
                    Groups ({groups.length})
                  </button>
                )}
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
            </div>

            {activeTab === 'progress' && (
              <ProgressTab
                darkMode={darkMode}
                selectedClass={selectedClass?.toString()}
                classes={classes}
                classStudents={students}
                classGroups={groups}
                evaluations={evaluations}
                finalCommentsData={finalCommentsData}
                assignmentEvaluations={assignmentEvaluations}
              />
            )}

            {activeTab === 'students' && (
              <div className="admin-grid">
                <div className="card">
                  <h2>Upload Students (CSV)</h2>
                  <p style={{ fontSize: '0.9rem', color: darkMode ? '#a0a0a0' : '#666' }}>
                    CSV columns: university_id, last_name, first_name, email{currentClass?.show_groups ? ', group_name' : ''}
                  </p>
                  <p style={{ fontSize: '0.85rem', color: darkMode ? '#888' : '#999', marginTop: '4px' }}>
                    Lines can start/end with #. Password = university_id or auto-generated.
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '12px 0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={sendEmailsOnUpload}
                      onChange={(e) => setSendEmailsOnUpload(e.target.checked)}
                      style={{ width: 'auto' }}
                    />
                    <span style={{ fontSize: '0.9rem' }}>Send notification emails to uploaded students</span>
                  </label>
                  <label className="file-upload" style={uploading ? { opacity: 0.6, pointerEvents: 'none' } : {}}>
                    <input type="file" accept=".csv" onChange={handleFileUpload} disabled={uploading} />
                    <p>{uploading ? 'Uploading...' : 'Click to upload CSV file'}</p>
                  </label>
                </div>

                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>
                    <h2 style={{ margin: 0 }}>Students in Class</h2>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {students.filter(s => s.role === 'student' && s.must_change_password === 1).length > 0 && (
                        <button
                          className="btn btn-secondary"
                          onClick={handleBulkResetPasswords}
                          style={{ fontSize: '0.85rem', padding: '8px 16px' }}
                          title="Reset passwords and send credential emails to students who have never logged in"
                        >
                          Reset Unsent Passwords ({students.filter(s => s.role === 'student' && s.must_change_password === 1).length})
                        </button>
                      )}
                      {students.length > 0 && (
                        <button
                          className="btn btn-primary"
                          onClick={handleSendAllInvites}
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
                      {selectedStudents.size > 0 && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '8px 12px', marginBottom: '10px',
                          background: darkMode ? '#1a3a6e' : '#e8f4fc',
                          borderRadius: '6px', fontSize: '0.9rem'
                        }}>
                          <span>{selectedStudents.size} selected</span>
                          <button className="btn btn-danger btn-sm" onClick={handleBulkRemove}>
                            Remove Selected
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setSelectedStudents(new Set())}>
                            Clear
                          </button>
                        </div>
                      )}
                      {/* Desktop table view */}
                      <table className="desktop-table">
                        <thead>
                          <tr>
                            <th style={{ width: '30px' }}>
                              <input
                                type="checkbox"
                                checked={students.length > 0 && selectedStudents.size === students.length}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedStudents(new Set(students.map(s => s.id)));
                                  } else {
                                    setSelectedStudents(new Set());
                                  }
                                }}
                                style={{ width: 'auto' }}
                              />
                            </th>
                            <th>Last Name</th>
                            <th>First Name</th>
                            <th>Email</th>
                            {!!currentClass?.show_groups && <th>Group</th>}
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
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={selectedStudents.has(student.id)}
                                    onChange={(e) => {
                                      const next = new Set(selectedStudents);
                                      if (e.target.checked) next.add(student.id);
                                      else next.delete(student.id);
                                      setSelectedStudents(next);
                                    }}
                                    style={{ width: 'auto' }}
                                  />
                                </td>
                                <td>{student.last_name}</td>
                                <td>{student.first_name}</td>
                                <td>{student.email}</td>
                                {!!currentClass?.show_groups && (
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
                                )}
                                <td>
                                  <button
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.8rem', padding: '4px 8px', marginRight: '5px' }}
                                    onClick={() => handleSendInvite(student.id, fullName)}
                                    title="Send enrollment notification email"
                                  >
                                    Send Invite
                                  </button>
                                  <button
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.8rem', padding: '4px 8px', marginRight: '5px' }}
                                    onClick={() => handleResetPassword(student.id, fullName)}
                                  >
                                    Reset Password
                                  </button>
                                  <button
                                    className="btn btn-danger"
                                    style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                                    onClick={() => handleRemoveStudent(student.id, fullName)}
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Mobile card view */}
                      <div className="mobile-card-list">
                        {students.map(student => {
                          const studentGroup = groups.find(g =>
                            g.members?.some(m => m.id === student.id)
                          );
                          const fullName = `${student.first_name} ${student.last_name}`;
                          return (
                            <div key={student.id} className="mobile-card">
                              <div className="mobile-card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedStudents.has(student.id)}
                                  onChange={(e) => {
                                    const next = new Set(selectedStudents);
                                    if (e.target.checked) next.add(student.id);
                                    else next.delete(student.id);
                                    setSelectedStudents(next);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ width: 'auto' }}
                                />
                                {student.last_name}, {student.first_name}
                              </div>
                              <div className="mobile-card-row">
                                <span className="mobile-card-label">Email</span>
                                <span className="mobile-card-value" style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>
                                  {student.email}
                                </span>
                              </div>
                              {!!currentClass?.show_groups && (
                                <div className="mobile-card-row">
                                  <span className="mobile-card-label">Group</span>
                                  <select
                                    value={studentGroup?.id || ''}
                                    onChange={(e) => {
                                      const newGroupId = e.target.value;
                                      if (newGroupId) {
                                        handleAddToGroup(student.id, newGroupId);
                                      }
                                    }}
                                    style={{ flex: 1, maxWidth: '150px' }}
                                  >
                                    <option value="">Unassigned</option>
                                    {groups.map(g => (
                                      <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              <div className="mobile-card-actions">
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => handleSendInvite(student.id, fullName)}
                                  title="Send enrollment notification email"
                                >
                                  Send Invite
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => handleResetPassword(student.id, fullName)}
                                >
                                  Reset Password
                                </button>
                                <button
                                  className="btn btn-danger"
                                  onClick={() => handleRemoveStudent(student.id, fullName)}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {!!currentClass?.show_groups && activeTab === 'groups' && (
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

            {activeTab === 'evaluations' && (
              <EvaluationsTab
                selectedClass={selectedClass?.toString()}
                classes={classes}
                classStudents={students}
                classGroups={groups}
                evaluations={evaluations}
                assignmentEvaluations={assignmentEvaluations}
                onManageExtensions={() => setShowExtensionsModal(true)}
              />
            )}

            {activeTab === 'reports' && (
              <ReportsTab
                darkMode={darkMode}
                selectedClass={selectedClass?.toString()}
                classes={classes}
                classStudents={students}
                classGroups={groups}
                evaluations={evaluations}
                finalCommentsData={finalCommentsData}
                reportGroup={reportGroup}
                setReportGroup={setReportGroup}
                assignmentEvaluations={assignmentEvaluations}
              />
            )}
          </>
        )}

        {/* Class Settings Panel */}
        {editingClass && (
          <ClassSettingsPanel
            darkMode={darkMode}
            editingClass={editingClass}
            setEditingClass={setEditingClass}
            onSubmit={handleUpdateClass}
            onClose={() => setEditingClass(null)}
          />
        )}

        {showExtensionsModal && selectedClass && (
          <ManageExtensionsModal
            darkMode={darkMode}
            classId={selectedClass}
            classStudents={students}
            onClose={() => setShowExtensionsModal(false)}
            onSave={() => {
              setMessage({ type: 'success', text: 'Extensions saved successfully' });
            }}
          />
        )}
          </>
        )}
      </div>
    </div>
  );
}

export default TeacherDashboard;

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ChangePasswordModal from '../components/ChangePasswordModal';
import CreateClassModal from '../components/admin/CreateClassModal';
import ClassWizard from '../components/admin/ClassWizard';
import ClassSettingsPanel from '../components/admin/ClassSettingsPanel';
import ManageMembersModal from '../components/admin/ManageMembersModal';
import ManageExtensionsModal from '../components/admin/ManageExtensionsModal';
import UsersTab from '../components/admin/UsersTab';
import GroupsTab from '../components/admin/GroupsTab';
import EvaluationsTab from '../components/admin/EvaluationsTab';
import ReportsTab from '../components/admin/ReportsTab';
import ProgressTab from '../components/admin/ProgressTab';
import TemplatesTab from '../components/admin/TemplatesTab';
import NudgeTemplatesTab from '../components/admin/NudgeTemplatesTab';
import QuickStats from '../components/admin/QuickStats';
import ClassSelector from '../components/admin/ClassSelector';
import PendingInstructorsTab from '../components/admin/PendingInstructorsTab';
import CopyClassModal from '../components/admin/CopyClassModal';

function AdminDashboard() {
  const { user, logout, mustChangePassword } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('adminActiveTab') || 'progress';
  });
  const [users, setUsers] = useState([]);
  const [, setGroups] = useState([]);
  const [classes, setClasses] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Form states
  const [newUser, setNewUser] = useState({ email: '', password: '', first_name: '', last_name: '', role: 'student' });
  const [newGroup, setNewGroup] = useState({ name: '' });
  const [newClass, setNewClass] = useState({ name: '', section: '', semester: '', teacher_id: '', num_phases: 3, has_final_evaluation: true, instructor_ids: [], phase_due_dates: {}, min_comment_words: 0 });
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);
  const [reportGroup, setReportGroup] = useState('all');
  const [, setGroupsWithMembers] = useState([]);
  const [selectedClass, setSelectedClass] = useState(() => {
    return localStorage.getItem('adminSelectedClass') || '';
  });
  const [classGroups, setClassGroups] = useState([]);
  const [classStudents, setClassStudents] = useState([]);
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);
  const [showClassWizard, setShowClassWizard] = useState(false);
  const [showManageMembersModal, setShowManageMembersModal] = useState(false);
  const [showEditClassModal, setShowEditClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [showClassDropdown, setShowClassDropdown] = useState(false);
  const [showExtensionsModal, setShowExtensionsModal] = useState(false);
  const [showArchivedClasses, setShowArchivedClasses] = useState(false);
  const [archivedClasses, setArchivedClasses] = useState([]);
  const [finalCommentsData, setFinalCommentsData] = useState([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [assignmentEvaluations, setAssignmentEvaluations] = useState(null);
  const [uploadedCredentials, setUploadedCredentials] = useState([]);
  const [showCopyClassModal, setShowCopyClassModal] = useState(false);
  const [copyingClass, setCopyingClass] = useState(null);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save selectedClass to localStorage when it changes
  useEffect(() => {
    if (selectedClass) {
      localStorage.setItem('adminSelectedClass', selectedClass);
    } else {
      localStorage.removeItem('adminSelectedClass');
    }
  }, [selectedClass]);

  // Save activeTab to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('adminActiveTab', activeTab);
  }, [activeTab]);

  // Fetch class-specific data when selectedClass changes
  useEffect(() => {
    const fetchClassData = async () => {
      if (!selectedClass) {
        setClassGroups([]);
        setClassStudents([]);
        setAssignmentEvaluations(null);
        return;
      }
      try {
        const [groupsRes, studentsRes] = await Promise.all([
          axios.get(`/api/classes/${selectedClass}/groups`),
          axios.get(`/api/classes/${selectedClass}/students`)
        ]);
        setClassGroups(groupsRes.data);
        setClassStudents(studentsRes.data);

        // Check if this is an assignment-based class and fetch assignment evaluations
        const currentClass = classes.find(c => c.id.toString() === selectedClass);
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
        console.error('Failed to fetch class data:', err);
      }
    };
    fetchClassData();
  }, [selectedClass, classes]);

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

      // Validate stored selectedClass - if it doesn't exist in the classes list, clear it
      if (selectedClass) {
        const classExists = classesRes.data.some(c => c.id.toString() === selectedClass);
        if (!classExists) {
          setSelectedClass('');
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/users', newUser);
      const createdUser = response.data;

      // If a class is selected and the user is a student, also enroll them in the class
      if (selectedClass && newUser.role === 'student') {
        try {
          await axios.post(`/api/classes/${selectedClass}/students`, { user_id: createdUser.id });
          // Refresh class students
          const studentsRes = await axios.get(`/api/classes/${selectedClass}/students`);
          setClassStudents(studentsRes.data);
          setMessage({ type: 'success', text: `User created and added to class` });
        } catch (enrollErr) {
          // User created but enrollment failed
          setMessage({ type: 'success', text: 'User created (but failed to add to class)' });
        }
      } else {
        setMessage({ type: 'success', text: 'User created successfully' });
      }

      setNewUser({ email: '', password: '', first_name: '', last_name: '', role: 'student' });
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to create user' });
    }
  };

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
    if (!window.confirm(`Send a password reset email to ${userName}?`)) return;

    try {
      await axios.post(`/api/users/${userId}/reset-password`);
      setMessage({ type: 'success', text: `Password reset email sent to ${userName}.` });
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

  const fetchArchivedClasses = async () => {
    try {
      const res = await axios.get('/api/classes?include_archived=true');
      const archived = res.data.filter(c => c.archived === 1);
      setArchivedClasses(archived);
    } catch (err) {
      console.error('Failed to fetch archived classes:', err);
    }
  };

  const handleArchiveClass = async (classId) => {
    try {
      await axios.put(`/api/classes/${classId}/archive`, { archived: true });
      setMessage({ type: 'success', text: 'Class archived successfully' });
      setShowEditClassModal(false);
      setEditingClass(null);
      // If the archived class was selected, clear the selection
      if (selectedClass === classId.toString()) {
        setSelectedClass('');
      }
      fetchData();
      fetchArchivedClasses();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to archive class' });
    }
  };

  const handleRestoreClass = async (classId) => {
    try {
      await axios.put(`/api/classes/${classId}/archive`, { archived: false });
      setMessage({ type: 'success', text: 'Class restored successfully' });
      fetchData();
      fetchArchivedClasses();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to restore class' });
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
        has_final_evaluation: newClass.has_final_evaluation ? 1 : 0,
        due_date_timezone: newClass.due_date_timezone || null,
        instructor_ids: newClass.instructor_ids && newClass.instructor_ids.length > 0 ? newClass.instructor_ids : null,
        phase_due_dates: newClass.phase_due_dates || {},
        min_comment_words: newClass.min_comment_words || 0
      };
      // If teacher_id is specified and not empty, include it
      if (newClass.teacher_id) {
        classData.teacher_id = parseInt(newClass.teacher_id);
      }
      const res = await axios.post('/api/classes', classData);
      setNewClass({ name: '', section: '', semester: '', teacher_id: '', num_phases: 3, has_final_evaluation: true, instructor_ids: [], phase_due_dates: {}, min_comment_words: 0 });
      setMessage({ type: 'success', text: 'Class created successfully' });
      setShowCreateClassModal(false);
      fetchData();
      // Select the newly created class
      setSelectedClass(res.data.id.toString());
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to create class' });
    }
  };

  const handleCreateClassFromWizard = async (wizardData) => {
    // Transform wizard data to API format
    const classData = {
      name: wizardData.name,
      section: wizardData.section || null,
      semester: wizardData.semester || null,
      evaluation_mode: wizardData.evaluation_mode || 'phases',
      num_phases: wizardData.evaluation_mode === 'phases' ? (wizardData.num_phases || 3) : 0,
      has_final_evaluation: wizardData.evaluation_mode === 'phases' ? (wizardData.has_final_evaluation ? 1 : 0) : 0,
      due_date_timezone: wizardData.due_date_timezone || null,
      instructor_ids: wizardData.instructor_ids && wizardData.instructor_ids.length > 0 ? wizardData.instructor_ids : null,
      phase_due_dates: wizardData.phase_due_dates || {},
      min_comment_words: wizardData.min_comment_words || 0,
      allow_late: wizardData.allow_late ? 1 : 0,
      late_window_hours: wizardData.allow_late ? (wizardData.late_window_hours || 48) : 0,
      include_self_eval: wizardData.include_self_eval ? 1 : 0,
      peer_template_id: wizardData.peer_template_id || null,
      audience_template_id: wizardData.audience_template_id || null,
      self_template_id: wizardData.self_template_id || null,
      paper_review_template_id: wizardData.paper_review_template_id || null,
      assignments: wizardData.assignments || []
    };

    const res = await axios.post('/api/classes', classData);
    setMessage({ type: 'success', text: 'Class created successfully' });
    setShowClassWizard(false);
    fetchData();
    // Select the newly created class
    setSelectedClass(res.data.id.toString());
  };

  const handleEditClass = async (e) => {
    e.preventDefault();
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
        peer_template_id: editingClass.peer_template_id || null,
        audience_template_id: editingClass.audience_template_id || null,
        self_template_id: editingClass.self_template_id || null,
        paper_review_template_id: editingClass.paper_review_template_id || null
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

  const openEditClassModal = async (classItem) => {
    try {
      // Fetch full class details (including phase_due_dates), instructors, and enrolled users
      const [classRes, instructorsRes, studentsRes] = await Promise.all([
        axios.get(`/api/classes/${classItem.id}`),
        axios.get(`/api/classes/${classItem.id}/instructors`),
        axios.get(`/api/classes/${classItem.id}/students`)
      ]);

      // Filter enrolled users to only teachers/admins
      const enrolledTeachers = studentsRes.data.filter(u => u.role === 'teacher' || u.role === 'admin');

      // Fetch assignments if this is an assignment-based class
      let assignments = [];
      if (classRes.data.evaluation_mode === 'assignments') {
        try {
          const assignmentsRes = await axios.get(`/api/assignments/class/${classItem.id}`);
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
        instructor_ids: instructorsRes.data.map(i => i.id),
        enrolledTeachers: enrolledTeachers,
        assignments: assignments
      });
      setShowEditClassModal(true);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load class data' });
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

  const handleCopyClass = async (sourceClassId, formData) => {
    try {
      const res = await axios.post(`/api/classes/${sourceClassId}/copy`, formData);
      setMessage({ type: 'success', text: 'Class copied successfully!' });
      setShowCopyClassModal(false);
      setCopyingClass(null);
      fetchData();
      // Select the newly created class
      setSelectedClass(res.data.id.toString());
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to copy class' });
    }
  };

  const openCopyClassModal = (classData) => {
    setCopyingClass(classData);
    setShowCopyClassModal(true);
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

      {/* Modals */}
      {showCreateClassModal && (
        <CreateClassModal
          darkMode={darkMode}
          newClass={newClass}
          setNewClass={setNewClass}
          currentUser={user}
          onSubmit={handleCreateClass}
          onClose={() => {
            setShowCreateClassModal(false);
            setNewClass({ name: '', section: '', semester: '', teacher_id: '', num_phases: 3, has_final_evaluation: true, instructor_ids: [], phase_due_dates: {}, min_comment_words: 0 });
          }}
        />
      )}

      {showClassWizard && (
        <ClassWizard
          darkMode={darkMode}
          currentUser={user}
          onSubmit={handleCreateClassFromWizard}
          onClose={() => setShowClassWizard(false)}
        />
      )}

      {showEditClassModal && (
        <ClassSettingsPanel
          darkMode={darkMode}
          editingClass={editingClass}
          setEditingClass={setEditingClass}
          onSubmit={handleEditClass}
          onClose={() => {
            setShowEditClassModal(false);
            setEditingClass(null);
          }}
          onArchive={handleArchiveClass}
        />
      )}

      {showManageMembersModal && (
        <ManageMembersModal
          darkMode={darkMode}
          selectedGroup={selectedGroup}
          classGroups={classGroups}
          groupMembers={groupMembers}
          classStudents={classStudents}
          onClose={() => {
            setShowManageMembersModal(false);
            setSelectedGroup(null);
          }}
          onAddMember={handleAddMember}
          onRemoveMember={handleRemoveMember}
        />
      )}

      {showExtensionsModal && selectedClass && (
        <ManageExtensionsModal
          darkMode={darkMode}
          classId={selectedClass}
          classStudents={classStudents}
          onClose={() => setShowExtensionsModal(false)}
          onSave={() => {
            setMessage({ type: 'success', text: 'Extensions saved successfully' });
          }}
        />
      )}

      {showCopyClassModal && copyingClass && (
        <CopyClassModal
          darkMode={darkMode}
          sourceClass={copyingClass}
          onSubmit={handleCopyClass}
          onClose={() => {
            setShowCopyClassModal(false);
            setCopyingClass(null);
          }}
        />
      )}

      <div className="container">
        {message.text && (
          <div className={`message ${message.type}`}>{message.text}</div>
        )}

        {/* Class Selector */}
        <ClassSelector
          darkMode={darkMode}
          classes={classes}
          selectedClass={selectedClass}
          setSelectedClass={setSelectedClass}
          archivedClasses={archivedClasses}
          showArchivedClasses={showArchivedClasses}
          setShowArchivedClasses={setShowArchivedClasses}
          onFetchArchivedClasses={fetchArchivedClasses}
          onRestoreClass={handleRestoreClass}
          onEditClass={openEditClassModal}
          onCreateClass={() => setShowClassWizard(true)}
          onCopyClass={openCopyClassModal}
        />

        {/* Quick Stats Overview */}
        <QuickStats
          selectedClass={selectedClass}
          classes={classes}
          classStudents={classStudents}
          classGroups={classGroups}
          evaluations={evaluations}
          finalCommentsData={finalCommentsData}
          assignmentEvaluations={assignmentEvaluations}
          onNavigate={setActiveTab}
          currentUserRole={user?.role}
        />

        <div className="admin-tabs">
          <button
            className={`admin-tab ${activeTab === 'progress' ? 'active' : ''}`}
            onClick={() => setActiveTab('progress')}
          >
            Progress
          </button>
          <button
            className={`admin-tab ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            Reports
          </button>
          <button
            className={`admin-tab ${activeTab === 'evaluations' ? 'active' : ''}`}
            onClick={() => setActiveTab('evaluations')}
          >
            Evaluations
          </button>
          <button
            className={`admin-tab ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => setActiveTab('groups')}
          >
            Groups
          </button>
          <button
            className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            Users
          </button>
          <button
            className={`admin-tab ${activeTab === 'templates' ? 'active' : ''}`}
            onClick={() => setActiveTab('templates')}
          >
            Templates
          </button>
          <button
            className={`admin-tab ${activeTab === 'email' ? 'active' : ''}`}
            onClick={() => setActiveTab('email')}
          >
            Email
          </button>
          {user?.role === 'admin' && (
            <button
              className={`admin-tab ${activeTab === 'instructors' ? 'active' : ''}`}
              onClick={() => setActiveTab('instructors')}
            >
              Instructors
            </button>
          )}
        </div>

        {activeTab === 'users' && (
          <UsersTab
            darkMode={darkMode}
            selectedClass={selectedClass}
            classes={classes}
            users={users}
            classStudents={classStudents}
            classGroups={classGroups}
            newUser={newUser}
            setNewUser={setNewUser}
            uploadedCredentials={uploadedCredentials}
            setUploadedCredentials={setUploadedCredentials}
            userSearchQuery={userSearchQuery}
            setUserSearchQuery={setUserSearchQuery}
            userSearchResults={userSearchResults}
            onCreateUser={handleCreateUser}
            onUploadStudents={handleUploadStudents}
            onUserSearch={handleUserSearch}
            onAddToClass={handleAddToClass}
            onResetPassword={handleResetPassword}
            onRemoveFromClass={handleRemoveFromClass}
            onDeleteUser={handleDeleteUser}
            onViewGroup={handleSelectGroup}
            currentUser={user}
          />
        )}

        {activeTab === 'groups' && (
          <GroupsTab
            selectedClass={selectedClass}
            classes={classes}
            classGroups={classGroups}
            newGroup={newGroup}
            setNewGroup={setNewGroup}
            onCreateGroup={handleCreateGroup}
            onSelectGroup={handleSelectGroup}
            onDeleteGroup={handleDeleteGroup}
          />
        )}

        {activeTab === 'evaluations' && (
          <EvaluationsTab
            selectedClass={selectedClass}
            classes={classes}
            classStudents={classStudents}
            classGroups={classGroups}
            evaluations={evaluations}
            assignmentEvaluations={assignmentEvaluations}
            onManageExtensions={() => setShowExtensionsModal(true)}
          />
        )}

        {activeTab === 'progress' && (
          <ProgressTab
            darkMode={darkMode}
            selectedClass={selectedClass}
            classes={classes}
            classStudents={classStudents}
            classGroups={classGroups}
            evaluations={evaluations}
            finalCommentsData={finalCommentsData}
            assignmentEvaluations={assignmentEvaluations}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsTab
            darkMode={darkMode}
            selectedClass={selectedClass}
            classes={classes}
            classStudents={classStudents}
            classGroups={classGroups}
            evaluations={evaluations}
            finalCommentsData={finalCommentsData}
            reportGroup={reportGroup}
            setReportGroup={setReportGroup}
            assignmentEvaluations={assignmentEvaluations}
          />
        )}

        {activeTab === 'templates' && (
          <TemplatesTab
            darkMode={darkMode}
          />
        )}

        {activeTab === 'email' && (
          <NudgeTemplatesTab
            darkMode={darkMode}
          />
        )}

        {activeTab === 'instructors' && user?.role === 'admin' && (
          <PendingInstructorsTab
            darkMode={darkMode}
            onRefreshUsers={fetchData}
          />
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;

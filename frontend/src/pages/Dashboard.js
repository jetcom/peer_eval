import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ChangePasswordModal from '../components/ChangePasswordModal';
import CustomDropdown from '../components/CustomDropdown';

function Dashboard() {
  const { user, logout, mustChangePassword } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(() => {
    const stored = localStorage.getItem('studentSelectedClass');
    return stored ? parseInt(stored) : null;
  });
  const [group, setGroup] = useState(null);
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Masquerade feature for admins/teachers
  const [classStudents, setClassStudents] = useState([]);
  const [masqueradeUser, setMasqueradeUser] = useState(null);
  const [finalComments, setFinalComments] = useState([]);
  const isTeacherOrAdmin = user?.role === 'teacher' || user?.role === 'admin';

  useEffect(() => {
    fetchClasses();
  }, []);

  // Save selectedClass to localStorage when it changes
  useEffect(() => {
    if (selectedClass) {
      localStorage.setItem('studentSelectedClass', selectedClass.toString());
    } else {
      localStorage.removeItem('studentSelectedClass');
    }
  }, [selectedClass]);

  const fetchClassData = useCallback(async () => {
    setLoading(true);
    setError('');
    setGroup(null);

    // Fetch students for masquerade dropdown if admin/teacher
    if (isTeacherOrAdmin && selectedClass) {
      try {
        const studentsRes = await axios.get(`/api/classes/${selectedClass}/students`);
        setClassStudents(studentsRes.data);
      } catch (err) {
        setClassStudents([]);
      }
    }

    // If admin/teacher and no masquerade user selected, just show the student picker
    if (isTeacherOrAdmin && !masqueradeUser) {
      setLoading(false);
      return;
    }

    try {
      // Use masquerade user ID if set, otherwise use own ID
      const userIdParam = isTeacherOrAdmin && masqueradeUser ? `&user_id=${masqueradeUser}` : '';

      const [groupRes, evalRes, finalCommentsRes] = await Promise.all([
        axios.get(`/api/groups/my/group?class_id=${selectedClass}${userIdParam}`),
        axios.get(`/api/evaluations/my-evaluations?class_id=${selectedClass}${userIdParam}`),
        axios.get(`/api/evaluations/my-final-comments?${userIdParam.substring(1)}`)
      ]);
      setGroup(groupRes.data);
      setEvaluations(evalRes.data);
      setFinalComments(finalCommentsRes.data);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('This student is not assigned to any group in this class yet.');
      } else {
        setError('Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedClass, masqueradeUser, isTeacherOrAdmin]);

  useEffect(() => {
    if (selectedClass) {
      fetchClassData();
    }
  }, [selectedClass, fetchClassData]);

  // Reset masquerade when class changes
  useEffect(() => {
    setMasqueradeUser(null);
  }, [selectedClass]);

  const fetchClasses = async () => {
    try {
      const res = await axios.get('/api/classes/my/enrolled');
      setClasses(res.data);
      if (res.data.length > 0) {
        // Check if stored selectedClass exists in the available classes
        if (selectedClass) {
          const classExists = res.data.some(c => c.id === selectedClass);
          if (!classExists) {
            // Stored class doesn't exist, select first class
            setSelectedClass(res.data[0].id);
          }
          // else: stored class is valid, keep it
        } else {
          // No stored class, select first class
          setSelectedClass(res.data[0].id);
        }
      } else {
        setLoading(false);
      }
    } catch (err) {
      setError('Failed to load classes');
      setLoading(false);
    }
  };

  const getPhaseStatus = (phase) => {
    if (!group) return 'not-started';
    const memberCount = group.members.length;

    // Phase 4 is Final Evaluation - check finalComments
    if (phase === 4) {
      if (finalComments.length === memberCount) return 'completed';
      if (finalComments.length > 0) return 'in-progress';
      return 'not-started';
    }

    const phaseEvals = evaluations.filter(e => e.phase === phase);
    if (phaseEvals.length === memberCount) return 'completed';
    if (phaseEvals.length > 0) return 'in-progress';
    return 'not-started';
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentClass = classes.find(c => c.id === selectedClass);

  if (loading && classes.length === 0) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div>
      {mustChangePassword && <ChangePasswordModal />}
      <div className="header">
        <h1>Peer Evaluation</h1>
        <div className="header-right">
          {classes.length > 0 && (
            <CustomDropdown
              value={selectedClass}
              onChange={(value) => setSelectedClass(value)}
              options={classes.map(c => ({
                value: c.id,
                label: `${c.name}${c.section ? ` (${c.section})` : ''}${c.semester ? ` - ${c.semester}` : ''}`
              }))}
              darkMode={darkMode}
              style={{ marginRight: '10px' }}
            />
          )}
          <span>Welcome, {user?.first_name || user?.name}</span>
          <button className="theme-toggle" onClick={toggleDarkMode}>
            {darkMode ? 'Light' : 'Dark'}
          </button>
          {user?.role === 'admin' && (
            <button className="btn btn-secondary" onClick={() => navigate('/admin')}>
              Admin Panel
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="container">
        {classes.length === 0 ? (
          <div className="card">
            <h2>No Classes</h2>
            <p>You are not enrolled in any classes yet. Please contact your instructor.</p>
          </div>
        ) : (
          <>
            {currentClass && (
              <div className="card">
                <h2>{currentClass.name} {currentClass.section && `(${currentClass.section})`}</h2>
                {currentClass.semester && <p style={{ color: darkMode ? '#a0a0a0' : '#666', marginBottom: '5px' }}>{currentClass.semester}</p>}
                <p style={{ color: darkMode ? '#a0a0a0' : '#666' }}>
                  {currentClass.instructors && currentClass.instructors.length > 0 ? (
                    <>
                      {currentClass.instructors.length === 1 ? 'Instructor: ' : 'Instructors: '}
                      {currentClass.instructors.map((instructor, idx) => (
                        <span key={instructor.id}>
                          {instructor.first_name} {instructor.last_name}
                          {idx < currentClass.instructors.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </>
                  ) : (
                    <>Instructor: {currentClass.teacher_name}</>
                  )}
                  {currentClass.due_date && (
                    <>
                      <br />
                      <span style={{ color: darkMode ? '#f39c12' : '#d68910', fontWeight: '500' }}>
                        Peer Evaluation Due: {new Date(currentClass.due_date).toLocaleString('en-US', {
                          timeZone: currentClass.due_date_timezone || 'America/New_York',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })} ({currentClass.due_date_timezone || 'ET'})
                      </span>
                    </>
                  )}
                </p>
              </div>
            )}

            {/* Masquerade selector for admins/teachers */}
            {isTeacherOrAdmin && selectedClass && (
              <div className="card" style={{ background: darkMode ? '#2a4a6a' : '#fff3cd', borderLeft: '4px solid #f39c12' }}>
                <h2 style={{ marginBottom: '10px' }}>👁️ View as Student</h2>
                <p style={{ marginBottom: '15px', color: darkMode ? '#e0e0e0' : '#666' }}>
                  Select a student to view their dashboard experience.
                </p>
                <CustomDropdown
                  value={masqueradeUser || ''}
                  onChange={(value) => setMasqueradeUser(value ? value : null)}
                  options={[
                    { value: '', label: '-- Select a student --' },
                    ...classStudents.map(s => ({
                      value: s.id,
                      label: `${s.last_name}, ${s.first_name} (${s.email})`
                    }))
                  ]}
                  darkMode={darkMode}
                  style={{ width: '100%' }}
                />
                {masqueradeUser && (
                  <p style={{ marginTop: '10px', fontWeight: 'bold', color: darkMode ? '#f39c12' : '#856404' }}>
                    Viewing as: {classStudents.find(s => s.id === masqueradeUser)?.first_name} {classStudents.find(s => s.id === masqueradeUser)?.last_name}
                  </p>
                )}
              </div>
            )}

            {loading ? (
              <div className="loading">Loading class data...</div>
            ) : error ? (
              <div className="message error">{error}</div>
            ) : group && (
              <>
                <div className="card">
                  <h2>Your Group: {group.name}</h2>
                  <p>Members:</p>
                  <ul>
                    {group.members.map(member => (
                      <li key={member.id}>
                        {member.last_name}, {member.first_name} {member.id === (masqueradeUser || user?.id) && '(You)'}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="card">
                  <h2>Evaluation Phases</h2>
                  <p>Click on a phase to submit or update your peer evaluations.</p>

                  <div className="phase-tabs">
                    {Array.from({ length: currentClass?.num_phases || 3 }, (_, i) => i + 1).map(phase => {
                      const status = getPhaseStatus(phase);
                      return (
                        <button
                          key={phase}
                          className={`phase-tab ${status === 'completed' ? 'completed' : ''}`}
                          onClick={() => navigate(`/evaluate/${phase}?class_id=${selectedClass}${masqueradeUser ? `&user_id=${masqueradeUser}` : ''}`)}
                        >
                          Phase {phase}
                          {status === 'completed' && ' ✓'}
                          {status === 'in-progress' && ' (In Progress)'}
                        </button>
                      );
                    })}
                    {(currentClass?.has_final_evaluation === 1 || currentClass?.has_final_evaluation === true || currentClass?.has_final_evaluation === undefined) && (
                      <button
                        className={`phase-tab final-eval ${getPhaseStatus(4) === 'completed' ? 'completed' : ''}`}
                        onClick={() => navigate(`/evaluate/final?class_id=${selectedClass}${masqueradeUser ? `&user_id=${masqueradeUser}` : ''}`)}
                      >
                        Final Evaluation
                        {getPhaseStatus(4) === 'completed' && ' ✓'}
                        {getPhaseStatus(4) === 'in-progress' && ' (In Progress)'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="card">
                  <h2>Evaluation Progress</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>Team Member</th>
                        {Array.from({ length: currentClass?.num_phases || 3 }, (_, i) => i + 1).map(phase => (
                          <th key={phase}>Phase {phase}</th>
                        ))}
                        {(currentClass?.has_final_evaluation === 1 || currentClass?.has_final_evaluation === true || currentClass?.has_final_evaluation === undefined) && (
                          <th>Final</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {group.members.map(member => (
                        <tr key={member.id}>
                          <td>{member.last_name}, {member.first_name} {member.id === (masqueradeUser || user?.id) && '(You)'}</td>
                          {Array.from({ length: currentClass?.num_phases || 3 }, (_, i) => i + 1).map(phase => {
                            const hasEval = evaluations.some(
                              e => e.evaluatee_id === member.id && e.phase === phase
                            );
                            return (
                              <td key={phase}>
                                {hasEval ? (
                                  <span style={{ color: '#27ae60' }}>✓ Complete</span>
                                ) : (
                                  <span style={{ color: '#95a5a6' }}>Pending</span>
                                )}
                              </td>
                            );
                          })}
                          {(currentClass?.has_final_evaluation === 1 || currentClass?.has_final_evaluation === true || currentClass?.has_final_evaluation === undefined) && (
                            <td>
                              {finalComments.some(fc => fc.evaluatee_id === member.id) ? (
                                <span style={{ color: '#27ae60' }}>✓ Complete</span>
                              ) : (
                                <span style={{ color: '#95a5a6' }}>Pending</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default Dashboard;

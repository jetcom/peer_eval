import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ChangePasswordModal from '../components/ChangePasswordModal';

function Dashboard() {
  const { user, logout, mustChangePassword } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [group, setGroup] = useState(null);
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClassData = useCallback(async () => {
    setLoading(true);
    setError('');
    setGroup(null);
    try {
      const [groupRes, evalRes] = await Promise.all([
        axios.get(`/api/groups/my/group?class_id=${selectedClass}`),
        axios.get('/api/evaluations/my-evaluations')
      ]);
      setGroup(groupRes.data);
      setEvaluations(evalRes.data);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('You are not assigned to any group in this class yet. Please contact your instructor.');
      } else {
        setError('Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedClass]);

  useEffect(() => {
    if (selectedClass) {
      fetchClassData();
    }
  }, [selectedClass, fetchClassData]);

  const fetchClasses = async () => {
    try {
      const res = await axios.get('/api/classes/my/enrolled');
      setClasses(res.data);
      if (res.data.length > 0) {
        setSelectedClass(res.data[0].id);
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
          <span>Welcome, {user?.name}</span>
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
            {classes.length > 1 && (
              <div className="card">
                <h2>Select Class</h2>
                <select
                  value={selectedClass || ''}
                  onChange={(e) => setSelectedClass(parseInt(e.target.value))}
                  style={{ width: '100%', padding: '10px', fontSize: '1rem' }}
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.section && `(${c.section})`} - {c.teacher_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {currentClass && classes.length === 1 && (
              <div className="card">
                <h2>{currentClass.name} {currentClass.section && `(${currentClass.section})`}</h2>
                <p style={{ color: darkMode ? '#a0a0a0' : '#666' }}>Instructor: {currentClass.teacher_name}</p>
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
                        {member.last_name}, {member.first_name} {member.id === user?.id && '(You)'}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="card">
                  <h2>Evaluation Phases</h2>
                  <p>Click on a phase to submit or update your peer evaluations.</p>

                  <div className="phase-tabs">
                    {[1, 2, 3].map(phase => {
                      const status = getPhaseStatus(phase);
                      return (
                        <button
                          key={phase}
                          className={`phase-tab ${status === 'completed' ? 'completed' : ''}`}
                          onClick={() => navigate(`/evaluate/${phase}?class_id=${selectedClass}`)}
                        >
                          Phase {phase}
                          {status === 'completed' && ' ✓'}
                          {status === 'in-progress' && ' (In Progress)'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="card">
                  <h2>Evaluation Progress</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>Team Member</th>
                        <th>Phase 1</th>
                        <th>Phase 2</th>
                        <th>Phase 3</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.members.map(member => (
                        <tr key={member.id}>
                          <td>{member.last_name}, {member.first_name} {member.id === user?.id && '(You)'}</td>
                          {[1, 2, 3].map(phase => {
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

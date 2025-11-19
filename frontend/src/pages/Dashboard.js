import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ChangePasswordModal from '../components/ChangePasswordModal';

function Dashboard() {
  const { user, logout, mustChangePassword } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [groupRes, evalRes] = await Promise.all([
        axios.get('/api/groups/my/group'),
        axios.get('/api/evaluations/my-evaluations')
      ]);
      setGroup(groupRes.data);
      setEvaluations(evalRes.data);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('You are not assigned to any group yet. Please contact your instructor.');
      } else {
        setError('Failed to load data');
      }
    } finally {
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

  if (loading) {
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
        {error && (
          <div className="message error">{error}</div>
        )}

        {group && (
          <>
            <div className="card">
              <h2>Your Group: {group.name}</h2>
              <p>Members:</p>
              <ul>
                {group.members.map(member => (
                  <li key={member.id}>
                    {member.name} {member.id === user?.id && '(You)'}
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
                      onClick={() => navigate(`/evaluate/${phase}`)}
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
                      <td>{member.name} {member.id === user?.id && '(You)'}</td>
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
      </div>
    </div>
  );
}

export default Dashboard;

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

const CRITERIA = [
  { key: 'contribution', label: 'Contribution', description: 'Level of contribution to the project' },
  { key: 'communication', label: 'Communication', description: 'Quality and frequency of communication' },
  { key: 'reliability', label: 'Reliability', description: 'Dependability and meeting deadlines' },
  { key: 'quality_of_work', label: 'Quality of Work', description: 'Quality and thoroughness of work produced' },
  { key: 'collaboration', label: 'Collaboration', description: 'Ability to work well with others' }
];

const LIKERT_OPTIONS = [
  { value: 1, label: 'Strongly Disagree' },
  { value: 2, label: 'Disagree' },
  { value: 3, label: 'Neutral' },
  { value: 4, label: 'Agree' },
  { value: 5, label: 'Strongly Agree' }
];

function Evaluation() {
  const { phase } = useParams();
  const [searchParams] = useSearchParams();
  const classId = searchParams.get('class_id');
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const [group, setGroup] = useState(null);
  const [evaluations, setEvaluations] = useState({});
  const [finalComments, setFinalComments] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const groupUrl = classId
          ? `/api/groups/my/group?class_id=${classId}`
          : '/api/groups/my/group';
        const [groupRes, evalRes, finalCommentsRes] = await Promise.all([
          axios.get(groupUrl),
          axios.get('/api/evaluations/my-evaluations'),
          axios.get('/api/evaluations/my-final-comments')
        ]);

        setGroup(groupRes.data);

        // Initialize evaluations state from existing data
        const evalMap = {};
        const phaseEvals = evalRes.data.filter(e => e.phase === parseInt(phase));

        groupRes.data.members.forEach(member => {
          const existing = phaseEvals.find(e => e.evaluatee_id === member.id);
          evalMap[member.id] = existing || {
            contribution: 3,
            communication: 3,
            reliability: 3,
            quality_of_work: 3,
            collaboration: 3,
            score: 80,
            comments: ''
          };
        });
        setEvaluations(evalMap);

        // Initialize final comments if phase 3
        if (parseInt(phase) === 3) {
          const fcMap = {};
          groupRes.data.members.forEach(member => {
            const existing = finalCommentsRes.data.find(fc => fc.evaluatee_id === member.id);
            fcMap[member.id] = existing?.comments || '';
          });
          setFinalComments(fcMap);
        }
      } catch (err) {
        setMessage({ type: 'error', text: 'Failed to load data' });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [phase, classId]);

  const handleCriteriaChange = (memberId, criterion, value) => {
    setEvaluations(prev => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        [criterion]: parseInt(value)
      }
    }));
  };

  const handleScoreChange = (memberId, value) => {
    const score = Math.min(100, Math.max(0, parseInt(value) || 0));
    setEvaluations(prev => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        score
      }
    }));
  };

  const handleCommentsChange = (memberId, value) => {
    setEvaluations(prev => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        comments: value
      }
    }));
  };

  const handleFinalCommentsChange = (memberId, value) => {
    setFinalComments(prev => ({
      ...prev,
      [memberId]: value
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      // Save evaluations for each member
      const promises = group.members.map(member =>
        axios.post('/api/evaluations', {
          evaluatee_id: member.id,
          phase: parseInt(phase),
          ...evaluations[member.id]
        })
      );

      // Save final comments if phase 3
      if (parseInt(phase) === 3) {
        group.members.forEach(member => {
          promises.push(
            axios.post('/api/evaluations/final-comments', {
              evaluatee_id: member.id,
              comments: finalComments[member.id]
            })
          );
        });
      }

      await Promise.all(promises);
      setMessage({ type: 'success', text: 'Evaluations saved successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save evaluations' });
    } finally {
      setSaving(false);
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
      <div className="header">
        <h1>Phase {phase} Evaluation</h1>
        <div className="header-right">
          <span>Welcome, {user?.name}</span>
          <button className="theme-toggle" onClick={toggleDarkMode}>
            {darkMode ? 'Light' : 'Dark'}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
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

        <div className="card">
          <h2>Instructions</h2>
          <p>Please evaluate each team member (including yourself) on the following criteria using a 5-point scale.</p>
          <p>Also provide a score out of 100 and any comments for each member.</p>
        </div>

        {group?.members.map(member => (
          <div key={member.id} className="card evaluation-section">
            <div className="member-name">
              {member.last_name}, {member.first_name} {member.id === user?.id && '(Self-Evaluation)'}
            </div>

            {CRITERIA.map(criterion => (
              <div key={criterion.key} className="criteria-item">
                <div className="criteria-label">
                  {criterion.label}
                  <span style={{ fontWeight: 'normal', color: '#666', marginLeft: '10px' }}>
                    - {criterion.description}
                  </span>
                </div>
                <div className="likert-scale">
                  {LIKERT_OPTIONS.map(option => (
                    <label key={option.value} className="likert-option">
                      <input
                        type="radio"
                        name={`${member.id}-${criterion.key}`}
                        value={option.value}
                        checked={evaluations[member.id]?.[criterion.key] === option.value}
                        onChange={(e) => handleCriteriaChange(member.id, criterion.key, e.target.value)}
                      />
                      <span>{option.value}</span>
                    </label>
                  ))}
                </div>
                <div className="likert-labels">
                  <span>Strongly Disagree</span>
                  <span>Strongly Agree</span>
                </div>
              </div>
            ))}

            <div className="form-group">
              <label>Score (0-100)</label>
              <div className="score-input">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={evaluations[member.id]?.score || 0}
                  onChange={(e) => handleScoreChange(member.id, e.target.value)}
                />
                <span>/ 100</span>
              </div>
            </div>

            <div className="form-group">
              <label>Comments for Phase {phase}</label>
              <textarea
                value={evaluations[member.id]?.comments || ''}
                onChange={(e) => handleCommentsChange(member.id, e.target.value)}
                placeholder={`Enter your comments about ${member.first_name}'s performance in Phase ${phase}...`}
              />
            </div>

            {parseInt(phase) === 3 && (
              <div className="form-group">
                <label>Final Comments (Overall Project)</label>
                <textarea
                  value={finalComments[member.id] || ''}
                  onChange={(e) => handleFinalCommentsChange(member.id, e.target.value)}
                  placeholder={`Enter your final overall comments about ${member.first_name}'s contribution to the entire project...`}
                />
              </div>
            )}
          </div>
        ))}

        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <button
            className="btn btn-success"
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '15px 40px', fontSize: '1.1rem' }}
          >
            {saving ? 'Saving...' : 'Save All Evaluations'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Evaluation;

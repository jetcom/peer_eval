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
  const masqueradeUserId = searchParams.get('user_id');
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();

  // Check if this is the final evaluation (not a numbered phase)
  const isFinalEvaluation = phase === 'final';
  const [group, setGroup] = useState(null);
  const [evaluations, setEvaluations] = useState({});
  const [finalComments, setFinalComments] = useState({});
  const [finalPoints, setFinalPoints] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [masqueradeStudent, setMasqueradeStudent] = useState(null);
  const [isPastDue, setIsPastDue] = useState(false);

  // Check if viewing as another user (read-only mode) OR if evaluations are past due
  const isReadOnly = !!masqueradeUserId || isPastDue;

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Check if evaluations are past due (only for non-masquerade views)
        if (!masqueradeUserId) {
          try {
            const readOnlyRes = await axios.get('/api/evaluations/is-read-only');
            setIsPastDue(readOnlyRes.data.isReadOnly);
          } catch (err) {
            console.error('Failed to check read-only status:', err);
          }
        }

        // Build URL with masquerade user_id if provided
        const userIdParam = masqueradeUserId ? `&user_id=${masqueradeUserId}` : '';
        const groupUrl = classId
          ? `/api/groups/my/group?class_id=${classId}${userIdParam}`
          : `/api/groups/my/group?${userIdParam.substring(1)}`;

        if (isFinalEvaluation) {
          // For final evaluation, only fetch group and final comments
          const [groupRes, finalCommentsRes] = await Promise.all([
            axios.get(groupUrl),
            axios.get(`/api/evaluations/my-final-comments?${userIdParam.substring(1)}`)
          ]);

          // If masquerading, store student info for display
          if (masqueradeUserId) {
            const student = groupRes.data.members.find(m => m.id === parseInt(masqueradeUserId));
            setMasqueradeStudent(student);
          }

          setGroup(groupRes.data);

          // Initialize final comments and points
          const fcMap = {};
          const fpMap = {};
          groupRes.data.members.forEach(member => {
            const existing = finalCommentsRes.data.find(fc => fc.evaluatee_id === member.id);
            fcMap[member.id] = existing?.comments || '';
            fpMap[member.id] = existing?.final_points || 0;
          });
          setFinalComments(fcMap);
          setFinalPoints(fpMap);
        } else {
          // Regular phase evaluation
          const [groupRes, evalRes] = await Promise.all([
            axios.get(groupUrl),
            axios.get(`/api/evaluations/my-evaluations?${userIdParam.substring(1)}`)
          ]);

          // If masquerading, store student info for display
          if (masqueradeUserId) {
            const student = groupRes.data.members.find(m => m.id === parseInt(masqueradeUserId));
            setMasqueradeStudent(student);
          }

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
        }
      } catch (err) {
        setMessage({ type: 'error', text: 'Failed to load data' });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [phase, classId, masqueradeUserId, isFinalEvaluation]);

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

  const handleFinalPointsChange = (memberId, value) => {
    const points = Math.max(0, parseInt(value) || 0);
    setFinalPoints(prev => ({
      ...prev,
      [memberId]: points
    }));
  };

  // Calculate total points allocated
  const totalPoints = Object.values(finalPoints).reduce((sum, p) => sum + (p || 0), 0);

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });

    // Validate total points = 23 for final evaluation
    if (isFinalEvaluation && totalPoints !== 23) {
      setMessage({ type: 'error', text: `Total points must equal 23. Currently: ${totalPoints}` });
      setSaving(false);
      return;
    }

    try {
      if (isFinalEvaluation) {
        // Save only final comments and points
        const promises = group.members.map(member =>
          axios.post('/api/evaluations/final-comments', {
            evaluatee_id: member.id,
            comments: finalComments[member.id],
            final_points: finalPoints[member.id] || 0
          })
        );
        await Promise.all(promises);
        setMessage({ type: 'success', text: 'Final evaluation saved successfully!' });
      } else {
        // Save evaluations for each member
        const promises = group.members.map(member =>
          axios.post('/api/evaluations', {
            evaluatee_id: member.id,
            phase: parseInt(phase),
            ...evaluations[member.id]
          })
        );
        await Promise.all(promises);
        setMessage({ type: 'success', text: 'Evaluations saved successfully!' });
      }
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
        <h1>{isFinalEvaluation ? 'Final Evaluation' : `Phase ${phase} Evaluation`}</h1>
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

        {isReadOnly && masqueradeStudent && (
          <div className="card" style={{ background: darkMode ? '#2a4a6a' : '#fff3cd', borderLeft: '4px solid #f39c12' }}>
            <h2 style={{ marginBottom: '10px' }}>👁️ Viewing as {masqueradeStudent.first_name} {masqueradeStudent.last_name}</h2>
            <p style={{ margin: 0, color: darkMode ? '#e0e0e0' : '#856404' }}>
              This is a read-only view of the student's evaluations. You cannot make changes.
            </p>
          </div>
        )}

        {isPastDue && !masqueradeStudent && (
          <div className="card" style={{ background: darkMode ? '#3a2a2a' : '#f8d7da', borderLeft: '4px solid #dc3545' }}>
            <h2 style={{ marginBottom: '10px' }}>⏰ Evaluations Past Due</h2>
            <p style={{ margin: 0, color: darkMode ? '#e0e0e0' : '#721c24' }}>
              The due date for peer evaluations has passed. You can view your previous submissions but cannot make any changes.
            </p>
          </div>
        )}

        {/* Class Information */}
        {group && group.class && (
          <div className="card">
            <h2>{group.class.name} {group.class.section && `(${group.class.section})`}</h2>
            {group.class.semester && <p style={{ color: darkMode ? '#a0a0a0' : '#666', marginBottom: '5px' }}>{group.class.semester}</p>}
            <p style={{ color: darkMode ? '#a0a0a0' : '#666', marginBottom: '5px' }}>
              {group.class.instructors && group.class.instructors.length > 0 ? (
                <>
                  {group.class.instructors.length === 1 ? 'Instructor: ' : 'Instructors: '}
                  {group.class.instructors.map((instructor, idx) => (
                    <span key={instructor.id}>
                      {instructor.first_name} {instructor.last_name}
                      {idx < group.class.instructors.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </>
              ) : (
                <>Instructor: {group.class.teacher_name}</>
              )}
            </p>
            <p style={{ color: darkMode ? '#a0a0a0' : '#666', margin: 0 }}>
              Group: {group.name}
            </p>
          </div>
        )}

        <div className="card">
          <h2>Instructions</h2>
          {isFinalEvaluation ? (
            <>
              <p>This is your final evaluation for the entire project.</p>
              <p>Allocate 23 points total across all team members based on their overall contribution, and provide final comments for each member.</p>
            </>
          ) : (
            <>
              <p>Please evaluate each team member (including yourself) on the following criteria using a 5-point scale.</p>
              <p>Also provide a score out of 100 and any comments for each member.</p>
            </>
          )}
        </div>

        {/* Final Points Allocation - Final Evaluation only */}
        {isFinalEvaluation && group && (
          <div className="card" style={{ borderLeft: '4px solid #3498db' }}>
            <h2>Final Points Allocation</h2>
            <p style={{ marginBottom: '15px' }}>
              Allocate <strong>23 points total</strong> across all team members based on their overall contribution.
              Points can be distributed however you see fit (e.g., 6, 6, 6, 5 or 8, 7, 5, 3).
            </p>
            <table>
              <thead>
                <tr>
                  <th>Team Member</th>
                  <th style={{ width: '120px' }}>Points</th>
                </tr>
              </thead>
              <tbody>
                {group.members.map(member => (
                  <tr key={member.id}>
                    <td>
                      {member.last_name}, {member.first_name}
                      {member.id === (masqueradeUserId ? parseInt(masqueradeUserId) : user?.id) && ' (Self)'}
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="23"
                        value={finalPoints[member.id] || 0}
                        onChange={(e) => handleFinalPointsChange(member.id, e.target.value)}
                        disabled={isReadOnly}
                        style={{
                          width: '80px',
                          padding: '8px',
                          textAlign: 'center',
                          borderRadius: '4px',
                          border: '1px solid #ccc'
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Total</td>
                  <td style={{
                    fontWeight: 'bold',
                    color: totalPoints === 23 ? '#27ae60' : '#e74c3c',
                    textAlign: 'center'
                  }}>
                    {totalPoints} / 23
                    {totalPoints === 23 && ' ✓'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {isFinalEvaluation ? (
          /* Final Evaluation - only final comments for each member */
          group?.members.map(member => (
            <div key={member.id} className="card evaluation-section">
              <div className="member-name">
                {member.last_name}, {member.first_name} {member.id === (masqueradeUserId ? parseInt(masqueradeUserId) : user?.id) && '(Self)'}
              </div>
              <div className="form-group">
                <label>Final Comments (Overall Project)</label>
                <textarea
                  value={finalComments[member.id] || ''}
                  onChange={(e) => handleFinalCommentsChange(member.id, e.target.value)}
                  placeholder={`Enter your final overall comments about ${member.first_name}'s contribution to the entire project...`}
                  disabled={isReadOnly}
                />
              </div>
            </div>
          ))
        ) : (
          /* Regular Phase Evaluation */
          group?.members.map(member => (
            <div key={member.id} className="card evaluation-section">
              <div className="member-name">
                {member.last_name}, {member.first_name} {member.id === (masqueradeUserId ? parseInt(masqueradeUserId) : user?.id) && '(Self-Evaluation)'}
              </div>

              {CRITERIA.map(criterion => (
                <div key={criterion.key} className="criteria-item">
                  <div className="criteria-label">
                    {criterion.label}
                    <span className="criteria-description">
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
                          disabled={isReadOnly}
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
                    disabled={isReadOnly}
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
                  disabled={isReadOnly}
                />
              </div>
            </div>
          ))
        )}

        {!isReadOnly && (
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
        )}
      </div>
    </div>
  );
}

export default Evaluation;

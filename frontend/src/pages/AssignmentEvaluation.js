import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ImageUpload from '../components/ImageUpload';

function AssignmentEvaluation() {
  const { assignmentId, evalTypeId } = useParams();
  const [searchParams] = useSearchParams();
  const classId = searchParams.get('class_id');
  const masqueradeUserId = searchParams.get('user_id');
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();

  const [assignment, setAssignment] = useState(null);
  const [evalType, setEvalType] = useState(null);
  const [group, setGroup] = useState(null);
  const [allGroups, setAllGroups] = useState([]);
  const [evaluations, setEvaluations] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [evaluationIds, setEvaluationIds] = useState({}); // Map targetId -> evaluation.id
  const [attachments, setAttachments] = useState({}); // Map targetId -> attachments array
  const [imageUploadsEnabled, setImageUploadsEnabled] = useState(false);

  const autoSaveTimeoutRef = useRef(null);
  const lastSavedDataRef = useRef(null);

  // Check if viewing as another user (read-only mode)
  const isReadOnly = !!masqueradeUserId;

  // Word count helper
  const countWords = (text) => {
    if (!text || !text.trim()) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  useEffect(() => {
    fetchData();
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, evalTypeId, classId, masqueradeUserId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Check if image uploads are enabled
      try {
        const uploadStatusRes = await axios.get('/api/evaluations/attachments/status');
        setImageUploadsEnabled(uploadStatusRes.data.enabled);
      } catch (err) {
        console.log('Image uploads not available');
      }

      // Fetch assignment details
      const assignmentRes = await axios.get(`/api/assignments/${assignmentId}`);
      setAssignment(assignmentRes.data);

      // Find the eval type
      const foundEvalType = assignmentRes.data.eval_types.find(et => et.id === parseInt(evalTypeId));
      setEvalType(foundEvalType);

      if (!foundEvalType) {
        setMessage({ type: 'error', text: 'Evaluation type not found' });
        setLoading(false);
        return;
      }

      // Fetch group data based on evaluation target type
      const userIdParam = masqueradeUserId ? `?user_id=${masqueradeUserId}` : '';

      if (foundEvalType.target_type === 'group') {
        // For audience evaluations, fetch all groups in the class
        const groupsRes = await axios.get(`/api/assignments/groups/${classId}`);
        setAllGroups(groupsRes.data);
      }

      // Fetch user's group
      const groupUrl = classId
        ? `/api/groups/my/group?class_id=${classId}${userIdParam ? '&' + userIdParam.substring(1) : ''}`
        : `/api/groups/my/group${userIdParam}`;
      const groupRes = await axios.get(groupUrl);
      setGroup(groupRes.data);

      // Fetch existing evaluations
      const evalsRes = await axios.get(`/api/assignments/evaluations/my/${classId}${userIdParam}`);
      const assignmentData = evalsRes.data.assignments.find(a => a.id === parseInt(assignmentId));

      if (assignmentData) {
        // Initialize evaluations state
        const evalMap = {};
        const evalIdMap = {};

        if (foundEvalType.target_type === 'individual') {
          // Get group members to evaluate
          const membersToEvaluate = foundEvalType.include_self
            ? groupRes.data.members
            : groupRes.data.members.filter(m => m.id !== (masqueradeUserId ? parseInt(masqueradeUserId) : user?.id));

          membersToEvaluate.forEach(member => {
            const existing = assignmentData.evaluations.individual.find(
              e => e.evaluatee_id === member.id && e.eval_type_id === parseInt(evalTypeId)
            );

            // Initialize scores with default values
            const defaultScores = {};
            foundEvalType.criteria.forEach(c => {
              const existingScore = existing?.scores?.find(s => s.criterion_id === c.id);
              defaultScores[c.id] = existingScore?.score ?? Math.floor((c.min_value + c.max_value) / 2);
            });

            evalMap[member.id] = {
              comments: existing?.comments || '',
              scores: defaultScores
            };

            // Track evaluation ID for attachments
            if (existing?.id) {
              evalIdMap[member.id] = existing.id;
            }
          });
        } else {
          // Group evaluations - exclude own group for audience evals
          const groupsRes = await axios.get(`/api/assignments/groups/${classId}`);
          const otherGroups = groupsRes.data.filter(g => g.id !== groupRes.data.id);

          otherGroups.forEach(targetGroup => {
            const existing = assignmentData.evaluations.group.find(
              e => e.group_id === targetGroup.id && e.eval_type_id === parseInt(evalTypeId)
            );

            const defaultScores = {};
            foundEvalType.criteria.forEach(c => {
              const existingScore = existing?.scores?.find(s => s.criterion_id === c.id);
              defaultScores[c.id] = existingScore?.score ?? Math.floor((c.min_value + c.max_value) / 2);
            });

            const targetId = `group_${targetGroup.id}`;
            evalMap[targetId] = {
              comments: existing?.comments || '',
              scores: defaultScores
            };

            // Track evaluation ID for attachments
            if (existing?.id) {
              evalIdMap[targetId] = existing.id;
            }
          });

          setAllGroups(otherGroups);
        }

        setEvaluations(evalMap);
        setEvaluationIds(evalIdMap);
        lastSavedDataRef.current = JSON.stringify(evalMap);

        // Fetch attachments for existing evaluations
        const attachmentsMap = {};
        await Promise.all(
          Object.entries(evalIdMap).map(async ([targetId, evalId]) => {
            try {
              const isGroup = targetId.startsWith('group_');
              const endpoint = isGroup
                ? `/api/assignments/evaluations/group/${evalId}/attachments`
                : `/api/assignments/evaluations/individual/${evalId}/attachments`;
              const attRes = await axios.get(endpoint);
              attachmentsMap[targetId] = attRes.data;
            } catch (err) {
              console.log(`No attachments for evaluation ${evalId}`);
              attachmentsMap[targetId] = [];
            }
          })
        );
        setAttachments(attachmentsMap);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setMessage({ type: 'error', text: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  // Auto-save function
  const performAutoSave = useCallback(async () => {
    if (isReadOnly || !evalType || !group) return false;

    setAutoSaveStatus('saving');
    try {
      const promises = [];

      Object.entries(evaluations).forEach(([key, evalData]) => {
        const scores = Object.entries(evalData.scores).map(([criterionId, score]) => ({
          criterion_id: parseInt(criterionId),
          score
        }));

        if (key.startsWith('group_')) {
          // Group evaluation
          const groupId = parseInt(key.replace('group_', ''));
          promises.push(
            axios.post('/api/assignments/evaluations/group', {
              group_id: groupId,
              eval_type_id: parseInt(evalTypeId),
              comments: evalData.comments,
              scores
            })
          );
        } else {
          // Individual evaluation
          promises.push(
            axios.post('/api/assignments/evaluations/individual', {
              evaluatee_id: parseInt(key),
              eval_type_id: parseInt(evalTypeId),
              comments: evalData.comments,
              scores
            })
          );
        }
      });

      await Promise.all(promises);
      setAutoSaveStatus('saved');
      setHasUnsavedChanges(false);
      lastSavedDataRef.current = JSON.stringify(evaluations);

      setTimeout(() => setAutoSaveStatus(''), 3000);
      return true;
    } catch (err) {
      console.error('Auto-save failed:', err);
      setAutoSaveStatus('error');
      return false;
    }
  }, [isReadOnly, evalType, group, evaluations, evalTypeId]);

  // Debounced auto-save when data changes
  useEffect(() => {
    if (isReadOnly || loading || !evalType) return;

    const currentData = JSON.stringify(evaluations);
    if (currentData === lastSavedDataRef.current) return;

    setHasUnsavedChanges(true);

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      performAutoSave();
    }, 3000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [evaluations, isReadOnly, loading, evalType, performAutoSave]);

  const handleScoreChange = (targetId, criterionId, value) => {
    setEvaluations(prev => ({
      ...prev,
      [targetId]: {
        ...prev[targetId],
        scores: {
          ...prev[targetId]?.scores,
          [criterionId]: parseInt(value)
        }
      }
    }));
  };

  const handleCommentsChange = (targetId, value) => {
    setEvaluations(prev => ({
      ...prev,
      [targetId]: {
        ...prev[targetId],
        comments: value
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });

    // Validate minimum word count if required
    if (evalType?.require_comments && evalType?.min_comment_words > 0) {
      const insufficient = [];
      Object.entries(evaluations).forEach(([key, evalData]) => {
        const wordCount = countWords(evalData.comments);
        if (wordCount < evalType.min_comment_words) {
          insufficient.push(key);
        }
      });

      if (insufficient.length > 0) {
        setMessage({
          type: 'error',
          text: `Comments must be at least ${evalType.min_comment_words} words for all evaluations.`
        });
        setSaving(false);
        return;
      }
    }

    try {
      const promiseEntries = [];

      Object.entries(evaluations).forEach(([key, evalData]) => {
        const scores = Object.entries(evalData.scores).map(([criterionId, score]) => ({
          criterion_id: parseInt(criterionId),
          score
        }));

        if (key.startsWith('group_')) {
          const groupId = parseInt(key.replace('group_', ''));
          promiseEntries.push({
            key,
            promise: axios.post('/api/assignments/evaluations/group', {
              group_id: groupId,
              eval_type_id: parseInt(evalTypeId),
              comments: evalData.comments,
              scores
            })
          });
        } else {
          promiseEntries.push({
            key,
            promise: axios.post('/api/assignments/evaluations/individual', {
              evaluatee_id: parseInt(key),
              eval_type_id: parseInt(evalTypeId),
              comments: evalData.comments,
              scores
            })
          });
        }
      });

      const results = await Promise.all(promiseEntries.map(pe => pe.promise));

      // Update evaluation IDs from response (for image uploads)
      const newEvalIdMap = { ...evaluationIds };
      results.forEach((res, idx) => {
        if (res.data.id) {
          newEvalIdMap[promiseEntries[idx].key] = res.data.id;
        }
      });
      setEvaluationIds(newEvalIdMap);

      setMessage({ type: 'success', text: 'Evaluations saved successfully!' });
      lastSavedDataRef.current = JSON.stringify(evaluations);
      setHasUnsavedChanges(false);
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

  const getTargetsToEvaluate = () => {
    if (!evalType || !group) return [];

    if (evalType.target_type === 'individual') {
      return evalType.include_self
        ? group.members
        : group.members.filter(m => m.id !== (masqueradeUserId ? parseInt(masqueradeUserId) : user?.id));
    } else {
      return allGroups;
    }
  };

  const targets = getTargetsToEvaluate();

  return (
    <div>
      <div className="header">
        <h1>{assignment?.name} - {evalType?.name}</h1>
        <div className="header-right">
          <span>Welcome, {user?.first_name || user?.name}</span>
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

        {isReadOnly && (
          <div className="card" style={{ background: darkMode ? '#2a4a6a' : '#fff3cd', borderLeft: '4px solid #f39c12' }}>
            <h2 style={{ marginBottom: '10px' }}>Read-Only View</h2>
            <p style={{ margin: 0, color: darkMode ? '#e0e0e0' : '#856404' }}>
              You are viewing this evaluation in read-only mode.
            </p>
          </div>
        )}

        <div className="card">
          <h2>Instructions</h2>
          <p>
            {evalType?.target_type === 'individual'
              ? 'Please evaluate each team member on the following criteria.'
              : 'Please evaluate each group on the following criteria.'}
          </p>
          {evalType?.criteria && evalType.criteria.length > 0 && (
            <p>Rate each criterion on a scale of {evalType.criteria[0].min_value} to {evalType.criteria[0].max_value}.</p>
          )}
        </div>

        {targets.length === 0 && evalType?.target_type === 'group' && (
          <div className="card" style={{ background: darkMode ? '#2a4a6a' : '#fff3cd', borderLeft: '4px solid #f39c12' }}>
            <h2 style={{ marginBottom: '10px' }}>No Groups to Evaluate</h2>
            <p style={{ margin: 0, color: darkMode ? '#e0e0e0' : '#856404' }}>
              Audience evaluations are for rating other groups. There are no other groups in this class to evaluate.
            </p>
          </div>
        )}

        {targets.map(target => {
          const targetId = evalType?.target_type === 'individual' ? target.id : `group_${target.id}`;
          const targetLabel = evalType?.target_type === 'individual'
            ? `${target.last_name}, ${target.first_name}${target.id === (masqueradeUserId ? parseInt(masqueradeUserId) : user?.id) ? ' (Self)' : ''}`
            : target.name;

          return (
            <div key={targetId} className="card evaluation-section">
              <div className="member-name">{targetLabel}</div>

              {evalType?.target_type === 'group' && target.members && (
                <div style={{
                  fontSize: '0.9rem',
                  color: darkMode ? '#a0a0a0' : '#666',
                  marginBottom: '15px'
                }}>
                  Members: {target.members.map(m => `${m.first_name} ${m.last_name}`).join(', ')}
                </div>
              )}

              {evalType?.criteria?.map(criterion => (
                <div key={criterion.id} className="criteria-item">
                  <div className="criteria-label">
                    {criterion.name}
                    {criterion.description && (
                      <span className="criteria-description"> - {criterion.description}</span>
                    )}
                  </div>
                  <div className="likert-scale">
                    {Array.from(
                      { length: criterion.max_value - criterion.min_value + 1 },
                      (_, i) => criterion.min_value + i
                    ).map(value => (
                      <label key={value} className="likert-option">
                        <input
                          type="radio"
                          name={`${targetId}-${criterion.id}`}
                          value={value}
                          checked={evaluations[targetId]?.scores?.[criterion.id] === value}
                          onChange={(e) => handleScoreChange(targetId, criterion.id, e.target.value)}
                          disabled={isReadOnly}
                        />
                        <span>{value}</span>
                      </label>
                    ))}
                  </div>
                  <div className="likert-labels">
                    <span>{criterion.min_value} - Low</span>
                    <span>{criterion.max_value} - High</span>
                  </div>
                </div>
              ))}

              <div className="form-group">
                <label>
                  Comments
                  {evalType?.require_comments && evalType?.min_comment_words > 0 && (
                    <span style={{ fontWeight: 'normal', color: darkMode ? '#a0a0a0' : '#666' }}>
                      {' '}(minimum {evalType.min_comment_words} words)
                    </span>
                  )}
                </label>
                <textarea
                  value={evaluations[targetId]?.comments || ''}
                  onChange={(e) => handleCommentsChange(targetId, e.target.value)}
                  placeholder={`Enter your comments...`}
                  disabled={isReadOnly}
                />
                {evalType?.min_comment_words > 0 && (
                  <div style={{
                    fontSize: '0.85rem',
                    marginTop: '4px',
                    color: countWords(evaluations[targetId]?.comments) >= evalType.min_comment_words ? '#27ae60' : '#e74c3c'
                  }}>
                    {countWords(evaluations[targetId]?.comments)} / {evalType.min_comment_words} words minimum
                    {countWords(evaluations[targetId]?.comments) >= evalType.min_comment_words ? ' ✓' : ''}
                  </div>
                )}

                {/* Image upload section */}
                {imageUploadsEnabled && (
                  <div style={{ marginTop: '16px' }}>
                    <label style={{ fontWeight: '500', display: 'block', marginBottom: '8px' }}>
                      Attach Images (optional)
                    </label>
                    {evaluationIds[targetId] ? (
                      <ImageUpload
                        evaluationId={evaluationIds[targetId]}
                        evaluationType={evalType?.target_type === 'group' ? 'group' : 'assignment'}
                        attachments={attachments[targetId] || []}
                        onAttachmentsChange={(newAttachments) => {
                          setAttachments(prev => ({
                            ...prev,
                            [targetId]: newAttachments
                          }));
                        }}
                        disabled={isReadOnly}
                      />
                    ) : (
                      <div style={{
                        padding: '12px',
                        background: darkMode ? '#2a2a2a' : '#f8f9fa',
                        borderRadius: '6px',
                        color: darkMode ? '#a0a0a0' : '#666',
                        fontSize: '0.9rem'
                      }}>
                        Save your evaluation first to enable image uploads
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {!isReadOnly && (
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            {autoSaveStatus && (
              <div style={{
                marginBottom: '10px',
                fontSize: '0.9rem',
                color: autoSaveStatus === 'saved' ? '#27ae60' :
                       autoSaveStatus === 'saving' ? '#f39c12' :
                       autoSaveStatus === 'error' ? '#e74c3c' : darkMode ? '#a0a0a0' : '#666'
              }}>
                {autoSaveStatus === 'saving' && 'Auto-saving...'}
                {autoSaveStatus === 'saved' && '✓ Auto-saved'}
                {autoSaveStatus === 'error' && 'Auto-save failed - please save manually'}
              </div>
            )}
            {hasUnsavedChanges && !autoSaveStatus && (
              <div style={{ marginBottom: '10px', fontSize: '0.9rem', color: darkMode ? '#a0a0a0' : '#666' }}>
                Unsaved changes...
              </div>
            )}
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

export default AssignmentEvaluation;

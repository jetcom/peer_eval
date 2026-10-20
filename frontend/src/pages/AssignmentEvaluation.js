import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ImageUpload from '../components/ImageUpload';
import { formatWallClock } from '../utils/wallClock';

// State key for a target: group evaluations are prefixed so the save code
// can tell them apart from individual evaluatee ids
const keyForAudienceTarget = (t) => (t.kind === 'group' ? `group_${t.id}` : String(t.id));

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
  const [audienceInfo, setAudienceInfo] = useState(null); // who this student may evaluate, with dates
  const [startedTargets, setStartedTargets] = useState(new Set()); // audience targets the student has begun
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
  const isAudience = evalType?.eval_type === 'audience';
  const currentUserId = masqueradeUserId ? parseInt(masqueradeUserId) : user?.id;

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

      const isAudienceType = foundEvalType.eval_type === 'audience';
      const userIdParam = masqueradeUserId ? `?user_id=${masqueradeUserId}` : '';

      // Fetch user's group. Audience evaluations work without one.
      const groupUrl = classId
        ? `/api/groups/my/group?class_id=${classId}${userIdParam ? '&' + userIdParam.substring(1) : ''}`
        : `/api/groups/my/group${userIdParam}`;
      let myGroup = null;
      try {
        const groupRes = await axios.get(groupUrl);
        myGroup = groupRes.data;
      } catch (err) {
        if (!isAudienceType) throw err;
      }
      setGroup(myGroup);

      // Audience evaluations: the server decides who can be evaluated and when
      let audienceData = null;
      if (isAudienceType) {
        const audienceRes = await axios.get(`/api/assignments/eval-type/${evalTypeId}/audience${userIdParam}`);
        audienceData = audienceRes.data;
        setAudienceInfo(audienceData);
      }

      // Fetch existing evaluations
      const evalsRes = await axios.get(`/api/assignments/evaluations/my/${classId}${userIdParam}`);
      const assignmentData = evalsRes.data.assignments.find(a => a.id === parseInt(assignmentId));

      if (assignmentData) {
        // Initialize evaluations state
        const evalMap = {};
        const evalIdMap = {};
        const started = new Set();

        // Audience targets start blank so students choose which ones to do;
        // peer evaluations keep the midpoint default
        const initialScores = (existing, blankDefaults) => {
          const scores = {};
          foundEvalType.criteria.forEach(c => {
            const existingScore = existing?.scores?.find(s => s.criterion_id === c.id);
            if ((c.question_type || 'likert') === 'open_response') {
              scores[c.id] = { text: existingScore?.text_response || '' };
            } else if (blankDefaults) {
              scores[c.id] = existingScore?.score ?? null;
            } else {
              scores[c.id] = existingScore?.score ?? Math.floor((c.min_value + c.max_value) / 2);
            }
          });
          return scores;
        };

        if (isAudienceType) {
          audienceData.targets.forEach(target => {
            const key = keyForAudienceTarget(target);
            const existing = target.kind === 'group'
              ? assignmentData.evaluations.group.find(
                e => e.group_id === target.id && e.eval_type_id === parseInt(evalTypeId)
              )
              : assignmentData.evaluations.individual.find(
                e => e.evaluatee_id === target.id && e.eval_type_id === parseInt(evalTypeId)
              );

            evalMap[key] = {
              comments: existing?.comments || '',
              scores: initialScores(existing, true)
            };
            if (existing?.id) {
              evalIdMap[key] = existing.id;
              started.add(key);
            }
          });
        } else if (foundEvalType.target_type === 'individual') {
          // Get group members to evaluate
          const membersToEvaluate = foundEvalType.include_self
            ? myGroup.members
            : myGroup.members.filter(m => m.id !== currentUserId);

          membersToEvaluate.forEach(member => {
            const existing = assignmentData.evaluations.individual.find(
              e => e.evaluatee_id === member.id && e.eval_type_id === parseInt(evalTypeId)
            );

            evalMap[member.id] = {
              comments: existing?.comments || '',
              scores: initialScores(existing, false)
            };

            // Track evaluation ID for attachments
            if (existing?.id) {
              evalIdMap[member.id] = existing.id;
            }
          });
        } else {
          // Group evaluations - exclude own group
          const groupsRes = await axios.get(`/api/assignments/groups/${classId}`);
          const otherGroups = groupsRes.data.filter(g => g.id !== myGroup?.id);

          otherGroups.forEach(targetGroup => {
            const existing = assignmentData.evaluations.group.find(
              e => e.group_id === targetGroup.id && e.eval_type_id === parseInt(evalTypeId)
            );

            const targetId = `group_${targetGroup.id}`;
            evalMap[targetId] = {
              comments: existing?.comments || '',
              scores: initialScores(existing, false)
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
        setStartedTargets(started);
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

  // Audience target lookup by state key
  const audienceTargetByKey = useCallback((key) => {
    if (!audienceInfo) return null;
    return audienceInfo.targets.find(t => keyForAudienceTarget(t) === key) || null;
  }, [audienceInfo]);

  // Every rating criterion has a score (open responses may stay empty)
  const isFullyScored = useCallback((evalData) => {
    if (!evalType) return false;
    return evalType.criteria.every(c => {
      if ((c.question_type || 'likert') === 'open_response') return true;
      const v = evalData?.scores?.[c.id];
      return typeof v === 'number';
    });
  }, [evalType]);

  // Which targets a save should send. Audience rounds only send the ones the
  // student has begun that are open; everything else saves all targets.
  const keysToSave = useCallback((requireFullyScored) => {
    return Object.keys(evaluations).filter(key => {
      if (!isAudience) return true;
      if (!startedTargets.has(key)) return false;
      const target = audienceTargetByKey(key);
      if (!target || !target.can_submit) return false;
      return requireFullyScored ? isFullyScored(evaluations[key]) : true;
    });
  }, [evaluations, isAudience, startedTargets, audienceTargetByKey, isFullyScored]);

  const buildRequests = useCallback((keys) => {
    return keys.map(key => {
      const evalData = evaluations[key];
      const scores = Object.entries(evalData.scores).map(([criterionId, scoreVal]) => {
        if (scoreVal && typeof scoreVal === 'object' && 'text' in scoreVal) {
          return { criterion_id: parseInt(criterionId), score: null, text_response: scoreVal.text };
        }
        return { criterion_id: parseInt(criterionId), score: scoreVal, text_response: null };
      });

      if (key.startsWith('group_')) {
        const groupId = parseInt(key.replace('group_', ''));
        return {
          key,
          promise: axios.post('/api/assignments/evaluations/group', {
            group_id: groupId,
            eval_type_id: parseInt(evalTypeId),
            comments: evalData.comments,
            scores
          })
        };
      }
      return {
        key,
        promise: axios.post('/api/assignments/evaluations/individual', {
          evaluatee_id: parseInt(key),
          eval_type_id: parseInt(evalTypeId),
          comments: evalData.comments,
          scores
        })
      };
    });
  }, [evaluations, evalTypeId]);

  const recordEvaluationIds = (entries, results) => {
    setEvaluationIds(prev => {
      const next = { ...prev };
      results.forEach((res, idx) => {
        if (res.data.id) next[entries[idx].key] = res.data.id;
      });
      return next;
    });
  };

  // Auto-save function
  const performAutoSave = useCallback(async () => {
    if (isReadOnly || !evalType) return false;
    if (!isAudience && !group) return false;

    const entries = buildRequests(keysToSave(true));
    if (entries.length === 0) return false;

    setAutoSaveStatus('saving');
    try {
      const results = await Promise.all(entries.map(e => e.promise));
      recordEvaluationIds(entries, results);
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
  }, [isReadOnly, evalType, isAudience, group, buildRequests, keysToSave, evaluations]);

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

  const markStarted = (targetId) => {
    setStartedTargets(prev => {
      if (prev.has(targetId)) return prev;
      const next = new Set(prev);
      next.add(targetId);
      return next;
    });
  };

  const handleScoreChange = (targetId, criterionId, value) => {
    markStarted(targetId);
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

  const handleTextResponseChange = (targetId, criterionId, text) => {
    markStarted(targetId);
    setEvaluations(prev => ({
      ...prev,
      [targetId]: {
        ...prev[targetId],
        scores: {
          ...prev[targetId]?.scores,
          [criterionId]: { text }
        }
      }
    }));
  };

  const handleCommentsChange = (targetId, value) => {
    markStarted(targetId);
    setEvaluations(prev => ({
      ...prev,
      [targetId]: {
        ...prev[targetId],
        comments: value
      }
    }));
  };

  const labelForKey = (key) => {
    if (isAudience) {
      const t = audienceTargetByKey(key);
      if (!t) return key;
      return t.kind === 'group' ? t.name : `${t.first_name} ${t.last_name}`;
    }
    return key;
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });

    const keys = keysToSave(false);

    if (isAudience) {
      if (keys.length === 0) {
        setMessage({ type: 'error', text: 'Start an evaluation before saving. Pick any open presentation below.' });
        setSaving(false);
        return;
      }
      const unscored = keys.filter(k => !isFullyScored(evaluations[k]));
      if (unscored.length > 0) {
        setMessage({
          type: 'error',
          text: `Please rate every criterion for: ${unscored.map(labelForKey).join(', ')}.`
        });
        setSaving(false);
        return;
      }
    }

    // Validate minimum word count if required
    if (evalType?.require_comments && evalType?.min_comment_words > 0) {
      const insufficient = keys.filter(key => countWords(evaluations[key].comments) < evalType.min_comment_words);

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
      const entries = buildRequests(keys);
      const results = await Promise.all(entries.map(e => e.promise));
      recordEvaluationIds(entries, results);

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
    if (!evalType) return [];

    if (isAudience) {
      return audienceInfo?.targets || [];
    }
    if (!group) return [];

    if (evalType.target_type === 'individual') {
      return evalType.include_self
        ? group.members
        : group.members.filter(m => m.id !== currentUserId);
    }
    return allGroups;
  };

  const targets = getTargetsToEvaluate();

  // Audience progress, kept live as evaluations are saved
  const audienceCompleted = isAudience
    ? targets.filter(t => !t.excused && evaluationIds[keyForAudienceTarget(t)]).length
    : 0;
  const audienceRequired = audienceInfo?.required ?? 0;
  const audienceAvailable = audienceInfo?.available ?? 0;
  const audienceExcused = audienceInfo?.excused ?? 0;
  const mutedColor = darkMode ? '#a0a0a0' : '#666';

  const renderAudienceMeta = (target) => {
    const parts = [];
    if (target.presentation_date) {
      parts.push(`${target.is_open ? 'Presented' : 'Presents'} ${formatWallClock(target.presentation_date)}`);
    }
    if (target.due_date) {
      parts.push(`${target.is_past_due ? 'Was due' : 'Due'} ${formatWallClock(target.due_date)}`);
    }
    const key = keyForAudienceTarget(target);
    const done = !!evaluationIds[key];
    let badge = null;
    if (done) {
      badge = { text: target.evaluation?.is_late ? 'Submitted late' : 'Submitted', color: '#27ae60' };
    } else if (!target.can_submit && target.is_open) {
      badge = { text: 'Closed', color: '#e74c3c' };
    } else if (target.is_past_due) {
      badge = { text: 'Late submissions accepted', color: '#f39c12' };
    }
    return (
      <div style={{ fontSize: '0.9rem', color: mutedColor, marginBottom: '15px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        {parts.length > 0 && <span>{parts.join(' · ')}</span>}
        {badge && <span style={{ color: badge.color, fontWeight: 500 }}>{badge.text}</span>}
      </div>
    );
  };

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
            {isAudience
              ? (evalType?.target_type === 'group'
                ? 'Please evaluate each presenting group on the following criteria.'
                : 'Please evaluate each presenter on the following criteria.')
              : evalType?.target_type === 'individual'
                ? 'Please evaluate each team member on the following criteria.'
                : 'Please evaluate each group on the following criteria.'}
          </p>
          {evalType?.criteria && evalType.criteria.length > 0 && (() => {
            const hasLikert = evalType.criteria.some(c => (c.question_type || 'likert') === 'likert');
            const hasOpenResponse = evalType.criteria.some(c => c.question_type === 'open_response');
            return (
              <>
                {hasLikert && (
                  <p>Rate each rating criterion on a scale of {evalType.criteria.find(c => (c.question_type || 'likert') === 'likert').min_value} to {evalType.criteria.find(c => (c.question_type || 'likert') === 'likert').max_value}.</p>
                )}
                {hasOpenResponse && (
                  <p>Provide written responses for open-ended questions.</p>
                )}
              </>
            );
          })()}
        </div>

        {isAudience && audienceInfo && audienceAvailable > 0 && (
          <div className="card">
            <h2>Your Progress</h2>
            <p style={{ fontSize: '1.1rem', marginBottom: '8px' }}>
              <strong style={{ color: audienceCompleted >= audienceRequired ? '#27ae60' : undefined }}>
                {audienceCompleted} of {audienceRequired}
              </strong>{' '}
              required evaluations completed
              {audienceCompleted >= audienceRequired && ' ✓'}
            </p>
            <p style={{ margin: 0, color: mutedColor, fontSize: '0.95rem' }}>
              {audienceInfo.assignment_mode === 'assigned'
                ? `You have been assigned ${audienceAvailable} ${evalType.target_type === 'group' ? 'groups' : 'presenters'} to evaluate, listed below. `
                : audienceRequired < audienceAvailable
                  ? `You may evaluate any ${audienceRequired} of the ${audienceAvailable} ${evalType.target_type === 'group' ? 'groups' : 'presenters'} listed below. `
                  : `Evaluate all ${audienceAvailable} ${evalType.target_type === 'group' ? 'groups' : 'presenters'} listed below. `}
              {audienceInfo.eval_window_hours != null
                ? `Each evaluation is due ${audienceInfo.eval_window_hours} hours after that presentation.`
                : ''}
              {' '}Your own {group ? 'group' : 'presentation'} is not included.
              {audienceExcused > 0 && ` You have been excused from ${audienceExcused}.`}
            </p>
          </div>
        )}

        {isAudience && audienceInfo?.assignment_mode === 'assigned' && audienceAvailable === 0 && audienceExcused === 0 && (
          <div className="card" style={{ background: darkMode ? '#2a4a6a' : '#fff3cd', borderLeft: '4px solid #f39c12' }}>
            <h2 style={{ marginBottom: '10px' }}>Not Assigned Yet</h2>
            <p style={{ margin: 0, color: darkMode ? '#e0e0e0' : '#856404' }}>
              Your instructor assigns presenters to evaluate at random. You have not been assigned any yet. Check back later.
            </p>
          </div>
        )}

        {isAudience && audienceAvailable === 0 && audienceExcused > 0 && (
          <div className="card">
            <h2 style={{ marginBottom: '10px' }}>Nothing to Evaluate</h2>
            <p style={{ margin: 0, color: mutedColor }}>You have been excused from every presentation in this round.</p>
          </div>
        )}

        {targets.length === 0 && (isAudience || evalType?.target_type === 'group') && audienceInfo?.assignment_mode !== 'assigned' && (
          <div className="card" style={{ background: darkMode ? '#2a4a6a' : '#fff3cd', borderLeft: '4px solid #f39c12' }}>
            <h2 style={{ marginBottom: '10px' }}>
              {evalType?.target_type === 'group' ? 'No Groups to Evaluate' : 'No Presenters to Evaluate'}
            </h2>
            <p style={{ margin: 0, color: darkMode ? '#e0e0e0' : '#856404' }}>
              {evalType?.target_type === 'group'
                ? 'Audience evaluations are for rating other groups. There are no other groups in this class to evaluate.'
                : 'Audience evaluations are for rating other presenters. There is nobody else in this class to evaluate yet.'}
            </p>
          </div>
        )}

        {targets.map(target => {
          const targetId = isAudience
            ? keyForAudienceTarget(target)
            : evalType?.target_type === 'individual' ? target.id : `group_${target.id}`;
          const isGroupTarget = isAudience ? target.kind === 'group' : evalType?.target_type === 'group';
          const targetLabel = isGroupTarget
            ? target.name
            : `${target.last_name}, ${target.first_name}${target.id === currentUserId ? ' (Self)' : ''}`;

          // Excused (absent): shown for transparency, nothing owed
          if (isAudience && target.excused) {
            return (
              <div key={targetId} className="card evaluation-section" style={{ opacity: 0.6 }}>
                <div className="member-name">{targetLabel}</div>
                <p style={{ margin: 0, color: mutedColor }}>
                  You were excused from this evaluation
                  {target.presentation_date ? ` (presented ${formatWallClock(target.presentation_date)})` : ''}.
                </p>
              </div>
            );
          }

          // Locked until the presentation happens
          if (isAudience && !target.is_open) {
            return (
              <div key={targetId} className="card evaluation-section" style={{ opacity: 0.7 }}>
                <div className="member-name">{targetLabel}</div>
                {isGroupTarget && target.members && (
                  <div style={{ fontSize: '0.9rem', color: mutedColor, marginBottom: '10px' }}>
                    Members: {target.members.map(m => `${m.first_name} ${m.last_name}`).join(', ')}
                  </div>
                )}
                <p style={{ margin: 0, color: mutedColor }}>
                  Presents {formatWallClock(target.presentation_date)}. The evaluation form opens then.
                </p>
              </div>
            );
          }

          const closed = isAudience && !target.can_submit;
          const disabled = isReadOnly || closed;

          return (
            <div key={targetId} className="card evaluation-section">
              <div className="member-name">{targetLabel}</div>

              {isGroupTarget && target.members && (
                <div style={{
                  fontSize: '0.9rem',
                  color: mutedColor,
                  marginBottom: isAudience ? '6px' : '15px'
                }}>
                  Members: {target.members.map(m => `${m.first_name} ${m.last_name}`).join(', ')}
                </div>
              )}

              {isAudience && renderAudienceMeta(target)}

              {closed && !evaluationIds[targetId] && (
                <p style={{ color: '#e74c3c', marginBottom: '15px' }}>
                  The deadline for evaluating this {isGroupTarget ? 'group' : 'presenter'} has passed.
                </p>
              )}

              {evalType?.criteria?.map(criterion => (
                <div key={criterion.id} className="criteria-item">
                  <div className="criteria-label">
                    {criterion.name}
                    {criterion.description && (
                      <span className="criteria-description"> - {criterion.description}</span>
                    )}
                  </div>
                  {(criterion.question_type || 'likert') === 'open_response' ? (
                    <div style={{ marginTop: '8px' }}>
                      <textarea
                        value={evaluations[targetId]?.scores?.[criterion.id]?.text || ''}
                        onChange={(e) => handleTextResponseChange(targetId, criterion.id, e.target.value)}
                        placeholder={`Enter your response for "${criterion.name}"...`}
                        disabled={disabled}
                        rows={3}
                        style={{ width: '100%', resize: 'vertical' }}
                      />
                    </div>
                  ) : (
                    <>
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
                              disabled={disabled}
                            />
                            <span>{value}</span>
                          </label>
                        ))}
                      </div>
                      <div className="likert-labels">
                        <span>{criterion.min_value} - Low</span>
                        <span>{criterion.max_value} - High</span>
                      </div>
                    </>
                  )}
                </div>
              ))}

              <div className="form-group">
                <label>
                  Comments
                  {evalType?.require_comments && evalType?.min_comment_words > 0 && (
                    <span style={{ fontWeight: 'normal', color: mutedColor }}>
                      {' '}(minimum {evalType.min_comment_words} words)
                    </span>
                  )}
                </label>
                <textarea
                  value={evaluations[targetId]?.comments || ''}
                  onChange={(e) => handleCommentsChange(targetId, e.target.value)}
                  placeholder={`Enter your comments...`}
                  disabled={disabled}
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
                        evaluationType={isGroupTarget ? 'group' : 'assignment'}
                        attachments={attachments[targetId] || []}
                        onAttachmentsChange={(newAttachments) => {
                          setAttachments(prev => ({
                            ...prev,
                            [targetId]: newAttachments
                          }));
                        }}
                        disabled={disabled}
                      />
                    ) : (
                      <div style={{
                        padding: '12px',
                        background: darkMode ? '#2a2a2a' : '#f8f9fa',
                        borderRadius: '6px',
                        color: mutedColor,
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
                       autoSaveStatus === 'error' ? '#e74c3c' : mutedColor
              }}>
                {autoSaveStatus === 'saving' && 'Auto-saving...'}
                {autoSaveStatus === 'saved' && '✓ Auto-saved'}
                {autoSaveStatus === 'error' && 'Auto-save failed - please save manually'}
              </div>
            )}
            {hasUnsavedChanges && !autoSaveStatus && (
              <div style={{ marginBottom: '10px', fontSize: '0.9rem', color: mutedColor }}>
                Unsaved changes...
              </div>
            )}
            <button
              className="btn btn-success"
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '15px 40px', fontSize: '1.1rem' }}
            >
              {saving ? 'Saving...' : isAudience ? 'Save Evaluations' : 'Save All Evaluations'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AssignmentEvaluation;

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import PdfAnnotationViewer from '../components/PdfAnnotationViewer';
import AnnotationSidebar from '../components/AnnotationSidebar';

function PaperReview() {
  const { roundId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [overallComments, setOverallComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [activeAnnotation, setActiveAnnotation] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [criteria, setCriteria] = useState([]);
  const [scores, setScores] = useState({}); // { criterionId: { score, text_response } }
  const scoresRef = useRef({});

  // Masquerade support
  const searchParams = new URLSearchParams(window.location.search);
  const masqueradeUserId = searchParams.get('user_id');
  const isMasquerading = !!masqueradeUserId;

  useEffect(() => {
    fetchAssignment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  const fetchAssignment = async () => {
    try {
      setLoading(true);
      const params = masqueradeUserId ? `?user_id=${masqueradeUserId}` : '';
      const res = await axios.get(`/api/paper-review/${roundId}/my-assignment${params}`);
      setAssignment(res.data);
      setCriteria(res.data?.criteria || []);
      if (res.data?.review) {
        setOverallComments(res.data.review.overall_comments || '');
        setAnnotations(res.data.review.annotations || []);
        // Build scores map from existing review scores
        const scoresMap = {};
        (res.data.review.scores || []).forEach(s => {
          scoresMap[s.criterion_id] = { score: s.score, text_response: s.text_response || '' };
        });
        setScores(scoresMap);
        scoresRef.current = scoresMap;
      }
    } catch (err) {
      console.error('Error fetching assignment:', err);
      setError(err.response?.data?.error || 'Failed to load review assignment');
    } finally {
      setLoading(false);
    }
  };

  // Build scores array for API from current scores state
  const buildScoresPayload = useCallback((currentScores) => {
    return Object.entries(currentScores).map(([criterionId, data]) => ({
      criterion_id: parseInt(criterionId),
      score: data.score ?? null,
      text_response: data.text_response || null
    }));
  }, []);

  // Auto-save review (comments + scores) with debounce
  const saveReview = useCallback(async (comments, currentScores) => {
    setSaving(true);
    setSaveStatus('Saving...');
    try {
      await axios.post(`/api/paper-review/${roundId}/my-review`, {
        overall_comments: comments,
        scores: buildScoresPayload(currentScores),
        submit: !!(comments || Object.keys(currentScores).length > 0)
      });
      setSaveStatus('Saved & submitted');
    } catch (err) {
      setSaveStatus('Error saving');
      console.error('Save error:', err);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(''), 2000);
    }
  }, [roundId, buildScoresPayload]);

  // Debounced auto-save for comments and scores (skip when masquerading)
  useEffect(() => {
    if (isMasquerading) return;
    if (!assignment?.review && !overallComments && Object.keys(scores).length === 0) return;

    const timer = setTimeout(() => {
      const commentsChanged = overallComments !== (assignment?.review?.overall_comments || '');
      const scoresChanged = JSON.stringify(scores) !== JSON.stringify(scoresRef.current);
      if (commentsChanged || scoresChanged) {
        scoresRef.current = { ...scores };
        saveReview(overallComments, scores);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [overallComments, scores, assignment, saveReview, isMasquerading]);

  const handleScoreChange = (criterionId, value) => {
    setScores(prev => ({
      ...prev,
      [criterionId]: { ...prev[criterionId], score: parseInt(value) }
    }));
  };

  const handleTextResponseChange = (criterionId, value) => {
    setScores(prev => ({
      ...prev,
      [criterionId]: { ...prev[criterionId], text_response: value }
    }));
  };

  const handleAddAnnotation = async (annotationData) => {
    try {
      const res = await axios.post(`/api/paper-review/${roundId}/my-review/annotations`, annotationData);
      setAnnotations([...annotations, res.data]);
    } catch (err) {
      console.error('Error adding annotation:', err);
    }
  };

  const handleDeleteAnnotation = async (annotationId) => {
    try {
      await axios.delete(`/api/paper-review/${roundId}/annotations/${annotationId}`);
      setAnnotations(annotations.filter(a => a.id !== annotationId));
      if (activeAnnotation?.id === annotationId) {
        setActiveAnnotation(null);
      }
    } catch (err) {
      console.error('Error deleting annotation:', err);
    }
  };

  const handleSubmit = async () => {
    if (!window.confirm('Submit your review? You won\'t be able to make changes after submission.')) {
      return;
    }

    setSaving(true);
    setSaveStatus('Submitting...');
    try {
      await axios.post(`/api/paper-review/${roundId}/my-review`, {
        overall_comments: overallComments,
        scores: buildScoresPayload(scores),
        submit: true
      });
      setSaveStatus('Submitted!');
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (err) {
      setSaveStatus('Error submitting');
      console.error('Submit error:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="card">
          <div className="error-message">{error}</div>
          <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="container">
        <div className="card">
          <h2>No Paper Assigned</h2>
          <p>You haven't been assigned a paper to review yet. Check back after the review period starts.</p>
          <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isSubmitted = !!assignment.review?.submitted_at;
  const readOnly = isSubmitted || isMasquerading;

  return (
    <div className={darkMode ? 'dark-mode' : ''}>
      <header className="header">
        <h1>Paper Review</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span>Welcome, {user?.firstName || user?.email}</span>
          <button className="btn btn-secondary btn-sm" onClick={toggleDarkMode}>
            {darkMode ? 'Light' : 'Dark'}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
          <button className="btn btn-danger" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {isMasquerading && (
        <div style={{
          background: '#fff3cd', color: '#856404', padding: '0.5rem 1rem',
          textAlign: 'center', fontWeight: 500, fontSize: '0.9rem'
        }}>
          Viewing as {assignment.paper?.author?.name || 'student'} (read-only)
        </div>
      )}

      <div className="review-page-container">
        {/* Left: PDF Viewer with Annotations */}
        <div className="pdf-section">
          <div className="pdf-header">
            <h3>Paper by {assignment.paper.author.name}</h3>
            <span className="file-info">{assignment.paper.file_name}</span>
          </div>
          {assignment.paper.url ? (
            <PdfAnnotationViewer
              fileUrl={assignment.paper.url}
              annotations={annotations}
              onAnnotationAdd={!readOnly ? handleAddAnnotation : undefined}
              onAnnotationDelete={!readOnly ? handleDeleteAnnotation : undefined}
              onPageChange={setCurrentPage}
              readOnly={readOnly}
            />
          ) : (
            <div className="no-pdf card">Unable to load PDF</div>
          )}
        </div>

        {/* Right: Sidebar with annotations list and comments */}
        <div className="sidebar-section">
          {/* Deadline info */}
          {assignment.review_deadline && (
            <div className="deadline-banner">
              <strong>Deadline:</strong> {new Date(assignment.review_deadline).toLocaleString()}
            </div>
          )}

          {isSubmitted && (
            <div className="submitted-banner">
              Review submitted on {new Date(assignment.review.submitted_at).toLocaleString()}
            </div>
          )}

          {/* Annotations list */}
          <div className="annotations-panel">
            <AnnotationSidebar
              annotations={annotations}
              onAnnotationClick={setActiveAnnotation}
              onAnnotationAdd={!readOnly ? handleAddAnnotation : undefined}
              onAnnotationDelete={!readOnly ? handleDeleteAnnotation : undefined}
              activeAnnotationId={activeAnnotation?.id}
              currentPage={currentPage}
              readOnly={readOnly}
            />
          </div>

          {/* Rubric criteria */}
          {criteria.length > 0 && (
            <div className="criteria-panel card" style={{ overflowY: 'auto', flexShrink: 0 }}>
              <h4>Review Criteria</h4>
              {criteria.map(criterion => (
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
                        value={scores[criterion.id]?.text_response || ''}
                        onChange={(e) => handleTextResponseChange(criterion.id, e.target.value)}
                        placeholder={`Enter your response for "${criterion.name}"...`}
                        disabled={readOnly}
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
                              name={`criterion-${criterion.id}`}
                              value={value}
                              checked={scores[criterion.id]?.score === value}
                              onChange={(e) => handleScoreChange(criterion.id, e.target.value)}
                              disabled={readOnly}
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
            </div>
          )}

          {/* Overall comments */}
          <div className="comments-panel card">
            <h4>Overall Comments</h4>
            <textarea
              value={overallComments}
              onChange={(e) => setOverallComments(e.target.value)}
              placeholder="Provide overall feedback to help your peer improve their paper..."
              rows={6}
              disabled={readOnly}
            />

            <div className="review-actions">
              {saveStatus && <span className="save-status">{saveStatus}</span>}
              {!readOnly && (
                <button
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={saving}
                >
                  Submit Review
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .review-page-container {
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 1rem;
          height: calc(100vh - 70px);
          padding: 1rem;
          overflow: hidden;
        }

        @media (max-width: 1200px) {
          .review-page-container {
            grid-template-columns: 1fr;
            height: auto;
            overflow: visible;
          }

          .pdf-section {
            height: 600px;
          }
        }

        .pdf-section {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: #fff;
          border-radius: 8px;
        }

        .pdf-header {
          padding: 0.75rem 1rem;
          background: #f8f9fa;
          border-bottom: 1px solid #eee;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        }

        .pdf-header h3 {
          margin: 0;
          font-size: 1rem;
        }

        .file-info {
          color: #666;
          font-size: 0.85rem;
        }

        .sidebar-section {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          overflow-y: auto;
        }

        .deadline-banner {
          padding: 0.75rem 1rem;
          background: #fff3cd;
          color: #856404;
          border-radius: 8px;
          font-size: 0.9rem;
          flex-shrink: 0;
        }

        .submitted-banner {
          padding: 0.75rem 1rem;
          background: #d4edda;
          color: #155724;
          border-radius: 8px;
          font-size: 0.9rem;
          flex-shrink: 0;
        }

        .criteria-panel h4 {
          margin: 0 0 0.75rem 0;
          font-size: 1rem;
        }

        .criteria-item {
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #eee;
        }

        .criteria-item:last-child {
          margin-bottom: 0;
          padding-bottom: 0;
          border-bottom: none;
        }

        .criteria-label {
          font-weight: 600;
          font-size: 0.95rem;
          margin-bottom: 0.5rem;
        }

        .criteria-description {
          font-weight: 400;
          color: #666;
          font-size: 0.9rem;
        }

        .likert-scale {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-top: 0.25rem;
        }

        .likert-option {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          cursor: pointer;
          font-size: 0.9rem;
        }

        .likert-option input[type="radio"]:disabled {
          cursor: not-allowed;
        }

        .likert-labels {
          display: flex;
          justify-content: space-between;
          font-size: 0.8rem;
          color: #888;
          margin-top: 0.25rem;
        }

        .annotations-panel {
          flex: 1;
          min-height: 200px;
          overflow: hidden;
        }

        .comments-panel {
          flex-shrink: 0;
        }

        .comments-panel h4 {
          margin: 0 0 0.75rem 0;
          font-size: 1rem;
        }

        .comments-panel textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-family: inherit;
          font-size: 0.95rem;
          resize: vertical;
        }

        .comments-panel textarea:disabled {
          background: #f5f5f5;
          cursor: not-allowed;
        }

        .review-actions {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 1rem;
          margin-top: 0.75rem;
        }

        .save-status {
          color: #666;
          font-size: 0.85rem;
        }

        .no-pdf {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #999;
        }

        .error-message {
          color: #d32f2f;
          padding: 1rem;
          background: #ffebee;
          border-radius: 8px;
          margin-bottom: 1rem;
        }

        .loading {
          text-align: center;
          padding: 3rem;
          color: #666;
        }

        /* Dark mode */
        body.dark-mode .pdf-section {
          background: #2a2a2a;
        }

        body.dark-mode .pdf-header {
          background: #333;
          border-color: #444;
        }

        body.dark-mode .file-info {
          color: #aaa;
        }

        body.dark-mode .deadline-banner {
          background: #3d3200;
          color: #ffd93d;
        }

        body.dark-mode .submitted-banner {
          background: #1e4620;
          color: #a3d9a5;
        }

        body.dark-mode .criteria-item {
          border-color: #444;
        }

        body.dark-mode .criteria-description {
          color: #aaa;
        }

        body.dark-mode .likert-labels {
          color: #888;
        }

        body.dark-mode .criteria-panel textarea {
          background: #2a2a2a;
          border-color: #444;
          color: #e0e0e0;
        }

        body.dark-mode .comments-panel textarea {
          background: #2a2a2a;
          border-color: #444;
          color: #e0e0e0;
        }

        body.dark-mode .comments-panel textarea:disabled {
          background: #333;
        }
      `}</style>
    </div>
  );
}

export default PaperReview;

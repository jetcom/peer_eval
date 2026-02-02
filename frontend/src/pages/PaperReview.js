import React, { useState, useEffect, useCallback } from 'react';
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

  useEffect(() => {
    fetchAssignment();
  }, [roundId]);

  const fetchAssignment = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/paper-review/${roundId}/my-assignment`);
      setAssignment(res.data);
      if (res.data?.review) {
        setOverallComments(res.data.review.overall_comments || '');
        setAnnotations(res.data.review.annotations || []);
      }
    } catch (err) {
      console.error('Error fetching assignment:', err);
      setError(err.response?.data?.error || 'Failed to load review assignment');
    } finally {
      setLoading(false);
    }
  };

  // Auto-save comments with debounce
  const saveComments = useCallback(async (comments) => {
    setSaving(true);
    setSaveStatus('Saving...');
    try {
      await axios.post(`/api/paper-review/${roundId}/my-review`, {
        overall_comments: comments,
        submit: false
      });
      setSaveStatus('Saved');
    } catch (err) {
      setSaveStatus('Error saving');
      console.error('Save error:', err);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(''), 2000);
    }
  }, [roundId]);

  // Debounced save for comments
  useEffect(() => {
    if (!assignment?.review && !overallComments) return;

    const timer = setTimeout(() => {
      if (overallComments !== (assignment?.review?.overall_comments || '')) {
        saveComments(overallComments);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [overallComments, assignment, saveComments]);

  const handleAddAnnotation = async (annotationData) => {
    try {
      const res = await axios.post(`/api/paper-review/${roundId}/my-review/annotations`, annotationData);
      setAnnotations([...annotations, res.data]);
    } catch (err) {
      console.error('Error adding annotation:', err);
    }
  };

  const handleUpdateAnnotation = async (annotationId, updates) => {
    try {
      const res = await axios.put(`/api/paper-review/${roundId}/annotations/${annotationId}`, updates);
      setAnnotations(annotations.map(a => a.id === annotationId ? res.data : a));
    } catch (err) {
      console.error('Error updating annotation:', err);
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
              onAnnotationAdd={!isSubmitted ? handleAddAnnotation : undefined}
              onAnnotationUpdate={!isSubmitted ? handleUpdateAnnotation : undefined}
              onAnnotationDelete={!isSubmitted ? handleDeleteAnnotation : undefined}
              readOnly={isSubmitted}
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
              onAnnotationDelete={!isSubmitted ? handleDeleteAnnotation : undefined}
              activeAnnotationId={activeAnnotation?.id}
              readOnly={isSubmitted}
            />
          </div>

          {/* Overall comments */}
          <div className="comments-panel card">
            <h4>Overall Comments</h4>
            <textarea
              value={overallComments}
              onChange={(e) => setOverallComments(e.target.value)}
              placeholder="Provide overall feedback to help your peer improve their paper..."
              rows={6}
              disabled={isSubmitted}
            />

            <div className="review-actions">
              {saveStatus && <span className="save-status">{saveStatus}</span>}
              {!isSubmitted && (
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
          overflow: hidden;
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

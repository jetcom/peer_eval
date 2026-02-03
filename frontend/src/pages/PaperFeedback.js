import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import PdfAnnotationViewer from '../components/PdfAnnotationViewer';
import AnnotationSidebar from '../components/AnnotationSidebar';

function PaperFeedback() {
  const { roundId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [activeAnnotation, setActiveAnnotation] = useState(null);

  useEffect(() => {
    fetchFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  const fetchFeedback = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/paper-review/${roundId}/my-feedback`);
      setFeedback(res.data);
    } catch (err) {
      console.error('Error fetching feedback:', err);
      setError(err.response?.data?.error || 'Failed to load feedback');
    } finally {
      setLoading(false);
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

  // Handle various states
  if (!feedback?.available) {
    return (
      <div className={darkMode ? 'dark-mode' : ''}>
        <header className="header">
          <h1>Paper Feedback</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </button>
          </div>
        </header>
        <div className="container">
          <div className="card">
            <h2>Feedback Not Available</h2>
            <p>{feedback?.message || 'Feedback has not been released yet. Check back later.'}</p>
            <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!feedback?.paper) {
    return (
      <div className={darkMode ? 'dark-mode' : ''}>
        <header className="header">
          <h1>Paper Feedback</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </button>
          </div>
        </header>
        <div className="container">
          <div className="card">
            <h2>No Paper Submitted</h2>
            <p>You did not submit a paper for this review round.</p>
            <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!feedback?.review) {
    return (
      <div className={darkMode ? 'dark-mode' : ''}>
        <header className="header">
          <h1>Paper Feedback</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </button>
          </div>
        </header>
        <div className="container">
          <div className="card">
            <h2>No Review Received</h2>
            <p>Your paper was submitted but has not been reviewed yet.</p>
            <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const annotations = feedback.review.annotations || [];

  return (
    <div className={darkMode ? 'dark-mode' : ''}>
      <header className="header">
        <h1>Paper Feedback</h1>
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

      <div className="feedback-page-container">
        {/* Left: PDF Viewer with Annotations (read-only) */}
        <div className="pdf-section">
          <div className="pdf-header">
            <h3>Your Paper: {feedback.paper.file_name}</h3>
          </div>
          {feedback.paper.url ? (
            <PdfAnnotationViewer
              fileUrl={feedback.paper.url}
              annotations={annotations}
              readOnly={true}
            />
          ) : (
            <div className="no-pdf card">Unable to load PDF</div>
          )}
        </div>

        {/* Right: Sidebar with feedback details */}
        <div className="sidebar-section">
          {/* Reviewer info */}
          <div className="feedback-info card">
            <h4>Review Details</h4>
            {feedback.reviewer ? (
              <p><strong>Reviewer:</strong> {feedback.reviewer.name}</p>
            ) : (
              <p><em>Anonymous reviewer</em></p>
            )}
            {feedback.review.submitted_at && (
              <p><strong>Submitted:</strong> {new Date(feedback.review.submitted_at).toLocaleString()}</p>
            )}
          </div>

          {/* Annotations list */}
          <div className="annotations-panel">
            <AnnotationSidebar
              annotations={annotations}
              onAnnotationClick={setActiveAnnotation}
              activeAnnotationId={activeAnnotation?.id}
              readOnly={true}
            />
          </div>

          {/* Overall comments */}
          <div className="comments-panel card">
            <h4>Overall Comments</h4>
            <div className="comments-content">
              {feedback.review.overall_comments || (
                <span className="no-comments">No overall comments provided</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .feedback-page-container {
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 1rem;
          height: calc(100vh - 70px);
          padding: 1rem;
          overflow: hidden;
        }

        @media (max-width: 1200px) {
          .feedback-page-container {
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
          flex-shrink: 0;
        }

        .pdf-header h3 {
          margin: 0;
          font-size: 1rem;
        }

        .sidebar-section {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          overflow: hidden;
        }

        .feedback-info {
          flex-shrink: 0;
        }

        .feedback-info h4 {
          margin: 0 0 0.75rem 0;
          font-size: 1rem;
        }

        .feedback-info p {
          margin: 0.25rem 0;
          font-size: 0.9rem;
          color: #666;
        }

        .annotations-panel {
          flex: 1;
          min-height: 200px;
          overflow: hidden;
        }

        .comments-panel {
          flex-shrink: 0;
          max-height: 300px;
          overflow-y: auto;
        }

        .comments-panel h4 {
          margin: 0 0 0.75rem 0;
          font-size: 1rem;
        }

        .comments-content {
          background: #f8f9fa;
          padding: 1rem;
          border-radius: 6px;
          white-space: pre-wrap;
          line-height: 1.6;
          font-size: 0.95rem;
        }

        .no-comments {
          color: #999;
          font-style: italic;
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

        body.dark-mode .feedback-info p {
          color: #aaa;
        }

        body.dark-mode .comments-content {
          background: #2a2a2a;
        }
      `}</style>
    </div>
  );
}

export default PaperFeedback;

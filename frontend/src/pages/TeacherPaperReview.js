import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import PdfAnnotationViewer from '../components/PdfAnnotationViewer';
import AnnotationSidebar from '../components/AnnotationSidebar';

function TeacherPaperReview() {
  const { roundId, paperId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paper, setPaper] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [overallComments, setOverallComments] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [activeAnnotation, setActiveAnnotation] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    fetchReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, paperId]);

  const fetchReview = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/paper-review/${roundId}/papers/${paperId}/teacher-review`);
      setPaper(res.data.paper);
      if (res.data.review) {
        setOverallComments(res.data.review.overall_comments || '');
        setAnnotations(res.data.review.annotations || []);
      }
    } catch (err) {
      console.error('Error fetching review:', err);
      setError(err.response?.data?.error || 'Failed to load paper');
    } finally {
      setLoading(false);
    }
  };

  // Auto-save comments with debounce
  const saveComments = useCallback(async (comments) => {
    setSaveStatus('Saving...');
    try {
      await axios.post(`/api/paper-review/${roundId}/papers/${paperId}/teacher-review`, {
        overall_comments: comments
      });
      setSaveStatus('Saved');
    } catch (err) {
      setSaveStatus('Error saving');
      console.error('Save error:', err);
    } finally {
      setTimeout(() => setSaveStatus(''), 2000);
    }
  }, [roundId, paperId]);

  // Debounced save for comments
  useEffect(() => {
    if (!paper) return;

    const timer = setTimeout(() => {
      saveComments(overallComments);
    }, 1000);

    return () => clearTimeout(timer);
  }, [overallComments, paper, saveComments]);

  const handleAddAnnotation = async (annotationData) => {
    try {
      const res = await axios.post(`/api/paper-review/${roundId}/papers/${paperId}/teacher-review/annotations`, annotationData);
      setAnnotations([...annotations, res.data]);
    } catch (err) {
      console.error('Error adding annotation:', err);
    }
  };

  const handleDeleteAnnotation = async (annotationId) => {
    try {
      await axios.delete(`/api/paper-review/${roundId}/papers/${paperId}/teacher-review/annotations/${annotationId}`);
      setAnnotations(annotations.filter(a => a.id !== annotationId));
      if (activeAnnotation?.id === annotationId) {
        setActiveAnnotation(null);
      }
    } catch (err) {
      console.error('Error deleting annotation:', err);
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
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="container">
        <div className="card">
          <h2>Paper Not Found</h2>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={darkMode ? 'dark-mode' : ''}>
      <header className="header">
        <h1>Teacher Review</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span>Welcome, {user?.firstName || user?.email}</span>
          <button className="btn btn-secondary btn-sm" onClick={toggleDarkMode}>
            {darkMode ? 'Light' : 'Dark'}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            Back
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
            <h3>Paper by {paper.author.name}</h3>
            <span className="file-info">{paper.file_name}</span>
          </div>
          {paper.url ? (
            <PdfAnnotationViewer
              fileUrl={paper.url}
              annotations={annotations}
              onAnnotationAdd={handleAddAnnotation}
              onAnnotationDelete={handleDeleteAnnotation}
              onPageChange={setCurrentPage}
              readOnly={false}
            />
          ) : (
            <div className="no-pdf card">Unable to load PDF</div>
          )}
        </div>

        {/* Right: Sidebar with annotations list and comments */}
        <div className="sidebar-section">
          <div className="teacher-banner">
            Teacher Review Mode
          </div>

          {/* Annotations list */}
          <div className="annotations-panel">
            <AnnotationSidebar
              annotations={annotations}
              onAnnotationClick={setActiveAnnotation}
              onAnnotationAdd={handleAddAnnotation}
              onAnnotationDelete={handleDeleteAnnotation}
              activeAnnotationId={activeAnnotation?.id}
              currentPage={currentPage}
              readOnly={false}
            />
          </div>

          {/* Overall comments */}
          <div className="comments-panel card">
            <h4>Teacher Comments</h4>
            <textarea
              value={overallComments}
              onChange={(e) => setOverallComments(e.target.value)}
              placeholder="Add your feedback and comments here..."
              rows={6}
            />

            <div className="review-actions">
              {saveStatus && <span className="save-status">{saveStatus}</span>}
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

        .teacher-banner {
          padding: 0.75rem 1rem;
          background: #e3f2fd;
          color: #1565c0;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 500;
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

        body.dark-mode .teacher-banner {
          background: #1a3a5c;
          color: #90caf9;
        }

        body.dark-mode .comments-panel textarea {
          background: #2a2a2a;
          border-color: #444;
          color: #e0e0e0;
        }
      `}</style>
    </div>
  );
}

export default TeacherPaperReview;

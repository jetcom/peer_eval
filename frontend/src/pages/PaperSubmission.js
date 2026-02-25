import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import PdfUpload from '../components/PdfUpload';

function PaperSubmission() {
  const { roundId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [roundInfo, setRoundInfo] = useState(null);
  const [paper, setPaper] = useState(null);

  // Masquerade support
  const searchParams = new URLSearchParams(window.location.search);
  const masqueradeUserId = searchParams.get('user_id');
  const isMasquerading = !!masqueradeUserId;

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch paper if already submitted
      const params = masqueradeUserId ? `?user_id=${masqueradeUserId}` : '';
      const paperRes = await axios.get(`/api/paper-review/${roundId}/my-paper${params}`);
      setPaper(paperRes.data);

      // For now, we'll get basic info. In a full implementation,
      // we'd have an endpoint to get round info for students
      setRoundInfo({
        id: parseInt(roundId),
        // These would come from the API in a full implementation
        status: 'submission'
      });
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.response?.data?.error || 'Failed to load paper review information');
    } finally {
      setLoading(false);
    }
  };

  const handlePaperChange = (newPaper) => {
    setPaper(newPaper);
  };

  const isSubmissionOpen = roundInfo?.status === 'submission' && !isMasquerading;

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

  return (
    <div className={darkMode ? 'dark-mode' : ''}>
      <header className="header">
        <h1>Paper Submission</h1>
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

      <div className="container">
        {isMasquerading && (
          <div style={{
            background: '#fff3cd', color: '#856404', padding: '0.5rem 1rem',
            textAlign: 'center', fontWeight: 500, fontSize: '0.9rem', borderRadius: '8px', marginBottom: '1rem'
          }}>
            Viewing as student (read-only)
          </div>
        )}
        <div className="card">
          <h2>Submit Your Paper</h2>

          {!isSubmissionOpen && (
            <div className="alert alert-warning">
              The submission period has ended. You can no longer upload or modify your paper.
            </div>
          )}

          <div className="submission-instructions">
            <h3>Instructions</h3>
            <ul>
              <li>Upload your paper as a PDF file (maximum 25MB)</li>
              <li>You can replace your submission before the deadline</li>
              <li>After the deadline, your paper will be assigned to a peer for review</li>
              <li>You will also be assigned another student's paper to review</li>
            </ul>
          </div>

          <div className="upload-section">
            <h3>{paper ? 'Your Submitted Paper' : 'Upload Paper'}</h3>
            <PdfUpload
              roundId={parseInt(roundId)}
              currentPaper={paper}
              onPaperChange={handlePaperChange}
              disabled={!isSubmissionOpen}
            />
          </div>

          {paper && (
            <div className="status-section">
              <div className="status-badge success">
                Paper submitted successfully
              </div>
              <p>
                Your paper has been submitted. You will be notified when the review period begins
                and you are assigned a paper to review.
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .submission-instructions {
          background: #f8f9fa;
          padding: 1rem 1.5rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }

        .submission-instructions h3 {
          margin-top: 0;
          margin-bottom: 0.75rem;
          font-size: 1rem;
        }

        .submission-instructions ul {
          margin: 0;
          padding-left: 1.25rem;
        }

        .submission-instructions li {
          margin-bottom: 0.5rem;
          color: #555;
        }

        .upload-section {
          margin-bottom: 1.5rem;
        }

        .upload-section h3 {
          margin-bottom: 1rem;
          font-size: 1rem;
        }

        .status-section {
          text-align: center;
          padding: 1rem;
        }

        .status-badge {
          display: inline-block;
          padding: 0.5rem 1rem;
          border-radius: 20px;
          font-weight: 500;
          margin-bottom: 0.75rem;
        }

        .status-badge.success {
          background: #d4edda;
          color: #155724;
        }

        .status-section p {
          color: #666;
          margin: 0;
        }

        .alert {
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }

        .alert-warning {
          background: #fff3cd;
          color: #856404;
          border: 1px solid #ffeeba;
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

        /* Dark mode adjustments */
        body.dark-mode .submission-instructions {
          background: #2a2a2a;
        }

        body.dark-mode .submission-instructions li {
          color: #aaa;
        }

        body.dark-mode .status-badge.success {
          background: #1e4620;
          color: #a3d9a5;
        }

        body.dark-mode .status-section p {
          color: #aaa;
        }

        body.dark-mode .alert-warning {
          background: #3d3200;
          color: #ffd93d;
          border-color: #5c4d00;
        }
      `}</style>
    </div>
  );
}

export default PaperSubmission;

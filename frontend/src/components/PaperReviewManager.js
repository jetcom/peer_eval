import React, { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * PaperReviewManager component for teachers to manage paper review rounds
 *
 * Props:
 * - roundId: ID of the paper review round
 * - onUpdate: Callback when round status changes
 */
const PaperReviewManager = ({ roundId, onUpdate }) => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [durationHours, setDurationHours] = useState(48);
  const [showSettings, setShowSettings] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [settings, setSettings] = useState({
    submission_deadline: '',
    review_duration_hours: 48,
    anonymous_reviews: true,
    require_submission_to_review: true,
    auto_release_feedback: true
  });

  useEffect(() => {
    if (roundId) {
      fetchStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/paper-review/${roundId}/status`);
      setStatus(res.data);
      setSettings({
        submission_deadline: res.data.submission_deadline || '',
        review_duration_hours: res.data.review_duration_hours || 48,
        anonymous_reviews: res.data.anonymous_reviews,
        require_submission_to_review: res.data.require_submission_to_review,
        auto_release_feedback: res.data.auto_release_feedback
      });
      setDurationHours(res.data.review_duration_hours || 48);
    } catch (err) {
      console.error('Error fetching round status:', err);
      setError(err.response?.data?.error || 'Failed to load status');
    } finally {
      setLoading(false);
    }
  };

  const handleStartReview = async () => {
    if (!window.confirm(`Start the review period? This will assign papers to reviewers. Duration: ${durationHours} hours.`)) {
      return;
    }

    try {
      await axios.post(`/api/paper-review/${roundId}/start-review`, {
        duration_hours: durationHours
      });
      fetchStatus();
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start review');
    }
  };

  const handleReleaseFeedback = async () => {
    if (!window.confirm('Release feedback early? Authors will be able to see their reviews immediately.')) {
      return;
    }

    try {
      await axios.post(`/api/paper-review/${roundId}/release-feedback`);
      fetchStatus();
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to release feedback');
    }
  };

  const handleSaveSettings = async () => {
    try {
      await axios.put(`/api/paper-review/${roundId}/settings`, settings);
      setShowSettings(false);
      fetchStatus();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save settings');
    }
  };

  const handleUploadForStudent = async (e) => {
    e.preventDefault();
    if (!selectedStudent || !uploadFile) {
      setError('Please select a student and choose a file');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);

      await axios.post(`/api/paper-review/${roundId}/papers/${selectedStudent}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setShowUploadForm(false);
      setSelectedStudent('');
      setUploadFile(null);
      fetchStatus();
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload paper');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <div className="prm-loading">Loading...</div>;
  }

  if (error && !status) {
    return <div className="prm-error">{error}</div>;
  }

  const statusBadgeClass = {
    submission: 'badge-info',
    review: 'badge-warning',
    completed: 'badge-success'
  }[status?.status] || 'badge-secondary';

  const statusLabel = {
    submission: 'Accepting Submissions',
    review: 'Review In Progress',
    completed: 'Completed'
  }[status?.status] || status?.status;

  return (
    <div className="paper-review-manager">
      {error && <div className="prm-error">{error}</div>}

      {/* Status Header */}
      <div className="prm-header">
        <h4>Paper Review Status</h4>
        <span className={`prm-badge ${statusBadgeClass}`}>{statusLabel}</span>
      </div>

      {/* Stats */}
      <div className="prm-stats">
        <div className="stat">
          <span className="stat-value">{status?.submitted_count || 0}</span>
          <span className="stat-label">/ {status?.total_students || 0} Submitted</span>
        </div>
        {status?.status !== 'submission' && (
          <>
            <div className="stat">
              <span className="stat-value">{status?.reviews_completed || 0}</span>
              <span className="stat-label">/ {status?.assignments_count || 0} Reviews Done</span>
            </div>
          </>
        )}
      </div>

      {/* Deadlines */}
      {status?.submission_deadline && (
        <div className="prm-info">
          <strong>Submission Deadline:</strong> {new Date(status.submission_deadline).toLocaleString()}
        </div>
      )}
      {status?.review_deadline && (
        <div className="prm-info">
          <strong>Review Deadline:</strong> {new Date(status.review_deadline).toLocaleString()}
        </div>
      )}

      {/* Settings & Upload Buttons */}
      {status?.status === 'submission' && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { setShowSettings(!showSettings); setShowUploadForm(false); }}
          >
            {showSettings ? 'Hide Settings' : 'Settings'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { setShowUploadForm(!showUploadForm); setShowSettings(false); }}
          >
            {showUploadForm ? 'Hide Upload' : 'Upload for Student'}
          </button>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && status?.status === 'submission' && (
        <div className="prm-settings">
          <div className="form-group">
            <label>Submission Deadline</label>
            <input
              type="datetime-local"
              value={settings.submission_deadline ? settings.submission_deadline.slice(0, 16) : ''}
              onChange={(e) => setSettings({ ...settings, submission_deadline: e.target.value ? new Date(e.target.value).toISOString() : '' })}
            />
          </div>
          <div className="form-group">
            <label>Review Duration (hours)</label>
            <input
              type="number"
              min="1"
              max="336"
              value={settings.review_duration_hours}
              onChange={(e) => setSettings({ ...settings, review_duration_hours: parseInt(e.target.value) || 48 })}
            />
          </div>
          <div className="form-group checkbox">
            <label>
              <input
                type="checkbox"
                checked={settings.anonymous_reviews}
                onChange={(e) => setSettings({ ...settings, anonymous_reviews: e.target.checked })}
              />
              Anonymous reviews (hide reviewer name from author)
            </label>
          </div>
          <div className="form-group checkbox">
            <label>
              <input
                type="checkbox"
                checked={settings.require_submission_to_review}
                onChange={(e) => setSettings({ ...settings, require_submission_to_review: e.target.checked })}
              />
              Require submission to be assigned a review
            </label>
          </div>
          <div className="form-group checkbox">
            <label>
              <input
                type="checkbox"
                checked={settings.auto_release_feedback}
                onChange={(e) => setSettings({ ...settings, auto_release_feedback: e.target.checked })}
              />
              Auto-release feedback after review deadline
            </label>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleSaveSettings}>
            Save Settings
          </button>
        </div>
      )}

      {/* Upload for Student Panel */}
      {showUploadForm && status?.status === 'submission' && (
        <div className="prm-settings">
          <h5 style={{ marginTop: 0, marginBottom: '1rem' }}>Upload Paper for Student</h5>
          <form onSubmit={handleUploadForStudent}>
            <div className="form-group">
              <label>Select Student</label>
              <select
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
              >
                <option value="">-- Select a student --</option>
                {/* Students who haven't submitted */}
                {status.students_not_submitted?.length > 0 && (
                  <optgroup label="Not Yet Submitted">
                    {status.students_not_submitted.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                    ))}
                  </optgroup>
                )}
                {/* Students who already submitted (for replacement) */}
                {status.papers?.length > 0 && (
                  <optgroup label="Already Submitted (Replace)">
                    {status.papers.map(p => (
                      <option key={p.author.id} value={p.author.id}>{p.author.name} ({p.author.email})</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div className="form-group">
              <label>PDF File</label>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => setUploadFile(e.target.files[0])}
                style={{ display: 'block', marginTop: '0.25rem' }}
              />
              {uploadFile && (
                <small style={{ color: '#666' }}>{uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)</small>
              )}
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={uploading || !selectedStudent || !uploadFile}
            >
              {uploading ? 'Uploading...' : 'Upload Paper'}
            </button>
          </form>
        </div>
      )}

      {/* Actions */}
      <div className="prm-actions">
        {status?.status === 'submission' && (
          <div className="start-review-section">
            <div className="form-group inline">
              <label>Review Duration:</label>
              <select
                value={durationHours}
                onChange={(e) => setDurationHours(parseInt(e.target.value))}
              >
                <option value={24}>24 hours</option>
                <option value={48}>48 hours</option>
                <option value={72}>72 hours</option>
                <option value={96}>4 days</option>
                <option value={168}>7 days</option>
              </select>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleStartReview}
              disabled={!status?.submitted_count || status.submitted_count < 2}
            >
              Start Review Period
            </button>
            {(!status?.submitted_count || status.submitted_count < 2) && (
              <p className="hint">Need at least 2 papers to start review</p>
            )}
          </div>
        )}

        {status?.status === 'review' && !status?.feedback_released_at && (
          <button className="btn btn-success" onClick={handleReleaseFeedback}>
            Release Feedback Early
          </button>
        )}
      </div>

      {/* Submission List */}
      {status?.papers && status.papers.length > 0 && (
        <div className="prm-submissions">
          <h5>Submissions ({status.papers.length})</h5>
          <table className="prm-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>File</th>
                <th>Submitted</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {status.papers.map((paper) => (
                <tr key={paper.id}>
                  <td>{paper.author.name}</td>
                  <td className="file-name">{paper.file_name}</td>
                  <td>{new Date(paper.submitted_at).toLocaleString()}</td>
                  <td>
                    {paper.is_late ? (
                      <span className="late-badge">Late</span>
                    ) : (
                      <span className="on-time-badge">On time</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Assignments List (after review started) */}
      {status?.assignments && status.assignments.length > 0 && (
        <div className="prm-assignments">
          <h5>Review Assignments ({status.assignments.length})</h5>
          <table className="prm-table">
            <thead>
              <tr>
                <th>Reviewer</th>
                <th>Reviewing</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {status.assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td>{assignment.reviewer.name}</td>
                  <td>{assignment.author.name}'s paper</td>
                  <td>
                    {assignment.review_submitted ? (
                      <span className="complete-badge">Complete</span>
                    ) : (
                      <span className="pending-badge">Pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .paper-review-manager {
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 8px;
          margin-top: 1rem;
        }

        .prm-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .prm-header h4 {
          margin: 0;
        }

        .prm-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 500;
        }

        .badge-info {
          background: #d1ecf1;
          color: #0c5460;
        }

        .badge-warning {
          background: #fff3cd;
          color: #856404;
        }

        .badge-success {
          background: #d4edda;
          color: #155724;
        }

        .prm-stats {
          display: flex;
          gap: 2rem;
          margin-bottom: 1rem;
        }

        .stat {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: bold;
          color: #333;
        }

        .stat-label {
          color: #666;
          font-size: 0.9rem;
        }

        .prm-info {
          font-size: 0.9rem;
          color: #666;
          margin-bottom: 0.5rem;
        }

        .prm-settings {
          background: #fff;
          padding: 1rem;
          border-radius: 6px;
          margin-bottom: 1rem;
          border: 1px solid #ddd;
        }

        .prm-settings .form-group {
          margin-bottom: 0.75rem;
        }

        .prm-settings .form-group.checkbox label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }

        .prm-settings input[type="datetime-local"],
        .prm-settings input[type="number"] {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
        }

        .prm-actions {
          margin: 1rem 0;
        }

        .start-review-section {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .form-group.inline {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .form-group.inline label {
          margin: 0;
          white-space: nowrap;
        }

        .hint {
          color: #999;
          font-size: 0.85rem;
          margin: 0;
        }

        .prm-submissions,
        .prm-assignments {
          margin-top: 1.5rem;
        }

        .prm-submissions h5,
        .prm-assignments h5 {
          margin-bottom: 0.75rem;
        }

        .prm-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
        }

        .prm-table th,
        .prm-table td {
          padding: 0.5rem;
          text-align: left;
          border-bottom: 1px solid #ddd;
        }

        .prm-table th {
          background: #e9ecef;
          font-weight: 500;
        }

        .prm-table .file-name {
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .late-badge,
        .on-time-badge,
        .complete-badge,
        .pending-badge {
          padding: 0.125rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .late-badge {
          background: #ffebee;
          color: #c62828;
        }

        .on-time-badge {
          background: #e8f5e9;
          color: #2e7d32;
        }

        .complete-badge {
          background: #e8f5e9;
          color: #2e7d32;
        }

        .pending-badge {
          background: #fff3e0;
          color: #e65100;
        }

        .prm-loading {
          padding: 1rem;
          text-align: center;
          color: #666;
        }

        .prm-error {
          color: #d32f2f;
          padding: 0.75rem;
          background: #ffebee;
          border-radius: 6px;
          margin-bottom: 1rem;
        }

        /* Dark mode */
        body.dark-mode .paper-review-manager {
          background: #2a2a2a;
        }

        body.dark-mode .stat-value {
          color: #e0e0e0;
        }

        body.dark-mode .prm-settings {
          background: #333;
          border-color: #444;
        }

        body.dark-mode .prm-table th {
          background: #333;
        }

        body.dark-mode .prm-table td {
          border-color: #444;
        }
      `}</style>
    </div>
  );
};

export default PaperReviewManager;

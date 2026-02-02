import React, { useState, useRef } from 'react';
import axios from 'axios';

/**
 * PdfUpload component for uploading PDFs for paper review
 *
 * Props:
 * - roundId: ID of the paper review round
 * - currentPaper: Current paper object (if already submitted)
 * - onPaperChange: Callback when paper is uploaded or deleted
 * - disabled: Whether uploads are disabled
 */
const PdfUpload = ({
  roundId,
  currentPaper = null,
  onPaperChange,
  disabled = false,
}) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleUpload = async (file) => {
    if (!file) return;

    // Validate file type
    if (file.type !== 'application/pdf') {
      setError('Please select a PDF file');
      return;
    }

    // Validate file size (25MB)
    if (file.size > 25 * 1024 * 1024) {
      setError('PDF must be less than 25MB');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(
        `/api/paper-review/${roundId}/papers`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      onPaperChange(response.data);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || 'Failed to upload PDF');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Remove this paper? You can upload a new one before the deadline.')) return;

    try {
      await axios.delete(`/api/paper-review/${roundId}/my-paper`);
      onPaperChange(null);
    } catch (err) {
      console.error('Delete error:', err);
      setError(err.response?.data?.error || 'Failed to delete paper');
    }
  };

  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleUpload(files[0]);
    }
    e.target.value = '';
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleUpload(files[0]);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="pdf-upload">
      {/* Show current paper if uploaded */}
      {currentPaper ? (
        <div className="paper-info">
          <div className="paper-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div className="paper-details">
            <div className="paper-name">{currentPaper.file_name}</div>
            <div className="paper-meta">
              <span>{formatFileSize(currentPaper.file_size)}</span>
              <span>Submitted: {formatDate(currentPaper.submitted_at)}</span>
              {currentPaper.is_late && <span className="late-badge">Late</span>}
            </div>
          </div>
          <div className="paper-actions">
            {currentPaper.url && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => window.open(currentPaper.url, '_blank')}
              >
                View
              </button>
            )}
            {!disabled && (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Replace
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDelete}
                >
                  Delete
                </button>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
      ) : (
        /* Upload area */
        <div
          className={`upload-zone ${dragActive ? 'drag-active' : ''} ${uploading ? 'uploading' : ''} ${disabled ? 'disabled' : ''}`}
          onDragEnter={!disabled ? handleDrag : undefined}
          onDragLeave={!disabled ? handleDrag : undefined}
          onDragOver={!disabled ? handleDrag : undefined}
          onDrop={!disabled ? handleDrop : undefined}
          onClick={() => !uploading && !disabled && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={disabled}
          />
          {uploading ? (
            <div className="upload-status">
              <span className="spinner"></span>
              Uploading...
            </div>
          ) : disabled ? (
            <div className="upload-prompt disabled">
              <span className="upload-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
              </span>
              <span>Submission period has ended</span>
            </div>
          ) : (
            <div className="upload-prompt">
              <span className="upload-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </span>
              <span>Drop your PDF here or click to upload</span>
              <span className="upload-hint">Maximum file size: 25MB</span>
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {error && <div className="upload-error">{error}</div>}

      <style>{`
        .pdf-upload {
          margin: 1rem 0;
        }

        .upload-zone {
          border: 2px dashed #ccc;
          border-radius: 8px;
          padding: 2rem;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          background: #fafafa;
        }

        .upload-zone:hover:not(.disabled) {
          border-color: #666;
          background: #f0f0f0;
        }

        .upload-zone.drag-active {
          border-color: #4a90d9;
          background: #e8f4fc;
        }

        .upload-zone.uploading {
          cursor: wait;
          opacity: 0.7;
        }

        .upload-zone.disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .upload-prompt {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          color: #666;
        }

        .upload-prompt.disabled {
          color: #999;
        }

        .upload-icon {
          color: #999;
        }

        .upload-hint {
          font-size: 0.85rem;
          color: #999;
        }

        .upload-status {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          color: #666;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid #ccc;
          border-top-color: #666;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .upload-error {
          color: #d32f2f;
          font-size: 0.9rem;
          margin-top: 0.5rem;
          padding: 0.5rem;
          background: #ffebee;
          border-radius: 4px;
        }

        .paper-info {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background: #f5f5f5;
          border-radius: 8px;
          border: 1px solid #ddd;
        }

        .paper-icon {
          color: #e74c3c;
          flex-shrink: 0;
        }

        .paper-details {
          flex: 1;
          min-width: 0;
        }

        .paper-name {
          font-weight: 500;
          margin-bottom: 0.25rem;
          word-break: break-word;
        }

        .paper-meta {
          font-size: 0.85rem;
          color: #666;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem 1rem;
        }

        .late-badge {
          background: #ffebee;
          color: #d32f2f;
          padding: 0.125rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .paper-actions {
          display: flex;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        .paper-actions .btn {
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
        }

        @media (max-width: 600px) {
          .paper-info {
            flex-direction: column;
            text-align: center;
          }

          .paper-actions {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
};

export default PdfUpload;

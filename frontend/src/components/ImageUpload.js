import React, { useState, useRef } from 'react';
import axios from 'axios';

/**
 * ImageUpload component for adding images to evaluations
 *
 * Props:
 * - evaluationId: ID of the evaluation to attach images to
 * - evaluationType: 'phase', 'assignment', or 'group'
 * - attachments: Array of current attachments
 * - onAttachmentsChange: Callback when attachments change
 * - maxFiles: Maximum number of files allowed (default: 5)
 * - disabled: Whether uploads are disabled
 */
const ImageUpload = ({
  evaluationId,
  evaluationType = 'phase',
  attachments = [],
  onAttachmentsChange,
  maxFiles = 5,
  disabled = false,
}) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // Determine the API endpoint based on evaluation type
  const getUploadUrl = () => {
    switch (evaluationType) {
      case 'assignment':
        return `/api/assignments/evaluations/individual/${evaluationId}/attachments`;
      case 'group':
        return `/api/assignments/evaluations/group/${evaluationId}/attachments`;
      case 'phase':
      default:
        return `/api/evaluations/${evaluationId}/attachments`;
    }
  };

  const getDeleteUrl = (attachmentId) => {
    switch (evaluationType) {
      case 'assignment':
        return `/api/assignments/evaluations/individual/attachments/${attachmentId}`;
      case 'group':
        return `/api/assignments/evaluations/group/attachments/${attachmentId}`;
      case 'phase':
      default:
        return `/api/evaluations/attachments/${attachmentId}`;
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Please select an image file (JPEG, PNG, GIF, or WebP)');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    // Check if we've reached the limit
    if (attachments.length >= maxFiles) {
      setError(`Maximum ${maxFiles} images allowed`);
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await axios.post(getUploadUrl(), formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Add new attachment to list
      onAttachmentsChange([...attachments, response.data]);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (attachmentId) => {
    if (!window.confirm('Remove this image?')) return;

    try {
      await axios.delete(getDeleteUrl(attachmentId));
      onAttachmentsChange(attachments.filter((a) => a.id !== attachmentId));
    } catch (err) {
      console.error('Delete error:', err);
      setError(err.response?.data?.error || 'Failed to delete image');
    }
  };

  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleUpload(files[0]);
    }
    // Reset input so same file can be selected again
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

  const canUpload = !disabled && attachments.length < maxFiles && evaluationId;

  return (
    <div className="image-upload">
      {/* Upload area */}
      {canUpload && (
        <div
          className={`upload-zone ${dragActive ? 'drag-active' : ''} ${uploading ? 'uploading' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          {uploading ? (
            <div className="upload-status">
              <span className="spinner"></span>
              Uploading...
            </div>
          ) : (
            <div className="upload-prompt">
              <span className="upload-icon">+</span>
              <span>Drop image here or click to upload</span>
              <span className="upload-hint">
                {attachments.length}/{maxFiles} images (max 5MB each)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {error && <div className="upload-error">{error}</div>}

      {/* Attachments grid */}
      {attachments.length > 0 && (
        <div className="attachments-grid">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="attachment-item">
              <img
                src={attachment.url}
                alt={attachment.fileName}
                onClick={() => window.open(attachment.url, '_blank')}
              />
              <div className="attachment-info">
                <span className="attachment-name" title={attachment.fileName}>
                  {attachment.fileName.length > 15
                    ? attachment.fileName.substring(0, 12) + '...'
                    : attachment.fileName}
                </span>
                <span className="attachment-size">{formatFileSize(attachment.fileSize)}</span>
              </div>
              {!disabled && (
                <button
                  type="button"
                  className="attachment-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(attachment.id);
                  }}
                  title="Remove image"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .image-upload {
          margin: 1rem 0;
        }

        .upload-zone {
          border: 2px dashed #ccc;
          border-radius: 8px;
          padding: 1.5rem;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          background: #fafafa;
        }

        .upload-zone:hover {
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

        .upload-prompt {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          color: #666;
        }

        .upload-icon {
          font-size: 2rem;
          font-weight: bold;
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

        .attachments-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: 1rem;
          margin-top: 1rem;
        }

        .attachment-item {
          position: relative;
          border: 1px solid #ddd;
          border-radius: 8px;
          overflow: hidden;
          background: #fff;
        }

        .attachment-item img {
          width: 100%;
          height: 100px;
          object-fit: cover;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .attachment-item img:hover {
          opacity: 0.9;
        }

        .attachment-info {
          padding: 0.5rem;
          font-size: 0.75rem;
          color: #666;
          display: flex;
          flex-direction: column;
        }

        .attachment-name {
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .attachment-size {
          color: #999;
        }

        .attachment-delete {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 24px;
          height: 24px;
          border: none;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.6);
          color: white;
          font-size: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .attachment-item:hover .attachment-delete {
          opacity: 1;
        }

        .attachment-delete:hover {
          background: rgba(211, 47, 47, 0.9);
        }
      `}</style>
    </div>
  );
};

export default ImageUpload;

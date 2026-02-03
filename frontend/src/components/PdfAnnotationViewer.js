import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Viewer, Worker } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';

/**
 * PdfAnnotationViewer - PDF viewer with annotation support
 *
 * Props:
 * - fileUrl: URL of the PDF file
 * - annotations: Array of existing annotations
 * - onAnnotationAdd: Callback when annotation is added
 * - onAnnotationUpdate: Callback when annotation is updated
 * - onAnnotationDelete: Callback when annotation is deleted
 * - readOnly: Whether annotations are read-only
 */
const PdfAnnotationViewer = ({
  fileUrl,
  annotations = [],
  onAnnotationAdd,
  onAnnotationUpdate,
  onAnnotationDelete,
  readOnly = false,
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [scale] = useState(1.0);
  const [activeAnnotation, setActiveAnnotation] = useState(null);
  const [selectedTool, setSelectedTool] = useState('select'); // 'select', 'highlight', 'comment'
  const [newCommentText, setNewCommentText] = useState('');
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentPosition, setCommentPosition] = useState(null);
  const containerRef = useRef(null);

  // Handle document load
  const handleDocumentLoad = (e) => {
    setTotalPages(e.doc.numPages);
  };

  // Handle page change
  const handlePageChange = (e) => {
    setCurrentPage(e.currentPage);
  };

  // Get annotations for current page
  const pageAnnotations = annotations.filter(
    (a) => a.position?.page === currentPage
  );

  // Handle click on PDF for adding comments
  const handlePdfClick = useCallback((e) => {
    if (readOnly || selectedTool !== 'comment') return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setCommentPosition({ page: currentPage, x, y });
    setShowCommentInput(true);
    setNewCommentText('');
  }, [currentPage, readOnly, selectedTool]);

  // Handle text selection for highlights
  const handleMouseUp = useCallback((e) => {
    if (readOnly || selectedTool !== 'highlight') return;

    // Small delay to ensure selection is complete
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const selectedText = selection.toString().trim();
      if (!selectedText) return;

      // Get selection range info
      const range = selection.getRangeAt(0);
      const rects = range.getClientRects();

      if (rects.length === 0) return;

      const container = containerRef.current;
      if (!container) return;

      // Check if selection is within our container
      const containerRect = container.getBoundingClientRect();
      const firstRect = rects[0];
      if (firstRect.left < containerRect.left || firstRect.right > containerRect.right + 50) {
        return; // Selection is outside our PDF container
      }

      // Convert rects to percentages relative to the container
      const normalizedRects = Array.from(rects).map((rect) => ({
        x1: ((rect.left - containerRect.left + container.scrollLeft) / container.scrollWidth) * 100,
        y1: ((rect.top - containerRect.top + container.scrollTop) / container.scrollHeight) * 100,
        x2: ((rect.right - containerRect.left + container.scrollLeft) / container.scrollWidth) * 100,
        y2: ((rect.bottom - containerRect.top + container.scrollTop) / container.scrollHeight) * 100,
        width: (rect.width / container.scrollWidth) * 100,
        height: (rect.height / container.scrollHeight) * 100,
      }));

      // Create highlight annotation
      if (onAnnotationAdd) {
        onAnnotationAdd({
          type: 'highlight',
          position: {
            page: currentPage,
            rects: normalizedRects,
            selectedText,
          },
          content: '',
          color: '#ffff00',
        });
      }

      selection.removeAllRanges();
    }, 10);
  }, [currentPage, readOnly, selectedTool, onAnnotationAdd]);

  // Attach mouseup listener to document for better selection capture
  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseUp]);

  // Add comment
  const handleAddComment = () => {
    if (!newCommentText.trim() || !commentPosition) return;

    if (onAnnotationAdd) {
      onAnnotationAdd({
        type: 'comment',
        position: commentPosition,
        content: newCommentText.trim(),
        color: '#ffeb3b',
      });
    }

    setShowCommentInput(false);
    setCommentPosition(null);
    setNewCommentText('');
  };

  // Cancel comment
  const handleCancelComment = () => {
    setShowCommentInput(false);
    setCommentPosition(null);
    setNewCommentText('');
  };

  // Delete annotation
  const handleDeleteAnnotation = (annotationId) => {
    if (readOnly) return;
    if (onAnnotationDelete) {
      onAnnotationDelete(annotationId);
    }
    setActiveAnnotation(null);
  };

  // Render annotation overlay
  const renderAnnotations = () => {
    return pageAnnotations.map((annotation) => {
      if (annotation.type === 'highlight' && annotation.position?.rects) {
        return (
          <div key={annotation.id} className="annotation-highlight-group">
            {annotation.position.rects.map((rect, idx) => (
              <div
                key={idx}
                className={`annotation-highlight ${activeAnnotation?.id === annotation.id ? 'active' : ''}`}
                style={{
                  left: `${rect.x1}%`,
                  top: `${rect.y1}%`,
                  width: `${rect.width}%`,
                  height: `${rect.height}%`,
                  backgroundColor: annotation.color || '#ffff00',
                }}
                onClick={() => setActiveAnnotation(annotation)}
              />
            ))}
            {activeAnnotation?.id === annotation.id && (
              <div
                className="annotation-popup"
                style={{
                  left: `${annotation.position.rects[0]?.x1 || 0}%`,
                  top: `${(annotation.position.rects[annotation.position.rects.length - 1]?.y2 || 0) + 1}%`,
                }}
              >
                <div className="popup-content">
                  <div className="popup-text">
                    <em>"{annotation.position.selectedText?.slice(0, 50)}..."</em>
                  </div>
                  {annotation.content && (
                    <div className="popup-comment">{annotation.content}</div>
                  )}
                  {!readOnly && (
                    <button
                      className="popup-delete"
                      onClick={() => handleDeleteAnnotation(annotation.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      }

      if (annotation.type === 'comment') {
        return (
          <div
            key={annotation.id}
            className={`annotation-comment-marker ${activeAnnotation?.id === annotation.id ? 'active' : ''}`}
            style={{
              left: `${annotation.position?.x || 0}%`,
              top: `${annotation.position?.y || 0}%`,
            }}
            onClick={() => setActiveAnnotation(
              activeAnnotation?.id === annotation.id ? null : annotation
            )}
          >
            <span className="comment-icon">💬</span>
            {activeAnnotation?.id === annotation.id && (
              <div className="annotation-popup comment-popup">
                <div className="popup-content">
                  <div className="popup-comment">{annotation.content}</div>
                  {!readOnly && (
                    <button
                      className="popup-delete"
                      onClick={() => handleDeleteAnnotation(annotation.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      }

      return null;
    });
  };

  return (
    <div className="pdf-annotation-viewer">
      {/* Toolbar */}
      {!readOnly && (
        <div className="pav-toolbar">
          <div className="tool-group">
            <button
              className={`tool-btn ${selectedTool === 'select' ? 'active' : ''}`}
              onClick={() => setSelectedTool('select')}
              title="Select"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
              </svg>
            </button>
            <button
              className={`tool-btn ${selectedTool === 'highlight' ? 'active' : ''}`}
              onClick={() => setSelectedTool('highlight')}
              title="Highlight text"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </button>
            <button
              className={`tool-btn ${selectedTool === 'comment' ? 'active' : ''}`}
              onClick={() => setSelectedTool('comment')}
              title="Add comment"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          </div>
          <div className="tool-info">
            {selectedTool === 'highlight' && 'Select text to highlight'}
            {selectedTool === 'comment' && 'Click to add a comment'}
            {selectedTool === 'select' && 'Click annotations to view/delete'}
          </div>
        </div>
      )}

      {/* PDF Container */}
      <div
        ref={containerRef}
        className={`pav-container ${selectedTool === 'highlight' ? 'highlight-mode' : ''}`}
        onClick={handlePdfClick}
      >
        <Worker workerUrl={`https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`}>
          <Viewer
            fileUrl={fileUrl}
            onDocumentLoad={handleDocumentLoad}
            onPageChange={handlePageChange}
            defaultScale={scale}
          />
        </Worker>

        {/* Annotation overlay */}
        <div className="annotation-layer">
          {renderAnnotations()}
        </div>

        {/* Comment input popup */}
        {showCommentInput && commentPosition && (
          <div
            className="comment-input-popup"
            style={{
              left: `${commentPosition.x}%`,
              top: `${commentPosition.y}%`,
            }}
          >
            <textarea
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              placeholder="Enter your comment..."
              autoFocus
              rows={3}
            />
            <div className="comment-input-actions">
              <button className="btn btn-sm btn-secondary" onClick={handleCancelComment}>
                Cancel
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={handleAddComment}
                disabled={!newCommentText.trim()}
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Page info */}
      <div className="pav-footer">
        <span>Page {currentPage + 1} of {totalPages}</span>
        <span>{pageAnnotations.length} annotation(s) on this page</span>
      </div>

      <style>{`
        .pdf-annotation-viewer {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #525659;
          border-radius: 8px;
          overflow: hidden;
        }

        .pav-toolbar {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.5rem 1rem;
          background: #3a3a3a;
          border-bottom: 1px solid #2a2a2a;
        }

        .tool-group {
          display: flex;
          gap: 0.25rem;
        }

        .tool-btn {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          color: #ccc;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .tool-btn:hover {
          background: #4a4a4a;
          color: #fff;
        }

        .tool-btn.active {
          background: #4a90d9;
          color: #fff;
        }

        .tool-info {
          color: #999;
          font-size: 0.85rem;
        }

        .pav-container {
          flex: 1;
          position: relative;
          overflow: auto;
        }

        .annotation-layer {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          z-index: 10;
        }

        .annotation-highlight,
        .annotation-comment-marker,
        .annotation-popup,
        .comment-input-popup {
          pointer-events: auto;
        }

        .annotation-highlight {
          position: absolute;
          opacity: 0.4;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .annotation-highlight:hover,
        .annotation-highlight.active {
          opacity: 0.6;
        }

        .annotation-comment-marker {
          position: absolute;
          cursor: pointer;
          transform: translate(-50%, -50%);
          font-size: 1.25rem;
          filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
          transition: transform 0.2s;
        }

        .annotation-comment-marker:hover,
        .annotation-comment-marker.active {
          transform: translate(-50%, -50%) scale(1.2);
        }

        .annotation-popup {
          position: absolute;
          background: #fff;
          border-radius: 6px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          z-index: 100;
          min-width: 200px;
          max-width: 300px;
        }

        .comment-popup {
          transform: translateX(-50%);
        }

        .popup-content {
          padding: 0.75rem;
        }

        .popup-text {
          font-size: 0.85rem;
          color: #666;
          margin-bottom: 0.5rem;
        }

        .popup-comment {
          font-size: 0.9rem;
          color: #333;
          white-space: pre-wrap;
        }

        .popup-delete {
          margin-top: 0.5rem;
          padding: 0.25rem 0.5rem;
          background: #ffebee;
          color: #c62828;
          border: none;
          border-radius: 4px;
          font-size: 0.75rem;
          cursor: pointer;
        }

        .popup-delete:hover {
          background: #ffcdd2;
        }

        .comment-input-popup {
          position: absolute;
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          padding: 0.75rem;
          z-index: 100;
          min-width: 250px;
          transform: translate(-50%, 10px);
        }

        .comment-input-popup textarea {
          width: 100%;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 0.5rem;
          font-family: inherit;
          font-size: 0.9rem;
          resize: vertical;
        }

        .comment-input-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .comment-input-actions .btn {
          padding: 0.25rem 0.75rem;
          font-size: 0.85rem;
        }

        .pav-footer {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem 1rem;
          background: #3a3a3a;
          color: #999;
          font-size: 0.85rem;
          border-top: 1px solid #2a2a2a;
        }

        /* Override pdf viewer styles */
        .rpv-core__viewer {
          background: #525659;
        }

        .rpv-core__inner-page {
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }

        /* Ensure text layer is selectable */
        .rpv-core__text-layer {
          user-select: text !important;
          -webkit-user-select: text !important;
        }

        .rpv-core__text-layer span {
          user-select: text !important;
          -webkit-user-select: text !important;
        }

        /* Highlight cursor when in highlight mode */
        .pav-container.highlight-mode {
          cursor: text;
        }

        .pav-container.highlight-mode .rpv-core__text-layer {
          cursor: text;
        }

        /* Visual feedback for selection */
        .rpv-core__text-layer ::selection {
          background: rgba(255, 255, 0, 0.5);
        }
      `}</style>
    </div>
  );
};

export default PdfAnnotationViewer;

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Viewer, Worker, SpecialZoomLevel } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

/**
 * PdfAnnotationViewer - PDF viewer with annotation support
 */
const PdfAnnotationViewer = ({
  fileUrl,
  annotations = [],
  onAnnotationAdd,
  onAnnotationDelete,
  readOnly = false,
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [activeAnnotation, setActiveAnnotation] = useState(null);
  const [selectedTool, setSelectedTool] = useState('select');
  const [newCommentText, setNewCommentText] = useState('');
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentPosition, setCommentPosition] = useState(null);
  const containerRef = useRef(null);

  // Create the default layout plugin (includes toolbar, sidebar, text selection)
  const defaultLayoutPluginInstance = defaultLayoutPlugin({
    sidebarTabs: () => [], // Hide sidebar
    toolbarPlugin: {
      fullScreenPlugin: { onEnterFullScreen: () => {}, onExitFullScreen: () => {} },
    },
  });

  // Get annotations for current page
  const pageAnnotations = annotations.filter(
    (a) => a.position?.page === currentPage
  );

  // Handle text selection for highlights
  const handleMouseUp = useCallback(() => {
    if (readOnly || selectedTool !== 'highlight') return;

    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const selectedText = selection.toString().trim();
      if (!selectedText || selectedText.length < 2) return;

      const container = containerRef.current;
      if (!container) return;

      // Check if selection is within our PDF container
      const range = selection.getRangeAt(0);
      const commonAncestor = range.commonAncestorContainer;
      if (!container.contains(commonAncestor)) return;

      const rects = range.getClientRects();
      if (rects.length === 0) return;

      const containerRect = container.getBoundingClientRect();

      // Convert rects to percentages
      const normalizedRects = Array.from(rects)
        .filter(rect => rect.width > 0 && rect.height > 0)
        .map((rect) => ({
          x1: ((rect.left - containerRect.left + container.scrollLeft) / container.scrollWidth) * 100,
          y1: ((rect.top - containerRect.top + container.scrollTop) / container.scrollHeight) * 100,
          width: (rect.width / container.scrollWidth) * 100,
          height: (rect.height / container.scrollHeight) * 100,
        }));

      if (normalizedRects.length === 0) return;

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
    }, 50);
  }, [currentPage, readOnly, selectedTool, onAnnotationAdd]);

  // Handle click for adding comments
  const handleContainerClick = useCallback((e) => {
    // Close active annotation popup when clicking elsewhere
    if (activeAnnotation && !e.target.closest('.annotation-popup')) {
      setActiveAnnotation(null);
    }

    if (readOnly || selectedTool !== 'comment') return;

    const container = containerRef.current;
    if (!container) return;

    // Don't add comment if clicking on existing annotation
    if (e.target.closest('.annotation-marker') || e.target.closest('.annotation-highlight')) return;

    const containerRect = container.getBoundingClientRect();
    const x = ((e.clientX - containerRect.left + container.scrollLeft) / container.scrollWidth) * 100;
    const y = ((e.clientY - containerRect.top + container.scrollTop) / container.scrollHeight) * 100;

    setCommentPosition({ page: currentPage, x, y });
    setShowCommentInput(true);
    setNewCommentText('');
  }, [currentPage, readOnly, selectedTool, activeAnnotation]);

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

  // Attach mouseup listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('mouseup', handleMouseUp);
    return () => container.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  // Render highlights
  const renderHighlights = () => {
    return pageAnnotations
      .filter(a => a.type === 'highlight' && a.position?.rects)
      .map((annotation) => (
        <div key={annotation.id} className="highlight-group">
          {annotation.position.rects.map((rect, idx) => (
            <div
              key={idx}
              className="highlight-rect"
              style={{
                left: `${rect.x1}%`,
                top: `${rect.y1}%`,
                width: `${rect.width}%`,
                height: `${rect.height}%`,
                backgroundColor: annotation.color || '#ffff00',
              }}
              onClick={(e) => {
                e.stopPropagation();
                setActiveAnnotation(activeAnnotation?.id === annotation.id ? null : annotation);
              }}
            />
          ))}
          {activeAnnotation?.id === annotation.id && (
            <div
              className="annotation-popup"
              style={{
                left: `${annotation.position.rects[0]?.x1 || 0}%`,
                top: `${(annotation.position.rects[annotation.position.rects.length - 1]?.y1 || 0) + (annotation.position.rects[annotation.position.rects.length - 1]?.height || 2)}%`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="popup-text">"{annotation.position.selectedText?.slice(0, 100)}{annotation.position.selectedText?.length > 100 ? '...' : ''}"</div>
              {!readOnly && (
                <button className="popup-delete" onClick={() => onAnnotationDelete?.(annotation.id)}>
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      ));
  };

  // Render comment markers
  const renderComments = () => {
    return pageAnnotations
      .filter(a => a.type === 'comment')
      .map((annotation) => (
        <div
          key={annotation.id}
          className="annotation-marker"
          style={{
            left: `${annotation.position?.x || 0}%`,
            top: `${annotation.position?.y || 0}%`,
          }}
          onClick={(e) => {
            e.stopPropagation();
            setActiveAnnotation(activeAnnotation?.id === annotation.id ? null : annotation);
          }}
        >
          <span className="marker-icon">💬</span>
          {activeAnnotation?.id === annotation.id && (
            <div className="annotation-popup" onClick={(e) => e.stopPropagation()}>
              <div className="popup-comment">{annotation.content}</div>
              {!readOnly && (
                <button className="popup-delete" onClick={() => onAnnotationDelete?.(annotation.id)}>
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      ));
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
              title="Select/View"
            >
              👆
            </button>
            <button
              className={`tool-btn ${selectedTool === 'highlight' ? 'active' : ''}`}
              onClick={() => setSelectedTool('highlight')}
              title="Highlight text"
            >
              🖍️
            </button>
            <button
              className={`tool-btn ${selectedTool === 'comment' ? 'active' : ''}`}
              onClick={() => setSelectedTool('comment')}
              title="Add comment"
            >
              💬
            </button>
          </div>
          <div className="tool-info">
            {selectedTool === 'highlight' && '📌 Select text to highlight'}
            {selectedTool === 'comment' && '📌 Click to add a comment'}
            {selectedTool === 'select' && '📌 Click annotations to view/delete'}
          </div>
        </div>
      )}

      {/* PDF Container */}
      <div
        ref={containerRef}
        className={`pav-container ${selectedTool === 'highlight' ? 'highlight-mode' : ''} ${selectedTool === 'comment' ? 'comment-mode' : ''}`}
        onClick={handleContainerClick}
      >
        <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
          <Viewer
            fileUrl={fileUrl}
            plugins={[defaultLayoutPluginInstance]}
            defaultScale={SpecialZoomLevel.PageWidth}
            onPageChange={(e) => setCurrentPage(e.currentPage)}
          />
        </Worker>

        {/* Annotation overlay */}
        <div className="annotation-overlay">
          {renderHighlights()}
          {renderComments()}
        </div>

        {/* Comment input */}
        {showCommentInput && commentPosition && (
          <div
            className="comment-input-box"
            style={{
              left: `${commentPosition.x}%`,
              top: `${commentPosition.y}%`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <textarea
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              placeholder="Enter your comment..."
              autoFocus
              rows={3}
            />
            <div className="comment-actions">
              <button onClick={() => { setShowCommentInput(false); setCommentPosition(null); }}>
                Cancel
              </button>
              <button onClick={handleAddComment} disabled={!newCommentText.trim()} className="primary">
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pav-footer">
        <span>Page {currentPage + 1}</span>
        <span>{pageAnnotations.length} annotation(s)</span>
      </div>

      <style>{`
        .pdf-annotation-viewer {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #404040;
          border-radius: 8px;
          overflow: hidden;
        }

        .pav-toolbar {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 8px 12px;
          background: #333;
          border-bottom: 1px solid #222;
          flex-shrink: 0;
        }

        .tool-group {
          display: flex;
          gap: 4px;
        }

        .tool-btn {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: #444;
          color: #fff;
          border-radius: 6px;
          cursor: pointer;
          font-size: 18px;
          transition: all 0.15s;
        }

        .tool-btn:hover {
          background: #555;
        }

        .tool-btn.active {
          background: #4a90d9;
          box-shadow: 0 0 0 2px rgba(74, 144, 217, 0.4);
        }

        .tool-info {
          color: #aaa;
          font-size: 13px;
        }

        .pav-container {
          flex: 1;
          position: relative;
          overflow: auto;
          background: #525659;
        }

        .pav-container.highlight-mode {
          cursor: text;
        }

        .pav-container.comment-mode {
          cursor: crosshair;
        }

        .annotation-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          z-index: 10;
        }

        .highlight-group,
        .annotation-marker,
        .annotation-popup,
        .comment-input-box {
          pointer-events: auto;
        }

        .highlight-rect {
          position: absolute;
          opacity: 0.35;
          cursor: pointer;
          transition: opacity 0.15s;
          border-radius: 2px;
        }

        .highlight-rect:hover {
          opacity: 0.5;
        }

        .annotation-marker {
          position: absolute;
          cursor: pointer;
          transform: translate(-50%, -50%);
          font-size: 24px;
          z-index: 20;
          transition: transform 0.15s;
        }

        .annotation-marker:hover {
          transform: translate(-50%, -50%) scale(1.15);
        }

        .annotation-popup {
          position: absolute;
          background: #333;
          color: #fff;
          border-radius: 8px;
          padding: 12px;
          min-width: 180px;
          max-width: 280px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.4);
          z-index: 100;
          font-size: 13px;
          margin-top: 8px;
        }

        .popup-text {
          color: #ccc;
          font-style: italic;
          margin-bottom: 8px;
          line-height: 1.4;
          word-break: break-word;
        }

        .popup-comment {
          color: #fff;
          line-height: 1.4;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .popup-delete {
          margin-top: 10px;
          padding: 4px 10px;
          background: #c62828;
          color: #fff;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
        }

        .popup-delete:hover {
          background: #d32f2f;
        }

        .comment-input-box {
          position: absolute;
          background: #fff;
          border-radius: 8px;
          padding: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          z-index: 100;
          min-width: 220px;
          transform: translate(-50%, 8px);
        }

        .comment-input-box textarea {
          width: 100%;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 8px;
          font-family: inherit;
          font-size: 13px;
          resize: vertical;
          min-height: 60px;
        }

        .comment-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 8px;
        }

        .comment-actions button {
          padding: 6px 12px;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          background: #e0e0e0;
        }

        .comment-actions button:hover {
          background: #d0d0d0;
        }

        .comment-actions button.primary {
          background: #4a90d9;
          color: #fff;
        }

        .comment-actions button.primary:hover {
          background: #3a80c9;
        }

        .comment-actions button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pav-footer {
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          background: #333;
          color: #999;
          font-size: 12px;
          border-top: 1px solid #222;
          flex-shrink: 0;
        }

        /* PDF viewer overrides */
        .rpv-core__viewer {
          background: #525659 !important;
        }

        .rpv-default-layout__container {
          border: none !important;
        }

        .rpv-default-layout__toolbar {
          display: none !important;
        }

        .rpv-default-layout__sidebar {
          display: none !important;
        }

        /* Enable text selection */
        .rpv-core__text-layer {
          user-select: text !important;
        }

        .rpv-core__text-layer > span {
          user-select: text !important;
        }

        .rpv-core__text-layer ::selection {
          background: rgba(255, 255, 0, 0.4) !important;
        }
      `}</style>
    </div>
  );
};

export default PdfAnnotationViewer;

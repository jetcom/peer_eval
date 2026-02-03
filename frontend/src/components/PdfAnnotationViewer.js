import React, { useState, useRef } from 'react';
import { Viewer, Worker, SpecialZoomLevel } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';

/**
 * PdfAnnotationViewer - PDF viewer with click-to-annotate support
 */
const PdfAnnotationViewer = ({
  fileUrl,
  annotations = [],
  onAnnotationAdd,
  onAnnotationDelete,
  onPageChange,
  readOnly = false,
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [pendingAnnotation, setPendingAnnotation] = useState(null);
  const [commentText, setCommentText] = useState('');
  const containerRef = useRef(null);

  // Get annotations for current page
  const pageAnnotations = annotations.filter((a) => {
    const page = a.position?.page ?? a.position?.highlightAreas?.[0]?.pageIndex ?? -1;
    return page === currentPage;
  });

  const handlePageChange = (e) => {
    setCurrentPage(e.currentPage);
    if (onPageChange) {
      onPageChange(e.currentPage);
    }
  };

  // Handle click on PDF to add annotation
  const handleContainerClick = (e) => {
    if (readOnly || !onAnnotationAdd) return;

    // Don't trigger if clicking on existing annotation marker or popup
    if (e.target.closest('.annotation-marker') || e.target.closest('.comment-popup')) return;

    const container = containerRef.current;
    if (!container) return;

    // Get the page element that was clicked
    const pageElement = e.target.closest('.rpv-core__page-layer');
    if (!pageElement) return;

    const pageRect = pageElement.getBoundingClientRect();
    const x = ((e.clientX - pageRect.left) / pageRect.width) * 100;
    const y = ((e.clientY - pageRect.top) / pageRect.height) * 100;

    setPendingAnnotation({ page: currentPage, x, y });
    setCommentText('');
  };

  // Save the pending annotation
  const handleSaveAnnotation = () => {
    if (!pendingAnnotation || !commentText.trim()) return;

    onAnnotationAdd({
      type: 'comment',
      position: pendingAnnotation,
      content: commentText.trim(),
    });

    setPendingAnnotation(null);
    setCommentText('');
  };

  // Cancel pending annotation
  const handleCancelAnnotation = () => {
    setPendingAnnotation(null);
    setCommentText('');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#404040',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      {!readOnly && (
        <div
          style={{
            padding: '10px 14px',
            background: '#333',
            borderBottom: '1px solid #222',
            color: '#aaa',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ color: '#4a90d9' }}>💬</span>
          Click anywhere on the PDF to add a comment at that location
        </div>
      )}

      {/* PDF Container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'auto',
          background: '#525659',
          cursor: readOnly ? 'default' : 'crosshair',
        }}
        onClick={handleContainerClick}
      >
        <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
          <Viewer
            fileUrl={fileUrl}
            defaultScale={SpecialZoomLevel.PageWidth}
            onPageChange={handlePageChange}
          />
        </Worker>

        {/* Render annotation markers */}
        {pageAnnotations.map((annotation) => (
          <div
            key={annotation.id}
            className="annotation-marker"
            style={{
              position: 'absolute',
              left: `${annotation.position?.x || 5}%`,
              top: `${annotation.position?.y || 5}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: '24px',
              cursor: 'pointer',
              zIndex: 100,
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
            }}
            onClick={(e) => {
              e.stopPropagation();
              // Show annotation content in an alert for now
              alert(`Comment:\n\n${annotation.content || 'No content'}`);
            }}
            title={annotation.content || 'Click to view'}
          >
            📌
          </div>
        ))}

        {/* Pending annotation input */}
        {pendingAnnotation && (
          <div
            className="comment-popup"
            style={{
              position: 'absolute',
              left: `${Math.min(pendingAnnotation.x, 70)}%`,
              top: `${pendingAnnotation.y}%`,
              background: '#fff',
              borderRadius: '8px',
              padding: '12px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              zIndex: 200,
              minWidth: '250px',
              maxWidth: '350px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Enter your comment..."
              autoFocus
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontFamily: 'inherit',
                fontSize: '13px',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={handleCancelAnnotation}
                style={{
                  padding: '6px 12px',
                  background: '#e0e0e0',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAnnotation}
                disabled={!commentText.trim()}
                style={{
                  padding: '6px 12px',
                  background: commentText.trim() ? '#4a90d9' : '#ccc',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: commentText.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Add Comment
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: '#333',
          color: '#999',
          fontSize: '12px',
          borderTop: '1px solid #222',
        }}
      >
        <span>Page {currentPage + 1}</span>
        <span>{pageAnnotations.length} annotation(s) on this page</span>
      </div>

      <style>{`
        .rpv-core__viewer {
          background: #525659 !important;
        }
        .annotation-marker:hover {
          transform: translate(-50%, -50%) scale(1.2);
        }
      `}</style>
    </div>
  );
};

export default PdfAnnotationViewer;

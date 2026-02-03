import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Viewer, Worker, SpecialZoomLevel } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';

/**
 * PdfAnnotationViewer - PDF viewer with click-to-annotate support
 * Annotations are rendered on top of PDF pages and scroll with content
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
  const [selectedAnnotation, setSelectedAnnotation] = useState(null);
  const containerRef = useRef(null);
  const [renderKey, setRenderKey] = useState(0);

  // Force re-render when pages load to position markers
  useEffect(() => {
    const timer = setInterval(() => {
      const pages = containerRef.current?.querySelectorAll('.rpv-core__page-layer');
      if (pages && pages.length > 0) {
        setRenderKey(n => n + 1);
        clearInterval(timer);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [fileUrl]);

  const handlePageChange = useCallback((e) => {
    setCurrentPage(e.currentPage);
    if (onPageChange) {
      onPageChange(e.currentPage);
    }
  }, [onPageChange]);

  // Handle click on PDF container to add annotation
  const handleContainerClick = useCallback((e) => {
    if (readOnly || !onAnnotationAdd) return;

    // Don't trigger if clicking on existing annotation marker or popup
    if (e.target.closest('.annotation-marker') || e.target.closest('.comment-popup')) return;

    // Find which page was clicked
    const pageElement = e.target.closest('.rpv-core__page-layer');
    if (!pageElement) return;

    // Get page index from data attribute or DOM position
    const container = containerRef.current;
    const pages = container?.querySelectorAll('.rpv-core__page-layer');
    if (!pages) return;

    let pageIndex = -1;
    pages.forEach((page, idx) => {
      if (page === pageElement || page.contains(e.target)) {
        pageIndex = idx;
      }
    });

    if (pageIndex === -1) return;

    const pageRect = pageElement.getBoundingClientRect();
    const x = ((e.clientX - pageRect.left) / pageRect.width) * 100;
    const y = ((e.clientY - pageRect.top) / pageRect.height) * 100;

    setPendingAnnotation({ page: pageIndex, x, y });
    setCommentText('');
    setSelectedAnnotation(null);
  }, [readOnly, onAnnotationAdd]);

  // Save the pending annotation
  const handleSaveAnnotation = useCallback(() => {
    if (!pendingAnnotation || !commentText.trim()) return;

    onAnnotationAdd({
      type: 'comment',
      position: pendingAnnotation,
      content: commentText.trim(),
    });

    setPendingAnnotation(null);
    setCommentText('');
  }, [pendingAnnotation, commentText, onAnnotationAdd]);

  // Cancel pending annotation
  const handleCancelAnnotation = useCallback(() => {
    setPendingAnnotation(null);
    setCommentText('');
  }, []);

  // Render annotations overlay for each page
  const renderPageAnnotations = useCallback(() => {
    const container = containerRef.current;
    if (!container) return null;

    const pageElements = container.querySelectorAll('.rpv-core__page-layer');
    if (!pageElements || pageElements.length === 0) return null;

    const elements = [];

    pageElements.forEach((pageElement, pageIndex) => {
      // Get annotations for this page
      const pageAnnotations = annotations.filter(a => {
        const annotPage = a.position?.page ?? -1;
        return annotPage === pageIndex;
      });

      // Skip if no annotations and no pending annotation for this page
      const hasPending = pendingAnnotation && pendingAnnotation.page === pageIndex;
      const hasSelected = selectedAnnotation && pageAnnotations.some(a => a.id === selectedAnnotation.id);

      if (pageAnnotations.length === 0 && !hasPending && !hasSelected) return;

      // Create overlay div for this page's annotations
      const overlayStyle = {
        position: 'absolute',
        left: pageElement.offsetLeft,
        top: pageElement.offsetTop,
        width: pageElement.offsetWidth,
        height: pageElement.offsetHeight,
        pointerEvents: 'none',
        zIndex: 10,
      };

      elements.push(
        <div key={`page-overlay-${pageIndex}`} style={overlayStyle}>
          {/* Annotation markers */}
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
                pointerEvents: 'auto',
                transition: 'transform 0.15s',
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedAnnotation(selectedAnnotation?.id === annotation.id ? null : annotation);
              }}
              title={annotation.content || 'Click to view'}
            >
              📌
            </div>
          ))}

          {/* Selected annotation popup */}
          {selectedAnnotation && pageAnnotations.some(a => a.id === selectedAnnotation.id) && (
            <div
              className="comment-popup"
              style={{
                position: 'absolute',
                left: `${Math.min(Math.max(selectedAnnotation.position?.x || 10, 10), 60)}%`,
                top: `${(selectedAnnotation.position?.y || 10) + 3}%`,
                background: '#2d2d2d',
                color: '#fff',
                borderRadius: '8px',
                padding: '12px 14px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                zIndex: 200,
                minWidth: '200px',
                maxWidth: '280px',
                fontSize: '13px',
                pointerEvents: 'auto',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ marginBottom: '10px', lineHeight: '1.4' }}>
                {selectedAnnotation.content || 'No content'}
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                {!readOnly && onAnnotationDelete && (
                  <button
                    style={{
                      padding: '5px 10px',
                      background: '#c62828',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      onAnnotationDelete(selectedAnnotation.id);
                      setSelectedAnnotation(null);
                    }}
                  >
                    Delete
                  </button>
                )}
                <button
                  style={{
                    padding: '5px 10px',
                    background: '#555',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedAnnotation(null)}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Pending annotation input */}
          {pendingAnnotation && pendingAnnotation.page === pageIndex && (
            <div
              className="comment-popup"
              style={{
                position: 'absolute',
                left: `${Math.min(Math.max(pendingAnnotation.x, 5), 55)}%`,
                top: `${pendingAnnotation.y}%`,
                background: '#fff',
                borderRadius: '8px',
                padding: '12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                zIndex: 300,
                minWidth: '250px',
                maxWidth: '320px',
                pointerEvents: 'auto',
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
                  minHeight: '70px',
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
      );
    });

    return elements;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, pendingAnnotation, commentText, selectedAnnotation, readOnly, onAnnotationDelete, handleCancelAnnotation, handleSaveAnnotation, renderKey]);

  // Re-render annotations when scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollContainer = container.querySelector('.rpv-core__inner-pages');
    if (!scrollContainer) return;

    const handleScroll = () => setRenderKey(n => n + 1);
    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // Get page annotation counts
  const pageAnnotationCount = annotations.filter((a) => {
    const page = a.position?.page ?? -1;
    return page === currentPage;
  }).length;

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
          overflow: 'hidden',
          background: '#525659',
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

        {/* Annotation overlays */}
        {renderPageAnnotations()}
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
        <span>{pageAnnotationCount} annotation(s) on this page</span>
      </div>

      <style>{`
        .rpv-core__viewer {
          background: #525659 !important;
        }
        .annotation-marker:hover {
          transform: translate(-50%, -50%) scale(1.2) !important;
        }
      `}</style>
    </div>
  );
};

export default PdfAnnotationViewer;

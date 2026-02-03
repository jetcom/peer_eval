import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Viewer, Worker, SpecialZoomLevel } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';

/**
 * PdfAnnotationViewer - PDF viewer with click-to-annotate support
 * Uses React portals to render markers directly inside PDF pages
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
  const [pageMap, setPageMap] = useState(new Map()); // Map<pageIndex, DOM element>
  const containerRef = useRef(null);

  // Helper to extract page index from data-testid attribute
  const getPageIndexFromElement = (element) => {
    const testId = element.getAttribute('data-testid');
    if (testId && testId.startsWith('core__page-layer-')) {
      return parseInt(testId.replace('core__page-layer-', ''), 10);
    }
    return -1;
  };

  // Find and track PDF page elements using data-testid for accurate page numbers
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const findPages = () => {
      const pages = container.querySelectorAll('[data-testid^="core__page-layer-"]');
      const newMap = new Map();
      pages.forEach((page) => {
        const pageIndex = getPageIndexFromElement(page);
        if (pageIndex >= 0) {
          newMap.set(pageIndex, page);
        }
      });
      if (newMap.size > 0) {
        setPageMap(newMap);
      }
    };

    // Initial search
    findPages();

    // Use MutationObserver to detect when pages are rendered
    const observer = new MutationObserver(() => {
      findPages();
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [fileUrl]);

  const handlePageChange = useCallback((e) => {
    setCurrentPage(e.currentPage);
    if (onPageChange) {
      onPageChange(e.currentPage);
    }
  }, [onPageChange]);

  // Handle click on PDF to add annotation
  const handleContainerClick = useCallback((e) => {
    if (readOnly || !onAnnotationAdd) return;

    // Don't trigger if clicking on annotation elements
    if (e.target.closest('.pdf-annotation-marker') || e.target.closest('.pdf-annotation-popup')) return;

    // Find which page was clicked using data-testid
    const pageElement = e.target.closest('[data-testid^="core__page-layer-"]');
    if (!pageElement) return;

    const pageIndex = getPageIndexFromElement(pageElement);
    if (pageIndex < 0) return;

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

  // Render annotation markers for a specific page using portal
  const renderPageMarkers = (pageIndex, pageElement) => {
    const pageAnnotations = annotations.filter(a => (a.position?.page ?? -1) === pageIndex);
    const hasPending = pendingAnnotation && pendingAnnotation.page === pageIndex;
    const hasSelected = selectedAnnotation && pageAnnotations.some(a => a.id === selectedAnnotation.id);

    if (pageAnnotations.length === 0 && !hasPending && !hasSelected) return null;

    return createPortal(
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        {/* Annotation markers */}
        {pageAnnotations.map((annotation) => (
          <div
            key={annotation.id}
            className="pdf-annotation-marker"
            style={{
              position: 'absolute',
              left: `${annotation.position?.x || 5}%`,
              top: `${annotation.position?.y || 5}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: '24px',
              cursor: 'pointer',
              zIndex: 100,
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
              pointerEvents: 'auto',
              transition: 'transform 0.15s',
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedAnnotation(selectedAnnotation?.id === annotation.id ? null : annotation);
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.2)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translate(-50%, -50%)'}
            title={annotation.content || 'Click to view'}
          >
            📌
          </div>
        ))}

        {/* Selected annotation popup */}
        {selectedAnnotation && pageAnnotations.some(a => a.id === selectedAnnotation.id) && (
          <div
            className="pdf-annotation-popup"
            style={{
              position: 'absolute',
              left: `${Math.min(Math.max(selectedAnnotation.position?.x || 10, 5), 55)}%`,
              top: `${(selectedAnnotation.position?.y || 10) + 4}%`,
              background: '#2d2d2d',
              color: '#fff',
              borderRadius: '8px',
              padding: '12px 14px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
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
        {hasPending && (
          <div
            className="pdf-annotation-popup"
            style={{
              position: 'absolute',
              left: `${Math.min(Math.max(pendingAnnotation.x, 5), 50)}%`,
              top: `${pendingAnnotation.y + 2}%`,
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
                onClick={() => {
                  setPendingAnnotation(null);
                  setCommentText('');
                }}
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
      </div>,
      pageElement
    );
  };

  // Count annotations on current page
  const pageAnnotationCount = annotations.filter(a => (a.position?.page ?? -1) === currentPage).length;

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

        {/* Render annotation markers via portals into each page */}
        {Array.from(pageMap.entries()).map(([pageIndex, pageElement]) => (
          <React.Fragment key={pageIndex}>
            {renderPageMarkers(pageIndex, pageElement)}
          </React.Fragment>
        ))}
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
        .rpv-core__page-layer,
        [data-testid^="core__page-layer-"] {
          position: relative !important;
        }
      `}</style>
    </div>
  );
};

export default PdfAnnotationViewer;

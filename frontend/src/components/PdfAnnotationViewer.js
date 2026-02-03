import React, { useState } from 'react';
import { Viewer, Worker, SpecialZoomLevel } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';

/**
 * PdfAnnotationViewer - Simple PDF viewer with annotation list
 *
 * Due to react-pdf-viewer plugin limitations with React hooks,
 * we use a simple viewer + sidebar approach for annotations.
 */
const PdfAnnotationViewer = ({
  fileUrl,
  annotations = [],
  onAnnotationAdd,
  onAnnotationDelete,
  readOnly = false,
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);

  // Get annotations for current page
  const pageAnnotationCount = annotations.filter(
    (a) => {
      const page = a.position?.page ?? a.position?.highlightAreas?.[0]?.pageIndex ?? -1;
      return page === currentPage;
    }
  ).length;

  const selectedAnnotation = annotations.find(a => a.id === selectedAnnotationId);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#404040',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      {/* Info bar */}
      {!readOnly && (
        <div style={{
          padding: '10px 14px',
          background: '#333',
          borderBottom: '1px solid #222',
          color: '#aaa',
          fontSize: '13px',
        }}>
          View the PDF below. Use the annotation sidebar to manage comments.
        </div>
      )}

      {/* PDF Viewer */}
      <div style={{
        flex: 1,
        position: 'relative',
        overflow: 'auto',
        background: '#525659',
      }}>
        <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
          <Viewer
            fileUrl={fileUrl}
            defaultScale={SpecialZoomLevel.PageWidth}
            onPageChange={(e) => setCurrentPage(e.currentPage)}
          />
        </Worker>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: '#333',
        color: '#999',
        fontSize: '12px',
        borderTop: '1px solid #222',
      }}>
        <span>Page {currentPage + 1}</span>
        <span>{pageAnnotationCount} annotation(s) on this page</span>
      </div>

      {/* Selected annotation popup */}
      {selectedAnnotation && (
        <div
          style={{
            position: 'absolute',
            bottom: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#2d2d2d',
            color: '#fff',
            padding: '14px 18px',
            borderRadius: '8px',
            minWidth: '280px',
            maxWidth: '400px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            zIndex: 1000,
            fontSize: '13px',
            border: '1px solid #444',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{
            color: '#bbb',
            fontStyle: 'italic',
            marginBottom: '12px',
            lineHeight: '1.4',
            borderLeft: '3px solid #4a90d9',
            paddingLeft: '10px',
          }}>
            {selectedAnnotation.type === 'highlight'
              ? `"${selectedAnnotation.position?.selectedText?.slice(0, 150)}${selectedAnnotation.position?.selectedText?.length > 150 ? '...' : ''}"`
              : selectedAnnotation.content || 'No content'
            }
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            {!readOnly && onAnnotationDelete && (
              <button
                style={{
                  padding: '6px 14px',
                  background: '#c62828',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  onAnnotationDelete(selectedAnnotation.id);
                  setSelectedAnnotationId(null);
                }}
              >
                Delete
              </button>
            )}
            <button
              style={{
                padding: '6px 14px',
                background: '#555',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
              onClick={() => setSelectedAnnotationId(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <style>{`
        /* PDF viewer overrides */
        .rpv-core__viewer {
          background: #525659 !important;
        }
      `}</style>
    </div>
  );
};

export default PdfAnnotationViewer;

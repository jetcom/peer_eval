import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Viewer, Worker, SpecialZoomLevel } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { highlightPlugin, Trigger } from '@react-pdf-viewer/highlight';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import '@react-pdf-viewer/highlight/lib/styles/index.css';

/**
 * PdfAnnotationViewer - PDF viewer with annotation support using react-pdf-viewer plugins
 */
const PdfAnnotationViewer = ({
  fileUrl,
  annotations = [],
  onAnnotationAdd,
  onAnnotationDelete,
  readOnly = false,
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedTool, setSelectedTool] = useState('select');
  const [selectedHighlightId, setSelectedHighlightId] = useState(null);

  // Use refs to access current values in plugin callbacks without recreating plugin
  const annotationsRef = useRef(annotations);
  const selectedHighlightIdRef = useRef(selectedHighlightId);
  const readOnlyRef = useRef(readOnly);
  const onAnnotationAddRef = useRef(onAnnotationAdd);
  const onAnnotationDeleteRef = useRef(onAnnotationDelete);

  // Keep refs in sync
  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  useEffect(() => {
    selectedHighlightIdRef.current = selectedHighlightId;
  }, [selectedHighlightId]);

  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);

  useEffect(() => {
    onAnnotationAddRef.current = onAnnotationAdd;
  }, [onAnnotationAdd]);

  useEffect(() => {
    onAnnotationDeleteRef.current = onAnnotationDelete;
  }, [onAnnotationDelete]);

  // Get annotations for current page (for footer count)
  const pageAnnotationCount = annotations.filter(
    (a) => a.position?.page === currentPage ||
           a.position?.highlightAreas?.some(area => area.pageIndex === currentPage)
  ).length;

  // Create layout plugin with minimal UI - only created once
  const defaultLayoutPluginInstance = useMemo(() => defaultLayoutPlugin({
    sidebarTabs: () => [],
    toolbarPlugin: {
      fullScreenPlugin: { onEnterFullScreen: () => {}, onExitFullScreen: () => {} },
    },
  }), []);

  // Create highlight plugin - only created once, uses refs for current state
  const highlightPluginInstance = useMemo(() => {
    return highlightPlugin({
      trigger: Trigger.TextSelection,
      renderHighlightTarget: (props) => {
        if (readOnlyRef.current) {
          return null;
        }
        return (
          <div
            style={{
              background: '#4a90d9',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              position: 'absolute',
              zIndex: 1000,
            }}
            onClick={() => {
              if (onAnnotationAddRef.current) {
                onAnnotationAddRef.current({
                  type: 'highlight',
                  position: {
                    page: props.selectionRegion.pageIndex,
                    highlightAreas: props.highlightAreas,
                    selectedText: props.selectedText,
                  },
                  content: '',
                  color: '#ffff00',
                });
              }
              props.cancel();
            }}
          >
            Add Highlight
          </div>
        );
      },
      renderHighlights: (props) => {
        const currentAnnotations = annotationsRef.current;
        const currentSelectedId = selectedHighlightIdRef.current;

        // Find annotations for this page
        const pageHighlights = currentAnnotations.filter(
          a => a.type === 'highlight' &&
               a.position?.highlightAreas?.some(area => area.pageIndex === props.pageIndex)
        );

        const selectedHighlight = pageHighlights.find(h => h.id === currentSelectedId);

        return (
          <div>
            {pageHighlights.map((annotation) => {
              const areasOnPage = annotation.position.highlightAreas.filter(
                area => area.pageIndex === props.pageIndex
              );
              return areasOnPage.map((area, idx) => (
                <div
                  key={`${annotation.id}-${idx}`}
                  style={{
                    position: 'absolute',
                    left: `${area.left}%`,
                    top: `${area.top}%`,
                    width: `${area.width}%`,
                    height: `${area.height}%`,
                    backgroundColor: annotation.color || '#ffff00',
                    opacity: currentSelectedId === annotation.id ? 0.5 : 0.35,
                    cursor: 'pointer',
                    borderRadius: '2px',
                    transition: 'opacity 0.15s',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedHighlightId(currentSelectedId === annotation.id ? null : annotation.id);
                  }}
                />
              ));
            })}
            {/* Popup for selected highlight */}
            {selectedHighlight && (
              <div
                style={{
                  position: 'absolute',
                  left: `${Math.min((selectedHighlight.position.highlightAreas[0]?.left || 10), 60)}%`,
                  top: `${(selectedHighlight.position.highlightAreas[selectedHighlight.position.highlightAreas.length - 1]?.top || 0) +
                        (selectedHighlight.position.highlightAreas[selectedHighlight.position.highlightAreas.length - 1]?.height || 2) + 1}%`,
                  background: '#2d2d2d',
                  color: '#fff',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  minWidth: '220px',
                  maxWidth: '320px',
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
                  marginBottom: '10px',
                  lineHeight: '1.4',
                  borderLeft: '3px solid #4a90d9',
                  paddingLeft: '10px',
                }}>
                  "{selectedHighlight.position?.selectedText?.slice(0, 120)}
                  {selectedHighlight.position?.selectedText?.length > 120 ? '...' : ''}"
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {!readOnlyRef.current && (
                    <button
                      style={{
                        padding: '6px 12px',
                        background: '#c62828',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        onAnnotationDeleteRef.current?.(selectedHighlight.id);
                        setSelectedHighlightId(null);
                      }}
                    >
                      Delete
                    </button>
                  )}
                  <button
                    style={{
                      padding: '6px 12px',
                      background: '#555',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedHighlightId(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      },
    });
  }, []); // Empty deps - plugin created once, uses refs for current values

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
              <span role="img" aria-label="select">👆</span>
            </button>
            <button
              className={`tool-btn ${selectedTool === 'highlight' ? 'active' : ''}`}
              onClick={() => setSelectedTool('highlight')}
              title="Highlight text"
            >
              <span role="img" aria-label="highlight">🖍️</span>
            </button>
          </div>
          <div className="tool-info">
            {selectedTool === 'highlight' && 'Select text to highlight it'}
            {selectedTool === 'select' && 'Click on highlights to view/delete'}
          </div>
        </div>
      )}

      {/* PDF Viewer */}
      <div
        className="pav-container"
        onClick={() => setSelectedHighlightId(null)}
      >
        <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
          <Viewer
            fileUrl={fileUrl}
            plugins={[highlightPluginInstance, defaultLayoutPluginInstance]}
            defaultScale={SpecialZoomLevel.PageWidth}
            onPageChange={(e) => setCurrentPage(e.currentPage)}
          />
        </Worker>
      </div>

      {/* Footer */}
      <div className="pav-footer">
        <span>Page {currentPage + 1}</span>
        <span>{pageAnnotationCount} annotation(s) on this page</span>
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
          -webkit-user-select: text !important;
        }

        .rpv-core__text-layer span {
          user-select: text !important;
          -webkit-user-select: text !important;
        }

        .rpv-core__text-layer::selection,
        .rpv-core__text-layer span::selection {
          background: rgba(255, 255, 0, 0.4) !important;
        }

        /* Highlight plugin styles */
        .rpv-highlight__selected-text {
          background-color: rgba(255, 255, 0, 0.4) !important;
        }
      `}</style>
    </div>
  );
};

export default PdfAnnotationViewer;

import React from 'react';

/**
 * AnnotationSidebar - Displays list of annotations
 *
 * Props:
 * - annotations: Array of annotations
 * - onAnnotationClick: Callback when annotation is clicked
 * - onAnnotationDelete: Callback when annotation is deleted
 * - activeAnnotationId: ID of currently active annotation
 * - readOnly: Whether annotations are read-only
 */
const AnnotationSidebar = ({
  annotations = [],
  onAnnotationClick,
  onAnnotationDelete,
  activeAnnotationId,
  readOnly = false,
}) => {
  // Group annotations by page
  const annotationsByPage = annotations.reduce((acc, annotation) => {
    const page = annotation.position?.page ?? 0;
    if (!acc[page]) acc[page] = [];
    acc[page].push(annotation);
    return acc;
  }, {});

  const sortedPages = Object.keys(annotationsByPage).map(Number).sort((a, b) => a - b);

  const getAnnotationIcon = (type) => {
    switch (type) {
      case 'highlight':
        return '🖍️';
      case 'comment':
        return '💬';
      case 'area_comment':
        return '📝';
      default:
        return '📌';
    }
  };

  const getAnnotationLabel = (type) => {
    switch (type) {
      case 'highlight':
        return 'Highlight';
      case 'comment':
        return 'Comment';
      case 'area_comment':
        return 'Area Comment';
      default:
        return 'Annotation';
    }
  };

  const truncateText = (text, maxLength = 100) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  if (annotations.length === 0) {
    return (
      <div className="annotation-sidebar empty">
        <div className="empty-message">
          <span className="empty-icon">📝</span>
          <p>No annotations yet</p>
          {!readOnly && (
            <p className="empty-hint">
              Use the highlight tool to select text, or the comment tool to add notes.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="annotation-sidebar">
      <div className="sidebar-header">
        <h4>Annotations ({annotations.length})</h4>
      </div>

      <div className="annotations-list">
        {sortedPages.map((page) => (
          <div key={page} className="page-group">
            <div className="page-header">Page {page + 1}</div>
            {annotationsByPage[page].map((annotation) => (
              <div
                key={annotation.id}
                className={`annotation-item ${activeAnnotationId === annotation.id ? 'active' : ''}`}
                onClick={() => onAnnotationClick && onAnnotationClick(annotation)}
              >
                <div className="annotation-header">
                  <span className="annotation-icon">
                    {getAnnotationIcon(annotation.type)}
                  </span>
                  <span className="annotation-type">
                    {getAnnotationLabel(annotation.type)}
                  </span>
                  {!readOnly && onAnnotationDelete && (
                    <button
                      className="delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAnnotationDelete(annotation.id);
                      }}
                      title="Delete annotation"
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="annotation-body">
                  {annotation.type === 'highlight' && annotation.position?.selectedText && (
                    <div className="highlight-text">
                      "{truncateText(annotation.position.selectedText, 80)}"
                    </div>
                  )}
                  {annotation.content && (
                    <div className="annotation-content">
                      {truncateText(annotation.content)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <style>{`
        .annotation-sidebar {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #fff;
          border-radius: 8px;
          overflow: hidden;
        }

        .annotation-sidebar.empty {
          justify-content: center;
          align-items: center;
        }

        .empty-message {
          text-align: center;
          padding: 2rem;
          color: #666;
        }

        .empty-icon {
          font-size: 2rem;
          display: block;
          margin-bottom: 0.5rem;
        }

        .empty-message p {
          margin: 0.5rem 0;
        }

        .empty-hint {
          font-size: 0.85rem;
          color: #999;
        }

        .sidebar-header {
          padding: 1rem;
          border-bottom: 1px solid #eee;
          background: #f8f9fa;
        }

        .sidebar-header h4 {
          margin: 0;
          font-size: 1rem;
        }

        .annotations-list {
          flex: 1;
          overflow-y: auto;
          padding: 0.5rem;
        }

        .page-group {
          margin-bottom: 1rem;
        }

        .page-header {
          font-size: 0.75rem;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          padding: 0.5rem;
          background: #f0f0f0;
          border-radius: 4px;
          margin-bottom: 0.5rem;
        }

        .annotation-item {
          padding: 0.75rem;
          border: 1px solid #eee;
          border-radius: 6px;
          margin-bottom: 0.5rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .annotation-item:hover {
          border-color: #ccc;
          background: #fafafa;
        }

        .annotation-item.active {
          border-color: #4a90d9;
          background: #e8f4fc;
        }

        .annotation-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .annotation-icon {
          font-size: 1rem;
        }

        .annotation-type {
          font-size: 0.75rem;
          font-weight: 500;
          color: #666;
          flex: 1;
        }

        .delete-btn {
          width: 20px;
          height: 20px;
          border: none;
          background: transparent;
          color: #999;
          font-size: 1.25rem;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
        }

        .annotation-item:hover .delete-btn {
          opacity: 1;
        }

        .delete-btn:hover {
          color: #d32f2f;
          background: #ffebee;
        }

        .annotation-body {
          font-size: 0.9rem;
        }

        .highlight-text {
          color: #666;
          font-style: italic;
          margin-bottom: 0.25rem;
          padding: 0.25rem 0.5rem;
          background: #fffde7;
          border-radius: 4px;
        }

        .annotation-content {
          color: #333;
          line-height: 1.4;
        }

        /* Dark mode */
        body.dark-mode .annotation-sidebar {
          background: #2a2a2a;
        }

        body.dark-mode .sidebar-header {
          background: #333;
          border-color: #444;
        }

        body.dark-mode .page-header {
          background: #333;
          color: #aaa;
        }

        body.dark-mode .annotation-item {
          border-color: #444;
        }

        body.dark-mode .annotation-item:hover {
          background: #333;
          border-color: #555;
        }

        body.dark-mode .annotation-item.active {
          background: #1a3a5c;
          border-color: #4a90d9;
        }

        body.dark-mode .annotation-type {
          color: #aaa;
        }

        body.dark-mode .highlight-text {
          background: #3d3800;
          color: #ccc;
        }

        body.dark-mode .annotation-content {
          color: #e0e0e0;
        }
      `}</style>
    </div>
  );
};

export default AnnotationSidebar;

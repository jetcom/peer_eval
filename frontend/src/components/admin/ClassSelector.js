import React, { useState } from 'react';

function ClassSelector({
  darkMode,
  classes,
  selectedClass,
  setSelectedClass,
  archivedClasses,
  showArchivedClasses,
  setShowArchivedClasses,
  onFetchArchivedClasses,
  onRestoreClass,
  onEditClass,
  onCreateClass,
  onCopyClass
}) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedClassData = classes.find(c => c.id.toString() === selectedClass);

  return (
    <div className="class-selector-container">
      <div className="class-selector-row">
        <div className="class-selector-wrapper">
          <label className="class-selector-label">Current Class</label>
          <button
            className="class-selector-btn"
            onClick={() => setIsOpen(!isOpen)}
          >
            <span className="class-selector-value">
              {selectedClassData
                ? `${selectedClassData.name}${selectedClassData.section ? ` (${selectedClassData.section})` : ''}${selectedClassData.semester ? ` - ${selectedClassData.semester}` : ''}`
                : 'Select a class...'}
            </span>
            <span className="class-selector-arrow">{isOpen ? '▲' : '▼'}</span>
          </button>

          {isOpen && (
            <div className="class-selector-dropdown">
              {classes.length === 0 ? (
                <div className="class-selector-empty">
                  No classes yet. Click "+ New Class" to create one!
                </div>
              ) : (
                classes.map(c => (
                  <div
                    key={c.id}
                    className={`class-selector-item ${selectedClass === c.id.toString() ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedClass(c.id.toString());
                      setIsOpen(false);
                    }}
                  >
                    <span className="class-selector-item-name">
                      {c.name}
                      {c.section && <span className="class-selector-item-section">({c.section})</span>}
                      {c.semester && <span className="class-selector-item-semester">{c.semester}</span>}
                    </span>
                  </div>
                ))
              )}

              <div className="class-selector-divider" />
              <div
                className="class-selector-archived-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!showArchivedClasses) {
                    onFetchArchivedClasses();
                  }
                  setShowArchivedClasses(!showArchivedClasses);
                }}
              >
                <span>{showArchivedClasses ? '▼' : '▶'}</span>
                Archived Classes {archivedClasses.length > 0 && `(${archivedClasses.length})`}
              </div>

              {showArchivedClasses && (
                <div className="class-selector-archived-list">
                  {archivedClasses.length === 0 ? (
                    <div className="class-selector-archived-empty">
                      No archived classes
                    </div>
                  ) : (
                    archivedClasses.map(c => (
                      <div key={c.id} className="class-selector-archived-item">
                        <span>
                          {c.name} {c.section ? `(${c.section})` : ''} {c.semester ? `- ${c.semester}` : ''}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRestoreClass(c.id);
                          }}
                        >
                          Restore
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {selectedClass && (
          <>
            <button
              className="class-selector-settings-btn"
              onClick={() => onEditClass(selectedClassData)}
              title="Class settings"
            >
              Class Settings
            </button>
            <button
              className="class-selector-copy-btn"
              onClick={() => onCopyClass(selectedClassData)}
              title="Copy class for a new term"
            >
              Copy Class
            </button>
          </>
        )}

        <button
          className="class-selector-new-btn"
          onClick={onCreateClass}
        >
          + New Class
        </button>
      </div>
    </div>
  );
}

export default ClassSelector;

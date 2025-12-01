import React, { useState } from 'react';

function StudentClassSelector({
  classes,
  selectedClass,
  setSelectedClass
}) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedClassData = classes.find(c => c.id === selectedClass);

  if (classes.length === 0) {
    return null;
  }

  // If only one class, just show it as text (no dropdown needed)
  if (classes.length === 1) {
    return (
      <div className="student-class-selector">
        <span className="student-class-current">
          {selectedClassData?.name}
          {selectedClassData?.section && <span className="student-class-section">({selectedClassData.section})</span>}
          {selectedClassData?.semester && <span className="student-class-semester">{selectedClassData.semester}</span>}
        </span>
      </div>
    );
  }

  return (
    <div className="student-class-selector">
      <button
        className="student-class-btn"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="student-class-value">
          {selectedClassData
            ? `${selectedClassData.name}${selectedClassData.section ? ` (${selectedClassData.section})` : ''}${selectedClassData.semester ? ` - ${selectedClassData.semester}` : ''}`
            : 'Select a class...'}
        </span>
        <span className="student-class-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="student-class-dropdown">
          {classes.map(c => (
            <div
              key={c.id}
              className={`student-class-item ${selectedClass === c.id ? 'selected' : ''}`}
              onClick={() => {
                setSelectedClass(c.id);
                setIsOpen(false);
              }}
            >
              {c.name}
              {c.section && <span className="student-class-section">({c.section})</span>}
              {c.semester && <span className="student-class-semester">{c.semester}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default StudentClassSelector;

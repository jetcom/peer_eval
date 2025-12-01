import React from 'react';

function BasicInfoStep({ darkMode, classData, updateClassData, currentUser }) {
  const availableInstructors = currentUser ? [currentUser] : [];

  return (
    <div>
      <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
        Basic Information
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="form-group">
          <label>Class Name *</label>
          <input
            type="text"
            value={classData.name}
            onChange={(e) => updateClassData({ name: e.target.value })}
            required
            placeholder="e.g., Software Engineering"
          />
        </div>

        <div className="form-group">
          <label>Section</label>
          <input
            type="text"
            value={classData.section}
            onChange={(e) => updateClassData({ section: e.target.value })}
            placeholder="e.g., 001"
          />
        </div>

        <div className="form-group">
          <label>Semester</label>
          <input
            type="text"
            value={classData.semester}
            onChange={(e) => updateClassData({ semester: e.target.value })}
            placeholder="e.g., Fall 2024"
          />
        </div>

        <div className="form-group">
          <label>Timezone</label>
          <select
            value={classData.due_date_timezone}
            onChange={(e) => updateClassData({ due_date_timezone: e.target.value })}
          >
            <option value="America/New_York">Eastern (ET)</option>
            <option value="America/Chicago">Central (CT)</option>
            <option value="America/Denver">Mountain (MT)</option>
            <option value="America/Phoenix">Arizona (MST)</option>
            <option value="America/Los_Angeles">Pacific (PT)</option>
            <option value="America/Anchorage">Alaska (AKT)</option>
            <option value="Pacific/Honolulu">Hawaii (HST)</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
      </div>

      {/* Instructors */}
      {availableInstructors.length > 0 && (
        <div className="form-group" style={{ marginTop: '15px' }}>
          <label>Instructors ({(classData.instructor_ids || []).length} selected)</label>
          <div style={{
            maxHeight: '120px',
            overflowY: 'auto',
            border: `1px solid ${darkMode ? '#333' : '#ddd'}`,
            borderRadius: '4px',
            padding: '8px',
            backgroundColor: darkMode ? '#0f0f0f' : '#fff'
          }}>
            {availableInstructors.map(u => (
              <label
                key={u.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  color: darkMode ? '#e0e0e0' : '#333',
                  fontSize: '0.9rem',
                  padding: '2px 0'
                }}
              >
                <input
                  type="checkbox"
                  checked={(classData.instructor_ids || []).includes(u.id)}
                  onChange={() => {
                    const currentIds = classData.instructor_ids || [];
                    const newIds = currentIds.includes(u.id)
                      ? currentIds.filter(id => id !== u.id)
                      : [...currentIds, u.id];
                    updateClassData({ instructor_ids: newIds });
                  }}
                  style={{ marginRight: '8px', width: 'auto' }}
                />
                {u.last_name}, {u.first_name}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default BasicInfoStep;

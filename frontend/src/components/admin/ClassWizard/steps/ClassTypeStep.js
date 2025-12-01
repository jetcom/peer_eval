import React from 'react';

function ClassTypeStep({ darkMode, classData, updateClassData }) {
  const options = [
    {
      value: 'phases',
      title: 'Phase-Based Evaluations',
      description: 'Multiple evaluation phases throughout the semester (e.g., Sprint 1, Sprint 2, Sprint 3). Students rate teammates at each phase checkpoint.',
      icon: '📊',
      examples: 'Software Engineering projects, Semester-long team projects'
    },
    {
      value: 'assignments',
      title: 'Assignment-Based Evaluations',
      description: 'Evaluations tied to specific assignments like presentations, papers, or projects. Supports peer, audience, and paper review evaluations.',
      icon: '📝',
      examples: 'Presentation classes, Paper-based courses, Mixed evaluation formats'
    }
  ];

  return (
    <div>
      <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
        What type of class is this?
      </h3>
      <p style={{
        marginBottom: '25px',
        color: darkMode ? '#a0a0a0' : '#666',
        fontSize: '0.95rem'
      }}>
        Choose how evaluations will be structured in this class. You can customize the specifics in the next steps.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => updateClassData({ evaluation_mode: option.value })}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '15px',
              padding: '20px',
              borderRadius: '8px',
              border: classData.evaluation_mode === option.value
                ? '2px solid #3498db'
                : `2px solid ${darkMode ? '#333' : '#e0e0e0'}`,
              background: classData.evaluation_mode === option.value
                ? (darkMode ? 'rgba(52, 152, 219, 0.15)' : 'rgba(52, 152, 219, 0.1)')
                : (darkMode ? '#1a1a1a' : '#fff'),
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s'
            }}
          >
            <span style={{ fontSize: '2rem' }}>{option.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{
                fontWeight: 600,
                fontSize: '1.1rem',
                marginBottom: '8px',
                color: classData.evaluation_mode === option.value
                  ? '#3498db'
                  : (darkMode ? '#f0f0f0' : '#333')
              }}>
                {option.title}
              </div>
              <div style={{
                color: darkMode ? '#a0a0a0' : '#666',
                fontSize: '0.9rem',
                marginBottom: '10px',
                lineHeight: '1.4'
              }}>
                {option.description}
              </div>
              <div style={{
                color: darkMode ? '#888' : '#888',
                fontSize: '0.85rem',
                fontStyle: 'italic'
              }}>
                Examples: {option.examples}
              </div>
            </div>
            {classData.evaluation_mode === option.value && (
              <span style={{
                color: '#3498db',
                fontSize: '1.5rem'
              }}>
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default ClassTypeStep;

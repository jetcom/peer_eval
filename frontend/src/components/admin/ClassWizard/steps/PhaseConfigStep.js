import React from 'react';

function PhaseConfigStep({ darkMode, classData, updateClassData }) {
  return (
    <div>
      <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
        Phase Configuration
      </h3>
      <p style={{
        marginBottom: '25px',
        color: darkMode ? '#a0a0a0' : '#666',
        fontSize: '0.95rem'
      }}>
        Configure how many evaluation phases your class will have. Each phase represents a checkpoint where students evaluate their teammates.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        <div>
          <div className="form-group">
            <label>Number of Phases</label>
            <select
              value={classData.num_phases}
              onChange={(e) => updateClassData({ num_phases: parseInt(e.target.value) })}
            >
              <option value={1}>1 Phase</option>
              <option value={2}>2 Phases</option>
              <option value={3}>3 Phases</option>
              <option value={4}>4 Phases</option>
              <option value={5}>5 Phases</option>
            </select>
            <small style={{
              display: 'block',
              marginTop: '6px',
              color: darkMode ? '#888' : '#888'
            }}>
              Typical: 3 phases for a semester project
            </small>
          </div>

          <div className="form-group" style={{ marginTop: '20px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              fontWeight: 'normal'
            }}>
              <input
                type="checkbox"
                checked={classData.has_final_evaluation}
                onChange={(e) => updateClassData({ has_final_evaluation: e.target.checked })}
                style={{ width: '18px', height: '18px' }}
              />
              <span>Include Final Evaluation (23-pt scale)</span>
            </label>
            <small style={{
              display: 'block',
              marginTop: '6px',
              color: darkMode ? '#888' : '#888',
              marginLeft: '28px'
            }}>
              Final evaluation uses a 23-point scale for grade adjustment recommendations
            </small>
          </div>
        </div>

        <div style={{
          background: darkMode ? '#1a1a1a' : '#f8f9fa',
          borderRadius: '8px',
          padding: '20px',
          border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
        }}>
          <h4 style={{ marginTop: 0, marginBottom: '15px', fontSize: '1rem' }}>
            Preview
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Array.from({ length: classData.num_phases }, (_, i) => (
              <div
                key={i + 1}
                style={{
                  padding: '10px 15px',
                  borderRadius: '4px',
                  background: '#3498db',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              >
                Phase {i + 1}
              </div>
            ))}
            {classData.has_final_evaluation && (
              <div
                style={{
                  padding: '10px 15px',
                  borderRadius: '4px',
                  background: '#9b59b6',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              >
                Final Evaluation (23-pt)
              </div>
            )}
          </div>
          <div style={{
            marginTop: '15px',
            fontSize: '0.85rem',
            color: darkMode ? '#657b83' : '#888'
          }}>
            Total: {classData.num_phases + (classData.has_final_evaluation ? 1 : 0)} evaluation periods
          </div>
        </div>
      </div>
    </div>
  );
}

export default PhaseConfigStep;

import React from 'react';

function OptionsStep({ darkMode, classData, updateClassData }) {
  return (
    <div>
      <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
        Additional Options
      </h3>
      <p style={{
        marginBottom: '25px',
        color: darkMode ? '#a0a0a0' : '#666',
        fontSize: '0.95rem'
      }}>
        Configure additional settings for this class. These can be changed later.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '30px'
      }}>
        {/* Left column */}
        <div>
          {/* Comment requirements */}
          <div style={{
            marginBottom: '25px',
            padding: '20px',
            borderRadius: '8px',
            background: darkMode ? '#1a1a1a' : '#f8f9fa',
            border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
          }}>
            <h4 style={{ margin: '0 0 15px', fontSize: '1rem' }}>
              Comment Requirements
            </h4>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Minimum Comment Words</label>
              <input
                type="number"
                min="0"
                value={classData.min_comment_words || 0}
                onChange={(e) => updateClassData({ min_comment_words: parseInt(e.target.value) || 0 })}
                style={{ maxWidth: '150px' }}
              />
              <small style={{
                display: 'block',
                marginTop: '6px',
                color: darkMode ? '#888' : '#888'
              }}>
                Set to 0 for no minimum. Students must write at least this many words in their comments.
              </small>
            </div>
          </div>

          {/* Late submissions */}
          <div style={{
            marginBottom: '25px',
            padding: '20px',
            borderRadius: '8px',
            background: darkMode ? '#1a1a1a' : '#f8f9fa',
            border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
          }}>
            <h4 style={{ margin: '0 0 15px', fontSize: '1rem' }}>
              Late Submissions
            </h4>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              marginBottom: '15px'
            }}>
              <input
                type="checkbox"
                checked={classData.allow_late}
                onChange={(e) => updateClassData({
                  allow_late: e.target.checked,
                  late_window_hours: e.target.checked ? (classData.late_window_hours || 48) : 0
                })}
                style={{ width: '18px', height: '18px' }}
              />
              <span>Allow late submissions</span>
            </label>

            {classData.allow_late && (
              <div className="form-group" style={{ margin: '0 0 10px' }}>
                <label>Late submission window</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    value={classData.late_window_hours || 48}
                    onChange={(e) => updateClassData({ late_window_hours: parseInt(e.target.value) || 48 })}
                    style={{ width: '80px' }}
                  />
                  <span style={{ color: darkMode ? '#a0a0a0' : '#666' }}>hours after due date</span>
                </div>
                <small style={{
                  display: 'block',
                  marginTop: '6px',
                  color: darkMode ? '#888' : '#888'
                }}>
                  Common values: 24 (1 day), 48 (2 days), 72 (3 days), 168 (1 week)
                </small>
              </div>
            )}

            <small style={{
              display: 'block',
              marginTop: '10px',
              color: darkMode ? '#657b83' : '#888'
            }}>
              {classData.allow_late
                ? `Students can submit up to ${classData.late_window_hours || 48} hours after the due date. Late submissions are marked.`
                : 'When disabled, students cannot submit after the due date.'}
            </small>
          </div>
        </div>

        {/* Right column - Summary */}
        <div style={{
          padding: '20px',
          borderRadius: '8px',
          background: darkMode ? '#141414' : '#fff',
          border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
        }}>
          <h4 style={{ margin: '0 0 20px', fontSize: '1rem' }}>
            Class Summary
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{
                fontSize: '0.8rem',
                color: darkMode ? '#888' : '#888',
                textTransform: 'uppercase'
              }}>
                Class Name
              </label>
              <div style={{ fontWeight: 500, marginTop: '2px' }}>
                {classData.name || '(not set)'}
              </div>
            </div>

            {classData.section && (
              <div>
                <label style={{
                  fontSize: '0.8rem',
                  color: darkMode ? '#888' : '#888',
                  textTransform: 'uppercase'
                }}>
                  Section
                </label>
                <div style={{ fontWeight: 500, marginTop: '2px' }}>
                  {classData.section}
                </div>
              </div>
            )}

            {classData.semester && (
              <div>
                <label style={{
                  fontSize: '0.8rem',
                  color: darkMode ? '#888' : '#888',
                  textTransform: 'uppercase'
                }}>
                  Semester
                </label>
                <div style={{ fontWeight: 500, marginTop: '2px' }}>
                  {classData.semester}
                </div>
              </div>
            )}

            <div>
              <label style={{
                fontSize: '0.8rem',
                color: darkMode ? '#888' : '#888',
                textTransform: 'uppercase'
              }}>
                Evaluation Mode
              </label>
              <div style={{ fontWeight: 500, marginTop: '2px' }}>
                {classData.evaluation_mode === 'phases' ? 'Phase-Based' : 'Assignment-Based'}
              </div>
            </div>

            {classData.evaluation_mode === 'phases' ? (
              <div>
                <label style={{
                  fontSize: '0.8rem',
                  color: darkMode ? '#888' : '#888',
                  textTransform: 'uppercase'
                }}>
                  Phases
                </label>
                <div style={{ fontWeight: 500, marginTop: '2px' }}>
                  {classData.num_phases} phase{classData.num_phases > 1 ? 's' : ''}
                  {classData.has_final_evaluation && ' + Final Evaluation'}
                </div>
              </div>
            ) : (
              <div>
                <label style={{
                  fontSize: '0.8rem',
                  color: darkMode ? '#888' : '#888',
                  textTransform: 'uppercase'
                }}>
                  Assignments
                </label>
                <div style={{ fontWeight: 500, marginTop: '2px' }}>
                  {classData.assignments?.length || 0} assignment{(classData.assignments?.length || 0) !== 1 ? 's' : ''}
                </div>
              </div>
            )}

            <div>
              <label style={{
                fontSize: '0.8rem',
                color: darkMode ? '#888' : '#888',
                textTransform: 'uppercase'
              }}>
                Evaluation Types
              </label>
              <div style={{ fontWeight: 500, marginTop: '2px' }}>
                <span>Peer</span>
                {classData.include_self_eval && <span>, Self</span>}
                {classData.include_audience_eval && <span>, Audience</span>}
                {classData.include_paper_review && <span>, Paper Review</span>}
              </div>
            </div>

            <div>
              <label style={{
                fontSize: '0.8rem',
                color: darkMode ? '#888' : '#888',
                textTransform: 'uppercase'
              }}>
                Timezone
              </label>
              <div style={{ fontWeight: 500, marginTop: '2px' }}>
                {classData.due_date_timezone}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OptionsStep;

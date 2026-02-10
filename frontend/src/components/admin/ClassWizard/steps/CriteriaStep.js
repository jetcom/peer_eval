import React from 'react';

function CriteriaStep({ darkMode, classData, updateClassData, templates }) {
  const isPhaseBased = classData.evaluation_mode === 'phases';

  // Filter templates by target type
  const individualTemplates = templates.filter(t => t.target_type === 'individual');
  const groupTemplates = templates.filter(t => t.target_type === 'group');

  // Get the currently selected template for preview
  const getSelectedTemplate = (templateId) => {
    return templates.find(t => t.id === templateId);
  };

  const renderTemplateSelector = (label, field, templateList, description) => {
    const selectedTemplate = getSelectedTemplate(classData[field]);

    return (
      <div style={{
        marginBottom: '25px',
        padding: '20px',
        borderRadius: '8px',
        background: darkMode ? '#1a1a1a' : '#f8f9fa',
        border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
      }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ fontWeight: 600, fontSize: '1rem' }}>{label}</label>
          <p style={{
            margin: '5px 0 0',
            fontSize: '0.85rem',
            color: darkMode ? '#888' : '#888'
          }}>
            {description}
          </p>
        </div>

        <div className="form-group" style={{ marginBottom: '15px' }}>
          <select
            value={classData[field] || ''}
            onChange={(e) => updateClassData({ [field]: e.target.value ? parseInt(e.target.value) : null })}
            style={{ maxWidth: '400px' }}
          >
            <option value="">-- Select Template --</option>
            {templateList.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} {t.is_system ? '(System)' : ''}
              </option>
            ))}
          </select>
        </div>

        {selectedTemplate && (
          <div style={{
            marginTop: '15px',
            padding: '15px',
            borderRadius: '6px',
            background: darkMode ? '#141414' : '#fff',
            border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
          }}>
            <h5 style={{ margin: '0 0 10px', fontSize: '0.95rem' }}>
              {selectedTemplate.name} Criteria
            </h5>
            {selectedTemplate.description && (
              <p style={{
                margin: '0 0 10px',
                fontSize: '0.85rem',
                color: darkMode ? '#888' : '#888'
              }}>
                {selectedTemplate.description}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {selectedTemplate.criteria.map((c, index) => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    background: darkMode ? '#1a1a1a' : '#f8f9fa',
                    fontSize: '0.9rem'
                  }}
                >
                  <span style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: '#3498db',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    flexShrink: 0
                  }}>
                    {index + 1}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{c.name}</div>
                    {c.description && (
                      <div style={{
                        fontSize: '0.8rem',
                        color: darkMode ? '#888' : '#888'
                      }}>
                        {c.description}
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontSize: '0.8rem',
                    color: darkMode ? '#888' : '#888'
                  }}>
                    {(c.question_type || 'likert') === 'open_response' ? 'Text' : `${c.min_value}-${c.max_value}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
        Evaluation Criteria
      </h3>
      <p style={{
        marginBottom: '25px',
        color: darkMode ? '#a0a0a0' : '#666',
        fontSize: '0.95rem'
      }}>
        Select templates for each evaluation type. Templates define the criteria students will use when evaluating.
        {!isPhaseBased && ' You can customize which evaluation types apply to each assignment.'}
      </p>

      {/* Peer Evaluation Template */}
      {renderTemplateSelector(
        'Peer Evaluation Template',
        'peer_template_id',
        individualTemplates,
        'Used when students evaluate individual teammates (individual → individual)'
      )}

      {/* For assignment-based classes, show audience evaluation template */}
      {!isPhaseBased && renderTemplateSelector(
        'Audience Evaluation Template',
        'audience_template_id',
        groupTemplates,
        'Used when students evaluate presenting groups (individual → group)'
      )}

      {/* Self Evaluation (optional) */}
      <div style={{
        marginBottom: '25px',
        padding: '20px',
        borderRadius: '8px',
        background: darkMode ? '#1a1a1a' : '#f8f9fa',
        border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
      }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          fontWeight: 600,
          marginBottom: '10px'
        }}>
          <input
            type="checkbox"
            checked={classData.include_self_eval}
            onChange={(e) => updateClassData({ include_self_eval: e.target.checked })}
            style={{ width: '18px', height: '18px' }}
          />
          Include Self-Evaluation
        </label>
        <p style={{
          margin: '0 0 15px',
          fontSize: '0.85rem',
          color: darkMode ? '#888' : '#888'
        }}>
          Students will also evaluate themselves using the same criteria
        </p>

        {classData.include_self_eval && (
          <div className="form-group" style={{ margin: 0 }}>
            <label>Self-Evaluation Template (optional)</label>
            <select
              value={classData.self_template_id || ''}
              onChange={(e) => updateClassData({ self_template_id: e.target.value ? parseInt(e.target.value) : null })}
              style={{ maxWidth: '400px' }}
            >
              <option value="">-- Use same as peer evaluation --</option>
              {individualTemplates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.is_system ? '(System)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Paper Review (only for assignment-based) */}
      {!isPhaseBased && (
        <div style={{
          marginBottom: '25px',
          padding: '20px',
          borderRadius: '8px',
          background: darkMode ? '#1a3350' : '#f8f9fa',
          border: `1px solid ${darkMode ? '#2d4a6f' : '#e0e0e0'}`
        }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            fontWeight: 600,
            marginBottom: '10px'
          }}>
            <input
              type="checkbox"
              checked={classData.include_paper_review}
              onChange={(e) => updateClassData({ include_paper_review: e.target.checked })}
              style={{ width: '18px', height: '18px' }}
            />
            Include Paper Reviews
          </label>
          <p style={{
            margin: '0 0 15px',
            fontSize: '0.85rem',
            color: darkMode ? '#888' : '#888'
          }}>
            Students will review papers or written submissions from other students
          </p>

          {classData.include_paper_review && renderTemplateSelector(
            'Paper Review Template',
            'paper_review_template_id',
            individualTemplates,
            'Used when students review papers or written submissions'
          )}
        </div>
      )}

      {/* Info box */}
      <div style={{
        padding: '15px',
        borderRadius: '6px',
        background: darkMode ? 'rgba(38, 139, 210, 0.1)' : 'rgba(52, 152, 219, 0.1)',
        border: '1px solid #3498db',
        fontSize: '0.9rem',
        color: darkMode ? '#a0a0a0' : '#555'
      }}>
        <strong>Tip:</strong> You can create custom templates from the Templates management page after creating the class.
        Templates can be duplicated and customized to fit your specific course needs.
      </div>
    </div>
  );
}

export default CriteriaStep;

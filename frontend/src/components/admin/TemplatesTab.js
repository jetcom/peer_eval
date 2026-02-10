import React, { useState, useEffect } from 'react';
import axios from 'axios';

function TemplatesTab({ darkMode }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedTemplate, setExpandedTemplate] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    target_type: 'individual',
    criteria: [{ name: '', description: '', min_value: 1, max_value: 5, question_type: 'likert' }]
  });
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await axios.get('/api/templates');
      setTemplates(res.data);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
      setMessage({ type: 'error', text: 'Failed to load templates' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplate.name.trim()) {
      setMessage({ type: 'error', text: 'Template name is required' });
      return;
    }

    if (newTemplate.criteria.length === 0 || !newTemplate.criteria.some(c => c.name.trim())) {
      setMessage({ type: 'error', text: 'At least one criterion with a name is required' });
      return;
    }

    try {
      const data = {
        name: newTemplate.name,
        description: newTemplate.description || null,
        target_type: newTemplate.target_type,
        criteria: newTemplate.criteria.filter(c => c.name.trim()).map((c, i) => ({
          name: c.name,
          description: c.description || null,
          order_index: i,
          min_value: parseInt(c.min_value) || 1,
          max_value: parseInt(c.max_value) || 5,
          question_type: c.question_type || 'likert'
        }))
      };

      await axios.post('/api/templates', data);
      setMessage({ type: 'success', text: 'Template created successfully' });
      setShowCreateModal(false);
      setNewTemplate({
        name: '',
        description: '',
        target_type: 'individual',
        criteria: [{ name: '', description: '', min_value: 1, max_value: 5, question_type: 'likert' }]
      });
      fetchTemplates();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to create template' });
    }
  };

  const handleDuplicateTemplate = async (template) => {
    const newName = window.prompt('Name for the new template:', `${template.name} (Copy)`);
    if (!newName) return;

    try {
      await axios.post(`/api/templates/${template.id}/duplicate`, { name: newName });
      setMessage({ type: 'success', text: 'Template duplicated successfully' });
      fetchTemplates();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to duplicate template' });
    }
  };

  const handleDeleteTemplate = async (template) => {
    if (!window.confirm(`Delete "${template.name}"? This cannot be undone.`)) return;

    try {
      await axios.delete(`/api/templates/${template.id}`);
      setMessage({ type: 'success', text: 'Template deleted' });
      fetchTemplates();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to delete template' });
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate.name.trim()) {
      setMessage({ type: 'error', text: 'Template name is required' });
      return;
    }

    try {
      const data = {
        name: editingTemplate.name,
        description: editingTemplate.description || null,
        target_type: editingTemplate.target_type,
        criteria: editingTemplate.criteria.filter(c => c.name.trim()).map((c, i) => ({
          name: c.name,
          description: c.description || null,
          order_index: i,
          min_value: parseInt(c.min_value) || 1,
          max_value: parseInt(c.max_value) || 5,
          question_type: c.question_type || 'likert'
        }))
      };

      await axios.put(`/api/templates/${editingTemplate.id}`, data);
      setMessage({ type: 'success', text: 'Template updated successfully' });
      setEditingTemplate(null);
      fetchTemplates();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to update template' });
    }
  };

  const addCriterion = (setTemplate, template) => {
    setTemplate({
      ...template,
      criteria: [...template.criteria, { name: '', description: '', min_value: 1, max_value: 5, question_type: 'likert' }]
    });
  };

  const removeCriterion = (setTemplate, template, index) => {
    setTemplate({
      ...template,
      criteria: template.criteria.filter((_, i) => i !== index)
    });
  };

  const updateCriterion = (setTemplate, template, index, field, value) => {
    const newCriteria = [...template.criteria];
    newCriteria[index] = { ...newCriteria[index], [field]: value };
    setTemplate({ ...template, criteria: newCriteria });
  };

  const moveCriterion = (setTemplate, template, index, direction) => {
    const newCriteria = [...template.criteria];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= newCriteria.length) return;
    [newCriteria[index], newCriteria[newIndex]] = [newCriteria[newIndex], newCriteria[index]];
    setTemplate({ ...template, criteria: newCriteria });
  };

  const renderCriteriaEditor = (template, setTemplate, isEditing = false) => (
    <div style={{
      marginTop: '20px',
      background: darkMode ? '#141414' : '#f5f7fa',
      borderRadius: '8px',
      padding: '20px',
      border: `1px solid ${darkMode ? '#2a2a2a' : '#e0e0e0'}`
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '15px'
      }}>
        <div>
          <label style={{ fontWeight: 600, fontSize: '1rem', display: 'block' }}>Evaluation Criteria</label>
          <span style={{ fontSize: '0.85rem', color: darkMode ? '#888' : '#666' }}>
            Define the criteria students will use to evaluate
          </span>
        </div>
        <button
          type="button"
          onClick={() => addCriterion(setTemplate, template)}
          style={{
            background: '#3498db',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
            boxShadow: '0 2px 4px rgba(52, 152, 219, 0.3)'
          }}
        >
          + Add Criterion
        </button>
      </div>

      {template.criteria.map((criterion, index) => (
        <div
          key={index}
          style={{
            background: darkMode ? '#1a1a1a' : '#fff',
            border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`,
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '12px',
            boxShadow: darkMode ? 'none' : '0 1px 3px rgba(0,0,0,0.05)'
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            paddingBottom: '10px',
            borderBottom: `1px solid ${darkMode ? '#333' : '#eee'}`
          }}>
            <span style={{
              fontWeight: 600,
              fontSize: '0.9rem',
              color: '#3498db'
            }}>
              Criterion {index + 1}
            </span>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => moveCriterion(setTemplate, template, index, -1)}
                disabled={index === 0}
                style={{
                  background: darkMode ? '#2a2a2a' : '#f0f0f0',
                  border: `1px solid ${darkMode ? '#333' : '#ddd'}`,
                  borderRadius: '4px',
                  cursor: index === 0 ? 'default' : 'pointer',
                  opacity: index === 0 ? 0.4 : 1,
                  fontSize: '0.9rem',
                  padding: '4px 8px',
                  color: darkMode ? '#e0e0e0' : '#333'
                }}
                title="Move up"
              >
                &#9650;
              </button>
              <button
                type="button"
                onClick={() => moveCriterion(setTemplate, template, index, 1)}
                disabled={index === template.criteria.length - 1}
                style={{
                  background: darkMode ? '#2a2a2a' : '#f0f0f0',
                  border: `1px solid ${darkMode ? '#333' : '#ddd'}`,
                  borderRadius: '4px',
                  cursor: index === template.criteria.length - 1 ? 'default' : 'pointer',
                  opacity: index === template.criteria.length - 1 ? 0.4 : 1,
                  fontSize: '0.9rem',
                  padding: '4px 8px',
                  color: darkMode ? '#e0e0e0' : '#333'
                }}
                title="Move down"
              >
                &#9660;
              </button>
              {template.criteria.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCriterion(setTemplate, template, index)}
                  style={{
                    background: 'rgba(231, 76, 60, 0.1)',
                    border: '1px solid #e74c3c',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: '#e74c3c',
                    fontSize: '0.9rem',
                    padding: '4px 10px',
                    marginLeft: '8px'
                  }}
                  title="Remove criterion"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.85rem' }}>Name *</label>
              <input
                type="text"
                value={criterion.name}
                onChange={(e) => updateCriterion(setTemplate, template, index, 'name', e.target.value)}
                placeholder="e.g., Communication"
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.85rem' }}>Description</label>
              <input
                type="text"
                value={criterion.description || ''}
                onChange={(e) => updateCriterion(setTemplate, template, index, 'description', e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '15px',
            marginTop: '12px',
            padding: '10px 12px',
            background: darkMode ? '#252525' : '#f8f9fa',
            borderRadius: '6px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', color: darkMode ? '#888' : '#666', fontWeight: 500 }}>Type:</span>
              <select
                value={criterion.question_type || 'likert'}
                onChange={(e) => updateCriterion(setTemplate, template, index, 'question_type', e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '4px',
                  background: darkMode ? '#0f0f0f' : '#fff',
                  border: `1px solid ${darkMode ? '#333' : '#ddd'}`,
                  color: darkMode ? '#e0e0e0' : '#333',
                  fontSize: '0.85rem'
                }}
              >
                <option value="likert">Rating Scale</option>
                <option value="open_response">Open Response</option>
              </select>
            </div>
            {(criterion.question_type || 'likert') === 'likert' && (
              <>
                <span style={{ fontSize: '0.85rem', color: darkMode ? '#888' : '#666', fontWeight: 500 }}>Scale:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    value={criterion.min_value}
                    onChange={(e) => updateCriterion(setTemplate, template, index, 'min_value', e.target.value)}
                    style={{
                      width: '60px',
                      textAlign: 'center',
                      background: darkMode ? '#0f0f0f' : '#fff',
                      border: `1px solid ${darkMode ? '#333' : '#ddd'}`,
                      color: darkMode ? '#e0e0e0' : '#333',
                      padding: '6px',
                      borderRadius: '4px'
                    }}
                  />
                  <span style={{ color: darkMode ? '#666' : '#999' }}>to</span>
                  <input
                    type="number"
                    value={criterion.max_value}
                    onChange={(e) => updateCriterion(setTemplate, template, index, 'max_value', e.target.value)}
                    style={{
                      width: '60px',
                      textAlign: 'center',
                      background: darkMode ? '#0f0f0f' : '#fff',
                      border: `1px solid ${darkMode ? '#333' : '#ddd'}`,
                      color: darkMode ? '#e0e0e0' : '#333',
                      padding: '6px',
                      borderRadius: '4px'
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading templates...</div>;
  }

  const individualTemplates = templates.filter(t => t.target_type === 'individual');
  const groupTemplates = templates.filter(t => t.target_type === 'group');

  return (
    <div className="card">
      {message.text && (
        <div className={`message ${message.type}`} style={{ marginBottom: '15px' }}>
          {message.text}
        </div>
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h2 style={{ margin: 0 }}>Evaluation Templates</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          + Create Template
        </button>
      </div>

      <p style={{
        marginBottom: '25px',
        color: darkMode ? '#a0a0a0' : '#666'
      }}>
        Templates define the evaluation criteria students use. System templates cannot be modified,
        but you can duplicate them to create custom versions.
      </p>

      {/* Individual Templates */}
      <h3 style={{ marginBottom: '15px', fontSize: '1.1rem' }}>
        Individual Evaluation Templates (Peer/Self)
      </h3>
      <div style={{ marginBottom: '30px' }}>
        {individualTemplates.length === 0 ? (
          <p style={{ color: darkMode ? '#888' : '#888', fontStyle: 'italic' }}>
            No individual templates found.
          </p>
        ) : (
          individualTemplates.map(template => (
            <div
              key={template.id}
              style={{
                background: darkMode ? '#1a1a1a' : '#fff',
                border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`,
                borderRadius: '8px',
                marginBottom: '10px',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  padding: '15px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer'
                }}
                onClick={() => setExpandedTemplate(expandedTemplate === template.id ? null : template.id)}
              >
                <div>
                  <span style={{ fontWeight: 600 }}>{template.name}</span>
                  {template.is_system && (
                    <span style={{
                      marginLeft: '10px',
                      padding: '2px 8px',
                      borderRadius: '3px',
                      fontSize: '0.75rem',
                      background: darkMode ? '#333' : '#e0e0e0'
                    }}>
                      System
                    </span>
                  )}
                  <span style={{
                    marginLeft: '10px',
                    color: darkMode ? '#888' : '#888',
                    fontSize: '0.9rem'
                  }}>
                    {template.criteria.length} criteria
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicateTemplate(template);
                    }}
                    style={{
                      background: 'none',
                      border: `1px solid ${darkMode ? '#444' : '#ccc'}`,
                      color: darkMode ? '#a0a0a0' : '#666',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    Duplicate
                  </button>
                  {!template.is_system && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTemplate({
                            ...template,
                            criteria: template.criteria.map(c => ({
                              name: c.name,
                              description: c.description || '',
                              min_value: c.min_value,
                              max_value: c.max_value,
                              question_type: c.question_type || 'likert'
                            }))
                          });
                        }}
                        style={{
                          background: 'none',
                          border: '1px solid #3498db',
                          color: '#3498db',
                          padding: '4px 10px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTemplate(template);
                        }}
                        style={{
                          background: 'none',
                          border: '1px solid #e74c3c',
                          color: '#e74c3c',
                          padding: '4px 10px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                  <span style={{ fontSize: '0.9rem' }}>
                    {expandedTemplate === template.id ? '▼' : '▶'}
                  </span>
                </div>
              </div>

              {expandedTemplate === template.id && (
                <div style={{
                  padding: '0 15px 15px',
                  borderTop: `1px solid ${darkMode ? '#2d4a6f' : '#e0e0e0'}`
                }}>
                  {template.description && (
                    <p style={{
                      margin: '15px 0',
                      color: darkMode ? '#a0a0a0' : '#666',
                      fontSize: '0.9rem'
                    }}>
                      {template.description}
                    </p>
                  )}
                  <table style={{ width: '100%', marginTop: '10px' }}>
                    <thead>
                      <tr style={{
                        background: darkMode ? '#252525' : '#f5f5f5',
                        textAlign: 'left'
                      }}>
                        <th style={{ padding: '8px 12px' }}>#</th>
                        <th style={{ padding: '8px 12px' }}>Criterion</th>
                        <th style={{ padding: '8px 12px' }}>Description</th>
                        <th style={{ padding: '8px 12px' }}>Scale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {template.criteria.map((c, i) => (
                        <tr key={c.id || i} style={{
                          borderBottom: `1px solid ${darkMode ? '#333' : '#eee'}`
                        }}>
                          <td style={{ padding: '8px 12px' }}>{i + 1}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 500 }}>{c.name}</td>
                          <td style={{
                            padding: '8px 12px',
                            color: darkMode ? '#a0a0a0' : '#666',
                            fontSize: '0.9rem'
                          }}>
                            {c.description || '-'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {(c.question_type || 'likert') === 'open_response' ? 'Text' : `${c.min_value} - ${c.max_value}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Group Templates */}
      <h3 style={{ marginBottom: '15px', fontSize: '1.1rem' }}>
        Group Evaluation Templates (Audience)
      </h3>
      <div>
        {groupTemplates.length === 0 ? (
          <p style={{ color: darkMode ? '#888' : '#888', fontStyle: 'italic' }}>
            No group templates found.
          </p>
        ) : (
          groupTemplates.map(template => (
            <div
              key={template.id}
              style={{
                background: darkMode ? '#1a1a1a' : '#fff',
                border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`,
                borderRadius: '8px',
                marginBottom: '10px',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  padding: '15px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer'
                }}
                onClick={() => setExpandedTemplate(expandedTemplate === template.id ? null : template.id)}
              >
                <div>
                  <span style={{ fontWeight: 600 }}>{template.name}</span>
                  {template.is_system && (
                    <span style={{
                      marginLeft: '10px',
                      padding: '2px 8px',
                      borderRadius: '3px',
                      fontSize: '0.75rem',
                      background: darkMode ? '#333' : '#e0e0e0'
                    }}>
                      System
                    </span>
                  )}
                  <span style={{
                    marginLeft: '10px',
                    color: darkMode ? '#888' : '#888',
                    fontSize: '0.9rem'
                  }}>
                    {template.criteria.length} criteria
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicateTemplate(template);
                    }}
                    style={{
                      background: 'none',
                      border: `1px solid ${darkMode ? '#444' : '#ccc'}`,
                      color: darkMode ? '#a0a0a0' : '#666',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    Duplicate
                  </button>
                  {!template.is_system && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTemplate({
                            ...template,
                            criteria: template.criteria.map(c => ({
                              name: c.name,
                              description: c.description || '',
                              min_value: c.min_value,
                              max_value: c.max_value,
                              question_type: c.question_type || 'likert'
                            }))
                          });
                        }}
                        style={{
                          background: 'none',
                          border: '1px solid #3498db',
                          color: '#3498db',
                          padding: '4px 10px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTemplate(template);
                        }}
                        style={{
                          background: 'none',
                          border: '1px solid #e74c3c',
                          color: '#e74c3c',
                          padding: '4px 10px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                  <span style={{ fontSize: '0.9rem' }}>
                    {expandedTemplate === template.id ? '▼' : '▶'}
                  </span>
                </div>
              </div>

              {expandedTemplate === template.id && (
                <div style={{
                  padding: '0 15px 15px',
                  borderTop: `1px solid ${darkMode ? '#2d4a6f' : '#e0e0e0'}`
                }}>
                  {template.description && (
                    <p style={{
                      margin: '15px 0',
                      color: darkMode ? '#a0a0a0' : '#666',
                      fontSize: '0.9rem'
                    }}>
                      {template.description}
                    </p>
                  )}
                  <table style={{ width: '100%', marginTop: '10px' }}>
                    <thead>
                      <tr style={{
                        background: darkMode ? '#252525' : '#f5f5f5',
                        textAlign: 'left'
                      }}>
                        <th style={{ padding: '8px 12px' }}>#</th>
                        <th style={{ padding: '8px 12px' }}>Criterion</th>
                        <th style={{ padding: '8px 12px' }}>Description</th>
                        <th style={{ padding: '8px 12px' }}>Scale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {template.criteria.map((c, i) => (
                        <tr key={c.id || i} style={{
                          borderBottom: `1px solid ${darkMode ? '#333' : '#eee'}`
                        }}>
                          <td style={{ padding: '8px 12px' }}>{i + 1}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 500 }}>{c.name}</td>
                          <td style={{
                            padding: '8px 12px',
                            color: darkMode ? '#a0a0a0' : '#666',
                            fontSize: '0.9rem'
                          }}>
                            {c.description || '-'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {(c.question_type || 'likert') === 'open_response' ? 'Text' : `${c.min_value} - ${c.max_value}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create Template Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: darkMode ? '#1a1a1a' : '#fff',
            padding: '30px',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '700px',
            maxHeight: '90vh',
            overflow: 'auto',
            border: darkMode ? '1px solid #333' : '1px solid #e0e0e0',
            boxShadow: darkMode ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.15)'
          }}>
            <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.5rem', borderBottom: darkMode ? '1px solid #333' : '1px solid #eee', paddingBottom: '15px' }}>Create Template</h2>

            <div className="form-group">
              <label>Template Name *</label>
              <input
                type="text"
                value={newTemplate.name}
                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                placeholder="e.g., Custom Peer Evaluation"
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                value={newTemplate.description}
                onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                placeholder="Optional description of this template"
                rows={2}
              />
            </div>

            <div className="form-group">
              <label>Target Type</label>
              <select
                value={newTemplate.target_type}
                onChange={(e) => setNewTemplate({ ...newTemplate, target_type: e.target.value })}
              >
                <option value="individual">Individual (Peer/Self Evaluation)</option>
                <option value="group">Group (Audience Evaluation)</option>
              </select>
            </div>

            {renderCriteriaEditor(newTemplate, setNewTemplate)}

            <div style={{
              display: 'flex',
              gap: '10px',
              marginTop: '20px',
              justifyContent: 'flex-end'
            }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewTemplate({
                    name: '',
                    description: '',
                    target_type: 'individual',
                    criteria: [{ name: '', description: '', min_value: 1, max_value: 5 }]
                  });
                }}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreateTemplate}>
                Create Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Template Modal */}
      {editingTemplate && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: darkMode ? '#1a1a1a' : '#fff',
            padding: '30px',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '700px',
            maxHeight: '90vh',
            overflow: 'auto',
            border: darkMode ? '1px solid #333' : '1px solid #e0e0e0',
            boxShadow: darkMode ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.15)'
          }}>
            <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.5rem', borderBottom: darkMode ? '1px solid #333' : '1px solid #eee', paddingBottom: '15px' }}>Edit Template</h2>

            <div className="form-group">
              <label>Template Name *</label>
              <input
                type="text"
                value={editingTemplate.name}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                value={editingTemplate.description || ''}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="form-group">
              <label>Target Type</label>
              <select
                value={editingTemplate.target_type}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, target_type: e.target.value })}
              >
                <option value="individual">Individual (Peer/Self Evaluation)</option>
                <option value="group">Group (Audience Evaluation)</option>
              </select>
            </div>

            {renderCriteriaEditor(editingTemplate, setEditingTemplate, true)}

            <div style={{
              display: 'flex',
              gap: '10px',
              marginTop: '20px',
              justifyContent: 'flex-end'
            }}>
              <button
                className="btn btn-secondary"
                onClick={() => setEditingTemplate(null)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleUpdateTemplate}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TemplatesTab;

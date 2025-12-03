import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

function NudgeTemplatesTab({ darkMode }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    subject: 'Action Required: Incomplete Evaluations',
    message: '',
    is_default: false
  });

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await axios.get('/api/nudge-templates');
      setTemplates(res.data);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load templates' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingTemplate) {
        await axios.put(`/api/nudge-templates/${editingTemplate.id}`, formData);
        setMessage({ type: 'success', text: 'Template updated successfully' });
      } else {
        await axios.post('/api/nudge-templates', formData);
        setMessage({ type: 'success', text: 'Template created successfully' });
      }
      resetForm();
      fetchTemplates();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save template' });
    }
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      subject: template.subject,
      message: template.message,
      is_default: template.is_default
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try {
      await axios.delete(`/api/nudge-templates/${id}`);
      setMessage({ type: 'success', text: 'Template deleted' });
      fetchTemplates();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete template' });
    }
  };

  const resetForm = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      subject: 'Action Required: Incomplete Evaluations',
      message: '',
      is_default: false
    });
    setShowForm(false);
  };

  if (loading) {
    return <div className="card"><p>Loading templates...</p></div>;
  }

  return (
    <>
      {message.text && (
        <div className={`message ${message.type}`}>{message.text}</div>
      )}

      <div className="admin-grid">
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0 }}>Nudge Email Templates</h2>
            {!showForm && (
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                + New Template
              </button>
            )}
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} style={{
              background: darkMode ? '#1f1f1f' : '#f8f9fa',
              padding: '20px',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <h3 style={{ marginTop: 0 }}>{editingTemplate ? 'Edit Template' : 'New Template'}</h3>

              <div className="form-group">
                <label>Template Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g., Friendly Reminder"
                />
              </div>

              <div className="form-group">
                <label>Email Subject</label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  required
                  placeholder="Email subject line"
                />
              </div>

              <div className="form-group">
                <label>Message</label>
                <textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  required
                  placeholder="Enter the message that will be included in the email..."
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    padding: '10px',
                    borderRadius: '6px',
                    border: darkMode ? '1px solid #444' : '1px solid #ddd',
                    background: darkMode ? '#2a2a2a' : '#fff',
                    color: darkMode ? '#f0f0f0' : '#333',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
                <p style={{ fontSize: '0.85rem', color: darkMode ? '#888' : '#666', marginTop: '5px' }}>
                  This message will appear in the email body. The student's name, class name, and assignment (if applicable) are automatically included.
                </p>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                    style={{ width: 'auto' }}
                  />
                  Set as default template
                </label>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" className="btn btn-primary">
                  {editingTemplate ? 'Update Template' : 'Create Template'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {templates.length === 0 ? (
            <p style={{ color: darkMode ? '#888' : '#666' }}>
              No templates yet. Create one to save time when sending nudge emails.
            </p>
          ) : (
            <div>
              {templates.map(template => (
                <div
                  key={template.id}
                  style={{
                    background: darkMode ? '#1f1f1f' : '#f8f9fa',
                    padding: '15px',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    border: template.is_default ? `2px solid ${darkMode ? '#3498db' : '#2563eb'}` : 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ margin: '0 0 5px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {template.name}
                        {template.is_default && (
                          <span style={{
                            fontSize: '0.7rem',
                            background: darkMode ? '#3498db' : '#2563eb',
                            color: 'white',
                            padding: '2px 8px',
                            borderRadius: '10px'
                          }}>
                            DEFAULT
                          </span>
                        )}
                      </h4>
                      <p style={{ fontSize: '0.85rem', color: darkMode ? '#888' : '#666', margin: '5px 0' }}>
                        <strong>Subject:</strong> {template.subject}
                      </p>
                      <p style={{
                        fontSize: '0.9rem',
                        color: darkMode ? '#a0a0a0' : '#555',
                        margin: '10px 0 0 0',
                        whiteSpace: 'pre-wrap',
                        maxHeight: '80px',
                        overflow: 'hidden'
                      }}>
                        {template.message.length > 200 ? template.message.substring(0, 200) + '...' : template.message}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                        onClick={() => handleEdit(template)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                        onClick={() => handleDelete(template.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2>About Nudge Templates</h2>
          <p style={{ color: darkMode ? '#a0a0a0' : '#666' }}>
            Nudge templates let you save commonly used messages for reminding students about incomplete evaluations.
          </p>
          <ul style={{ color: darkMode ? '#a0a0a0' : '#666', paddingLeft: '20px' }}>
            <li>Create templates with custom subjects and messages</li>
            <li>Set a default template to use automatically</li>
            <li>Select templates when sending nudges from the Progress tab</li>
          </ul>
          <p style={{ fontSize: '0.9rem', color: darkMode ? '#888' : '#888', marginTop: '15px' }}>
            <strong>Tip:</strong> The email will automatically include the student's name, class name, and a link to complete their evaluations.
          </p>
        </div>
      </div>
    </>
  );
}

export default NudgeTemplatesTab;

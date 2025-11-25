import React, { useState, useEffect } from 'react';
import axios from 'axios';

function ManageExtensionsModal({
  darkMode,
  classId,
  classStudents,
  onClose,
  onSave
}) {
  const [extensions, setExtensions] = useState({});
  const [classDetails, setClassDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Filter to only students (not teachers/admins)
  const students = classStudents.filter(s => s.role === 'student');

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const fetchData = async () => {
    try {
      const [classRes, extRes] = await Promise.all([
        axios.get(`/api/classes/${classId}`),
        axios.get(`/api/classes/${classId}/extensions`)
      ]);

      setClassDetails(classRes.data);

      // Convert extensions array to object keyed by `userId-phase`
      const extMap = {};
      extRes.data.forEach(ext => {
        extMap[`${ext.user_id}-${ext.phase}`] = ext.extended_due_date;
      });
      setExtensions(extMap);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  // Get phases from class data
  const numPhases = classDetails?.num_phases || 3;
  const hasFinalEval = classDetails?.has_final_evaluation;
  const phaseDueDates = classDetails?.phase_due_dates || {};
  const timezone = classDetails?.due_date_timezone || 'America/New_York';

  // Build list of phases
  const phases = [];
  for (let i = 1; i <= numPhases; i++) {
    phases.push({ phase: i, label: `Phase ${i}` });
  }
  if (hasFinalEval) {
    phases.push({ phase: 0, label: 'Final' });
  }

  // Get effective due date for a phase (with cascading)
  const getEffectiveDueDate = (phase) => {
    if (phaseDueDates[phase]) return phaseDueDates[phase];
    if (phase > 0) {
      for (let p = phase + 1; p <= numPhases; p++) {
        if (phaseDueDates[p]) return phaseDueDates[p];
      }
      if (hasFinalEval && phaseDueDates[0]) return phaseDueDates[0];
    }
    return null;
  };

  // Format due date for display
  const formatDueDate = (dateStr) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        timeZone: timezone,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return dateStr;
    }
  };

  const handleExtensionChange = (userId, phase, value) => {
    setExtensions(prev => ({
      ...prev,
      [`${userId}-${phase}`]: value || null
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      // Convert extensions object to array format
      const extensionsArray = [];
      Object.entries(extensions).forEach(([key, value]) => {
        if (value) {
          const [userId, phase] = key.split('-');
          extensionsArray.push({
            user_id: parseInt(userId),
            phase: parseInt(phase),
            extended_due_date: value
          });
        }
      });

      await axios.put(`/api/classes/${classId}/extensions`, { extensions: extensionsArray });
      setMessage({ type: 'success', text: 'Extensions saved successfully' });
      if (onSave) onSave();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save extensions' });
    } finally {
      setSaving(false);
    }
  };

  const clearExtension = (userId, phase) => {
    setExtensions(prev => {
      const newExt = { ...prev };
      delete newExt[`${userId}-${phase}`];
      return newExt;
    });
  };

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          background: darkMode ? '#1e3a5f' : '#fff',
          padding: '30px',
          borderRadius: '8px'
        }}>
          Loading extensions...
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: darkMode ? '#1e3a5f' : '#fff',
        padding: '25px',
        borderRadius: '8px',
        width: '95%',
        maxWidth: '1000px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 style={{ margin: 0 }}>Manage Extensions</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        {message.text && (
          <div className={`message ${message.type}`} style={{ marginBottom: '15px' }}>
            {message.text}
          </div>
        )}

        <p style={{ marginBottom: '15px', opacity: 0.8, fontSize: '0.9rem' }}>
          Set extended due dates for individual students. Leave blank to use the class default.
        </p>

        {students.length === 0 ? (
          <p>No students enrolled in this class.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.9rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px', minWidth: '200px' }}>Student</th>
                  {phases.map(p => {
                    const dueDate = getEffectiveDueDate(p.phase);
                    return (
                      <th key={p.phase} style={{ textAlign: 'center', padding: '8px', minWidth: '180px' }}>
                        <div>{p.label}</div>
                        {dueDate && (
                          <div style={{
                            fontSize: '0.75rem',
                            fontWeight: 'normal',
                            opacity: 0.7,
                            marginTop: '2px'
                          }}>
                            Due: {formatDueDate(dueDate)}
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {students.map(student => (
                  <tr key={student.id}>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                      {student.last_name}, {student.first_name}
                    </td>
                    {phases.map(p => {
                      const key = `${student.id}-${p.phase}`;
                      const value = extensions[key] || '';
                      return (
                        <td key={p.phase} style={{ padding: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input
                              type="datetime-local"
                              value={value}
                              onChange={(e) => handleExtensionChange(student.id, p.phase, e.target.value)}
                              style={{
                                flex: 1,
                                padding: '4px 6px',
                                fontSize: '0.85rem',
                                backgroundColor: darkMode ? '#001e27' : '#fff',
                                color: darkMode ? '#93a1a1' : '#333',
                                border: `1px solid ${darkMode ? '#586e75' : '#ddd'}`,
                                borderRadius: '3px'
                              }}
                            />
                            {value && (
                              <button
                                onClick={() => clearExtension(student.id, p.phase)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '2px 6px',
                                  fontSize: '1rem',
                                  color: darkMode ? '#839496' : '#666'
                                }}
                                title="Clear extension"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default ManageExtensionsModal;

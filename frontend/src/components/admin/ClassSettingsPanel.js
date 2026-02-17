import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

// Helper function to normalize datetime input - defaults to 11:59 PM if only date is provided
function normalizeDateTime(value) {
  if (!value) return null;
  // If the value is just a date (YYYY-MM-DD), append 11:59 PM
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T23:59`;
  }
  return value;
}

const EVAL_TYPES = [
  { value: 'peer', label: 'Peer Evaluation', desc: 'Teammates rate each other', group: 'rating' },
  { value: 'audience', label: 'Audience Evaluation', desc: 'Class rates presenting groups', group: 'rating' },
  { value: 'paper_review', label: 'Paper Review', desc: 'Upload papers, 1:1 peer review with annotations', group: 'paper', exclusive: true }
];

// Helper function to calculate effective due date for a phase using cascading logic
function getEffectiveDueDate(phase, numPhases, hasFinalEvaluation, phaseDueDates) {
  if (phaseDueDates[phase]) {
    return phaseDueDates[phase];
  }

  if (phase > 0) {
    for (let p = phase + 1; p <= numPhases; p++) {
      if (phaseDueDates[p]) {
        return phaseDueDates[p];
      }
    }
    if (hasFinalEvaluation && phaseDueDates[0]) {
      return phaseDueDates[0];
    }
  }

  return null;
}

const TABS_PHASES = [
  { id: 'basic', label: 'Basic Info' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'criteria', label: 'Criteria' },
  { id: 'options', label: 'Options' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'danger', label: 'Danger Zone' }
];

const TABS_ASSIGNMENTS = [
  { id: 'basic', label: 'Basic Info' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'criteria', label: 'Criteria' },
  { id: 'options', label: 'Options' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'danger', label: 'Danger Zone' }
];

const REMINDER_OPTIONS = [
  { value: 24, label: '24 hours before' },
  { value: 48, label: '48 hours before' },
  { value: 72, label: '3 days before' },
  { value: 168, label: '1 week before' }
];

function ClassSettingsPanel({ darkMode, editingClass, setEditingClass, onSubmit, onClose, onArchive }) {
  const [activeTab, setActiveTab] = useState('basic');
  const [templates, setTemplates] = useState([]);
  const [newAssignment, setNewAssignment] = useState({ name: '', eval_types: ['peer'], due_date: '', due_time: '23:59', template_overrides: {} });
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const assignmentListRef = useRef(null);
  const [reminderSchedules, setReminderSchedules] = useState([]);
  const [nudgeTemplates, setNudgeTemplates] = useState([]);
  const [addingReminder, setAddingReminder] = useState(false);
  const [newReminder, setNewReminder] = useState({ hours_before_due: 24, nudge_template_id: '' });

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/templates', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setTemplates(data);
        }
      } catch (err) {
        console.error('Failed to fetch templates:', err);
      }
    };
    fetchTemplates();
  }, []);

  // Fetch reminder schedules when class changes
  useEffect(() => {
    const fetchReminderData = async () => {
      if (!editingClass?.id) return;
      try {
        const [schedulesRes, nudgeRes] = await Promise.all([
          axios.get(`/api/reminder-schedules/${editingClass.id}`),
          axios.get('/api/nudge-templates')
        ]);
        setReminderSchedules(schedulesRes.data);
        setNudgeTemplates(nudgeRes.data);
      } catch (err) {
        console.error('Failed to fetch reminder data:', err);
      }
    };
    fetchReminderData();
  }, [editingClass?.id]);

  if (!editingClass) return null;

  const availableInstructors = editingClass.enrolledTeachers || [];
  const isPhaseBased = editingClass.evaluation_mode !== 'assignments';
  const TABS = isPhaseBased ? TABS_PHASES : TABS_ASSIGNMENTS;

  // Get list of phases including final evaluation
  const getPhases = () => {
    const phases = [];
    for (let i = 1; i <= (editingClass.num_phases || 3); i++) {
      phases.push({ phase: i, label: `Phase ${i}` });
    }
    if (editingClass.has_final_evaluation) {
      phases.push({ phase: 0, label: 'Final Evaluation' });
    }
    return phases;
  };

  // Determine the last required phase
  const getLastRequiredPhase = () => {
    if (editingClass.has_final_evaluation) {
      return 0;
    }
    return editingClass.num_phases || 3;
  };

  const handlePhaseDueDateChange = (phase, value) => {
    setEditingClass({
      ...editingClass,
      phase_due_dates: {
        ...editingClass.phase_due_dates,
        [phase]: normalizeDateTime(value)
      }
    });
  };

  const renderBasicInfoTab = () => (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="form-group">
          <label>Class Name *</label>
          <input
            type="text"
            value={editingClass.name}
            onChange={(e) => setEditingClass({ ...editingClass, name: e.target.value })}
            required
            placeholder="e.g., Software Engineering"
          />
        </div>

        <div className="form-group">
          <label>Section</label>
          <input
            type="text"
            value={editingClass.section || ''}
            onChange={(e) => setEditingClass({ ...editingClass, section: e.target.value })}
            placeholder="e.g., 001"
          />
        </div>

        <div className="form-group">
          <label>Semester</label>
          <input
            type="text"
            value={editingClass.semester || ''}
            onChange={(e) => setEditingClass({ ...editingClass, semester: e.target.value })}
            placeholder="e.g., Fall 2024"
          />
        </div>

        <div className="form-group">
          <label>Timezone</label>
          <select
            value={editingClass.due_date_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
            onChange={(e) => setEditingClass({ ...editingClass, due_date_timezone: e.target.value })}
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
          <label>Instructors ({(editingClass.instructor_ids || []).length} selected)</label>
          <div style={{
            minHeight: availableInstructors.length <= 5 ? 'auto' : '120px',
            maxHeight: '200px',
            overflowY: 'auto',
            border: `1px solid ${darkMode ? '#333' : '#ddd'}`,
            borderRadius: '4px',
            padding: '10px',
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
                  padding: '4px 0'
                }}
              >
                <input
                  type="checkbox"
                  checked={(editingClass.instructor_ids || []).includes(u.id)}
                  onChange={() => {
                    const currentIds = editingClass.instructor_ids || [];
                    const newIds = currentIds.includes(u.id)
                      ? currentIds.filter(id => id !== u.id)
                      : [...currentIds, u.id];
                    setEditingClass({ ...editingClass, instructor_ids: newIds });
                  }}
                  style={{ marginRight: '8px', width: 'auto' }}
                />
                {u.last_name}, {u.first_name}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Evaluation Mode */}
      <div className="form-group" style={{ marginTop: '20px' }}>
        <label>Evaluation Mode</label>
        <select
          value={editingClass.evaluation_mode || 'phases'}
          onChange={(e) => setEditingClass({ ...editingClass, evaluation_mode: e.target.value })}
          style={{ maxWidth: '300px' }}
        >
          <option value="phases">Phase-Based</option>
          <option value="assignments">Assignment-Based</option>
        </select>
        <small style={{
          display: 'block',
          marginTop: '6px',
          color: darkMode ? '#888' : '#888'
        }}>
          {(editingClass.evaluation_mode || 'phases') === 'phases'
            ? 'Students evaluate teammates at scheduled phase checkpoints.'
            : 'Students evaluate based on specific assignments (presentations, papers, etc.).'
          }
          <br />
          <em>Note: Cannot be changed after evaluations are submitted.</em>
        </small>
      </div>
    </div>
  );

  const renderScheduleTab = () => (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '30px' }}>
        <div>
          <div className="form-group">
            <label>Number of Phases</label>
            <select
              value={editingClass.num_phases || 3}
              onChange={(e) => setEditingClass({ ...editingClass, num_phases: parseInt(e.target.value) })}
            >
              <option value={1}>1 Phase</option>
              <option value={2}>2 Phases</option>
              <option value={3}>3 Phases</option>
              <option value={4}>4 Phases</option>
              <option value={5}>5 Phases</option>
            </select>
          </div>

          <div className="form-group" style={{ marginTop: '15px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              fontWeight: 'normal'
            }}>
              <input
                type="checkbox"
                checked={editingClass.has_final_evaluation}
                onChange={(e) => setEditingClass({ ...editingClass, has_final_evaluation: e.target.checked })}
                style={{ width: '18px', height: '18px' }}
              />
              <span>Include Final Evaluation (23-pt scale)</span>
            </label>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '10px', fontWeight: 500 }}>
            Phase Due Dates
          </label>
          <small style={{
            display: 'block',
            marginBottom: '10px',
            color: darkMode ? '#888' : '#888'
          }}>
            Empty phases inherit from next set date
          </small>
          <div style={{
            border: `1px solid ${darkMode ? '#333' : '#ddd'}`,
            borderRadius: '4px',
            padding: '12px',
            backgroundColor: darkMode ? '#0f0f0f' : '#f9f9f9'
          }}>
            {getPhases().map(({ phase, label }) => {
              const phaseDueDates = editingClass.phase_due_dates || {};
              const effectiveDate = getEffectiveDueDate(
                phase,
                editingClass.num_phases || 3,
                editingClass.has_final_evaluation,
                phaseDueDates
              );
              const hasOwnDate = !!phaseDueDates[phase];
              const isLastPhase = phase === getLastRequiredPhase();

              return (
                <div key={phase} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: phase !== getLastRequiredPhase() ? '10px' : 0
                }}>
                  <span style={{
                    minWidth: '140px',
                    fontWeight: isLastPhase ? 'bold' : 'normal',
                    fontSize: '0.9rem'
                  }}>
                    {label}{isLastPhase ? ' *' : ''}:
                  </span>
                  <input
                    type="date"
                    value={(phaseDueDates[phase] || effectiveDate || '').split('T')[0]}
                    onChange={(e) => {
                      const date = e.target.value;
                      const currentTime = (phaseDueDates[phase] || '').split('T')[1] || '23:59';
                      handlePhaseDueDateChange(phase, date ? `${date}T${currentTime}` : null);
                    }}
                    required={isLastPhase}
                    style={{
                      opacity: hasOwnDate ? 1 : 0.6
                    }}
                  />
                  <input
                    type="time"
                    value={(phaseDueDates[phase] || effectiveDate || 'T23:59').split('T')[1] || '23:59'}
                    onChange={(e) => {
                      const time = e.target.value || '23:59';
                      const currentDate = (phaseDueDates[phase] || '').split('T')[0];
                      if (currentDate) {
                        handlePhaseDueDateChange(phase, `${currentDate}T${time}`);
                      }
                    }}
                    style={{
                      opacity: hasOwnDate ? 1 : 0.6,
                      width: '120px'
                    }}
                  />
                  {hasOwnDate && !isLastPhase && (
                    <button
                      type="button"
                      onClick={() => handlePhaseDueDateChange(phase, null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '5px 10px',
                        fontSize: '1.2rem',
                        color: darkMode ? '#888' : '#666'
                      }}
                      title="Clear date (inherit from later phase)"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  const toggleEvalType = (type) => {
    const types = newAssignment.eval_types;

    if (types.includes(type)) {
      // Unchecking - only allow if there's at least one other type selected
      if (types.length > 1) {
        setNewAssignment({ ...newAssignment, eval_types: types.filter(t => t !== type) });
      }
    } else {
      // Checking - paper_review is mutually exclusive with peer/audience
      if (type === 'paper_review') {
        // Selecting paper_review - clear peer and audience
        setNewAssignment({ ...newAssignment, eval_types: ['paper_review'] });
      } else {
        // Selecting peer or audience - remove paper_review if present
        const newTypes = types.filter(t => t !== 'paper_review');
        setNewAssignment({ ...newAssignment, eval_types: [...newTypes, type] });
      }
    }
  };

  const handleAddAssignment = async () => {
    if (!newAssignment.name.trim() || savingAssignment) return;

    setSavingAssignment(true);
    try {
      // Get template criteria based on eval type
      const individualTemplates = templates.filter(t => t.target_type === 'individual');
      const groupTemplates = templates.filter(t => t.target_type === 'group');

      // Find default system templates - use first system template of each type
      const defaultPeerTemplate = individualTemplates.find(t => t.is_system);
      const defaultAudienceTemplate = groupTemplates.find(t => t.is_system);

      const getTemplateForEvalType = (evalType) => {
        // Check per-assignment template override first
        const overrideId = newAssignment.template_overrides[evalType];
        if (overrideId) {
          const overrideTemplate = templates.find(t => t.id === overrideId);
          if (overrideTemplate) return overrideTemplate;
        }
        if (evalType === 'audience') {
          const templateId = editingClass.audience_template_id;
          return templateId
            ? templates.find(t => t.id === templateId)
            : defaultAudienceTemplate;
        } else {
          // peer, paper_review, and self all use individual templates
          const templateId = editingClass.peer_template_id;
          return templateId
            ? templates.find(t => t.id === templateId)
            : defaultPeerTemplate;
        }
      };

      // Build eval_types with proper structure and criteria from templates
      const evalTypes = newAssignment.eval_types.map(et => {
        const template = getTemplateForEvalType(et);
        return {
          eval_type: et,
          name: EVAL_TYPES.find(t => t.value === et)?.label || et,
          target_type: et === 'audience' ? 'group' : 'individual',
          criteria: template?.criteria?.map(c => ({
            name: c.name,
            description: c.description,
            min_value: c.min_value,
            max_value: c.max_value,
            order_index: c.order_index
          })) || []
        };
      });

      // Build due_date from date and time
      const dueDate = newAssignment.due_date
        ? `${newAssignment.due_date}T${newAssignment.due_time || '23:59'}`
        : null;

      const res = await axios.post('/api/assignments', {
        class_id: editingClass.id,
        name: newAssignment.name.trim(),
        due_date: dueDate,
        eval_types: evalTypes
      });

      // Add to local state
      const assignments = editingClass.assignments || [];
      setEditingClass({
        ...editingClass,
        assignments: [...assignments, res.data]
      });

      setNewAssignment({ name: '', eval_types: ['peer'], due_date: '', due_time: '23:59', template_overrides: {} });

      // Show success message and scroll to new assignment
      setSuccessMessage(`Assignment "${res.data.name}" created successfully`);
      setTimeout(() => setSuccessMessage(''), 3000);

      // Scroll to the bottom of the assignment list after React re-renders
      setTimeout(() => {
        if (assignmentListRef.current) {
          assignmentListRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      }, 100);
    } catch (err) {
      console.error('Failed to create assignment:', err);
      setSuccessMessage('');
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleApplyTemplate = async (evalTypeId, templateId, assignmentId) => {
    if (!templateId) return;
    setApplyingTemplate(evalTypeId);
    try {
      const res = await axios.put(`/api/assignments/eval-type/${evalTypeId}/apply-template`, {
        template_id: parseInt(templateId)
      });
      // Update the assignment in local state with refreshed data
      const assignments = editingClass.assignments || [];
      setEditingClass({
        ...editingClass,
        assignments: assignments.map(a => a.id === assignmentId ? res.data : a)
      });
      setSuccessMessage('Template applied successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Failed to apply template:', err);
      setSuccessMessage('');
    } finally {
      setApplyingTemplate(null);
    }
  };

  const handleDeleteAssignment = async (assignmentId) => {
    if (!window.confirm('Delete this assignment? This cannot be undone.')) return;

    try {
      await axios.delete(`/api/assignments/${assignmentId}`);
      const assignments = editingClass.assignments || [];
      setEditingClass({
        ...editingClass,
        assignments: assignments.filter(a => a.id !== assignmentId)
      });
    } catch (err) {
      console.error('Failed to delete assignment:', err);
    }
  };

  const renderAssignmentsTab = () => {
    const assignments = editingClass.assignments || [];

    return (
      <div>
        <p style={{
          marginBottom: '20px',
          color: darkMode ? '#a0a0a0' : '#666'
        }}>
          Manage assignments and their evaluation types for this class.
        </p>

        {/* Success message */}
        {successMessage && (
          <div style={{
            padding: '12px 16px',
            marginBottom: '20px',
            borderRadius: '6px',
            background: darkMode ? 'rgba(39, 174, 96, 0.15)' : 'rgba(39, 174, 96, 0.1)',
            border: `1px solid ${darkMode ? '#27ae60' : '#27ae60'}`,
            color: darkMode ? '#2ecc71' : '#27ae60',
            fontWeight: 500
          }}>
            {successMessage}
          </div>
        )}

        {/* Add new assignment form */}
        <div style={{
          background: darkMode ? '#1a1a1a' : '#f8f9fa',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '25px',
          border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
        }}>
          <h4 style={{ marginTop: 0, marginBottom: '15px', fontSize: '1rem' }}>
            Add Assignment
          </h4>

          <div className="form-group" style={{ margin: 0, marginBottom: '15px' }}>
            <label>Assignment Name</label>
            <input
              type="text"
              value={newAssignment.name}
              onChange={(e) => setNewAssignment({ ...newAssignment, name: e.target.value })}
              placeholder="e.g., Presentation 1, Paper Draft"
              style={{ maxWidth: '400px' }}
            />
          </div>

          <div className="form-group" style={{ marginTop: '15px', marginBottom: '15px' }}>
            <label>Due Date (optional)</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="date"
                value={newAssignment.due_date}
                onChange={(e) => setNewAssignment({ ...newAssignment, due_date: e.target.value })}
                style={{ width: 'auto' }}
              />
              <input
                type="time"
                value={newAssignment.due_time}
                onChange={(e) => setNewAssignment({ ...newAssignment, due_time: e.target.value || '23:59' })}
                style={{ width: 'auto' }}
              />
              {newAssignment.due_date && (
                <button
                  type="button"
                  onClick={() => setNewAssignment({ ...newAssignment, due_date: '', due_time: '23:59' })}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                    color: darkMode ? '#888' : '#666'
                  }}
                  title="Clear due date"
                >
                  ×
                </button>
              )}
            </div>
            <small style={{
              display: 'block',
              marginTop: '6px',
              color: darkMode ? '#888' : '#888'
            }}>
              You can also edit the due date after creating the assignment
            </small>
          </div>

          <div className="form-group" style={{ marginTop: '15px', marginBottom: '15px' }}>
            <label>Evaluation Type</label>
            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginTop: '8px', alignItems: 'flex-start' }}>
              {/* Rating-based eval types (can be combined) */}
              {EVAL_TYPES.filter(t => t.group === 'rating').map(type => (
                <label
                  key={type.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    background: newAssignment.eval_types.includes(type.value)
                      ? (darkMode ? 'rgba(38, 139, 210, 0.2)' : 'rgba(52, 152, 219, 0.15)')
                      : 'transparent',
                    border: `1px solid ${newAssignment.eval_types.includes(type.value)
                      ? '#3498db'
                      : (darkMode ? '#586e75' : '#ddd')}`
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newAssignment.eval_types.includes(type.value)}
                    onChange={() => toggleEvalType(type.value)}
                    style={{ width: 'auto' }}
                  />
                  <div>
                    <div style={{ fontWeight: 500 }}>{type.label}</div>
                    <div style={{
                      fontSize: '0.8rem',
                      color: darkMode ? '#888' : '#888'
                    }}>
                      {type.desc}
                    </div>
                  </div>
                </label>
              ))}

              {/* Separator */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                color: darkMode ? '#666' : '#999',
                fontSize: '0.85rem',
                padding: '0 5px'
              }}>
                or
              </div>

              {/* Paper review (exclusive) */}
              {EVAL_TYPES.filter(t => t.group === 'paper').map(type => (
                <label
                  key={type.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    background: newAssignment.eval_types.includes(type.value)
                      ? (darkMode ? 'rgba(38, 139, 210, 0.2)' : 'rgba(52, 152, 219, 0.15)')
                      : 'transparent',
                    border: `1px solid ${newAssignment.eval_types.includes(type.value)
                      ? '#3498db'
                      : (darkMode ? '#586e75' : '#ddd')}`
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newAssignment.eval_types.includes(type.value)}
                    onChange={() => toggleEvalType(type.value)}
                    style={{ width: 'auto' }}
                  />
                  <div>
                    <div style={{ fontWeight: 500 }}>{type.label}</div>
                    <div style={{
                      fontSize: '0.8rem',
                      color: darkMode ? '#888' : '#888'
                    }}>
                      {type.desc}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Per-assignment template selection */}
          {newAssignment.eval_types.length > 0 && templates.length > 0 && (
            <div className="form-group" style={{ marginTop: '15px', marginBottom: '15px' }}>
              <label>Evaluation Templates</label>
              <small style={{
                display: 'block',
                marginBottom: '10px',
                color: darkMode ? '#888' : '#888'
              }}>
                Choose a template for each evaluation type (defaults to class-level template)
              </small>
              {newAssignment.eval_types.map(evalType => {
                const isGroup = evalType === 'audience';
                const templateOptions = templates.filter(t => t.target_type === (isGroup ? 'group' : 'individual'));
                const classDefault = evalType === 'audience'
                  ? editingClass.audience_template_id
                  : editingClass.peer_template_id;
                const selectedId = newAssignment.template_overrides[evalType] || classDefault || '';
                const selectedTemplate = selectedId ? templates.find(t => t.id === selectedId) : null;

                return (
                  <div key={evalType} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        minWidth: '130px',
                        color: darkMode ? '#ccc' : '#333'
                      }}>
                        {EVAL_TYPES.find(t => t.value === evalType)?.label || evalType}:
                      </span>
                      <select
                        value={selectedId}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value) : null;
                          setNewAssignment({
                            ...newAssignment,
                            template_overrides: { ...newAssignment.template_overrides, [evalType]: val }
                          });
                        }}
                        style={{ flex: 1, maxWidth: '300px' }}
                      >
                        <option value="">-- Select template --</option>
                        {templateOptions.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name}{t.id === classDefault ? ' (class default)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedTemplate && selectedTemplate.criteria && (
                      <div style={{
                        marginLeft: '140px',
                        marginTop: '4px',
                        fontSize: '0.8rem',
                        color: darkMode ? '#888' : '#888'
                      }}>
                        {selectedTemplate.criteria.length} criteria: {selectedTemplate.criteria.map(c => c.name).join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAddAssignment}
            disabled={!newAssignment.name.trim() || savingAssignment}
          >
            {savingAssignment ? 'Adding...' : 'Add Assignment'}
          </button>
        </div>

        {/* Assignment list */}
        <h4 style={{ marginBottom: '15px' }}>
          Assignments ({assignments.length})
        </h4>

        {assignments.length === 0 ? (
          <div style={{
            padding: '30px',
            textAlign: 'center',
            color: darkMode ? '#888' : '#888',
            background: darkMode ? '#1a1a1a' : '#f8f9fa',
            borderRadius: '8px',
            border: `1px dashed ${darkMode ? '#333' : '#ddd'}`
          }}>
            No assignments added yet. Add assignments above to get started.
          </div>
        ) : (
          <div ref={assignmentListRef} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {assignments.map((assignment, index) => (
              <div
                key={assignment.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '15px',
                  padding: '15px',
                  borderRadius: '6px',
                  background: darkMode ? '#1a1a1a' : '#fff',
                  border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: '8px' }}>
                    {index + 1}. {assignment.name}
                  </div>
                  <div style={{
                    fontSize: '0.85rem',
                    color: darkMode ? '#888' : '#888',
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap',
                    marginBottom: '10px'
                  }}>
                    {(assignment.eval_types || []).map(et => (
                      <span
                        key={typeof et === 'string' ? et : et.id}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '3px',
                          background: darkMode ? '#333' : '#e0e0e0',
                          fontSize: '0.8rem'
                        }}
                      >
                        {typeof et === 'string'
                          ? EVAL_TYPES.find(t => t.value === et)?.label || et
                          : et.name}
                      </span>
                    ))}
                  </div>
                  {/* Template picker and criteria display for each eval type */}
                  {(assignment.eval_types || []).filter(et => typeof et === 'object').map(et => {
                    const isGroup = et.target_type === 'group' || et.eval_type === 'audience';
                    const templateOptions = templates.filter(t => t.target_type === (isGroup ? 'group' : 'individual'));
                    return (
                      <div key={et.id} style={{
                        fontSize: '0.8rem',
                        color: darkMode ? '#a0a0a0' : '#666',
                        marginBottom: '8px',
                        padding: '8px 10px',
                        background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        borderRadius: '4px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 500 }}>{et.name} template:</span>
                          <select
                            value=""
                            onChange={(e) => handleApplyTemplate(et.id, e.target.value, assignment.id)}
                            disabled={applyingTemplate === et.id}
                            style={{
                              fontSize: '0.8rem',
                              padding: '2px 6px',
                              borderRadius: '3px',
                              border: `1px solid ${darkMode ? '#444' : '#ccc'}`,
                              background: darkMode ? '#2a2a2a' : '#fff',
                              color: darkMode ? '#ccc' : '#333',
                              cursor: 'pointer'
                            }}
                          >
                            <option value="">{applyingTemplate === et.id ? 'Applying...' : 'Change template...'}</option>
                            {templateOptions.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                        {et.criteria && et.criteria.length > 0 && (
                          <div style={{ marginTop: '4px' }}>
                            Criteria: {et.criteria.map(c => c.name).join(', ')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.85rem' }}>Due Date</label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <input
                        type="date"
                        value={(assignment.due_date || '').split('T')[0]}
                        onChange={async (e) => {
                          const date = e.target.value;
                          const currentTime = (assignment.due_date || '').split('T')[1] || '23:59';
                          const dueDate = date ? `${date}T${currentTime}` : null;
                          try {
                            await axios.put(`/api/assignments/${assignment.id}`, { due_date: dueDate });
                            const updated = assignments.map(a =>
                              a.id === assignment.id ? { ...a, due_date: dueDate } : a
                            );
                            setEditingClass({ ...editingClass, assignments: updated });
                          } catch (err) {
                            console.error('Failed to update due date:', err);
                          }
                        }}
                        style={{ width: 'auto' }}
                      />
                      <input
                        type="time"
                        value={(assignment.due_date || 'T23:59').split('T')[1] || '23:59'}
                        onChange={async (e) => {
                          const time = e.target.value || '23:59';
                          const currentDate = (assignment.due_date || '').split('T')[0];
                          if (currentDate) {
                            const dueDate = `${currentDate}T${time}`;
                            try {
                              await axios.put(`/api/assignments/${assignment.id}`, { due_date: dueDate });
                              const updated = assignments.map(a =>
                                a.id === assignment.id ? { ...a, due_date: dueDate } : a
                              );
                              setEditingClass({ ...editingClass, assignments: updated });
                            } catch (err) {
                              console.error('Failed to update due date:', err);
                            }
                          }
                        }}
                        style={{ width: 'auto' }}
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteAssignment(assignment.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#e74c3c',
                    fontSize: '1.2rem',
                    padding: '5px 10px'
                  }}
                  title="Delete assignment"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Helper to render template preview
  const renderTemplatePreview = (templateId, templateList) => {
    const template = templateList.find(t => t.id === templateId);
    if (!template) return null;

    return (
      <div style={{
        marginTop: '10px',
        padding: '15px',
        borderRadius: '6px',
        background: darkMode ? '#141414' : '#f8f9fa',
        border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`,
        fontSize: '0.9rem'
      }}>
        <div style={{ fontWeight: 600, marginBottom: '10px' }}>
          {template.name} - {template.criteria.length} criteria
        </div>
        {template.description && (
          <div style={{ marginBottom: '10px', color: darkMode ? '#a0a0a0' : '#666', fontSize: '0.85rem' }}>
            {template.description}
          </div>
        )}
        <table style={{ width: '100%', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: darkMode ? '#1a1a1a' : '#f0f0f0', textAlign: 'left' }}>
              <th style={{ padding: '6px 10px', width: '30px' }}>#</th>
              <th style={{ padding: '6px 10px' }}>Criterion</th>
              <th style={{ padding: '6px 10px' }}>Scale</th>
            </tr>
          </thead>
          <tbody>
            {template.criteria.map((c, i) => (
              <tr key={c.id || i} style={{ borderBottom: `1px solid ${darkMode ? '#333' : '#eee'}` }}>
                <td style={{ padding: '6px 10px' }}>{i + 1}</td>
                <td style={{ padding: '6px 10px' }}>
                  <div style={{ fontWeight: 500 }}>{c.name}</div>
                  {c.description && (
                    <div style={{ fontSize: '0.8rem', color: darkMode ? '#888' : '#888' }}>
                      {c.description}
                    </div>
                  )}
                </td>
                <td style={{ padding: '6px 10px' }}>{c.min_value}-{c.max_value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCriteriaTab = () => {
    const individualTemplates = templates.filter(t => t.target_type === 'individual');
    const groupTemplates = templates.filter(t => t.target_type === 'group');

    // Get default templates (system templates with specific names)
    const defaultPeerTemplate = individualTemplates.find(t => t.is_system && t.name === 'Peer Evaluation');
    const defaultAudienceTemplate = groupTemplates.find(t => t.is_system && t.name === 'Audience Evaluation');

    // Get selected template IDs (use defaults if not set)
    const selectedPeerTemplateId = editingClass.peer_template_id || (defaultPeerTemplate?.id);
    const selectedAudienceTemplateId = editingClass.audience_template_id || (defaultAudienceTemplate?.id);

    return (
      <div>
        <p style={{
          marginBottom: '20px',
          color: darkMode ? '#a0a0a0' : '#666'
        }}>
          Select evaluation templates for this class. Templates define the criteria students use.
        </p>

        <div className="form-group">
          <label>Peer Evaluation Template</label>
          <select
            value={editingClass.peer_template_id || ''}
            onChange={(e) => setEditingClass({
              ...editingClass,
              peer_template_id: e.target.value ? parseInt(e.target.value) : null
            })}
            style={{ maxWidth: '400px' }}
          >
            <option value="">-- Default Template --</option>
            {individualTemplates.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} {t.is_system ? '(System)' : ''}
              </option>
            ))}
          </select>
          <small style={{
            display: 'block',
            marginTop: '6px',
            color: darkMode ? '#888' : '#888'
          }}>
            Used when students evaluate individual teammates
          </small>
          {selectedPeerTemplateId && renderTemplatePreview(selectedPeerTemplateId, individualTemplates)}
        </div>

        {!isPhaseBased && (
          <div className="form-group" style={{ marginTop: '20px' }}>
            <label>Audience Evaluation Template</label>
            <select
              value={editingClass.audience_template_id || ''}
              onChange={(e) => setEditingClass({
                ...editingClass,
                audience_template_id: e.target.value ? parseInt(e.target.value) : null
              })}
              style={{ maxWidth: '400px' }}
            >
              <option value="">-- Default Template --</option>
              {groupTemplates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.is_system ? '(System)' : ''}
                </option>
              ))}
            </select>
            <small style={{
              display: 'block',
              marginTop: '6px',
              color: darkMode ? '#888' : '#888'
            }}>
              Used when students evaluate presenting groups
            </small>
            {selectedAudienceTemplateId && renderTemplatePreview(selectedAudienceTemplateId, groupTemplates)}
          </div>
        )}

        <div style={{
          marginTop: '25px',
          padding: '15px',
          borderRadius: '6px',
          background: darkMode ? 'rgba(38, 139, 210, 0.1)' : 'rgba(52, 152, 219, 0.1)',
          border: `1px solid #3498db`,
          fontSize: '0.9rem'
        }}>
          <strong>Tip:</strong> Create custom templates from the Templates tab in the Admin Dashboard to customize criteria for your specific course needs.
        </div>
      </div>
    );
  };

  const renderOptionsTab = () => (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        <div>
          <div className="form-group">
            <label>Minimum Comment Words</label>
            <input
              type="number"
              min="0"
              value={editingClass.min_comment_words || 0}
              onChange={(e) => setEditingClass({
                ...editingClass,
                min_comment_words: parseInt(e.target.value) || 0
              })}
              style={{ maxWidth: '150px' }}
            />
            <small style={{
              display: 'block',
              marginTop: '6px',
              color: darkMode ? '#888' : '#888'
            }}>
              Set to 0 for no minimum. Students must write at least this many words.
            </small>
          </div>

          <div className="form-group" style={{ marginTop: '25px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              fontWeight: 'normal',
              marginBottom: '10px'
            }}>
              <input
                type="checkbox"
                checked={editingClass.allow_late || false}
                onChange={(e) => setEditingClass({
                  ...editingClass,
                  allow_late: e.target.checked,
                  late_window_hours: e.target.checked ? (editingClass.late_window_hours || 48) : 0
                })}
                style={{ width: '18px', height: '18px' }}
              />
              <span>Allow late submissions</span>
            </label>

            {editingClass.allow_late && (
              <div style={{ marginLeft: '28px' }}>
                <label style={{ fontSize: '0.9rem' }}>Late submission window</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    value={editingClass.late_window_hours || 48}
                    onChange={(e) => setEditingClass({
                      ...editingClass,
                      late_window_hours: parseInt(e.target.value) || 48
                    })}
                    style={{ width: '80px' }}
                  />
                  <span style={{ color: darkMode ? '#a0a0a0' : '#666' }}>hours after due date</span>
                </div>
              </div>
            )}
          </div>

          <div className="form-group" style={{ marginTop: '25px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              fontWeight: 'normal'
            }}>
              <input
                type="checkbox"
                checked={editingClass.include_self_eval || false}
                onChange={(e) => setEditingClass({
                  ...editingClass,
                  include_self_eval: e.target.checked
                })}
                style={{ width: '18px', height: '18px' }}
              />
              <span>Include self-evaluation</span>
            </label>
            <small style={{
              display: 'block',
              marginTop: '6px',
              marginLeft: '28px',
              color: darkMode ? '#888' : '#888'
            }}>
              Students will also evaluate themselves
            </small>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              fontWeight: 'normal'
            }}>
              <input
                type="checkbox"
                checked={editingClass.show_groups || false}
                onChange={(e) => setEditingClass({
                  ...editingClass,
                  show_groups: e.target.checked
                })}
                style={{ width: '18px', height: '18px' }}
              />
              <span>Enable groups</span>
            </label>
            <small style={{
              display: 'block',
              marginTop: '6px',
              marginLeft: '28px',
              color: darkMode ? '#888' : '#888'
            }}>
              Show group assignment and display in student views
            </small>
          </div>
        </div>

        <div style={{
          padding: '20px',
          borderRadius: '8px',
          background: darkMode ? '#141414' : '#f8f9fa',
          border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
        }}>
          <h4 style={{ margin: '0 0 15px', fontSize: '1rem' }}>Current Settings</h4>
          <div style={{ fontSize: '0.9rem', lineHeight: '1.8' }}>
            <div><strong>Min words:</strong> {editingClass.min_comment_words || 0}</div>
            <div><strong>Late submissions:</strong> {editingClass.allow_late ? `Yes (${editingClass.late_window_hours || 48}h window)` : 'No'}</div>
            <div><strong>Self-evaluation:</strong> {editingClass.include_self_eval ? 'Yes' : 'No'}</div>
            <div><strong>Groups:</strong> {editingClass.show_groups ? 'Enabled' : 'Disabled'}</div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDangerTab = () => (
    <div>
      <div style={{
        padding: '20px',
        borderRadius: '8px',
        background: darkMode ? 'rgba(220, 50, 47, 0.1)' : 'rgba(231, 76, 60, 0.1)',
        border: `1px solid #e74c3c`
      }}>
        <h4 style={{
          margin: '0 0 15px',
          color: '#e74c3c'
        }}>
          Archive Class
        </h4>
        <p style={{
          marginBottom: '15px',
          color: darkMode ? '#a0a0a0' : '#666'
        }}>
          Archiving a class hides it from the class dropdown but preserves all data.
          Archived classes can be restored later.
        </p>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Are you sure you want to archive "${editingClass.name}"?`)) {
              onArchive(editingClass.id);
            }
          }}
          style={{
            background: '#e74c3c',
            color: '#fff',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.95rem'
          }}
        >
          Archive This Class
        </button>
      </div>
    </div>
  );

  const formatHours = (hours) => {
    const option = REMINDER_OPTIONS.find(o => o.value === hours);
    return option ? option.label : `${hours} hours before`;
  };

  const handleAddReminder = async () => {
    try {
      await axios.post('/api/reminder-schedules', {
        class_id: editingClass.id,
        hours_before_due: newReminder.hours_before_due,
        enabled: true,
        nudge_template_id: newReminder.nudge_template_id ? parseInt(newReminder.nudge_template_id) : null
      });
      // Refresh schedules
      const res = await axios.get(`/api/reminder-schedules/${editingClass.id}`);
      setReminderSchedules(res.data);
      setAddingReminder(false);
      setNewReminder({ hours_before_due: 24, nudge_template_id: '' });
    } catch (err) {
      console.error('Failed to add reminder:', err);
    }
  };

  const handleToggleReminder = async (schedule) => {
    try {
      await axios.patch(`/api/reminder-schedules/${schedule.id}/toggle`);
      const res = await axios.get(`/api/reminder-schedules/${editingClass.id}`);
      setReminderSchedules(res.data);
    } catch (err) {
      console.error('Failed to toggle reminder:', err);
    }
  };

  const handleDeleteReminder = async (id) => {
    if (!window.confirm('Remove this reminder schedule?')) return;
    try {
      await axios.delete(`/api/reminder-schedules/${id}`);
      setReminderSchedules(reminderSchedules.filter(s => s.id !== id));
    } catch (err) {
      console.error('Failed to delete reminder:', err);
    }
  };

  const renderRemindersTab = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 style={{ margin: 0, marginBottom: '8px' }}>Automatic Email Reminders</h3>
          <p style={{ margin: 0, color: darkMode ? '#a0a0a0' : '#666', fontSize: '0.9rem' }}>
            Automatically notify students before evaluation deadlines.
          </p>
        </div>
        {!addingReminder && (
          <button className="btn btn-primary" onClick={() => setAddingReminder(true)}>
            + Add Reminder
          </button>
        )}
      </div>

      {addingReminder && (
        <div style={{
          background: darkMode ? '#1a1a1a' : '#f8f9fa',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
        }}>
          <h4 style={{ marginTop: 0 }}>New Reminder Schedule</h4>

          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label>When to send</label>
            <select
              value={newReminder.hours_before_due}
              onChange={(e) => setNewReminder({ ...newReminder, hours_before_due: parseInt(e.target.value) })}
              style={{ maxWidth: '300px' }}
            >
              {REMINDER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label>Email template (optional)</label>
            <select
              value={newReminder.nudge_template_id}
              onChange={(e) => setNewReminder({ ...newReminder, nudge_template_id: e.target.value })}
              style={{ maxWidth: '300px' }}
            >
              <option value="">Default reminder message</option>
              {nudgeTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <small style={{ display: 'block', marginTop: '6px', color: darkMode ? '#888' : '#888' }}>
              Create and edit templates in the Email tab
            </small>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-primary" onClick={handleAddReminder}>
              Add Schedule
            </button>
            <button className="btn btn-secondary" onClick={() => setAddingReminder(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {reminderSchedules.length === 0 ? (
        <div style={{
          padding: '30px',
          textAlign: 'center',
          color: darkMode ? '#888' : '#888',
          background: darkMode ? '#1a1a1a' : '#f8f9fa',
          borderRadius: '8px',
          border: `1px dashed ${darkMode ? '#333' : '#ddd'}`
        }}>
          No automatic reminders configured. Add a reminder to automatically notify students before evaluations are due.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {reminderSchedules.map(schedule => {
            const template = nudgeTemplates.find(t => t.id === schedule.nudge_template_id);
            return (
              <div
                key={schedule.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: darkMode ? '#1a1a1a' : '#f8f9fa',
                  padding: '15px',
                  borderRadius: '8px',
                  border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`,
                  opacity: schedule.enabled ? 1 : 0.6
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '500' }}>
                    {formatHours(schedule.hours_before_due)}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: darkMode ? '#888' : '#666' }}>
                    {template ? `Using template: ${template.name}` : 'Default reminder message'}
                  </div>
                  {schedule.last_sent_at && (
                    <div style={{ fontSize: '0.8rem', color: darkMode ? '#666' : '#999', marginTop: '4px' }}>
                      Last sent: {new Date(schedule.last_sent_at).toLocaleString()}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={schedule.enabled}
                      onChange={() => handleToggleReminder(schedule)}
                      style={{ width: 'auto' }}
                    />
                    <span style={{ fontSize: '0.85rem' }}>
                      {schedule.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleDeleteReminder(schedule.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#e74c3c',
                      fontSize: '1.2rem',
                      padding: '5px 10px'
                    }}
                    title="Remove reminder"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{
        marginTop: '25px',
        padding: '15px',
        background: darkMode ? '#1a2332' : '#eff6ff',
        borderRadius: '8px',
        fontSize: '0.9rem',
        color: darkMode ? '#a0b4c8' : '#1e40af'
      }}>
        <strong>How it works:</strong> The system checks every 15 minutes for upcoming due dates.
        When an evaluation is due within your configured time window, students who haven't completed
        their evaluations will receive an automatic reminder email. Teachers receive a notification
        listing which students were reminded.
      </div>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'basic': return renderBasicInfoTab();
      case 'schedule': return renderScheduleTab();
      case 'assignments': return renderAssignmentsTab();
      case 'criteria': return renderCriteriaTab();
      case 'options': return renderOptionsTab();
      case 'reminders': return renderRemindersTab();
      case 'danger': return renderDangerTab();
      default: return null;
    }
  };

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
        background: darkMode ? '#1a1a1a' : '#fff',
        borderRadius: '8px',
        width: '100%',
        maxWidth: '900px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 25px',
          borderBottom: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`,
          background: darkMode ? '#141414' : '#f8f9fa'
        }}>
          <h2 style={{ margin: 0 }}>
            Class Settings: {editingClass.name}
          </h2>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`,
          background: darkMode ? '#141414' : '#f8f9fa'
        }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 20px',
                border: 'none',
                borderBottom: activeTab === tab.id
                  ? `3px solid #3498db`
                  : '3px solid transparent',
                background: 'transparent',
                color: activeTab === tab.id
                  ? '#3498db'
                  : (darkMode ? '#93a1a1' : '#666'),
                fontWeight: activeTab === tab.id ? 600 : 400,
                cursor: 'pointer',
                fontSize: '0.95rem'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <form onSubmit={onSubmit} style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            flex: 1,
            padding: '25px',
            overflow: 'auto'
          }}>
            {renderTabContent()}
          </div>

          {/* Footer */}
          <div style={{
            padding: '15px 25px',
            borderTop: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`,
            display: 'flex',
            justifyContent: 'space-between',
            background: darkMode ? '#141414' : '#f8f9fa'
          }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="btn btn-primary"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ClassSettingsPanel;

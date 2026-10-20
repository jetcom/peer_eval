import React from 'react';

/**
 * Settings for an audience (in-class presentation) round: who presents,
 * how long after each presentation its evaluations are due, how many
 * presenters each student must evaluate, and whether students choose them
 * or are assigned them at random.
 *
 * Props: darkMode, et (the eval type), onUpdate(patch) -> saves via the API.
 * Number fields save on blur or Enter.
 */
function AudienceRoundControls({ darkMode, et, onUpdate }) {
  const scheduled = (et.presentation_slots || []).length;
  const smallInput = {
    width: '60px',
    fontSize: '0.85rem',
    padding: '3px 6px',
    borderRadius: '3px',
    border: `1px solid ${darkMode ? '#444' : '#ccc'}`,
    background: darkMode ? '#2a2a2a' : '#fff',
    color: darkMode ? '#ccc' : '#333'
  };
  const labelStyle = { display: 'flex', alignItems: 'center', gap: '6px', margin: 0, fontSize: '0.85rem' };

  const saveNumberOnBlur = (field, current, { min, max }) => (e) => {
    const raw = e.target.value.trim();
    const val = raw === '' ? null : parseInt(raw);
    if (val !== null && (Number.isNaN(val) || val < min || (max != null && val > max))) {
      e.target.value = current ?? '';
      return;
    }
    if (val === (current ?? null)) return;
    onUpdate({ [field]: val });
  };
  // These may sit inside a form, so Enter must not submit it
  const blurOnEnter = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center' }}>
      <label style={labelStyle}>
        Presenters:
        <select
          value={et.target_type}
          onChange={(e) => {
            const next = e.target.value;
            if (next === et.target_type) return;
            if (scheduled > 0 && !window.confirm('Switching presenters clears the presentation schedule, excused absences and random assignments for this round. Continue?')) return;
            onUpdate({ target_type: next });
          }}
          style={{ ...smallInput, width: 'auto', cursor: 'pointer' }}
        >
          <option value="group">Groups</option>
          <option value="individual">Individual students</option>
        </select>
      </label>
      <label style={labelStyle}>
        Evaluations due
        <input
          type="number"
          min="0"
          key={`win-${et.id}-${et.eval_window_hours ?? ''}`}
          defaultValue={et.eval_window_hours ?? ''}
          placeholder="—"
          onBlur={saveNumberOnBlur('eval_window_hours', et.eval_window_hours, { min: 0 })}
          onKeyDown={blurOnEnter}
          style={smallInput}
          title="Leave blank to use the assignment's due date for every presenter"
        />
        hours after each presentation
      </label>
      <label style={labelStyle}>
        Students evaluate:
        <select
          value={et.assignment_mode || 'any'}
          onChange={(e) => onUpdate({ assignment_mode: e.target.value })}
          style={{ ...smallInput, width: 'auto', cursor: 'pointer' }}
          title="Whether students pick which presenters to evaluate, or are assigned a random, balanced set"
        >
          <option value="any">presenters they choose</option>
          <option value="assigned">randomly assigned presenters</option>
        </select>
      </label>
      <label style={labelStyle}>
        {(et.assignment_mode || 'any') === 'assigned' ? 'Each assigned' : 'Must evaluate at least'}
        <input
          type="number"
          min="1"
          max="100"
          key={`min-${et.id}-${et.min_completion ?? ''}`}
          defaultValue={et.min_completion ?? ''}
          placeholder="100"
          onBlur={saveNumberOnBlur('min_completion', et.min_completion, { min: 1, max: 100 })}
          onKeyDown={blurOnEnter}
          style={smallInput}
          title="Percentage of the other presenters each student must evaluate (self and own group never count)"
        />
        % of presenters
      </label>
    </div>
  );
}

export default AudienceRoundControls;

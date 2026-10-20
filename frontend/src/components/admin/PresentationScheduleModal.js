import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { addHoursWallClock as addHours, formatWallClock as formatLocal } from '../../utils/wallClock';

/**
 * Teacher view for an audience round: when each group (or each student, for
 * individual presentations) presents. Evaluations of a presenter are due a
 * set number of hours after their slot, or on the round's due date when no
 * window is set.
 */
function PresentationScheduleModal({ darkMode, evalType, assignmentName, onClose, onSaved }) {
  const [schedule, setSchedule] = useState(null);
  const [dates, setDates] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [fill, setFill] = useState({ start: '', perSession: 3, daysBetween: 7 });

  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        const res = await axios.get(`/api/assignments/eval-type/${evalType.id}/schedule`);
        setSchedule(res.data);
        const initial = {};
        res.data.presenters.forEach(p => { initial[p.id] = p.presentation_date || ''; });
        setDates(initial);
      } catch (err) {
        setMessage({ type: 'error', text: 'Failed to load the presentation schedule' });
      } finally {
        setLoading(false);
      }
    };
    fetchSchedule();
  }, [evalType.id]);

  const presenters = schedule?.presenters || [];
  const windowHours = schedule?.eval_window_hours;
  const scheduledCount = presenters.filter(p => dates[p.id]).length;

  const dueFor = (dateStr) => {
    if (dateStr && windowHours != null) return addHours(dateStr, windowHours);
    return schedule?.round_due_date || null;
  };

  // Assign the unscheduled presenters in list order: N per session, sessions K days apart
  const fillSequentially = () => {
    if (!fill.start) return;
    const perSession = Math.max(1, parseInt(fill.perSession) || 1);
    const daysBetween = Math.max(1, parseInt(fill.daysBetween) || 1);
    const next = { ...dates };
    let index = 0;
    presenters.forEach(p => {
      if (next[p.id]) return;
      const session = Math.floor(index / perSession);
      next[p.id] = addHours(fill.start, session * daysBetween * 24);
      index++;
    });
    setDates(next);
  };

  const clearAll = () => {
    const cleared = {};
    presenters.forEach(p => { cleared[p.id] = ''; });
    setDates(cleared);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const slots = presenters.map(p => ({
        [p.kind === 'group' ? 'group_id' : 'user_id']: p.id,
        presentation_date: dates[p.id] || null
      }));
      const res = await axios.put(`/api/assignments/eval-type/${evalType.id}/schedule`, { slots });
      setSchedule(res.data);
      setMessage({ type: 'success', text: 'Schedule saved' });
      if (onSaved) onSaved(res.data);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save the schedule' });
    } finally {
      setSaving(false);
    }
  };

  const overlayStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1100 // above the class settings panel
  };
  const panelStyle = {
    background: darkMode ? '#1a1a1a' : '#fff',
    padding: '25px',
    borderRadius: '8px',
    width: '95%',
    maxWidth: '900px',
    maxHeight: '90vh',
    overflow: 'auto'
  };
  const mutedColor = darkMode ? '#a0a0a0' : '#666';
  const inputStyle = {
    padding: '6px 8px',
    borderRadius: '4px',
    border: `1px solid ${darkMode ? '#444' : '#ccc'}`,
    background: darkMode ? '#2a2a2a' : '#fff',
    color: darkMode ? '#e0e0e0' : '#333'
  };

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '10px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>Presentation Schedule</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Saving...' : 'Save Schedule'}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
        <p style={{ margin: '0 0 15px', color: mutedColor, fontSize: '0.9rem' }}>
          {assignmentName} &middot; {evalType.name}
          {schedule && (
            <>
              {' '}&middot; {windowHours != null
                ? `evaluations due ${windowHours} hours after each presentation`
                : schedule.round_due_date
                  ? `all evaluations due ${formatLocal(schedule.round_due_date)}`
                  : 'no due date set'}
            </>
          )}
        </p>

        {message.text && (
          <div className={`message ${message.type}`} style={{ marginBottom: '15px' }}>{message.text}</div>
        )}

        {loading ? (
          <div style={{ padding: '20px', color: mutedColor }}>Loading schedule...</div>
        ) : presenters.length === 0 ? (
          <div style={{ padding: '20px', color: mutedColor }}>
            {schedule?.target_type === 'group'
              ? 'This class has no groups yet. Add groups first, then schedule their presentations.'
              : 'This class has no students enrolled yet.'}
          </div>
        ) : (
          <>
            {/* Quick fill */}
            <div style={{
              display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap',
              padding: '12px 15px', marginBottom: '15px', borderRadius: '6px',
              background: darkMode ? 'rgba(255,255,255,0.05)' : '#f8f9fa',
              border: `1px solid ${darkMode ? '#335' : '#e0e0e0'}`
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: mutedColor, marginBottom: '4px' }}>First session</label>
                <input type="datetime-local" value={fill.start} onChange={(e) => setFill({ ...fill, start: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: mutedColor, marginBottom: '4px' }}>Presenters per session</label>
                <input type="number" min="1" value={fill.perSession} onChange={(e) => setFill({ ...fill, perSession: e.target.value })} style={{ ...inputStyle, width: '70px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: mutedColor, marginBottom: '4px' }}>Days between sessions</label>
                <input type="number" min="1" value={fill.daysBetween} onChange={(e) => setFill({ ...fill, daysBetween: e.target.value })} style={{ ...inputStyle, width: '70px' }} />
              </div>
              <button type="button" className="btn btn-secondary" onClick={fillSequentially} disabled={!fill.start} title="Assign dates to the presenters that don't have one yet, in list order">
                Fill unscheduled
              </button>
              <button type="button" className="btn btn-secondary" onClick={clearAll}>Clear all</button>
            </div>

            <div style={{ fontSize: '0.85rem', color: mutedColor, marginBottom: '8px' }}>
              {scheduledCount} of {presenters.length} scheduled. Students cannot evaluate a presenter until their presentation time.
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: darkMode ? '#1a1a1a' : '#f0f0f0', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>{schedule.target_type === 'group' ? 'Group' : 'Student'}</th>
                    <th style={{ padding: '8px 10px' }}>Presents</th>
                    <th style={{ padding: '8px 10px' }}>Evaluations due</th>
                  </tr>
                </thead>
                <tbody>
                  {presenters.map(p => {
                    const due = dueFor(dates[p.id]);
                    return (
                      <tr key={p.id} style={{ borderBottom: `1px solid ${darkMode ? '#335' : '#eee'}` }}>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontWeight: 500 }}>{p.kind === 'group' ? p.name : `${p.last_name}, ${p.first_name}`}</div>
                          {p.kind === 'group' && p.members?.length > 0 && (
                            <div style={{ fontSize: '0.8rem', color: mutedColor }}>
                              {p.members.map(m => `${m.first_name} ${m.last_name}`).join(', ')}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <input
                            type="datetime-local"
                            value={dates[p.id] || ''}
                            onChange={(e) => setDates({ ...dates, [p.id]: e.target.value })}
                            style={inputStyle}
                          />
                          {dates[p.id] && (
                            <button
                              type="button"
                              onClick={() => setDates({ ...dates, [p.id]: '' })}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: mutedColor, fontSize: '1.1rem', marginLeft: '4px' }}
                              title="Clear"
                            >
                              ×
                            </button>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', color: mutedColor, whiteSpace: 'nowrap' }}>
                          {due ? formatLocal(due) : <span style={{ fontStyle: 'italic' }}>no deadline</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default PresentationScheduleModal;

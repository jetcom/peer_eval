import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { addHoursWallClock as addHours, formatWallClock as formatLocal } from '../../utils/wallClock';

const presenterKey = (p) => `${p.kind}:${p.id}`;

/**
 * Teacher view for an audience round: when each group (or each student, for
 * individual presentations) presents, and which students were absent for a
 * session. Evaluations of a presenter are due a set number of hours after
 * their slot, or on the round's due date when no window is set. Excused
 * students are not expected to evaluate that session's presenters.
 */
function PresentationScheduleModal({ darkMode, evalType, assignmentName, onClose, onSaved }) {
  const [tab, setTab] = useState('schedule');
  const [schedule, setSchedule] = useState(null);
  const [dates, setDates] = useState({});
  const [excused, setExcused] = useState({}); // presenterKey -> Set of student ids
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [fill, setFill] = useState({ start: '', perSession: 3, daysBetween: 7 });
  const [pendingAdd, setPendingAdd] = useState({}); // sessionKey -> student id chosen in the dropdown
  const [assigning, setAssigning] = useState(false);

  const applySchedule = (data) => {
    setSchedule(data);
    const initialDates = {};
    const initialExcused = {};
    data.presenters.forEach(p => {
      initialDates[p.id] = p.presentation_date || '';
      initialExcused[presenterKey(p)] = new Set(p.excused_student_ids || []);
    });
    setDates(initialDates);
    setExcused(initialExcused);
  };

  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        const res = await axios.get(`/api/assignments/eval-type/${evalType.id}/schedule`);
        applySchedule(res.data);
      } catch (err) {
        setMessage({ type: 'error', text: 'Failed to load the presentation schedule' });
      } finally {
        setLoading(false);
      }
    };
    fetchSchedule();
  }, [evalType.id]);

  const presenters = schedule?.presenters || [];
  const students = schedule?.students || [];
  const windowHours = schedule?.eval_window_hours;
  const scheduledCount = presenters.filter(p => dates[p.id]).length;
  const isGroupRound = schedule?.target_type === 'group';
  const isAssignedMode = schedule?.assignment_mode === 'assigned';
  const presenterByKey = new Map(presenters.map(p => [presenterKey(p), p]));
  const presenterLabel = (p) => (p.kind === 'group' ? p.name : `${p.last_name}, ${p.first_name}`);

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

  // Sessions: presenters that share a date-time, using the saved (unsaved edits
  // included) schedule. Unscheduled presenters each form their own row.
  const sessions = (() => {
    const byDate = new Map();
    presenters.forEach(p => {
      const key = dates[p.id] ? `d:${dates[p.id]}` : `p:${presenterKey(p)}`;
      if (!byDate.has(key)) byDate.set(key, { key, date: dates[p.id] || null, presenters: [] });
      byDate.get(key).presenters.push(p);
    });
    return [...byDate.values()].sort((a, b) => {
      if (a.date && b.date) return a.date.localeCompare(b.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });
  })();

  // Students excused from every presenter in the session
  const excusedForSession = (session) => {
    const sets = session.presenters.map(p => excused[presenterKey(p)] || new Set());
    return students.filter(s => sets.every(set => set.has(s.id)));
  };

  const setSessionExcused = (session, studentId, isExcused) => {
    setExcused(prev => {
      const next = { ...prev };
      session.presenters.forEach(p => {
        const k = presenterKey(p);
        const set = new Set(next[k] || []);
        if (isExcused) set.add(studentId); else set.delete(studentId);
        next[k] = set;
      });
      return next;
    });
  };

  // Random assignment of presenters to students ('assigned' mode)
  const runAssignment = async (scope) => {
    if (scope === 'all' && presenters.some(p => p.assigned_student_ids?.length > 0) &&
        !window.confirm('Reassign presenters for every student? Presenters a student has already evaluated are kept.')) {
      return;
    }
    setAssigning(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await axios.post(`/api/assignments/eval-type/${evalType.id}/assignments`, { scope });
      applySchedule(res.data);
      setMessage({ type: 'success', text: `Assigned presenters to ${res.data.result.assignedStudents} student(s)` });
      if (onSaved) onSaved(res.data);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to assign presenters' });
    } finally {
      setAssigning(false);
    }
  };

  const clearAssignments = async () => {
    if (!window.confirm('Remove all random assignments for this round?')) return;
    setAssigning(true);
    try {
      const res = await axios.delete(`/api/assignments/eval-type/${evalType.id}/assignments`);
      applySchedule(res.data);
      if (onSaved) onSaved(res.data);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to clear assignments' });
    } finally {
      setAssigning(false);
    }
  };

  const setAssignmentMode = async (mode) => {
    setAssigning(true);
    setMessage({ type: '', text: '' });
    try {
      await axios.put(`/api/assignments/eval-type/${evalType.id}`, { assignment_mode: mode });
      const res = await axios.get(`/api/assignments/eval-type/${evalType.id}/schedule`);
      applySchedule(res.data);
      if (onSaved) onSaved(res.data);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to change the setting' });
    } finally {
      setAssigning(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const slots = presenters.map(p => ({
        [p.kind === 'group' ? 'group_id' : 'user_id']: p.id,
        presentation_date: dates[p.id] || null
      }));
      await axios.put(`/api/assignments/eval-type/${evalType.id}/schedule`, { slots });
      const excusals = presenters.map(p => ({
        [p.kind === 'group' ? 'group_id' : 'user_id']: p.id,
        student_ids: [...(excused[presenterKey(p)] || [])]
      }));
      const res = await axios.put(`/api/assignments/eval-type/${evalType.id}/excusals`, { excusals });
      applySchedule(res.data);
      setMessage({ type: 'success', text: 'Saved' });
      if (onSaved) onSaved(res.data);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save' });
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
  const tabStyle = (active) => ({
    padding: '8px 16px',
    border: 'none',
    borderBottom: active ? '3px solid #3498db' : '3px solid transparent',
    background: 'transparent',
    color: active ? '#3498db' : mutedColor,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    fontSize: '0.95rem'
  });
  const theadStyle = { background: darkMode ? '#111' : '#f0f0f0', textAlign: 'left' };
  const rowBorder = `1px solid ${darkMode ? '#333' : '#eee'}`;

  const renderScheduleTab = () => (
    <>
      <div style={{
        display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap',
        padding: '12px 15px', marginBottom: '15px', borderRadius: '6px',
        background: darkMode ? 'rgba(255,255,255,0.05)' : '#f8f9fa',
        border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
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
            <tr style={theadStyle}>
              <th style={{ padding: '8px 10px' }}>{isGroupRound ? 'Group' : 'Student'}</th>
              <th style={{ padding: '8px 10px' }}>Presents</th>
              <th style={{ padding: '8px 10px' }}>Evaluations due</th>
            </tr>
          </thead>
          <tbody>
            {presenters.map(p => {
              const due = dueFor(dates[p.id]);
              return (
                <tr key={p.id} style={{ borderBottom: rowBorder }}>
                  <td style={{ padding: '8px 10px' }}>
                    <div style={{ fontWeight: 500 }}>{presenterLabel(p)}</div>
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
  );

  const renderAbsencesTab = () => (
    <>
      <div style={{ fontSize: '0.85rem', color: mutedColor, marginBottom: '12px' }}>
        Students who missed a session are excused from evaluating that session's presenters.
        An excused presenter does not count toward what the student must complete.
        {' '}Presenters sharing a date and time are treated as one session.
      </div>

      {students.length === 0 ? (
        <div style={{ padding: '20px', color: mutedColor }}>No students are enrolled in this class yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '0.9rem' }}>
            <thead>
              <tr style={theadStyle}>
                <th style={{ padding: '8px 10px' }}>Session</th>
                <th style={{ padding: '8px 10px' }}>Presenting</th>
                <th style={{ padding: '8px 10px' }}>Excused students</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(session => {
                const excusedList = excusedForSession(session);
                const excusedIds = new Set(excusedList.map(s => s.id));
                const candidates = students.filter(s => !excusedIds.has(s.id));
                const chosen = pendingAdd[session.key] || '';
                return (
                  <tr key={session.key} style={{ borderBottom: rowBorder, verticalAlign: 'top' }}>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      {session.date ? formatLocal(session.date) : <span style={{ fontStyle: 'italic', color: mutedColor }}>Unscheduled</span>}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {session.presenters.map(presenterLabel).join(', ')}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                        {excusedList.map(s => (
                          <span key={s.id} style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem',
                            background: darkMode ? '#333' : '#e8e8e8'
                          }}>
                            {s.last_name}, {s.first_name}
                            <button
                              type="button"
                              onClick={() => setSessionExcused(session, s.id, false)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: mutedColor, padding: 0, lineHeight: 1 }}
                              title="Remove excusal"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <select
                          value={chosen}
                          onChange={(e) => {
                            const id = parseInt(e.target.value);
                            if (id) setSessionExcused(session, id, true);
                            setPendingAdd({ ...pendingAdd, [session.key]: '' });
                          }}
                          style={{ ...inputStyle, fontSize: '0.8rem', padding: '3px 6px' }}
                        >
                          <option value="">Excuse a student...</option>
                          {candidates.map(s => (
                            <option key={s.id} value={s.id}>{s.last_name}, {s.first_name}</option>
                          ))}
                        </select>
                      </div>
                      {session.presenters.length > 1 && (() => {
                        // Excusals that cover only some presenters in this session (set before they shared a time)
                        const partial = students.filter(s => !excusedIds.has(s.id) &&
                          session.presenters.some(p => excused[presenterKey(p)]?.has(s.id)));
                        return partial.length > 0 ? (
                          <div style={{ fontSize: '0.75rem', color: mutedColor, marginTop: '4px' }}>
                            Partly excused: {partial.map(s => `${s.last_name}, ${s.first_name}`).join('; ')}
                          </div>
                        ) : null;
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  const renderAssignmentsTab = () => {
    const unassigned = students.filter(s => s.assigned.length === 0 && s.eligible_count > 0);
    const totalAssigned = students.reduce((n, s) => n + s.assigned.length, 0);
    const labelFor = (ref) => {
      const p = presenterByKey.get(`${ref.kind}:${ref.id}`);
      return p ? presenterLabel(p) : '?';
    };

    if (!isAssignedMode) {
      return (
        <div style={{ padding: '10px 0' }}>
          <p style={{ color: mutedColor, fontSize: '0.9rem', marginTop: 0 }}>
            Students currently choose which presenters to evaluate
            {schedule?.min_completion ? ` (at least ${schedule.min_completion}% of them)` : ''}.
            With random assignment, each student instead gets a balanced set of presenters chosen for them,
            so every presenter receives a similar number of evaluations and nobody can skip the final sessions.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setAssignmentMode('assigned')} disabled={assigning}>
            Switch to random assignment
          </button>
        </div>
      );
    }

    return (
      <>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
          <button type="button" className="btn btn-primary" onClick={() => runAssignment('all')} disabled={assigning || students.length === 0}>
            {assigning ? 'Working...' : totalAssigned > 0 ? 'Reassign all' : 'Assign randomly'}
          </button>
          {totalAssigned > 0 && unassigned.length > 0 && (
            <button type="button" className="btn btn-secondary" onClick={() => runAssignment('unassigned')} disabled={assigning}>
              Assign {unassigned.length} unassigned student{unassigned.length === 1 ? '' : 's'}
            </button>
          )}
          {totalAssigned > 0 && (
            <button type="button" className="btn btn-secondary" onClick={clearAssignments} disabled={assigning}>Clear</button>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => setAssignmentMode('any')} disabled={assigning} style={{ marginLeft: 'auto' }}>
            Let students choose instead
          </button>
        </div>
        <div style={{ fontSize: '0.85rem', color: mutedColor, marginBottom: '12px' }}>
          Each student is assigned {schedule?.min_completion ? `${schedule.min_completion}% of` : 'all'} the presenters they are eligible to evaluate
          (never themselves, their group, or sessions they were excused from). Presenters are balanced so each receives a similar
          number of evaluators. Change the percentage in the round's settings.
          {unassigned.length > 0 && totalAssigned > 0 && (
            <span style={{ color: '#f39c12' }}> {unassigned.length} student{unassigned.length === 1 ? ' has' : 's have'} no assignments yet.</span>
          )}
        </div>

        {students.length === 0 ? (
          <div style={{ padding: '20px', color: mutedColor }}>No students are enrolled in this class yet.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: '20px' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={theadStyle}>
                    <th style={{ padding: '8px 10px' }}>Student</th>
                    <th style={{ padding: '8px 10px' }}>Assigned to evaluate</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.id} style={{ borderBottom: rowBorder, verticalAlign: 'top' }}>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{s.last_name}, {s.first_name}</td>
                      <td style={{ padding: '8px 10px' }}>
                        {s.assigned.length === 0
                          ? <span style={{ fontStyle: 'italic', color: s.eligible_count > 0 ? '#f39c12' : mutedColor }}>
                              {s.eligible_count > 0 ? 'none yet' : 'nothing to evaluate'}
                            </span>
                          : s.assigned.map(labelFor).sort().join(', ')}
                        <span style={{ color: mutedColor, fontSize: '0.8rem' }}> ({s.assigned.length}/{s.required_count})</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={theadStyle}>
                    <th style={{ padding: '8px 10px' }}>{isGroupRound ? 'Group' : 'Presenter'}</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Evaluators</th>
                  </tr>
                </thead>
                <tbody>
                  {presenters.map(p => (
                    <tr key={p.id} style={{ borderBottom: rowBorder }}>
                      <td style={{ padding: '8px 10px' }}>{presenterLabel(p)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{p.assigned_student_ids?.length || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '10px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>Presentation Schedule</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
        <p style={{ margin: '0 0 12px', color: mutedColor, fontSize: '0.9rem' }}>
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

        <div style={{ display: 'flex', borderBottom: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`, marginBottom: '15px' }}>
          <button type="button" style={tabStyle(tab === 'schedule')} onClick={() => setTab('schedule')}>Schedule</button>
          <button type="button" style={tabStyle(tab === 'absences')} onClick={() => setTab('absences')}>Excused absences</button>
          <button type="button" style={tabStyle(tab === 'assignments')} onClick={() => setTab('assignments')}>
            Random assignment{isAssignedMode ? ' (on)' : ''}
          </button>
        </div>

        {message.text && (
          <div className={`message ${message.type}`} style={{ marginBottom: '15px' }}>{message.text}</div>
        )}

        {loading ? (
          <div style={{ padding: '20px', color: mutedColor }}>Loading schedule...</div>
        ) : presenters.length === 0 ? (
          <div style={{ padding: '20px', color: mutedColor }}>
            {isGroupRound
              ? 'This class has no groups yet. Add groups first, then schedule their presentations.'
              : 'This class has no students enrolled yet.'}
          </div>
        ) : tab === 'schedule' ? renderScheduleTab() : tab === 'absences' ? renderAbsencesTab() : renderAssignmentsTab()}
      </div>
    </div>
  );
}

export default PresentationScheduleModal;

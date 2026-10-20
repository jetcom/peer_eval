import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { addHoursWallClock as addHours, formatWallClock as formatLocal } from '../../utils/wallClock';

const presenterKey = (p) => `${p.kind}:${p.id}`;
const WEEKDAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' }
];

// Weekday (0 = Sunday) of a "YYYY-MM-DD" string, timezone-free
const weekdayOf = (dateOnly) => {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const addDays = (dateOnly, n) => addHours(`${dateOnly}T00:00`, n * 24).split('T')[0];

/**
 * Teacher view for an audience round, in three tabs:
 *  - Schedule: define the class sessions (e.g. every Tue/Thu at 2:00 for six
 *    weeks), then slot each group or student into a session. Each presenter
 *    ends up with a date-time; evaluations are due a set number of hours
 *    after it, or on the round's due date when no window is set.
 *  - Excused absences: students who missed a session owe nothing for it.
 *  - Random assignment: hand each student a balanced set of presenters.
 */
function PresentationScheduleModal({ darkMode, evalType, assignmentName, initialTab = 'schedule', onClose, onSaved }) {
  const [tab, setTab] = useState(initialTab);
  const [schedule, setSchedule] = useState(null);
  const [dates, setDates] = useState({});           // presenter id -> "YYYY-MM-DDTHH:mm"
  const [sessionDates, setSessionDates] = useState([]); // every session, including ones with nobody in them yet
  const [excused, setExcused] = useState({});       // presenterKey -> Set of student ids
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [pattern, setPattern] = useState({ weekdays: new Set([2, 4]), start: '', time: '14:00', count: 6 });
  const [singleSession, setSingleSession] = useState('');
  const [pendingAdd, setPendingAdd] = useState({}); // sessionKey -> dropdown selection

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
    setSessionDates(prev => [...new Set([...prev, ...Object.values(initialDates).filter(Boolean)])].sort());
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
  const isGroupRound = schedule?.target_type === 'group';
  const isAssignedMode = schedule?.assignment_mode === 'assigned';
  const presenterByKey = new Map(presenters.map(p => [presenterKey(p), p]));
  const presenterLabel = (p) => (p.kind === 'group' ? p.name : `${p.last_name}, ${p.first_name}`);
  const scheduledCount = presenters.filter(p => dates[p.id]).length;
  const unscheduled = presenters.filter(p => !dates[p.id]);

  const dueFor = (dateStr) => {
    if (dateStr && windowHours != null) return addHours(dateStr, windowHours);
    return schedule?.round_due_date || null;
  };

  // ---- Sessions ----------------------------------------------------------

  const addSessions = (list) => {
    setSessionDates(prev => [...new Set([...prev, ...list])].sort());
  };

  const addPatternSessions = () => {
    if (!pattern.start || pattern.weekdays.size === 0) return;
    const count = Math.min(Math.max(1, parseInt(pattern.count) || 1), 60);
    const found = [];
    let day = pattern.start;
    for (let i = 0; i < 400 && found.length < count; i++) {
      if (pattern.weekdays.has(weekdayOf(day))) found.push(`${day}T${pattern.time || '00:00'}`);
      day = addDays(day, 1);
    }
    addSessions(found);
  };

  const removeSession = (date) => {
    setSessionDates(prev => prev.filter(d => d !== date));
    setDates(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(id => { if (next[id] === date) next[id] = ''; });
      return next;
    });
  };

  const setPresenterSession = (presenterId, date) => {
    setDates(prev => ({ ...prev, [presenterId]: date || '' }));
  };

  // Put every unscheduled presenter into the emptiest session, in order
  const spreadAcrossSessions = () => {
    if (sessionDates.length === 0) return;
    const counts = new Map(sessionDates.map(d => [d, 0]));
    presenters.forEach(p => { if (dates[p.id] && counts.has(dates[p.id])) counts.set(dates[p.id], counts.get(dates[p.id]) + 1); });
    const next = { ...dates };
    unscheduled.forEach(p => {
      const target = [...counts.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0][0];
      next[p.id] = target;
      counts.set(target, counts.get(target) + 1);
    });
    setDates(next);
  };

  const clearAllDates = () => {
    const cleared = {};
    presenters.forEach(p => { cleared[p.id] = ''; });
    setDates(cleared);
  };

  // Sessions as rows: scheduled dates (with their presenters) plus empty ones
  const sessionRows = [...new Set([...sessionDates, ...Object.values(dates).filter(Boolean)])]
    .sort()
    .map(date => ({ key: `d:${date}`, date, presenters: presenters.filter(p => dates[p.id] === date) }));

  // ---- Absences (per session; unscheduled presenters are their own row) ----

  const absenceRows = (() => {
    const rows = sessionRows.filter(r => r.presenters.length > 0);
    unscheduled.forEach(p => rows.push({ key: `p:${presenterKey(p)}`, date: null, presenters: [p] }));
    return rows;
  })();

  const excusedForSession = (row) => {
    const sets = row.presenters.map(p => excused[presenterKey(p)] || new Set());
    return students.filter(s => sets.every(set => set.has(s.id)));
  };

  const setSessionExcused = (row, studentId, isExcused) => {
    setExcused(prev => {
      const next = { ...prev };
      row.presenters.forEach(p => {
        const k = presenterKey(p);
        const set = new Set(next[k] || []);
        if (isExcused) set.add(studentId); else set.delete(studentId);
        next[k] = set;
      });
      return next;
    });
  };

  // ---- Random assignment --------------------------------------------------

  const runAssignment = async (scope) => {
    if (scope === 'all' && presenters.some(p => p.assigned_student_ids?.length > 0) &&
        !window.confirm('Redraw presenters for every student? Presenters a student has already evaluated are kept.')) {
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

  // ---- Save (schedule + absences) -----------------------------------------

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

  // ---- Styles -------------------------------------------------------------

  const overlayStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1100
  };
  const panelStyle = {
    background: darkMode ? '#1a1a1a' : '#fff',
    padding: '25px',
    borderRadius: '8px',
    width: '95%',
    maxWidth: '960px',
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
  const smallSelect = { ...inputStyle, fontSize: '0.8rem', padding: '3px 6px' };
  const chipStyle = {
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem',
    background: darkMode ? '#333' : '#e8e8e8'
  };
  const chipX = { background: 'none', border: 'none', cursor: 'pointer', color: mutedColor, padding: 0, lineHeight: 1 };
  const boxStyle = {
    padding: '12px 15px', marginBottom: '15px', borderRadius: '6px',
    background: darkMode ? 'rgba(255,255,255,0.05)' : '#f8f9fa',
    border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
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
  const linkButton = { background: 'none', border: 'none', color: '#3498db', cursor: 'pointer', fontSize: '0.85rem', padding: 0 };

  // ---- Tabs ---------------------------------------------------------------

  const renderScheduleTab = () => (
    <>
      {/* Define sessions */}
      <div style={boxStyle}>
        <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '0.9rem' }}>Add class sessions</div>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: mutedColor, marginBottom: '4px' }}>On</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              {WEEKDAYS.map(w => {
                const on = pattern.weekdays.has(w.value);
                return (
                  <button
                    key={w.value}
                    type="button"
                    onClick={() => {
                      const next = new Set(pattern.weekdays);
                      if (on) next.delete(w.value); else next.add(w.value);
                      setPattern({ ...pattern, weekdays: next });
                    }}
                    style={{
                      padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px', cursor: 'pointer',
                      border: `1px solid ${on ? '#3498db' : (darkMode ? '#444' : '#ccc')}`,
                      background: on ? (darkMode ? 'rgba(52,152,219,0.25)' : 'rgba(52,152,219,0.15)') : 'transparent',
                      color: on ? '#3498db' : mutedColor
                    }}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: mutedColor, marginBottom: '4px' }}>Starting</label>
            <input type="date" value={pattern.start} onChange={(e) => setPattern({ ...pattern, start: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: mutedColor, marginBottom: '4px' }}>At</label>
            <input type="time" value={pattern.time} onChange={(e) => setPattern({ ...pattern, time: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: mutedColor, marginBottom: '4px' }}>Sessions</label>
            <input type="number" min="1" max="60" value={pattern.count} onChange={(e) => setPattern({ ...pattern, count: e.target.value })} style={{ ...inputStyle, width: '70px' }} />
          </div>
          <button type="button" className="btn btn-secondary" onClick={addPatternSessions} disabled={!pattern.start || pattern.weekdays.size === 0}>
            Add sessions
          </button>
          <span style={{ color: mutedColor, fontSize: '0.85rem' }}>or one at a time:</span>
          <input type="datetime-local" value={singleSession} onChange={(e) => setSingleSession(e.target.value)} style={inputStyle} />
          <button type="button" className="btn btn-secondary" onClick={() => { if (singleSession) { addSessions([singleSession]); setSingleSession(''); } }} disabled={!singleSession}>
            Add
          </button>
        </div>
      </div>

      {/* Sessions and who presents in each */}
      {sessionRows.length === 0 ? (
        <div style={{ padding: '10px 0 20px', color: mutedColor, fontSize: '0.9rem' }}>
          No sessions yet. Add the days your class presents, then slot each {isGroupRound ? 'group' : 'student'} into a session.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: '15px' }}>
          <table style={{ width: '100%', fontSize: '0.9rem' }}>
            <thead>
              <tr style={theadStyle}>
                <th style={{ padding: '8px 10px' }}>Session</th>
                <th style={{ padding: '8px 10px' }}>Presenting</th>
                <th style={{ padding: '8px 10px' }}>Evaluations due</th>
                <th style={{ padding: '8px 10px' }}></th>
              </tr>
            </thead>
            <tbody>
              {sessionRows.map(row => {
                const chosen = pendingAdd[row.key] || '';
                const due = dueFor(row.date);
                return (
                  <tr key={row.key} style={{ borderBottom: rowBorder, verticalAlign: 'top' }}>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{formatLocal(row.date)}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                        {row.presenters.map(p => (
                          <span key={p.id} style={chipStyle} title={p.kind === 'group' && p.members?.length ? p.members.map(m => `${m.first_name} ${m.last_name}`).join(', ') : undefined}>
                            {presenterLabel(p)}
                            <button type="button" onClick={() => setPresenterSession(p.id, '')} style={chipX} title="Remove from this session">×</button>
                          </span>
                        ))}
                        {unscheduled.length > 0 && (
                          <select
                            value={chosen}
                            onChange={(e) => {
                              const id = parseInt(e.target.value);
                              if (id) setPresenterSession(id, row.date);
                              setPendingAdd({ ...pendingAdd, [row.key]: '' });
                            }}
                            style={smallSelect}
                          >
                            <option value="">{row.presenters.length === 0 ? `Add ${isGroupRound ? 'a group' : 'a student'}...` : 'Add another...'}</option>
                            {unscheduled.map(p => (
                              <option key={p.id} value={p.id}>{presenterLabel(p)}</option>
                            ))}
                          </select>
                        )}
                        {row.presenters.length === 0 && unscheduled.length === 0 && (
                          <span style={{ fontStyle: 'italic', color: mutedColor, fontSize: '0.85rem' }}>nobody yet</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px', color: mutedColor, whiteSpace: 'nowrap' }}>
                      {due ? formatLocal(due) : <span style={{ fontStyle: 'italic' }}>no deadline</span>}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <button type="button" onClick={() => removeSession(row.date)} style={{ ...chipX, fontSize: '1.1rem' }} title="Remove this session">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Still to slot */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.85rem', color: mutedColor, marginBottom: '8px' }}>
        <span>
          {scheduledCount} of {presenters.length} {isGroupRound ? 'groups' : 'students'} scheduled.
          {' '}Students cannot evaluate a presenter until their session starts.
        </span>
        {unscheduled.length > 0 && sessionRows.length > 0 && (
          <button type="button" onClick={spreadAcrossSessions} style={linkButton}>
            Spread the {unscheduled.length} unscheduled evenly across sessions
          </button>
        )}
        {scheduledCount > 0 && (
          <button type="button" onClick={clearAllDates} style={{ ...linkButton, color: mutedColor, textDecoration: 'underline' }}>
            Clear all
          </button>
        )}
      </div>
      {unscheduled.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {unscheduled.map(p => (
            <span key={p.id} style={{ ...chipStyle, background: darkMode ? '#3d3a1a' : '#fff3cd' }}>
              {presenterLabel(p)}
              {sessionRows.length > 0 && (
                <select
                  value=""
                  onChange={(e) => e.target.value && setPresenterSession(p.id, e.target.value)}
                  style={{ ...smallSelect, padding: '1px 4px', marginLeft: '4px' }}
                  title="Put in a session"
                >
                  <option value="">session...</option>
                  {sessionRows.map(r => (
                    <option key={r.key} value={r.date}>{formatLocal(r.date, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</option>
                  ))}
                </select>
              )}
            </span>
          ))}
        </div>
      )}
    </>
  );

  const renderAbsencesTab = () => (
    <>
      <div style={{ fontSize: '0.85rem', color: mutedColor, marginBottom: '12px' }}>
        Students who missed a session are excused from evaluating that session's presenters.
        An excused presenter does not count toward what the student must complete.
      </div>

      {students.length === 0 ? (
        <div style={{ padding: '20px', color: mutedColor }}>No students are enrolled in this class yet.</div>
      ) : absenceRows.length === 0 ? (
        <div style={{ padding: '20px', color: mutedColor }}>Schedule the presentations first, then record absences here.</div>
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
              {absenceRows.map(row => {
                const excusedList = excusedForSession(row);
                const excusedIds = new Set(excusedList.map(s => s.id));
                const candidates = students.filter(s => !excusedIds.has(s.id));
                const chosen = pendingAdd[row.key] || '';
                const partial = row.presenters.length > 1
                  ? students.filter(s => !excusedIds.has(s.id) && row.presenters.some(p => excused[presenterKey(p)]?.has(s.id)))
                  : [];
                return (
                  <tr key={row.key} style={{ borderBottom: rowBorder, verticalAlign: 'top' }}>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      {row.date ? formatLocal(row.date) : <span style={{ fontStyle: 'italic', color: mutedColor }}>Unscheduled</span>}
                    </td>
                    <td style={{ padding: '8px 10px' }}>{row.presenters.map(presenterLabel).join(', ')}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                        {excusedList.map(s => (
                          <span key={s.id} style={chipStyle}>
                            {s.last_name}, {s.first_name}
                            <button type="button" onClick={() => setSessionExcused(row, s.id, false)} style={chipX} title="Remove excusal">×</button>
                          </span>
                        ))}
                        <select
                          value={chosen}
                          onChange={(e) => {
                            const id = parseInt(e.target.value);
                            if (id) setSessionExcused(row, id, true);
                            setPendingAdd({ ...pendingAdd, [row.key]: '' });
                          }}
                          style={smallSelect}
                        >
                          <option value="">Excuse a student...</option>
                          {candidates.map(s => (
                            <option key={s.id} value={s.id}>{s.last_name}, {s.first_name}</option>
                          ))}
                        </select>
                      </div>
                      {partial.length > 0 && (
                        <div style={{ fontSize: '0.75rem', color: mutedColor, marginTop: '4px' }}>
                          Partly excused: {partial.map(s => `${s.last_name}, ${s.first_name}`).join('; ')}
                        </div>
                      )}
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
    const short = students.filter(s => s.short && s.eligible_count > 0);
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
          {totalAssigned > 0 && short.length > 0 && (
            <button type="button" className="btn btn-secondary" onClick={() => runAssignment('fill')} disabled={assigning}
              title="Top up students who have fewer presenters than required, keeping what they already have">
              Fill in {short.length} student{short.length === 1 ? '' : 's'}
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
          (never themselves, their group, sessions they were excused from, or presenters whose evaluation window has already closed).
          Presenters are balanced so each receives a similar number of evaluators. Students who join or change groups after the
          draw are topped up automatically. Change the percentage in the round's settings.
          {short.length > 0 && totalAssigned > 0 && (
            <span style={{ color: '#f39c12' }}> {short.length} student{short.length === 1 ? ' is' : 's are'} short of presenters.</span>
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
                        <span style={{ color: s.short && s.eligible_count > 0 ? '#f39c12' : mutedColor, fontSize: '0.8rem' }}> ({s.assigned.length}/{s.required_count})</span>
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
          <h2 style={{ margin: 0 }}>Presentations</h2>
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
          <div style={{ padding: '20px', color: mutedColor }}>Loading...</div>
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

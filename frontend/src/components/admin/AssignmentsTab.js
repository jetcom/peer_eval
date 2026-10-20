import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import AudienceRoundControls from './AudienceRoundControls';
import PresentationScheduleModal from './PresentationScheduleModal';
import { formatWallClock } from '../../utils/wallClock';

const ROUND_LABELS = {
  peer: 'Teammates rate each other',
  audience: 'Class rates the presenters',
  self: 'Self evaluation',
  paper_review: 'Paper review'
};

/**
 * Where a teacher runs an assignment-mode class's rounds: due dates, and for
 * audience rounds the presentation schedule, excused absences and random
 * assignment of presenters. Adding assignments and picking rubric templates
 * stays in Class Settings.
 */
function AssignmentsTab({ darkMode, classId, classStudents = [], classGroups = [] }) {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scheduleTarget, setScheduleTarget] = useState(null); // { evalType, assignment, tab }

  const mutedColor = darkMode ? '#a0a0a0' : '#666';
  const studentCount = classStudents.filter(s => s.role === 'student').length;

  const load = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`/api/assignments/class/${classId}`);
      setAssignments(res.data);
    } catch (err) {
      setError('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { load(); }, [load]);

  const replaceAssignment = (updated) => {
    setAssignments(prev => prev.map(a => a.id === updated.id ? updated : a));
  };

  const updateEvalType = async (evalTypeId, patch) => {
    setError('');
    try {
      const res = await axios.put(`/api/assignments/eval-type/${evalTypeId}`, patch);
      replaceAssignment(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update the round');
    }
  };

  const updateDueDate = async (assignment, dueDate) => {
    setError('');
    try {
      const res = await axios.put(`/api/assignments/${assignment.id}`, {
        name: assignment.name,
        description: assignment.description,
        order_index: assignment.order_index,
        due_date: dueDate
      });
      replaceAssignment(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update the due date');
    }
  };

  // Summary line for an audience round's schedule
  const scheduleSummary = (et) => {
    const slots = et.presentation_slots || [];
    const presenterTotal = et.target_type === 'group' ? classGroups.length : studentCount;
    if (presenterTotal === 0) {
      return et.target_type === 'group' ? 'No groups in this class yet' : 'No students enrolled yet';
    }
    if (slots.length === 0) return 'No presentation dates set';
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const nowStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}T${pad(today.getHours())}:${pad(today.getMinutes())}`;
    const dates = [...new Set(slots.map(s => s.presentation_date))].sort();
    const next = dates.find(d => d >= nowStr);
    const parts = [`${slots.length} of ${presenterTotal} scheduled across ${dates.length} session${dates.length === 1 ? '' : 's'}`];
    parts.push(next ? `next ${formatWallClock(next)}` : `last was ${formatWallClock(dates[dates.length - 1])}`);
    return parts.join(' · ');
  };

  const openSchedule = (assignment, evalType, tab) => setScheduleTarget({ assignment, evalType, tab });

  const onScheduleSaved = (schedule) => {
    if (!scheduleTarget) return;
    const slots = schedule.presenters
      .filter(p => p.presentation_date)
      .map(p => ({
        group_id: p.kind === 'group' ? p.id : null,
        user_id: p.kind === 'individual' ? p.id : null,
        presentation_date: p.presentation_date
      }));
    const patch = { presentation_slots: slots, assignment_mode: schedule.assignment_mode };
    const updatedAssignment = {
      ...scheduleTarget.assignment,
      eval_types: (scheduleTarget.assignment.eval_types || []).map(x =>
        x.id === scheduleTarget.evalType.id ? { ...x, ...patch } : x
      )
    };
    replaceAssignment(updatedAssignment);
    setScheduleTarget({ ...scheduleTarget, assignment: updatedAssignment, evalType: { ...scheduleTarget.evalType, ...patch } });
  };

  if (loading) {
    return <div className="loading">Loading assignments...</div>;
  }

  return (
    <>
      <div className="card">
        <h2 style={{ marginBottom: '6px' }}>Assignments</h2>
        <p style={{ margin: 0, color: mutedColor, fontSize: '0.9rem' }}>
          Due dates and, for in-class presentations, the schedule, excused absences and random assignment of presenters.
          Add assignments or change rubric templates in the class's Settings.
        </p>
      </div>

      {error && <div className="message error">{error}</div>}

      {assignments.length === 0 && (
        <div className="card">
          <p style={{ margin: 0, color: mutedColor }}>No assignments yet. Add them in the class's Settings, under Assignments.</p>
        </div>
      )}

      {assignments.map((assignment, index) => {
        const datePart = (assignment.due_date || '').split('T')[0];
        const timePart = (assignment.due_date || '').split('T')[1] || '23:59';
        return (
          <div key={assignment.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>{index + 1}. {assignment.name}</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '0.9rem' }}>
                Due
                <input
                  type="date"
                  value={datePart}
                  onChange={(e) => updateDueDate(assignment, e.target.value ? `${e.target.value}T${timePart}` : null)}
                  style={{ width: 'auto' }}
                />
                <input
                  type="time"
                  value={timePart}
                  disabled={!datePart}
                  onChange={(e) => datePart && updateDueDate(assignment, `${datePart}T${e.target.value || '23:59'}`)}
                  style={{ width: 'auto' }}
                />
              </label>
            </div>

            {(assignment.eval_types || []).map(et => {
              const isAudience = et.eval_type === 'audience';
              return (
                <div
                  key={et.id}
                  style={{
                    marginTop: '15px',
                    padding: '12px 15px',
                    borderRadius: '6px',
                    background: darkMode ? 'rgba(255,255,255,0.04)' : '#f8f9fa',
                    border: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>{et.name}</span>
                    <span style={{ fontSize: '0.85rem', color: mutedColor }}>{ROUND_LABELS[et.eval_type] || et.eval_type}</span>
                    {et.due_date && (
                      <span style={{ fontSize: '0.85rem', color: mutedColor }}>· due {formatWallClock(et.due_date)}</span>
                    )}
                  </div>

                  {isAudience && (
                    <>
                      <div style={{ marginTop: '12px' }}>
                        <AudienceRoundControls darkMode={darkMode} et={et} onUpdate={(patch) => updateEvalType(et.id, patch)} />
                      </div>
                      <div style={{
                        marginTop: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        flexWrap: 'wrap'
                      }}>
                        <span style={{ fontSize: '0.85rem', color: mutedColor, flex: '1 1 260px' }}>
                          {scheduleSummary(et)}
                          {(et.assignment_mode || 'any') === 'assigned' && ' · random assignment on'}
                        </span>
                        <button type="button" className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={() => openSchedule(assignment, et, 'schedule')}>
                          {(et.presentation_slots || []).length > 0 ? 'Presentation schedule' : 'Set up presentation schedule'}
                        </button>
                        <button type="button" className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={() => openSchedule(assignment, et, 'absences')}>
                          Excused absences
                        </button>
                        <button type="button" className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={() => openSchedule(assignment, et, 'assignments')}>
                          Random assignment
                        </button>
                      </div>
                    </>
                  )}

                  {et.eval_type === 'paper_review' && (
                    <div style={{ marginTop: '8px', fontSize: '0.85rem', color: mutedColor }}>
                      Review rounds are managed from the Progress tab.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {scheduleTarget && (
        <PresentationScheduleModal
          darkMode={darkMode}
          evalType={scheduleTarget.evalType}
          assignmentName={scheduleTarget.assignment.name}
          initialTab={scheduleTarget.tab}
          onClose={() => setScheduleTarget(null)}
          onSaved={onScheduleSaved}
        />
      )}
    </>
  );
}

export default AssignmentsTab;

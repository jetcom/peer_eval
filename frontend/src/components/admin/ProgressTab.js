import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

function ProgressTab({
  darkMode,
  selectedClass,
  classes,
  classStudents,
  classGroups,
  evaluations,
  finalCommentsData
}) {
  const [filterGroup, setFilterGroup] = useState('all');
  const [heatmapPhase, setHeatmapPhase] = useState(1);
  const confettiFired = useRef(false);

  // Filter to students only
  const studentsOnly = classStudents.filter(s => s.role === 'student');

  // Filter evaluations by class
  const classStudentIds = new Set(studentsOnly.map(s => s.id));
  const classEvaluations = evaluations.filter(e =>
    e.class_id
      ? e.class_id === parseInt(selectedClass)
      : (classStudentIds.has(e.evaluator_id) && classStudentIds.has(e.evaluatee_id))
  );
  const classFinalComments = finalCommentsData.filter(fc =>
    fc.class_id
      ? fc.class_id === parseInt(selectedClass)
      : (classStudentIds.has(fc.evaluator_id) && classStudentIds.has(fc.evaluatee_id))
  );

  // Get class config
  const selectedClassData = classes.find(c => c.id.toString() === selectedClass);
  const numPhases = selectedClassData?.num_phases || 3;
  const hasFinalEvaluation = selectedClassData?.has_final_evaluation;
  const phaseNumbers = Array.from({ length: numPhases }, (_, i) => i + 1);

  // Get students filtered by group
  const getFilteredStudents = () => {
    if (filterGroup === 'all') return studentsOnly;
    const groupId = parseInt(filterGroup);
    const group = classGroups.find(g => g.id === groupId);
    if (!group || !group.members) return [];
    return group.members.filter(m => m.role === 'student');
  };

  const filteredStudents = getFilteredStudents();

  // Find which group a student belongs to
  const getStudentGroup = (studentId) => {
    return classGroups.find(g => g.members?.some(m => m.id === studentId));
  };

  // Calculate how many teammates each student should evaluate (including self)
  const getExpectedEvaluations = (studentId) => {
    const group = getStudentGroup(studentId);
    if (!group || !group.members) return 0;
    // Evaluate all group members including self
    return group.members.filter(m => m.role === 'student').length;
  };

  // Check if a student has completed a phase
  const getStudentPhaseStatus = (studentId, phase) => {
    const expected = getExpectedEvaluations(studentId);
    if (expected === 0) return 'no-group';

    const submitted = classEvaluations.filter(
      e => e.evaluator_id === studentId && e.phase === phase
    ).length;

    if (submitted === 0) return 'not-started';
    if (submitted < expected) return 'partial';
    return 'complete';
  };

  // Check final evaluation status
  const getStudentFinalStatus = (studentId) => {
    const expected = getExpectedEvaluations(studentId);
    if (expected === 0) return 'no-group';

    const submitted = classFinalComments.filter(
      fc => fc.evaluator_id === studentId
    ).length;

    if (submitted === 0) return 'not-started';
    if (submitted < expected) return 'partial';
    return 'complete';
  };

  // Calculate phase completion stats
  const getPhaseStats = (phase) => {
    let complete = 0;
    let partial = 0;
    let notStarted = 0;
    let noGroup = 0;

    filteredStudents.forEach(student => {
      const status = getStudentPhaseStatus(student.id, phase);
      if (status === 'complete') complete++;
      else if (status === 'partial') partial++;
      else if (status === 'not-started') notStarted++;
      else noGroup++;
    });

    const total = filteredStudents.length - noGroup;
    const percentage = total > 0 ? Math.round((complete / total) * 100) : 0;

    return { complete, partial, notStarted, noGroup, total, percentage };
  };

  // Calculate final evaluation stats
  const getFinalStats = () => {
    let complete = 0;
    let partial = 0;
    let notStarted = 0;
    let noGroup = 0;

    filteredStudents.forEach(student => {
      const status = getStudentFinalStatus(student.id);
      if (status === 'complete') complete++;
      else if (status === 'partial') partial++;
      else if (status === 'not-started') notStarted++;
      else noGroup++;
    });

    const total = filteredStudents.length - noGroup;
    const percentage = total > 0 ? Math.round((complete / total) * 100) : 0;

    return { complete, partial, notStarted, noGroup, total, percentage };
  };

  // Get incomplete students for a phase
  const getIncompleteStudents = (phase) => {
    return filteredStudents.filter(student => {
      const status = phase === 'final'
        ? getStudentFinalStatus(student.id)
        : getStudentPhaseStatus(student.id, phase);
      return status === 'not-started' || status === 'partial';
    }).map(student => ({
      ...student,
      status: phase === 'final'
        ? getStudentFinalStatus(student.id)
        : getStudentPhaseStatus(student.id, phase),
      group: getStudentGroup(student.id)
    }));
  };

  // Check if evaluator has evaluated evaluatee for a phase
  const hasEvaluated = (evaluatorId, evaluateeId, phase) => {
    if (phase === 'final') {
      return classFinalComments.some(
        fc => fc.evaluator_id == evaluatorId && fc.evaluatee_id == evaluateeId
      );
    }
    return classEvaluations.some(
      e => e.evaluator_id == evaluatorId && e.evaluatee_id == evaluateeId && e.phase == phase
    );
  };

  // Get students for heatmap (grouped by their group)
  const getHeatmapStudents = () => {
    if (filterGroup === 'all') {
      // Show all groups, but each group separately
      return classGroups.flatMap(g =>
        (g.members || []).filter(m => m.role === 'student')
      );
    }
    const groupId = parseInt(filterGroup);
    const group = classGroups.find(g => g.id === groupId);
    if (!group || !group.members) return [];
    return group.members.filter(m => m.role === 'student');
  };

  // Overall completion
  const allPhaseStats = phaseNumbers.map(p => getPhaseStats(p));
  const finalStats = hasFinalEvaluation ? getFinalStats() : null;

  const totalComplete = allPhaseStats.reduce((sum, s) => sum + s.complete, 0) + (finalStats?.complete || 0);
  const totalExpected = allPhaseStats.reduce((sum, s) => sum + s.total, 0) + (finalStats?.total || 0);
  const overallPercentage = totalExpected > 0 ? Math.round((totalComplete / totalExpected) * 100) : 0;

  // Confetti effect when 100% complete
  useEffect(() => {
    if (overallPercentage === 100 && !confettiFired.current && totalExpected > 0) {
      confettiFired.current = true;
      // Fire confetti from both sides
      const duration = 3000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.6 },
          colors: ['#27ae60', '#3498db', '#f39c12', '#9b59b6']
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.6 },
          colors: ['#27ae60', '#3498db', '#f39c12', '#9b59b6']
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();
    }
  }, [overallPercentage, totalExpected]);

  // Reset confetti flag when switching classes
  useEffect(() => {
    confettiFired.current = false;
  }, [selectedClass]);

  const statusColors = {
    'complete': '#27ae60',
    'partial': '#f39c12',
    'not-started': '#e74c3c',
    'no-group': '#95a5a6'
  };

  const statusLabels = {
    'complete': 'Complete',
    'partial': 'In Progress',
    'not-started': 'Not Started',
    'no-group': 'No Group'
  };

  if (!selectedClass) {
    return (
      <div className="card">
        <h2>Select a Class</h2>
        <p>Please select a class from the header dropdown to view progress.</p>
      </div>
    );
  }

  const heatmapStudents = getHeatmapStudents();

  return (
    <>
      {/* Filter */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Progress Overview</h2>
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            style={{ padding: '8px', fontSize: '1rem', minWidth: '200px' }}
          >
            <option value="all">All Groups ({studentsOnly.length} students)</option>
            {classGroups.map(g => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.members?.filter(m => m.role === 'student').length || 0} students)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>
          Overall Completion
          {overallPercentage === 100 && totalExpected > 0 && (
            <span style={{ marginLeft: '10px', fontSize: '1.2rem' }}>🎉</span>
          )}
        </h3>
        <div style={{
          background: darkMode ? '#2d2d2d' : '#ecf0f1',
          borderRadius: '8px',
          height: '30px',
          overflow: 'hidden',
          marginBottom: '10px'
        }}>
          <div style={{
            background: overallPercentage === 100 ? '#27ae60' : '#3498db',
            width: `${overallPercentage}%`,
            height: '100%',
            transition: 'width 0.3s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '0.9rem'
          }}>
            {overallPercentage > 10 && `${overallPercentage}%`}
          </div>
        </div>
        <p style={{ margin: 0, color: darkMode ? '#a0a0a0' : '#666' }}>
          {totalComplete} of {totalExpected} phase submissions complete across all students
        </p>
      </div>

      {/* Per-Phase Progress */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Progress by Phase</h3>
        <div style={{ display: 'grid', gap: '15px' }}>
          {phaseNumbers.map(phase => {
            const stats = getPhaseStats(phase);
            return (
              <div key={phase}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontWeight: '500' }}>Phase {phase}</span>
                  <span>
                    <span style={{ color: '#27ae60' }}>{stats.complete} done</span>
                    {stats.partial > 0 && <span style={{ color: '#f39c12' }}> · {stats.partial} partial</span>}
                    {stats.notStarted > 0 && <span style={{ color: '#e74c3c' }}> · {stats.notStarted} not started</span>}
                  </span>
                </div>
                <div style={{
                  background: darkMode ? '#2d2d2d' : '#ecf0f1',
                  borderRadius: '4px',
                  height: '20px',
                  overflow: 'hidden',
                  display: 'flex'
                }}>
                  <div style={{
                    background: '#27ae60',
                    width: `${(stats.complete / stats.total) * 100}%`,
                    height: '100%',
                    transition: 'width 0.3s'
                  }} />
                  <div style={{
                    background: '#f39c12',
                    width: `${(stats.partial / stats.total) * 100}%`,
                    height: '100%',
                    transition: 'width 0.3s'
                  }} />
                </div>
              </div>
            );
          })}

          {hasFinalEvaluation && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontWeight: '500' }}>Final Evaluation</span>
                <span>
                  <span style={{ color: '#27ae60' }}>{finalStats.complete} done</span>
                  {finalStats.partial > 0 && <span style={{ color: '#f39c12' }}> · {finalStats.partial} partial</span>}
                  {finalStats.notStarted > 0 && <span style={{ color: '#e74c3c' }}> · {finalStats.notStarted} not started</span>}
                </span>
              </div>
              <div style={{
                background: darkMode ? '#2d2d2d' : '#ecf0f1',
                borderRadius: '4px',
                height: '20px',
                overflow: 'hidden',
                display: 'flex'
              }}>
                <div style={{
                  background: '#27ae60',
                  width: `${(finalStats.complete / finalStats.total) * 100}%`,
                  height: '100%',
                  transition: 'width 0.3s'
                }} />
                <div style={{
                  background: '#f39c12',
                  width: `${(finalStats.partial / finalStats.total) * 100}%`,
                  height: '100%',
                  transition: 'width 0.3s'
                }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Evaluation Heat Map */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0 }}>Evaluation Heat Map</h3>
          <select
            value={heatmapPhase}
            onChange={(e) => setHeatmapPhase(e.target.value === 'final' ? 'final' : parseInt(e.target.value))}
            style={{ padding: '8px', fontSize: '1rem' }}
          >
            {phaseNumbers.map(p => (
              <option key={p} value={p}>Phase {p}</option>
            ))}
            {hasFinalEvaluation && (
              <option value="final">Final Evaluation</option>
            )}
          </select>
        </div>

        {heatmapStudents.length === 0 ? (
          <p style={{ color: darkMode ? '#a0a0a0' : '#666' }}>No students in selected group.</p>
        ) : heatmapStudents.length > 30 ? (
          <p style={{ color: darkMode ? '#a0a0a0' : '#666' }}>
            Select a specific group to view the heat map (too many students to display).
          </p>
        ) : (
          <>
            <div style={{
              display: 'flex',
              gap: '15px',
              marginBottom: '15px',
              fontSize: '0.85rem',
              color: darkMode ? '#a0a0a0' : '#666'
            }}>
              <span><span style={{
                display: 'inline-block',
                width: '12px',
                height: '12px',
                background: '#27ae60',
                borderRadius: '2px',
                marginRight: '5px',
                verticalAlign: 'middle'
              }}></span> Submitted</span>
              <span><span style={{
                display: 'inline-block',
                width: '12px',
                height: '12px',
                background: '#e74c3c',
                borderRadius: '2px',
                marginRight: '5px',
                verticalAlign: 'middle'
              }}></span> Missing</span>
              <span><span style={{
                display: 'inline-block',
                width: '12px',
                height: '12px',
                background: darkMode ? '#3d3d3d' : '#ddd',
                borderRadius: '2px',
                marginRight: '5px',
                verticalAlign: 'middle'
              }}></span> Different Group</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                borderCollapse: 'collapse',
                fontSize: '0.8rem',
                width: '100%'
              }}>
                <thead>
                  <tr>
                    <th style={{
                      padding: '8px',
                      textAlign: 'left',
                      borderBottom: `2px solid ${darkMode ? '#444' : '#ddd'}`,
                      position: 'sticky',
                      left: 0,
                      background: darkMode ? '#1a1a1a' : '#fff',
                      zIndex: 1
                    }}>
                      Evaluator ↓ / Evaluatee →
                    </th>
                    {heatmapStudents.map(student => (
                      <th key={student.id} style={{
                        padding: '8px',
                        textAlign: 'center',
                        borderBottom: `2px solid ${darkMode ? '#444' : '#ddd'}`,
                        whiteSpace: 'nowrap',
                        fontWeight: '500'
                      }}>
                        {student.first_name.charAt(0)}. {student.last_name.substring(0, 8)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmapStudents.map(evaluator => {
                    const evaluatorGroup = getStudentGroup(evaluator.id);
                    return (
                      <tr key={evaluator.id}>
                        <td style={{
                          padding: '8px',
                          borderBottom: `1px solid ${darkMode ? '#333' : '#eee'}`,
                          fontWeight: '500',
                          whiteSpace: 'nowrap',
                          position: 'sticky',
                          left: 0,
                          background: darkMode ? '#1a1a1a' : '#fff'
                        }}>
                          {evaluator.first_name} {evaluator.last_name.charAt(0)}.
                        </td>
                        {heatmapStudents.map(evaluatee => {
                          const evaluateeGroup = getStudentGroup(evaluatee.id);
                          const isSelf = evaluator.id === evaluatee.id;
                          const sameGroup = evaluatorGroup?.id === evaluateeGroup?.id;

                          let bgColor;
                          let symbol = '';

                          if (!sameGroup) {
                            bgColor = darkMode ? '#3d3d3d' : '#ddd';
                            symbol = '';
                          } else if (hasEvaluated(evaluator.id, evaluatee.id, heatmapPhase)) {
                            bgColor = '#27ae60';
                            symbol = '✓';
                          } else {
                            bgColor = '#e74c3c';
                            symbol = '✗';
                          }

                          return (
                            <td key={evaluatee.id} style={{
                              padding: '8px',
                              textAlign: 'center',
                              borderBottom: `1px solid ${darkMode ? '#333' : '#eee'}`,
                              background: bgColor,
                              color: (bgColor === '#27ae60' || bgColor === '#e74c3c') ? 'white' : (darkMode ? '#888' : '#999'),
                              fontWeight: 'bold'
                            }}>
                              {symbol}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Who Needs a Nudge */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Who Needs a Nudge?</h3>

        {phaseNumbers.map(phase => {
          const incomplete = getIncompleteStudents(phase);
          if (incomplete.length === 0) return null;

          return (
            <div key={phase} style={{ marginBottom: '20px' }}>
              <h4 style={{ marginBottom: '10px', color: '#e74c3c' }}>
                Phase {phase} - {incomplete.length} student{incomplete.length !== 1 ? 's' : ''} incomplete
              </h4>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: '8px'
              }}>
                {incomplete.map(student => (
                  <div
                    key={student.id}
                    style={{
                      padding: '8px 12px',
                      background: student.status === 'partial'
                        ? (darkMode ? '#3d3510' : '#fef9e7')
                        : (darkMode ? '#3d1515' : '#fdedec'),
                      borderRadius: '4px',
                      borderLeft: `4px solid ${statusColors[student.status]}`,
                      fontSize: '0.9rem'
                    }}
                  >
                    <div style={{ fontWeight: '500' }}>
                      {student.last_name}, {student.first_name}
                    </div>
                    <div style={{ color: darkMode ? '#a0a0a0' : '#666', fontSize: '0.8rem' }}>
                      {student.group?.name || 'No group'} · {statusLabels[student.status]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {hasFinalEvaluation && (() => {
          const incomplete = getIncompleteStudents('final');
          if (incomplete.length === 0) return null;

          return (
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ marginBottom: '10px', color: '#e74c3c' }}>
                Final Evaluation - {incomplete.length} student{incomplete.length !== 1 ? 's' : ''} incomplete
              </h4>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: '8px'
              }}>
                {incomplete.map(student => (
                  <div
                    key={student.id}
                    style={{
                      padding: '8px 12px',
                      background: student.status === 'partial'
                        ? (darkMode ? '#3d3510' : '#fef9e7')
                        : (darkMode ? '#3d1515' : '#fdedec'),
                      borderRadius: '4px',
                      borderLeft: `4px solid ${statusColors[student.status]}`,
                      fontSize: '0.9rem'
                    }}
                  >
                    <div style={{ fontWeight: '500' }}>
                      {student.last_name}, {student.first_name}
                    </div>
                    <div style={{ color: darkMode ? '#a0a0a0' : '#666', fontSize: '0.8rem' }}>
                      {student.group?.name || 'No group'} · {statusLabels[student.status]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {phaseNumbers.every(p => getIncompleteStudents(p).length === 0) &&
         (!hasFinalEvaluation || getIncompleteStudents('final').length === 0) && (
          <p style={{ color: '#27ae60', fontWeight: '500' }}>
            🎉 All students have completed their evaluations!
          </p>
        )}
      </div>
    </>
  );
}

export default ProgressTab;

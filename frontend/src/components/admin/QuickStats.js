import React from 'react';

function QuickStats({
  selectedClass,
  classes,
  classStudents,
  classGroups,
  evaluations,
  finalCommentsData,
  assignmentEvaluations,
  onNavigate,
  currentUserRole
}) {
  if (!selectedClass) {
    return null;
  }

  const currentClass = classes.find(c => c.id.toString() === selectedClass);
  const isAssignmentMode = currentClass?.evaluation_mode === 'assignments';

  // Filter to students only
  const studentsOnly = classStudents.filter(s => s.role === 'student');

  // Calculate completion stats
  const getCompletionStats = () => {
    if (isAssignmentMode) {
      const assignments = assignmentEvaluations?.assignments || [];
      const individualEvals = assignmentEvaluations?.individual_evaluations || [];
      const groupEvals = assignmentEvaluations?.group_evaluations || [];

      let totalExpected = 0;
      let totalCompleted = 0;

      studentsOnly.forEach(student => {
        const studentGroup = classGroups.find(g => g.members?.some(m => m.id === student.id));

        assignments.forEach(assignment => {
          const evalTypes = assignment.eval_types || [];

          evalTypes.forEach(evalType => {
            if (evalType.target_type === 'individual') {
              const teammates = studentGroup?.members?.filter(m => m.role === 'student') || [];
              const includeSelf = evalType.include_self;
              const targetsToEval = includeSelf ? teammates : teammates.filter(m => m.id !== student.id);
              totalExpected += targetsToEval.length;

              const completed = individualEvals.filter(e =>
                e.evaluator_id === student.id &&
                e.eval_type_id === evalType.id
              ).length;
              totalCompleted += Math.min(completed, targetsToEval.length);
            } else {
              const otherGroups = classGroups.filter(g => g.id !== studentGroup?.id);
              totalExpected += otherGroups.length;

              const completed = groupEvals.filter(e =>
                e.evaluator_id === student.id &&
                e.eval_type_id === evalType.id
              ).length;
              totalCompleted += Math.min(completed, otherGroups.length);
            }
          });
        });
      });

      return {
        completed: totalCompleted,
        expected: totalExpected,
        percentage: totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0
      };
    } else {
      // Phase-based mode
      const numPhases = currentClass?.num_phases || 3;
      const hasFinalEvaluation = currentClass?.has_final_evaluation;

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

      let totalExpected = 0;
      let totalComplete = 0;

      studentsOnly.forEach(student => {
        const group = classGroups.find(g => g.members?.some(m => m.id === student.id));
        const expectedPerPhase = group?.members?.filter(m => m.role === 'student').length || 0;

        for (let phase = 1; phase <= numPhases; phase++) {
          totalExpected += expectedPerPhase;
          const submitted = classEvaluations.filter(
            e => e.evaluator_id === student.id && e.phase === phase
          ).length;
          if (submitted >= expectedPerPhase && expectedPerPhase > 0) {
            totalComplete += expectedPerPhase;
          }
        }

        if (hasFinalEvaluation) {
          totalExpected += expectedPerPhase;
          const finalSubmitted = classFinalComments.filter(
            fc => fc.evaluator_id === student.id
          ).length;
          if (finalSubmitted >= expectedPerPhase && expectedPerPhase > 0) {
            totalComplete += expectedPerPhase;
          }
        }
      });

      return {
        completed: totalComplete,
        expected: totalExpected,
        percentage: totalExpected > 0 ? Math.round((totalComplete / totalExpected) * 100) : 0
      };
    }
  };

  // Count incomplete students
  const getIncompleteCount = () => {
    let incomplete = 0;

    if (isAssignmentMode) {
      const assignments = assignmentEvaluations?.assignments || [];
      const individualEvals = assignmentEvaluations?.individual_evaluations || [];
      const groupEvals = assignmentEvaluations?.group_evaluations || [];

      studentsOnly.forEach(student => {
        const studentGroup = classGroups.find(g => g.members?.some(m => m.id === student.id));
        let isComplete = true;

        assignments.forEach(assignment => {
          const evalTypes = assignment.eval_types || [];

          evalTypes.forEach(evalType => {
            let expected = 0;
            let completed = 0;

            if (evalType.target_type === 'individual') {
              const teammates = studentGroup?.members?.filter(m => m.role === 'student') || [];
              const includeSelf = evalType.include_self;
              const targetsToEval = includeSelf ? teammates : teammates.filter(m => m.id !== student.id);
              expected = targetsToEval.length;

              completed = individualEvals.filter(e =>
                e.evaluator_id === student.id &&
                e.eval_type_id === evalType.id
              ).length;
            } else {
              const otherGroups = classGroups.filter(g => g.id !== studentGroup?.id);
              expected = otherGroups.length;

              completed = groupEvals.filter(e =>
                e.evaluator_id === student.id &&
                e.eval_type_id === evalType.id
              ).length;
            }

            if (completed < expected) {
              isComplete = false;
            }
          });
        });

        if (!isComplete) incomplete++;
      });
    } else {
      const numPhases = currentClass?.num_phases || 3;
      const classStudentIds = new Set(studentsOnly.map(s => s.id));
      const classEvaluations = evaluations.filter(e =>
        e.class_id
          ? e.class_id === parseInt(selectedClass)
          : (classStudentIds.has(e.evaluator_id) && classStudentIds.has(e.evaluatee_id))
      );

      studentsOnly.forEach(student => {
        const group = classGroups.find(g => g.members?.some(m => m.id === student.id));
        const expectedPerPhase = group?.members?.filter(m => m.role === 'student').length || 0;

        for (let phase = 1; phase <= numPhases; phase++) {
          const submitted = classEvaluations.filter(
            e => e.evaluator_id === student.id && e.phase === phase
          ).length;
          if (submitted < expectedPerPhase) {
            incomplete++;
            break;
          }
        }
      });
    }

    return incomplete;
  };

  const stats = getCompletionStats();
  const incompleteCount = getIncompleteCount();
  const totalEvaluations = isAssignmentMode
    ? (assignmentEvaluations?.individual_evaluations?.length || 0) + (assignmentEvaluations?.group_evaluations?.length || 0)
    : evaluations.filter(e => e.class_id === parseInt(selectedClass)).length;

  return (
    <div className="admin-stats-grid">
      <div
        className="admin-stat-card info clickable"
        onClick={() => onNavigate && onNavigate('users')}
        title="View Users tab"
      >
        <div className="admin-stat-value">{studentsOnly.length}</div>
        <div className="admin-stat-label">Students</div>
        <div className="admin-stat-sublabel">enrolled in class</div>
      </div>

      <div
        className={`admin-stat-card clickable ${stats.percentage === 100 ? 'success' : stats.percentage > 50 ? 'warning' : 'info'}`}
        onClick={() => onNavigate && onNavigate('progress')}
        title="View Progress tab"
      >
        <div className="admin-stat-value">{stats.percentage}%</div>
        <div className="admin-stat-label">Complete</div>
        <div className="admin-stat-sublabel">{stats.completed} / {stats.expected} evals</div>
      </div>

      <div
        className="admin-stat-card purple clickable"
        onClick={() => onNavigate && onNavigate('groups')}
        title="View Groups tab"
      >
        <div className="admin-stat-value">{classGroups.length}</div>
        <div className="admin-stat-label">Groups</div>
        <div className="admin-stat-sublabel">in this class</div>
      </div>

      <div
        className={`admin-stat-card clickable ${incompleteCount === 0 ? 'success' : incompleteCount > studentsOnly.length / 2 ? 'danger' : 'warning'}`}
        onClick={() => onNavigate && onNavigate('progress')}
        title="View Progress tab"
      >
        <div className="admin-stat-value">{incompleteCount}</div>
        <div className="admin-stat-label">{incompleteCount === 0 ? 'All Done!' : 'Need Nudge'}</div>
        <div className="admin-stat-sublabel">{incompleteCount === 0 ? 'everyone is complete' : 'incomplete students'}</div>
      </div>

      <div
        className="admin-stat-card info clickable"
        onClick={() => onNavigate && onNavigate('evaluations')}
        title="View Evaluations tab"
      >
        <div className="admin-stat-value">{totalEvaluations}</div>
        <div className="admin-stat-label">Evaluations</div>
        <div className="admin-stat-sublabel">submitted total</div>
      </div>

      {/* Mobile-only nav buttons for tabs not covered by stat cards */}
      <div
        className="admin-stat-card mobile-nav-card clickable"
        onClick={() => onNavigate && onNavigate('reports')}
        title="View Reports tab"
      >
        <div className="admin-stat-label">Reports</div>
        <div className="admin-stat-sublabel">View score reports</div>
      </div>

      <div
        className="admin-stat-card mobile-nav-card clickable"
        onClick={() => onNavigate && onNavigate('templates')}
        title="View Templates tab"
      >
        <div className="admin-stat-label">Templates</div>
        <div className="admin-stat-sublabel">Manage eval templates</div>
      </div>

      {currentUserRole === 'admin' && (
        <div
          className="admin-stat-card mobile-nav-card clickable"
          onClick={() => onNavigate && onNavigate('instructors')}
          title="View Instructors tab"
        >
          <div className="admin-stat-label">Instructors</div>
          <div className="admin-stat-sublabel">Pending requests</div>
        </div>
      )}
    </div>
  );
}

export default QuickStats;

const express = require('express');
const { db } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Helper function to get effective due date for a specific phase
// Uses cascading logic: if no due date for this phase, use the next phase's due date
function getEffectiveDueDate(classId, phase, numPhases, hasFinalEvaluation, phaseDueDates, timezone) {
  // phase is 1-N for regular phases, 0 for final evaluation
  // phaseDueDates is an object { phase: due_date }

  // If this phase has a due date, use it
  if (phaseDueDates[phase]) {
    return phaseDueDates[phase];
  }

  // Otherwise, look forward to find the next set date
  // For regular phases (1 to numPhases), look at higher phases
  if (phase > 0) {
    for (let p = phase + 1; p <= numPhases; p++) {
      if (phaseDueDates[p]) {
        return phaseDueDates[p];
      }
    }
    // If still no date and there's a final evaluation, check phase 0
    if (hasFinalEvaluation && phaseDueDates[0]) {
      return phaseDueDates[0];
    }
  }

  // No due date found in cascade
  return null;
}

// Helper function to check if a specific phase is past due for a user
// Also checks for individual student extensions
function checkIfPhasePastDue(userId, phase, classId, callback) {
  // Get the user's class info and phase due dates
  const classQuery = classId
    ? 'SELECT c.id, c.num_phases, c.has_final_evaluation, c.due_date_timezone FROM classes c WHERE c.id = ?'
    : `SELECT c.id, c.num_phases, c.has_final_evaluation, c.due_date_timezone
       FROM classes c
       JOIN class_enrollments ce ON c.id = ce.class_id
       WHERE ce.user_id = ?
       LIMIT 1`;
  const classParams = classId ? [classId] : [userId];

  db.get(classQuery, classParams, (err, classInfo) => {
    if (err) {
      return callback(err, null, null);
    }

    if (!classInfo) {
      return callback(null, false, null);
    }

    // Convert phase parameter: 'final' becomes 0, otherwise parseInt
    const phaseNum = phase === 'final' || phase === 0 ? 0 : parseInt(phase);

    // First, check if this student has an individual extension for this phase
    db.get(`
      SELECT extended_due_date
      FROM student_extensions
      WHERE class_id = ? AND user_id = ? AND phase = ?
    `, [classInfo.id, userId, phaseNum], (err, extension) => {
      if (err) {
        return callback(err, null, null);
      }

      // Get phase due dates for this class
      db.all(`
        SELECT phase, due_date
        FROM phase_due_dates
        WHERE class_id = ?
      `, [classInfo.id], (err, phaseDueDatesRows) => {
        if (err) {
          return callback(err, null, null);
        }

        // Convert to object
        const phaseDueDates = {};
        if (phaseDueDatesRows) {
          phaseDueDatesRows.forEach(pd => {
            phaseDueDates[pd.phase] = pd.due_date;
          });
        }

        const timezone = classInfo.due_date_timezone || 'America/New_York';
        const numPhases = classInfo.num_phases || 3;
        const hasFinalEvaluation = classInfo.has_final_evaluation;

        // Determine the effective due date:
        // 1. If student has an extension, use that
        // 2. Otherwise, use the class phase due date (with cascading)
        let effectiveDueDate;
        if (extension && extension.extended_due_date) {
          effectiveDueDate = extension.extended_due_date;
        } else {
          effectiveDueDate = getEffectiveDueDate(
            classInfo.id,
            phaseNum,
            numPhases,
            hasFinalEvaluation,
            phaseDueDates,
            timezone
          );
        }

        if (!effectiveDueDate) {
          // No due date set for this phase (or any subsequent phase)
          return callback(null, false, null);
        }

        // Get current time formatted in the target timezone
        const now = new Date();
        const nowParts = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false
        }).formatToParts(now);

        const getPart = (parts, type) => parts.find(p => p.type === type)?.value;
        const nowInTz = `${getPart(nowParts, 'year')}-${getPart(nowParts, 'month')}-${getPart(nowParts, 'day')}T${getPart(nowParts, 'hour')}:${getPart(nowParts, 'minute')}`;

        // Compare as strings (both in the same timezone context)
        const isPastDue = nowInTz > effectiveDueDate;
        callback(null, isPastDue, effectiveDueDate);
      });
    });
  });
}

// Legacy helper function for backwards compatibility (checks any phase)
function checkIfPastDue(userId, callback) {
  checkIfPhasePastDue(userId, 1, null, (err, isPastDue) => {
    callback(err, isPastDue);
  });
}

// Check if evaluations are past due (read-only) for a specific phase
router.get('/is-read-only', authenticateToken, (req, res) => {
  const { phase, class_id } = req.query;

  // Teachers and admins can always edit
  if (req.user.role === 'teacher' || req.user.role === 'admin') {
    return res.json({ isReadOnly: false });
  }

  // Use phase 1 as default if not specified (backwards compatibility)
  const targetPhase = phase || 1;

  checkIfPhasePastDue(req.user.id, targetPhase, class_id, (err, isPastDue, effectiveDueDate) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    // Get timezone from class
    const classQuery = class_id
      ? 'SELECT due_date_timezone FROM classes WHERE id = ?'
      : `SELECT c.due_date_timezone FROM classes c
         JOIN class_enrollments ce ON c.id = ce.class_id
         WHERE ce.user_id = ? LIMIT 1`;
    const classParams = class_id ? [class_id] : [req.user.id];

    db.get(classQuery, classParams, (err, classInfo) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({
        isReadOnly: isPastDue,
        dueDate: effectiveDueDate,
        timezone: classInfo?.due_date_timezone || 'America/New_York'
      });
    });
  });
});

// Get evaluations for current user (what they've submitted)
// Admins/teachers can pass user_id to masquerade as a student
router.get('/my-evaluations', authenticateToken, (req, res) => {
  const { user_id } = req.query;

  // Allow admins/teachers to masquerade as a student
  const isTeacherOrAdmin = req.user.role === 'teacher' || req.user.role === 'admin';
  const targetUserId = (isTeacherOrAdmin && user_id) ? user_id : req.user.id;

  db.all(`
    SELECT e.*, (u.first_name || ' ' || u.last_name) as evaluatee_name
    FROM evaluations e
    JOIN users u ON e.evaluatee_id = u.id
    WHERE e.evaluator_id = ?
    ORDER BY e.phase, u.last_name
  `, [targetUserId], (err, evaluations) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(evaluations);
  });
});

// Get final comments for current user
// Admins/teachers can pass user_id to masquerade as a student
router.get('/my-final-comments', authenticateToken, (req, res) => {
  const { user_id } = req.query;

  // Allow admins/teachers to masquerade as a student
  const isTeacherOrAdmin = req.user.role === 'teacher' || req.user.role === 'admin';
  const targetUserId = (isTeacherOrAdmin && user_id) ? user_id : req.user.id;

  db.all(`
    SELECT fc.*, fc.final_points, (u.first_name || ' ' || u.last_name) as evaluatee_name
    FROM final_comments fc
    JOIN users u ON fc.evaluatee_id = u.id
    WHERE fc.evaluator_id = ?
    ORDER BY u.last_name
  `, [targetUserId], (err, comments) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(comments);
  });
});

// Submit or update evaluation
router.post('/', authenticateToken, (req, res) => {
  const {
    evaluatee_id,
    phase,
    class_id,
    contribution,
    communication,
    reliability,
    quality_of_work,
    collaboration,
    score,
    comments
  } = req.body;

  // Validate phase
  if (phase < 1 || phase > 5) {
    return res.status(400).json({ error: 'Phase must be between 1 and 5' });
  }

  // Validate score
  if (score < 0 || score > 100) {
    return res.status(400).json({ error: 'Score must be between 0 and 100' });
  }

  // Check if this specific phase is past due (only for students)
  if (req.user.role === 'student') {
    checkIfPhasePastDue(req.user.id, phase, class_id, (err, isPastDue) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (isPastDue) {
        return res.status(403).json({ error: `Phase ${phase} is past due and can no longer be submitted or modified` });
      }
      submitEvaluation();
    });
  } else {
    submitEvaluation();
  }

  function submitEvaluation() {
    // Check if evaluation exists
    db.get(
      'SELECT id FROM evaluations WHERE evaluator_id = ? AND evaluatee_id = ? AND phase = ?',
      [req.user.id, evaluatee_id, phase],
      (err, existing) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        if (existing) {
          // Update existing evaluation
          db.run(`
            UPDATE evaluations SET
              contribution = ?,
              communication = ?,
              reliability = ?,
              quality_of_work = ?,
              collaboration = ?,
              score = ?,
              comments = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [contribution, communication, reliability, quality_of_work, collaboration, score, comments, existing.id],
          function(err) {
            if (err) {
              return res.status(500).json({ error: 'Failed to update evaluation' });
            }
            res.json({ id: existing.id, message: 'Evaluation updated' });
          });
        } else {
          // Create new evaluation
          db.run(`
            INSERT INTO evaluations (
              evaluator_id, evaluatee_id, phase,
              contribution, communication, reliability,
              quality_of_work, collaboration, score, comments
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [req.user.id, evaluatee_id, phase, contribution, communication, reliability, quality_of_work, collaboration, score, comments],
          function(err) {
            if (err) {
              return res.status(500).json({ error: 'Failed to create evaluation' });
            }
            res.json({ id: this.lastID, message: 'Evaluation created' });
          });
        }
      }
    );
  }
});

// Submit or update final comments
router.post('/final-comments', authenticateToken, (req, res) => {
  const { evaluatee_id, comments, final_points, class_id } = req.body;

  // Check if final evaluation phase is past due (only for students)
  // Final evaluation is represented as phase 0 (or 'final')
  if (req.user.role === 'student') {
    checkIfPhasePastDue(req.user.id, 'final', class_id, (err, isPastDue) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (isPastDue) {
        return res.status(403).json({ error: 'Final evaluation is past due and can no longer be submitted or modified' });
      }
      submitFinalComments();
    });
  } else {
    submitFinalComments();
  }

  function submitFinalComments() {
    db.get(
      'SELECT id FROM final_comments WHERE evaluator_id = ? AND evaluatee_id = ?',
      [req.user.id, evaluatee_id],
      (err, existing) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        if (existing) {
          db.run(`
            UPDATE final_comments SET
              comments = ?,
              final_points = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [comments, final_points || 0, existing.id],
          function(err) {
            if (err) {
              return res.status(500).json({ error: 'Failed to update final comments' });
            }
            res.json({ id: existing.id, message: 'Final comments updated' });
          });
        } else {
          db.run(`
            INSERT INTO final_comments (evaluator_id, evaluatee_id, comments, final_points)
            VALUES (?, ?, ?, ?)
          `, [req.user.id, evaluatee_id, comments, final_points || 0],
          function(err) {
            if (err) {
              return res.status(500).json({ error: 'Failed to create final comments' });
            }
            res.json({ id: this.lastID, message: 'Final comments created' });
          });
        }
      }
    );
  }
});

// Get all evaluations (admin only)
router.get('/all', authenticateToken, requireAdmin, (req, res) => {
  db.all(`
    SELECT
      e.*,
      (evaluator.first_name || ' ' || evaluator.last_name) as evaluator_name,
      (evaluatee.first_name || ' ' || evaluatee.last_name) as evaluatee_name,
      g.name as group_name
    FROM evaluations e
    JOIN users evaluator ON e.evaluator_id = evaluator.id
    JOIN users evaluatee ON e.evaluatee_id = evaluatee.id
    LEFT JOIN group_members gm ON evaluatee.id = gm.user_id
    LEFT JOIN groups g ON gm.group_id = g.id
    ORDER BY g.name, e.phase, evaluatee.last_name, evaluator.last_name
  `, (err, evaluations) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(evaluations);
  });
});

// Get all final comments (admin only)
router.get('/all-final-comments', authenticateToken, requireAdmin, (req, res) => {
  db.all(`
    SELECT
      fc.*,
      (evaluator.first_name || ' ' || evaluator.last_name) as evaluator_name,
      (evaluatee.first_name || ' ' || evaluatee.last_name) as evaluatee_name,
      g.name as group_name
    FROM final_comments fc
    JOIN users evaluator ON fc.evaluator_id = evaluator.id
    JOIN users evaluatee ON fc.evaluatee_id = evaluatee.id
    LEFT JOIN group_members gm ON evaluatee.id = gm.user_id
    LEFT JOIN groups g ON gm.group_id = g.id
    ORDER BY g.name, evaluatee.last_name, evaluator.last_name
  `, (err, comments) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(comments);
  });
});

// Get evaluation summary for a user (admin only)
router.get('/summary/:userId', authenticateToken, requireAdmin, (req, res) => {
  const { userId } = req.params;

  db.all(`
    SELECT
      phase,
      AVG(contribution) as avg_contribution,
      AVG(communication) as avg_communication,
      AVG(reliability) as avg_reliability,
      AVG(quality_of_work) as avg_quality_of_work,
      AVG(collaboration) as avg_collaboration,
      AVG(score) as avg_score,
      COUNT(*) as num_evaluations
    FROM evaluations
    WHERE evaluatee_id = ?
    GROUP BY phase
    ORDER BY phase
  `, [userId], (err, summary) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(summary);
  });
});

module.exports = router;

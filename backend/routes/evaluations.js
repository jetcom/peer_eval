const express = require('express');
const { db } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Helper function to check if evaluations are past due for a user
function checkIfPastDue(userId, callback) {
  // Get the user's class and check the due date
  db.get(`
    SELECT c.due_date, c.due_date_timezone
    FROM classes c
    JOIN class_enrollments ce ON c.id = ce.class_id
    WHERE ce.user_id = ?
    LIMIT 1
  `, [userId], (err, classInfo) => {
    if (err) {
      return callback(err, null);
    }

    if (!classInfo || !classInfo.due_date) {
      // No due date set, evaluations are open
      return callback(null, false);
    }

    // Parse the due date with timezone
    // The due_date is stored as 'YYYY-MM-DDTHH:mm' without timezone
    // We need to interpret it in the specified timezone (default: America/New_York)
    const timezone = classInfo.due_date_timezone || 'America/New_York';
    const dueDateStr = classInfo.due_date;

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
    const isPastDue = nowInTz > dueDateStr;
    callback(null, isPastDue);
  });
}

// Check if evaluations are past due (read-only)
router.get('/is-read-only', authenticateToken, (req, res) => {
  // Teachers and admins can always edit
  if (req.user.role === 'teacher' || req.user.role === 'admin') {
    return res.json({ isReadOnly: false });
  }

  checkIfPastDue(req.user.id, (err, isPastDue) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ isReadOnly: isPastDue });
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
    contribution,
    communication,
    reliability,
    quality_of_work,
    collaboration,
    score,
    comments
  } = req.body;

  // Validate phase
  if (phase < 1 || phase > 3) {
    return res.status(400).json({ error: 'Phase must be 1, 2, or 3' });
  }

  // Validate score
  if (score < 0 || score > 100) {
    return res.status(400).json({ error: 'Score must be between 0 and 100' });
  }

  // Check if evaluations are past due (only for students)
  if (req.user.role === 'student') {
    checkIfPastDue(req.user.id, (err, isPastDue) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (isPastDue) {
        return res.status(403).json({ error: 'Evaluations are past due and can no longer be submitted or modified' });
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
  const { evaluatee_id, comments, final_points } = req.body;

  // Check if evaluations are past due (only for students)
  if (req.user.role === 'student') {
    checkIfPastDue(req.user.id, (err, isPastDue) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (isPastDue) {
        return res.status(403).json({ error: 'Evaluations are past due and can no longer be submitted or modified' });
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

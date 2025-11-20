const express = require('express');
const { db } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get evaluations for current user (what they've submitted)
router.get('/my-evaluations', authenticateToken, (req, res) => {
  db.all(`
    SELECT e.*, (u.first_name || ' ' || u.last_name) as evaluatee_name
    FROM evaluations e
    JOIN users u ON e.evaluatee_id = u.id
    WHERE e.evaluator_id = ?
    ORDER BY e.phase, u.last_name
  `, [req.user.id], (err, evaluations) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(evaluations);
  });
});

// Get final comments for current user
router.get('/my-final-comments', authenticateToken, (req, res) => {
  db.all(`
    SELECT fc.*, (u.first_name || ' ' || u.last_name) as evaluatee_name
    FROM final_comments fc
    JOIN users u ON fc.evaluatee_id = u.id
    WHERE fc.evaluator_id = ?
    ORDER BY u.last_name
  `, [req.user.id], (err, comments) => {
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
});

// Submit or update final comments
router.post('/final-comments', authenticateToken, (req, res) => {
  const { evaluatee_id, comments } = req.body;

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
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [comments, existing.id],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to update final comments' });
          }
          res.json({ id: existing.id, message: 'Final comments updated' });
        });
      } else {
        db.run(`
          INSERT INTO final_comments (evaluator_id, evaluatee_id, comments)
          VALUES (?, ?, ?)
        `, [req.user.id, evaluatee_id, comments],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to create final comments' });
          }
          res.json({ id: this.lastID, message: 'Final comments created' });
        });
      }
    }
  );
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

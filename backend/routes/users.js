const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { parse } = require('csv-parse');
const { db } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get all users (admin only)
router.get('/', authenticateToken, requireAdmin, (req, res) => {
  db.all('SELECT id, email, name, role, protected, created_at FROM users ORDER BY name', (err, users) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(users);
  });
});

// Create user (admin only)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  const { email, password, name, role = 'student' } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(
    'INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)',
    [email, hashedPassword, name, role],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint')) {
          return res.status(400).json({ error: 'Email already exists' });
        }
        return res.status(500).json({ error: 'Failed to create user' });
      }
      res.json({ id: this.lastID, email, name, role });
    }
  );
});

// Upload users via CSV (admin only)
// CSV format: email,name,role,university_id (university_id used as temp password)
// Or: email,password,name,role (if password column exists)
// Or: email,name,role (password auto-generated as username + "Pass123")
router.post('/upload-csv', authenticateToken, requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const results = [];
  const errors = [];

  parse(req.file.buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }, (err, records) => {
    if (err) {
      return res.status(400).json({ error: 'Failed to parse CSV: ' + err.message });
    }

    let processed = 0;
    const total = records.length;

    if (total === 0) {
      return res.json({ created: 0, errors: [], credentials: [] });
    }

    const credentials = [];

    records.forEach((record) => {
      const { email, password, name, role = 'student', university_id } = record;

      if (!email || !name) {
        errors.push({ email: email || 'unknown', error: 'Missing required fields (email, name)' });
        processed++;
        if (processed === total) {
          res.json({ created: results.length, errors, credentials });
        }
        return;
      }

      // Password priority: explicit password > university_id > auto-generated
      let generatedPassword;
      if (password) {
        generatedPassword = password;
      } else if (university_id) {
        generatedPassword = university_id;
      } else {
        const username = email.split('@')[0];
        generatedPassword = `${username}Pass123`;
      }
      const hashedPassword = bcrypt.hashSync(generatedPassword, 10);

      // Set must_change_password = 1 for auto-generated/university_id passwords
      const mustChange = password ? 0 : 1;

      db.run(
        'INSERT INTO users (email, password, name, role, must_change_password) VALUES (?, ?, ?, ?, ?)',
        [email, hashedPassword, name, role || 'student', mustChange],
        function(err) {
          if (err) {
            errors.push({ email, error: err.message.includes('UNIQUE') ? 'Email already exists' : err.message });
          } else {
            const userResult = { id: this.lastID, email, name, role: role || 'student' };
            results.push(userResult);
            // Include generated password in response (only if auto-generated)
            if (!password) {
              credentials.push({ email, password: generatedPassword });
            }
          }
          processed++;
          if (processed === total) {
            res.json({ created: results.length, errors, credentials });
          }
        }
      );
    });
  });
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  // Check if user is protected
  db.get('SELECT protected FROM users WHERE id = ?', [id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.protected === 1) {
      return res.status(403).json({ error: 'Cannot delete protected admin account' });
    }

    db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete user' });
      }
      res.json({ message: 'User deleted' });
    });
  });
});

// Reset user password (admin only)
router.post('/:id/reset-password', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);

  // Set must_change_password = 1 so user must change on first login
  db.run('UPDATE users SET password = ?, must_change_password = 1 WHERE id = ?', [hashedPassword, id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to reset password' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'Password reset successfully. User must change password on next login.' });
  });
});

module.exports = router;

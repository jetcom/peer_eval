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
  db.all('SELECT id, email, first_name, last_name, university_id, role, protected, created_at FROM users ORDER BY last_name, first_name', (err, users) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(users);
  });
});

// Create user (admin only)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  const { email, password, first_name, last_name, role = 'student' } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(
    'INSERT INTO users (email, password, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)',
    [email, hashedPassword, first_name, last_name, role],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint')) {
          return res.status(400).json({ error: 'Email already exists' });
        }
        return res.status(500).json({ error: 'Failed to create user' });
      }
      res.json({ id: this.lastID, email, first_name, last_name, role });
    }
  );
});

// Upload users via CSV (admin only)
// CSV format: #university_id, last_name, first_name, email, group_name#
router.post('/upload-csv', authenticateToken, requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const results = [];
  const errors = [];

  // Preprocess CSV to strip # markers from start and end of lines
  let csvContent = req.file.buffer.toString('utf8');
  csvContent = csvContent.split('\n').map(line => {
    line = line.trim();
    if (line.startsWith('#')) line = line.substring(1);
    if (line.endsWith('#')) line = line.slice(0, -1);
    return line;
  }).join('\n');

  parse(csvContent, {
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

    // Helper to get field value with flexible column names
    const getField = (record, ...names) => {
      for (const name of names) {
        // Check exact match and case-insensitive
        if (record[name] !== undefined) return record[name];
        const lowerName = name.toLowerCase();
        for (const key of Object.keys(record)) {
          if (key.toLowerCase() === lowerName) return record[key];
        }
      }
      return undefined;
    };

    records.forEach((record) => {
      // Support flexible column names (including spaces)
      const university_id = getField(record, 'university_id', 'universityID', 'universityid', 'id', 'ID', 'student_id', 'OrgDefinedId', 'Org Defined Id');
      const last_name = getField(record, 'last_name', 'lastname', 'Last', 'last', 'surname', 'family_name', 'Last Name');
      const first_name = getField(record, 'first_name', 'firstname', 'First', 'first', 'given_name', 'First Name');
      const email = getField(record, 'email', 'Email', 'e-mail', 'EMAIL');
      const group_name = getField(record, 'group_name', 'group', 'Group', 'team', 'Team', 'Project Groups', 'Project Group');
      const role = getField(record, 'role', 'Role', 'type') || 'student';

      if (!email || !first_name || !last_name) {
        const missing = [];
        if (!email) missing.push('email');
        if (!first_name) missing.push('first_name/First');
        if (!last_name) missing.push('last_name/Last');
        errors.push({
          email: email || 'unknown',
          error: `Missing: ${missing.join(', ')}. Columns found: ${Object.keys(record).join(', ')}`
        });
        processed++;
        if (processed === total) {
          res.json({ created: results.length, errors, credentials });
        }
        return;
      }

      // Password: use university_id or auto-generate
      let generatedPassword;
      if (university_id) {
        generatedPassword = university_id;
      } else {
        const username = email.split('@')[0];
        generatedPassword = `${username}Pass123`;
      }
      const hashedPassword = bcrypt.hashSync(generatedPassword, 10);

      db.run(
        'INSERT INTO users (email, password, first_name, last_name, university_id, role, must_change_password) VALUES (?, ?, ?, ?, ?, ?, 1)',
        [email, hashedPassword, first_name, last_name, university_id || null, role || 'student'],
        function(err) {
          if (err) {
            errors.push({ email, error: err.message.includes('UNIQUE') ? 'Email already exists' : err.message });
            processed++;
            if (processed === total) {
              res.json({ created: results.length, errors, credentials });
            }
            return;
          }

          const userId = this.lastID;
          const userResult = { id: userId, email, first_name, last_name, role: role || 'student' };
          results.push(userResult);
          credentials.push({ email, password: generatedPassword });

          // If group_name is provided, add user to group
          if (group_name) {
            // Check if group exists, create if not
            db.get('SELECT id FROM groups WHERE name = ?', [group_name], (err, group) => {
              if (err) {
                processed++;
                if (processed === total) {
                  res.json({ created: results.length, errors, credentials });
                }
                return;
              }

              if (group) {
                // Add to existing group
                db.run('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [group.id, userId], () => {
                  processed++;
                  if (processed === total) {
                    res.json({ created: results.length, errors, credentials });
                  }
                });
              } else {
                // Create group and add user
                db.run('INSERT INTO groups (name) VALUES (?)', [group_name], function(err) {
                  if (err) {
                    processed++;
                    if (processed === total) {
                      res.json({ created: results.length, errors, credentials });
                    }
                    return;
                  }
                  const groupId = this.lastID;
                  db.run('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, userId], () => {
                    processed++;
                    if (processed === total) {
                      res.json({ created: results.length, errors, credentials });
                    }
                  });
                });
              }
            });
          } else {
            processed++;
            if (processed === total) {
              res.json({ created: results.length, errors, credentials });
            }
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

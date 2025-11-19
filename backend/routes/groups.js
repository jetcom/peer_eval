const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse');
const { db } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get all groups (admin only)
router.get('/', authenticateToken, requireAdmin, (req, res) => {
  db.all('SELECT * FROM groups ORDER BY name', (err, groups) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(groups);
  });
});

// Get all groups with members (admin only)
router.get('/with-members', authenticateToken, requireAdmin, (req, res) => {
  db.all('SELECT * FROM groups ORDER BY name', (err, groups) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (groups.length === 0) {
      return res.json([]);
    }

    let processed = 0;
    const results = [];

    groups.forEach(group => {
      db.all(`
        SELECT u.id, u.email, u.name
        FROM users u
        JOIN group_members gm ON u.id = gm.user_id
        WHERE gm.group_id = ?
        ORDER BY u.name
      `, [group.id], (err, members) => {
        results.push({ ...group, members: members || [] });
        processed++;
        if (processed === groups.length) {
          res.json(results.sort((a, b) => a.name.localeCompare(b.name)));
        }
      });
    });
  });
});

// Get group with members
router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM groups WHERE id = ?', [id], (err, group) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    db.all(`
      SELECT u.id, u.email, u.name
      FROM users u
      JOIN group_members gm ON u.id = gm.user_id
      WHERE gm.group_id = ?
      ORDER BY u.name
    `, [id], (err, members) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ ...group, members });
    });
  });
});

// Get current user's group
router.get('/my/group', authenticateToken, (req, res) => {
  db.get(`
    SELECT g.* FROM groups g
    JOIN group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = ?
  `, [req.user.id], (err, group) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!group) {
      return res.status(404).json({ error: 'You are not in any group' });
    }

    db.all(`
      SELECT u.id, u.email, u.name
      FROM users u
      JOIN group_members gm ON u.id = gm.user_id
      WHERE gm.group_id = ?
      ORDER BY u.name
    `, [group.id], (err, members) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ ...group, members });
    });
  });
});

// Create group (admin only)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  const { name } = req.body;

  db.run('INSERT INTO groups (name) VALUES (?)', [name], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to create group' });
    }
    res.json({ id: this.lastID, name });
  });
});

// Add member to group (admin only)
router.post('/:id/members', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  // First remove user from any existing group
  db.run('DELETE FROM group_members WHERE user_id = ?', [userId], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    db.run(
      'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
      [id, userId],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to add member' });
        }
        res.json({ message: 'Member added' });
      }
    );
  });
});

// Remove member from group (admin only)
router.delete('/:id/members/:userId', authenticateToken, requireAdmin, (req, res) => {
  const { id, userId } = req.params;

  db.run(
    'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
    [id, userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to remove member' });
      }
      res.json({ message: 'Member removed' });
    }
  );
});

// Upload groups via CSV (admin only)
// CSV format: group_name,user_email
router.post('/upload-csv', authenticateToken, requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const groupMap = new Map();
  const errors = [];

  parse(req.file.buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }, (err, records) => {
    if (err) {
      return res.status(400).json({ error: 'Failed to parse CSV: ' + err.message });
    }

    // Group records by group_name
    records.forEach(record => {
      const { group_name, user_email } = record;
      if (!groupMap.has(group_name)) {
        groupMap.set(group_name, []);
      }
      groupMap.get(group_name).push(user_email);
    });

    const groupNames = Array.from(groupMap.keys());
    let processedGroups = 0;
    const createdGroups = [];

    if (groupNames.length === 0) {
      return res.json({ created: 0, errors: [] });
    }

    groupNames.forEach(groupName => {
      // Create or get group
      db.get('SELECT id FROM groups WHERE name = ?', [groupName], (err, existingGroup) => {
        if (err) {
          errors.push({ group: groupName, error: err.message });
          processedGroups++;
          if (processedGroups === groupNames.length) {
            res.json({ created: createdGroups.length, errors });
          }
          return;
        }

        const processMembers = (groupId) => {
          const emails = groupMap.get(groupName);
          let processedMembers = 0;

          emails.forEach(email => {
            db.get('SELECT id FROM users WHERE email = ?', [email], (err, user) => {
              if (err || !user) {
                errors.push({ group: groupName, email, error: 'User not found' });
              } else {
                // Remove from any existing group first
                db.run('DELETE FROM group_members WHERE user_id = ?', [user.id], () => {
                  db.run(
                    'INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)',
                    [groupId, user.id]
                  );
                });
              }

              processedMembers++;
              if (processedMembers === emails.length) {
                processedGroups++;
                if (processedGroups === groupNames.length) {
                  res.json({ created: createdGroups.length, errors });
                }
              }
            });
          });
        };

        if (existingGroup) {
          processMembers(existingGroup.id);
        } else {
          db.run('INSERT INTO groups (name) VALUES (?)', [groupName], function(err) {
            if (err) {
              errors.push({ group: groupName, error: err.message });
              processedGroups++;
              if (processedGroups === groupNames.length) {
                res.json({ created: createdGroups.length, errors });
              }
              return;
            }
            createdGroups.push({ id: this.lastID, name: groupName });
            processMembers(this.lastID);
          });
        }
      });
    });
  });
});

// Delete group (admin only)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM group_members WHERE group_id = ?', [id], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete group members' });
    }

    db.run('DELETE FROM groups WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete group' });
      }
      res.json({ message: 'Group deleted' });
    });
  });
});

module.exports = router;

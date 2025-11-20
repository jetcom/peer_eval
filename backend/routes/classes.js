const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse');
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware to check if user is teacher or admin
const requireTeacherOrAdmin = (req, res, next) => {
  if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Teacher or admin access required' });
  }
  next();
};

// Get all classes (admin sees all, teacher sees their own)
router.get('/', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  let query, params;

  if (req.user.role === 'admin') {
    query = `
      SELECT c.*, (u.first_name || ' ' || u.last_name) as teacher_name, u.email as teacher_email,
        (SELECT COUNT(*) FROM class_enrollments WHERE class_id = c.id) as student_count,
        (SELECT COUNT(*) FROM groups WHERE class_id = c.id) as group_count
      FROM classes c
      JOIN users u ON c.teacher_id = u.id
      ORDER BY c.created_at DESC
    `;
    params = [];
  } else {
    query = `
      SELECT c.*, (u.first_name || ' ' || u.last_name) as teacher_name, u.email as teacher_email,
        (SELECT COUNT(*) FROM class_enrollments WHERE class_id = c.id) as student_count,
        (SELECT COUNT(*) FROM groups WHERE class_id = c.id) as group_count
      FROM classes c
      JOIN users u ON c.teacher_id = u.id
      WHERE c.teacher_id = ?
      ORDER BY c.created_at DESC
    `;
    params = [req.user.id];
  }

  db.all(query, params, (err, classes) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(classes);
  });
});

// Get single class with details
router.get('/:id', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  const { id } = req.params;

  // Check ownership if not admin
  const checkQuery = req.user.role === 'admin'
    ? 'SELECT * FROM classes WHERE id = ?'
    : 'SELECT * FROM classes WHERE id = ? AND teacher_id = ?';
  const checkParams = req.user.role === 'admin' ? [id] : [id, req.user.id];

  db.get(checkQuery, checkParams, (err, classData) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }
    res.json(classData);
  });
});

// Create class
router.post('/', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  const { name, section, semester, num_phases, has_final_evaluation } = req.body;
  const teacher_id = req.user.role === 'admin' && req.body.teacher_id
    ? req.body.teacher_id
    : req.user.id;

  db.run(
    'INSERT INTO classes (name, section, semester, teacher_id, num_phases, has_final_evaluation) VALUES (?, ?, ?, ?, ?, ?)',
    [name, section || null, semester || null, teacher_id, num_phases || 3, has_final_evaluation !== undefined ? has_final_evaluation : 1],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create class' });
      }
      res.json({ id: this.lastID, name, section, semester, teacher_id, num_phases: num_phases || 3, has_final_evaluation: has_final_evaluation !== undefined ? has_final_evaluation : 1 });
    }
  );
});

// Update class
router.put('/:id', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  const { id } = req.params;
  const { name, section, semester, num_phases, has_final_evaluation } = req.body;

  // Check ownership if not admin
  const checkQuery = req.user.role === 'admin'
    ? 'SELECT * FROM classes WHERE id = ?'
    : 'SELECT * FROM classes WHERE id = ? AND teacher_id = ?';
  const checkParams = req.user.role === 'admin' ? [id] : [id, req.user.id];

  db.get(checkQuery, checkParams, (err, classData) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!classData) {
      return res.status(404).json({ error: 'Class not found or access denied' });
    }

    db.run(
      'UPDATE classes SET name = ?, section = ?, semester = ?, num_phases = ?, has_final_evaluation = ? WHERE id = ?',
      [name, section || null, semester || null, num_phases || 3, has_final_evaluation !== undefined ? has_final_evaluation : 1, id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to update class' });
        }
        res.json({ id: parseInt(id), name, section, semester, num_phases: num_phases || 3, has_final_evaluation: has_final_evaluation !== undefined ? has_final_evaluation : 1 });
      }
    );
  });
});

// Delete class
router.delete('/:id', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  const { id } = req.params;

  // Check ownership if not admin
  const checkQuery = req.user.role === 'admin'
    ? 'SELECT * FROM classes WHERE id = ?'
    : 'SELECT * FROM classes WHERE id = ? AND teacher_id = ?';
  const checkParams = req.user.role === 'admin' ? [id] : [id, req.user.id];

  db.get(checkQuery, checkParams, (err, classData) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Delete class and related data
    db.serialize(() => {
      db.run('DELETE FROM class_enrollments WHERE class_id = ?', [id]);
      db.run('DELETE FROM group_members WHERE group_id IN (SELECT id FROM groups WHERE class_id = ?)', [id]);
      db.run('DELETE FROM groups WHERE class_id = ?', [id]);
      db.run('DELETE FROM classes WHERE id = ?', [id], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to delete class' });
        }
        res.json({ message: 'Class deleted' });
      });
    });
  });
});

// Get students in a class
router.get('/:id/students', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  const { id } = req.params;

  db.all(`
    SELECT u.id, u.email, u.first_name, u.last_name, ce.created_at as enrolled_at
    FROM users u
    JOIN class_enrollments ce ON u.id = ce.user_id
    WHERE ce.class_id = ?
    ORDER BY u.last_name, u.first_name
  `, [id], (err, students) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(students);
  });
});

// Add student to class
router.post('/:id/students', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;

  db.run(
    'INSERT OR IGNORE INTO class_enrollments (class_id, user_id) VALUES (?, ?)',
    [id, user_id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to add student' });
      }
      res.json({ message: 'Student added to class' });
    }
  );
});

// Remove student from class
router.delete('/:id/students/:userId', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  const { id, userId } = req.params;

  db.run(
    'DELETE FROM class_enrollments WHERE class_id = ? AND user_id = ?',
    [id, userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to remove student' });
      }
      res.json({ message: 'Student removed from class' });
    }
  );
});

// Upload students via CSV to a class
router.post('/:id/upload-students', authenticateToken, requireTeacherOrAdmin, upload.single('file'), (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Check ownership if teacher
  const checkQuery = req.user.role === 'admin'
    ? 'SELECT * FROM classes WHERE id = ?'
    : 'SELECT * FROM classes WHERE id = ? AND teacher_id = ?';
  const checkParams = req.user.role === 'admin' ? [id] : [id, req.user.id];

  db.get(checkQuery, checkParams, (err, classData) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!classData) {
      return res.status(404).json({ error: 'Class not found or not authorized' });
    }

  const results = [];
  const errors = [];
  const credentials = [];

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
      return res.json({ created: 0, enrolled: 0, errors: [], credentials: [] });
    }

    // Helper to get field value with flexible column names
    const getField = (record, ...names) => {
      for (const name of names) {
        if (record[name] !== undefined) return record[name];
        const lowerName = name.toLowerCase();
        for (const key of Object.keys(record)) {
          if (key.toLowerCase() === lowerName) return record[key];
        }
      }
      return undefined;
    };

    // Pre-process: collect all unique group names and create them first
    const uniqueGroupNames = new Set();
    records.forEach(record => {
      const group_name = getField(record, 'group_name', 'group', 'Group', 'team', 'Team', 'Project Groups', 'Project Group');
      if (group_name && group_name.trim()) {
        uniqueGroupNames.add(group_name.trim());
      }
    });

    // Map to store group name -> group id
    const groupMap = new Map();

    // Function to ensure all groups exist before processing students
    const ensureGroupsExist = (callback) => {
      const groupNames = Array.from(uniqueGroupNames);
      if (groupNames.length === 0) {
        callback();
        return;
      }

      let groupsProcessed = 0;
      groupNames.forEach(groupName => {
        // Check if group exists in this class
        db.get('SELECT id FROM groups WHERE name = ? AND class_id = ?', [groupName, id], (err, existingGroup) => {
          if (existingGroup) {
            groupMap.set(groupName, existingGroup.id);
            groupsProcessed++;
            if (groupsProcessed === groupNames.length) callback();
          } else {
            // Create group
            db.run('INSERT INTO groups (name, class_id) VALUES (?, ?)', [groupName, id], function(err) {
              if (!err && this.lastID) {
                groupMap.set(groupName, this.lastID);
              }
              groupsProcessed++;
              if (groupsProcessed === groupNames.length) callback();
            });
          }
        });
      });
    };

    // First ensure all groups exist, then process students
    ensureGroupsExist(() => {
      records.forEach((record) => {
        // Support flexible column names
        const university_id = getField(record, 'university_id', 'universityID', 'universityid', 'id', 'ID', 'student_id', 'OrgDefinedId', 'Org Defined Id');
        const last_name = getField(record, 'last_name', 'lastname', 'Last', 'last', 'surname', 'family_name', 'Last Name');
        const first_name = getField(record, 'first_name', 'firstname', 'First', 'first', 'given_name', 'First Name');
        const email = getField(record, 'email', 'Email', 'e-mail', 'EMAIL');
        const group_name = getField(record, 'group_name', 'group', 'Group', 'team', 'Team', 'Project Groups', 'Project Group');

      if (!email || !first_name || !last_name) {
        errors.push({ email: email || 'unknown', error: 'Missing required fields (email, first_name, last_name)' });
        processed++;
        if (processed === total) {
          res.json({ created: results.length, enrolled: results.length, errors, credentials });
        }
        return;
      }

      // Check if user exists
      db.get('SELECT id FROM users WHERE email = ?', [email], (err, existingUser) => {
        if (err) {
          errors.push({ email, error: 'Database error' });
          processed++;
          if (processed === total) {
            res.json({ created: results.length, enrolled: results.length, errors, credentials });
          }
          return;
        }

        // Helper function to add user to group (uses pre-created groupMap)
        const addToGroup = (userId, groupName, callback) => {
          if (!groupName || !groupName.trim()) {
            callback();
            return;
          }

          const groupId = groupMap.get(groupName.trim());
          if (groupId) {
            db.run('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, userId], callback);
          } else {
            callback();
          }
        };

        if (existingUser) {
          // User exists, just enroll them
          db.run(
            'INSERT OR IGNORE INTO class_enrollments (class_id, user_id) VALUES (?, ?)',
            [id, existingUser.id],
            function(err) {
              if (err) {
                errors.push({ email, error: 'Failed to enroll existing user' });
                processed++;
                if (processed === total) {
                  res.json({ created: results.filter(r => !r.existing).length, enrolled: results.length, errors, credentials });
                }
                return;
              }

              results.push({ id: existingUser.id, email, first_name, last_name, existing: true });

              // Add to group if specified
              addToGroup(existingUser.id, group_name, () => {
                processed++;
                if (processed === total) {
                  res.json({ created: results.filter(r => !r.existing).length, enrolled: results.length, errors, credentials });
                }
              });
            }
          );
        } else {
          // Create new user and enroll
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
            [email, hashedPassword, first_name, last_name, university_id || null, 'student'],
            function(err) {
              if (err) {
                errors.push({ email, error: err.message.includes('UNIQUE') ? 'Email already exists' : err.message });
                processed++;
                if (processed === total) {
                  res.json({ created: results.filter(r => !r.existing).length, enrolled: results.length, errors, credentials });
                }
                return;
              }

              const userId = this.lastID;

              // Enroll in class
              db.run(
                'INSERT INTO class_enrollments (class_id, user_id) VALUES (?, ?)',
                [id, userId],
                function(err) {
                  if (err) {
                    errors.push({ email, error: 'Created user but failed to enroll' });
                    processed++;
                    if (processed === total) {
                      res.json({ created: results.filter(r => !r.existing).length, enrolled: results.length, errors, credentials });
                    }
                    return;
                  }

                  results.push({ id: userId, email, first_name, last_name, existing: false });
                  credentials.push({ email, password: generatedPassword });

                  // Add to group if specified
                  addToGroup(userId, group_name, () => {
                    processed++;
                    if (processed === total) {
                      res.json({ created: results.filter(r => !r.existing).length, enrolled: results.length, errors, credentials });
                    }
                  });
                }
              );
            }
          );
        }
      });
    });
  });
  });
  });
});

// Get groups in a class with members
router.get('/:id/groups', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  const { id } = req.params;

  db.all(`
    SELECT g.*,
      (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
    FROM groups g
    WHERE g.class_id = ?
    ORDER BY g.name
  `, [id], (err, groups) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (groups.length === 0) {
      return res.json([]);
    }

    // Fetch members for each group
    let processed = 0;
    const results = [];

    groups.forEach(group => {
      db.all(`
        SELECT u.id, u.email, u.first_name, u.last_name
        FROM users u
        JOIN group_members gm ON u.id = gm.user_id
        WHERE gm.group_id = ?
        ORDER BY u.last_name, u.first_name
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

// Get classes for a student (or teacher/admin viewing student dashboard)
router.get('/my/enrolled', authenticateToken, (req, res) => {
  // For teachers/admins, include classes they teach
  const isTeacherOrAdmin = req.user.role === 'teacher' || req.user.role === 'admin';

  let query;
  let params;

  if (isTeacherOrAdmin) {
    // Get classes they teach (and any they're enrolled in)
    query = `
      SELECT DISTINCT c.*, (u.first_name || ' ' || u.last_name) as teacher_name
      FROM classes c
      JOIN users u ON c.teacher_id = u.id
      WHERE c.teacher_id = ? OR c.id IN (
        SELECT class_id FROM class_enrollments WHERE user_id = ?
      )
      ORDER BY c.created_at DESC
    `;
    params = [req.user.id, req.user.id];
  } else {
    // Students only see enrolled classes
    query = `
      SELECT c.*, (u.first_name || ' ' || u.last_name) as teacher_name
      FROM classes c
      JOIN class_enrollments ce ON c.id = ce.class_id
      JOIN users u ON c.teacher_id = u.id
      WHERE ce.user_id = ?
      ORDER BY c.created_at DESC
    `;
    params = [req.user.id];
  }

  db.all(query, params, (err, classes) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(classes);
  });
});

// Reset student password (teacher can reset for students in their class)
router.post('/:id/students/:userId/reset-password', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  const { id, userId } = req.params;
  const { password } = req.body;

  // Check if teacher owns the class (or admin)
  const checkQuery = req.user.role === 'admin'
    ? 'SELECT * FROM classes WHERE id = ?'
    : 'SELECT * FROM classes WHERE id = ? AND teacher_id = ?';
  const checkParams = req.user.role === 'admin' ? [id] : [id, req.user.id];

  db.get(checkQuery, checkParams, (err, classData) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!classData) {
      return res.status(404).json({ error: 'Class not found or not authorized' });
    }

    // Check if student is enrolled in this class
    db.get('SELECT * FROM class_enrollments WHERE class_id = ? AND user_id = ?', [id, userId], (err, enrollment) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!enrollment) {
        return res.status(404).json({ error: 'Student not enrolled in this class' });
      }

      const hashedPassword = bcrypt.hashSync(password, 10);
      db.run('UPDATE users SET password = ?, must_change_password = 1 WHERE id = ?', [hashedPassword, userId], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to reset password' });
        }
        res.json({ message: 'Password reset successfully. Student must change password on next login.' });
      });
    });
  });
});

module.exports = router;

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
// Pass ?include_archived=true to include archived classes
router.get('/', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  const includeArchived = req.query.include_archived === 'true';
  let query, params;

  if (req.user.role === 'admin') {
    query = `
      SELECT c.*, (u.first_name || ' ' || u.last_name) as teacher_name, u.email as teacher_email,
        (SELECT COUNT(*) FROM class_enrollments WHERE class_id = c.id) as student_count,
        (SELECT COUNT(*) FROM groups WHERE class_id = c.id) as group_count
      FROM classes c
      JOIN users u ON c.teacher_id = u.id
      ${includeArchived ? '' : 'WHERE (c.archived IS NULL OR c.archived = 0)'}
      ORDER BY c.archived ASC, c.created_at DESC
    `;
    params = [];
  } else {
    query = `
      SELECT c.*, (u.first_name || ' ' || u.last_name) as teacher_name, u.email as teacher_email,
        (SELECT COUNT(*) FROM class_enrollments WHERE class_id = c.id) as student_count,
        (SELECT COUNT(*) FROM groups WHERE class_id = c.id) as group_count
      FROM classes c
      JOIN users u ON c.teacher_id = u.id
      WHERE c.teacher_id = ? ${includeArchived ? '' : 'AND (c.archived IS NULL OR c.archived = 0)'}
      ORDER BY c.archived ASC, c.created_at DESC
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

// Get instructors for a class
router.get('/:id/instructors', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.all(`
    SELECT u.id, u.first_name, u.last_name, u.email
    FROM users u
    JOIN class_instructors ci ON u.id = ci.user_id
    WHERE ci.class_id = ?
    ORDER BY u.last_name, u.first_name
  `, [id], (err, instructors) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(instructors);
  });
});

// Get class config (accessible by any authenticated user enrolled in the class)
router.get('/:id/config', authenticateToken, (req, res) => {
  const { id } = req.params;

  // Check if user is enrolled in this class or is teacher/admin
  const checkQuery = (req.user.role === 'admin' || req.user.role === 'teacher')
    ? 'SELECT min_comment_words FROM classes WHERE id = ?'
    : `SELECT c.min_comment_words FROM classes c
       JOIN class_enrollments ce ON c.id = ce.class_id
       WHERE c.id = ? AND ce.user_id = ?`;
  const checkParams = (req.user.role === 'admin' || req.user.role === 'teacher')
    ? [id]
    : [id, req.user.id];

  db.get(checkQuery, checkParams, (err, classData) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!classData) {
      return res.status(404).json({ error: 'Class not found or not enrolled' });
    }
    res.json({ min_comment_words: classData.min_comment_words || 0 });
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

    // Get instructors for this class
    db.all(`
      SELECT u.id, u.first_name, u.last_name, u.email
      FROM users u
      JOIN class_instructors ci ON u.id = ci.user_id
      WHERE ci.class_id = ?
      ORDER BY u.last_name, u.first_name
    `, [id], (err, instructors) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      classData.instructors = instructors;

      // Get phase due dates for this class
      db.all(`
        SELECT phase, due_date
        FROM phase_due_dates
        WHERE class_id = ?
      `, [id], (err, phaseDueDates) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        // Convert to object format { phase: due_date }
        const phaseDueDatesObj = {};
        if (phaseDueDates) {
          phaseDueDates.forEach(pd => {
            phaseDueDatesObj[pd.phase] = pd.due_date;
          });
        }
        classData.phase_due_dates = phaseDueDatesObj;

        res.json(classData);
      });
    });
  });
});

// Create class
router.post('/', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  const { name, section, semester, num_phases, has_final_evaluation, due_date_timezone, instructor_ids, phase_due_dates, min_comment_words } = req.body;
  const teacher_id = req.user.role === 'admin' && req.body.teacher_id
    ? req.body.teacher_id
    : req.user.id;

  db.run(
    'INSERT INTO classes (name, section, semester, teacher_id, num_phases, has_final_evaluation, due_date_timezone, min_comment_words) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [name, section || null, semester || null, teacher_id, num_phases || 3, has_final_evaluation !== undefined ? has_final_evaluation : 1, due_date_timezone || null, min_comment_words || 0],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create class' });
      }

      const classId = this.lastID;

      // Save phase due dates if provided
      const savePhaseDueDates = (callback) => {
        if (!phase_due_dates || typeof phase_due_dates !== 'object') {
          callback();
          return;
        }

        const phases = Object.keys(phase_due_dates).filter(p => phase_due_dates[p]);
        if (phases.length === 0) {
          callback();
          return;
        }

        let savedCount = 0;
        phases.forEach(phase => {
          const dueDate = phase_due_dates[phase];
          if (dueDate) {
            db.run(
              'INSERT OR REPLACE INTO phase_due_dates (class_id, phase, due_date) VALUES (?, ?, ?)',
              [classId, parseInt(phase), dueDate],
              () => {
                savedCount++;
                if (savedCount === phases.length) callback();
              }
            );
          } else {
            savedCount++;
            if (savedCount === phases.length) callback();
          }
        });
      };

      // Add instructors to class_instructors table
      const instructorList = instructor_ids && Array.isArray(instructor_ids) ? instructor_ids : (teacher_id ? [teacher_id] : []);

      const sendResponse = () => {
        res.json({
          id: classId,
          name,
          section,
          semester,
          teacher_id,
          num_phases: num_phases || 3,
          has_final_evaluation: has_final_evaluation !== undefined ? has_final_evaluation : 1,
          due_date_timezone: due_date_timezone || null,
          phase_due_dates: phase_due_dates || {}
        });
      };

      savePhaseDueDates(() => {
        if (instructorList.length > 0) {
          let insertedInstructors = 0;
          instructorList.forEach(instructorId => {
            db.run(
              'INSERT OR IGNORE INTO class_instructors (class_id, user_id) VALUES (?, ?)',
              [classId, instructorId],
              () => {
                insertedInstructors++;
                if (insertedInstructors === instructorList.length) {
                  sendResponse();
                }
              }
            );
          });
        } else {
          sendResponse();
        }
      });
    }
  );
});

// Update class
router.put('/:id', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  const { id } = req.params;
  const { name, section, semester, num_phases, has_final_evaluation, due_date_timezone, instructor_ids, phase_due_dates, min_comment_words } = req.body;

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
      'UPDATE classes SET name = ?, section = ?, semester = ?, num_phases = ?, has_final_evaluation = ?, due_date_timezone = ?, min_comment_words = ? WHERE id = ?',
      [name, section || null, semester || null, num_phases || 3, has_final_evaluation !== undefined ? has_final_evaluation : 1, due_date_timezone || null, min_comment_words || 0, id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to update class' });
        }

        // Update phase due dates
        const updatePhaseDueDates = (callback) => {
          if (!phase_due_dates || typeof phase_due_dates !== 'object') {
            callback();
            return;
          }

          // Delete existing phase due dates for this class
          db.run('DELETE FROM phase_due_dates WHERE class_id = ?', [id], (err) => {
            if (err) {
              callback();
              return;
            }

            const phases = Object.keys(phase_due_dates).filter(p => phase_due_dates[p]);
            if (phases.length === 0) {
              callback();
              return;
            }

            let savedCount = 0;
            phases.forEach(phase => {
              const dueDate = phase_due_dates[phase];
              if (dueDate) {
                db.run(
                  'INSERT INTO phase_due_dates (class_id, phase, due_date) VALUES (?, ?, ?)',
                  [id, parseInt(phase), dueDate],
                  () => {
                    savedCount++;
                    if (savedCount === phases.length) callback();
                  }
                );
              } else {
                savedCount++;
                if (savedCount === phases.length) callback();
              }
            });
          });
        };

        const sendResponse = () => {
          res.json({
            id: parseInt(id),
            name,
            section,
            semester,
            num_phases: num_phases || 3,
            has_final_evaluation: has_final_evaluation !== undefined ? has_final_evaluation : 1,
            due_date_timezone: due_date_timezone || null,
            phase_due_dates: phase_due_dates || {}
          });
        };

        updatePhaseDueDates(() => {
          // Update instructors if provided
          if (instructor_ids && Array.isArray(instructor_ids)) {
            // Delete existing instructors
            db.run('DELETE FROM class_instructors WHERE class_id = ?', [id], (err) => {
              if (err) {
                return res.status(500).json({ error: 'Failed to update instructors' });
              }

              // Add new instructors
              if (instructor_ids.length > 0) {
                let insertedInstructors = 0;
                instructor_ids.forEach(instructorId => {
                  db.run(
                    'INSERT INTO class_instructors (class_id, user_id) VALUES (?, ?)',
                    [id, instructorId],
                    () => {
                      insertedInstructors++;
                      if (insertedInstructors === instructor_ids.length) {
                        sendResponse();
                      }
                    }
                  );
                });
              } else {
                sendResponse();
              }
            });
          } else {
            sendResponse();
          }
        });
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

// Archive/unarchive a class
router.put('/:id/archive', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  const { id } = req.params;
  const { archived } = req.body;

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

    db.run('UPDATE classes SET archived = ? WHERE id = ?', [archived ? 1 : 0, id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update class' });
      }
      res.json({ message: archived ? 'Class archived' : 'Class restored', archived: archived ? 1 : 0 });
    });
  });
});

// Get students in a class
router.get('/:id/students', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  const { id } = req.params;

  db.all(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.role, ce.created_at as enrolled_at
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
      const group_name = getField(record, 'group_name', 'group', 'Group', 'team', 'Team', 'Project', 'project', 'Project Groups', 'Project Group');
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
        const group_name = getField(record, 'group_name', 'group', 'Group', 'team', 'Team', 'Project', 'project', 'Project Groups', 'Project Group');

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
        // First removes user from any existing groups in this class, then adds to new group
        const addToGroup = (userId, groupName, callback) => {
          if (!groupName || !groupName.trim()) {
            callback();
            return;
          }

          const groupId = groupMap.get(groupName.trim());
          if (groupId) {
            // Remove from any existing groups in this class first
            db.run(`
              DELETE FROM group_members
              WHERE user_id = ?
              AND group_id IN (SELECT id FROM groups WHERE class_id = ?)
            `, [userId, id], (err) => {
              // Then add to the new group
              db.run('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, userId], callback);
            });
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
        SELECT u.id, u.email, u.first_name, u.last_name, u.role
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

    // If no classes, return empty array
    if (!classes || classes.length === 0) {
      return res.json([]);
    }

    // Fetch instructors and phase due dates for each class
    let completedClasses = 0;
    classes.forEach((classItem, index) => {
      // Get instructors
      db.all(`
        SELECT u.id, u.first_name, u.last_name, u.email
        FROM users u
        JOIN class_instructors ci ON u.id = ci.user_id
        WHERE ci.class_id = ?
        ORDER BY u.last_name, u.first_name
      `, [classItem.id], (err, instructors) => {
        if (!err) {
          classes[index].instructors = instructors || [];
        } else {
          classes[index].instructors = [];
        }

        // Get phase due dates
        db.all(`
          SELECT phase, due_date
          FROM phase_due_dates
          WHERE class_id = ?
        `, [classItem.id], (err, phaseDueDates) => {
          const phaseDueDatesObj = {};
          if (!err && phaseDueDates) {
            phaseDueDates.forEach(pd => {
              phaseDueDatesObj[pd.phase] = pd.due_date;
            });
          }
          classes[index].phase_due_dates = phaseDueDatesObj;

          completedClasses++;
          if (completedClasses === classes.length) {
            res.json(classes);
          }
        });
      });
    });
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

// Get all extensions for a class
router.get('/:id/extensions', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  const { id } = req.params;

  db.all(`
    SELECT se.*, u.first_name, u.last_name, u.email
    FROM student_extensions se
    JOIN users u ON se.user_id = u.id
    WHERE se.class_id = ?
    ORDER BY u.last_name, u.first_name, se.phase
  `, [id], (err, extensions) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(extensions || []);
  });
});

// Create or update an extension
router.post('/:id/extensions', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  const { id } = req.params;
  const { user_id, phase, extended_due_date } = req.body;

  if (!user_id || phase === undefined || !extended_due_date) {
    return res.status(400).json({ error: 'Missing required fields: user_id, phase, extended_due_date' });
  }

  // Use INSERT OR REPLACE for SQLite, ON CONFLICT for PostgreSQL
  db.run(`
    INSERT INTO student_extensions (class_id, user_id, phase, extended_due_date)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(class_id, user_id, phase) DO UPDATE SET extended_due_date = ?
  `, [id, user_id, phase, extended_due_date, extended_due_date], function(err) {
    if (err) {
      // Fallback for SQLite
      db.run(`
        INSERT OR REPLACE INTO student_extensions (class_id, user_id, phase, extended_due_date)
        VALUES (?, ?, ?, ?)
      `, [id, user_id, phase, extended_due_date], function(err2) {
        if (err2) {
          return res.status(500).json({ error: 'Failed to save extension' });
        }
        res.json({ message: 'Extension saved', id: this.lastID });
      });
      return;
    }
    res.json({ message: 'Extension saved', id: this.lastID });
  });
});

// Delete an extension
router.delete('/:id/extensions/:userId/:phase', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  const { id, userId, phase } = req.params;

  db.run(
    'DELETE FROM student_extensions WHERE class_id = ? AND user_id = ? AND phase = ?',
    [id, userId, phase],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete extension' });
      }
      res.json({ message: 'Extension deleted' });
    }
  );
});

// Bulk update extensions (for efficient saving from modal)
router.put('/:id/extensions', authenticateToken, requireTeacherOrAdmin, (req, res) => {
  const { id } = req.params;
  const { extensions } = req.body; // Array of { user_id, phase, extended_due_date }

  if (!Array.isArray(extensions)) {
    return res.status(400).json({ error: 'extensions must be an array' });
  }

  // First, delete all existing extensions for this class
  db.run('DELETE FROM student_extensions WHERE class_id = ?', [id], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to clear existing extensions' });
    }

    // Filter out entries with no due date
    const validExtensions = extensions.filter(e => e.extended_due_date);

    if (validExtensions.length === 0) {
      return res.json({ message: 'Extensions updated', count: 0 });
    }

    let savedCount = 0;
    let hasError = false;

    validExtensions.forEach(ext => {
      db.run(
        'INSERT INTO student_extensions (class_id, user_id, phase, extended_due_date) VALUES (?, ?, ?, ?)',
        [id, ext.user_id, ext.phase, ext.extended_due_date],
        (err) => {
          if (err && !hasError) {
            hasError = true;
            return res.status(500).json({ error: 'Failed to save some extensions' });
          }
          savedCount++;
          if (savedCount === validExtensions.length && !hasError) {
            res.json({ message: 'Extensions updated', count: savedCount });
          }
        }
      );
    });
  });
});

module.exports = router;

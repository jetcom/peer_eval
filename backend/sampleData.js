const bcrypt = require('bcryptjs');

async function createSampleData(db, isPostgres) {
  const hashedPassword = bcrypt.hashSync('sample123', 10);

  return new Promise((resolve, reject) => {
    // Check if sample class already exists
    db.get('SELECT id FROM classes WHERE name = ?', ['Sample Class'], (err, existingClass) => {
      if (err) {
        console.error('Error checking for sample class:', err);
        return resolve(); // Don't fail deployment
      }

      if (existingClass) {
        console.log('Sample class already exists, skipping sample data creation');
        return resolve();
      }

      console.log('Creating sample data...');

      // Create sample students
      const students = [
        { email: 'sample1@example.com', first_name: 'Alice', last_name: 'Johnson' },
        { email: 'sample2@example.com', first_name: 'Bob', last_name: 'Smith' },
        { email: 'sample3@example.com', first_name: 'Carol', last_name: 'Williams' },
        { email: 'sample4@example.com', first_name: 'David', last_name: 'Brown' }
      ];

      const studentIds = [];
      let completed = 0;

      // Insert students
      students.forEach((student, index) => {
        const insertSql = isPostgres
          ? 'INSERT INTO users (email, password, first_name, last_name, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO UPDATE SET first_name = $3 RETURNING id'
          : 'INSERT OR REPLACE INTO users (email, password, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)';

        db.run(insertSql, [student.email, hashedPassword, student.first_name, student.last_name, 'student'], function(err) {
          if (err) {
            console.error('Error creating sample student:', err);
            return;
          }

          // Get the student ID
          if (isPostgres) {
            studentIds[index] = this.lastID;
            completed++;
            if (completed === students.length) {
              createClassAndGroup(db, isPostgres, studentIds, resolve);
            }
          } else {
            // For SQLite, we need to query the ID
            db.get('SELECT id FROM users WHERE email = ?', [student.email], (err, row) => {
              if (err || !row) {
                console.error('Error getting student ID:', err);
                return;
              }
              studentIds[index] = row.id;
              completed++;
              if (completed === students.length) {
                createClassAndGroup(db, isPostgres, studentIds, resolve);
              }
            });
          }
        });
      });
    });
  });
}

function createClassAndGroup(db, isPostgres, studentIds, resolve) {
  // Get the first admin user to be the teacher
  db.get('SELECT id FROM users WHERE role = ? LIMIT 1', ['admin'], (err, admin) => {
    if (err || !admin) {
      console.error('No admin found for sample class:', err);
      return resolve();
    }

    const teacherId = admin.id;

    // Create Sample Class
    db.run(
      'INSERT INTO classes (name, section, semester, teacher_id, num_phases, has_final_evaluation) VALUES (?, ?, ?, ?, ?, ?)',
      ['Sample Class', 'Demo', 'Demo Semester', teacherId, 3, 1],
      function(err) {
        if (err) {
          console.error('Error creating sample class:', err);
          return resolve();
        }

        const classId = this.lastID;
        console.log(`Created Sample Class with ID: ${classId}`);

        // Enroll all students in the class
        let enrollmentCount = 0;
        studentIds.forEach(studentId => {
          db.run(
            isPostgres
              ? 'INSERT INTO class_enrollments (class_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING'
              : 'INSERT OR IGNORE INTO class_enrollments (class_id, user_id) VALUES (?, ?)',
            [classId, studentId],
            (err) => {
              enrollmentCount++;
              if (enrollmentCount === studentIds.length) {
                // Also enroll all teachers and admins so they can view this class
                enrollTeachersAndAdmins(db, isPostgres, classId, () => {
                  createGroup(db, isPostgres, classId, studentIds, resolve);
                });
              }
            }
          );
        });
      }
    );
  });
}

function enrollTeachersAndAdmins(db, isPostgres, classId, callback) {
  // Get all teachers and admins
  db.all('SELECT id FROM users WHERE role IN (?, ?)', ['teacher', 'admin'], (err, users) => {
    if (err || !users || users.length === 0) {
      return callback();
    }

    let enrolled = 0;
    users.forEach(user => {
      db.run(
        isPostgres
          ? 'INSERT INTO class_enrollments (class_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING'
          : 'INSERT OR IGNORE INTO class_enrollments (class_id, user_id) VALUES (?, ?)',
        [classId, user.id],
        () => {
          enrolled++;
          if (enrolled === users.length) {
            callback();
          }
        }
      );
    });
  });
}

function createGroup(db, isPostgres, classId, studentIds, resolve) {
  // Create group
  db.run(
    'INSERT INTO groups (name, class_id) VALUES (?, ?)',
    ['Sample Team Alpha', classId],
    function(err) {
      if (err) {
        console.error('Error creating sample group:', err);
        return resolve();
      }

      const groupId = this.lastID;
      console.log(`Created Sample Team Alpha with ID: ${groupId}`);

      // Add members to group
      let memberCount = 0;
      studentIds.forEach(studentId => {
        db.run(
          isPostgres
            ? 'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING'
            : 'INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)',
          [groupId, studentId],
          () => {
            memberCount++;
            if (memberCount === studentIds.length) {
              createEvaluations(db, isPostgres, studentIds, resolve);
            }
          }
        );
      });
    }
  );
}

function createEvaluations(db, isPostgres, studentIds, resolve) {
  // Sample evaluation data for variety
  const evaluationData = {
    // Phase 1 - Early project
    1: [
      // Alice evaluates everyone
      { evaluator: 0, evaluatee: 0, contribution: 4, communication: 5, reliability: 4, quality_of_work: 4, collaboration: 5, score: 85, comments: 'Good start to the project. Setting up project infrastructure.' },
      { evaluator: 0, evaluatee: 1, contribution: 4, communication: 4, reliability: 4, quality_of_work: 4, collaboration: 4, score: 82, comments: 'Bob has been helpful with initial planning.' },
      { evaluator: 0, evaluatee: 2, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 90, comments: 'Carol is doing excellent work on documentation.' },
      { evaluator: 0, evaluatee: 3, contribution: 3, communication: 3, reliability: 3, quality_of_work: 4, collaboration: 4, score: 75, comments: 'David is still getting up to speed but showing potential.' },
      // Bob evaluates everyone
      { evaluator: 1, evaluatee: 0, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 92, comments: 'Alice is a great team lead.' },
      { evaluator: 1, evaluatee: 1, contribution: 4, communication: 4, reliability: 4, quality_of_work: 4, collaboration: 4, score: 80, comments: 'Working on backend development.' },
      { evaluator: 1, evaluatee: 2, contribution: 4, communication: 5, reliability: 4, quality_of_work: 4, collaboration: 5, score: 85, comments: 'Carol communicates very well.' },
      { evaluator: 1, evaluatee: 3, contribution: 3, communication: 3, reliability: 4, quality_of_work: 3, collaboration: 4, score: 72, comments: 'David needs more guidance but is improving.' },
      // Carol evaluates everyone
      { evaluator: 2, evaluatee: 0, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 95, comments: 'Alice keeps everyone organized and on track.' },
      { evaluator: 2, evaluatee: 1, contribution: 4, communication: 4, reliability: 5, quality_of_work: 4, collaboration: 4, score: 83, comments: 'Bob is reliable and gets his tasks done.' },
      { evaluator: 2, evaluatee: 2, contribution: 4, communication: 4, reliability: 4, quality_of_work: 5, collaboration: 4, score: 88, comments: 'Happy with my documentation progress.' },
      { evaluator: 2, evaluatee: 3, contribution: 3, communication: 3, reliability: 3, quality_of_work: 3, collaboration: 4, score: 70, comments: 'David is learning but needs to participate more.' },
      // David evaluates everyone
      { evaluator: 3, evaluatee: 0, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 90, comments: 'Alice is very helpful and patient.' },
      { evaluator: 3, evaluatee: 1, contribution: 4, communication: 4, reliability: 4, quality_of_work: 4, collaboration: 5, score: 85, comments: 'Bob explains things well.' },
      { evaluator: 3, evaluatee: 2, contribution: 4, communication: 5, reliability: 4, quality_of_work: 5, collaboration: 5, score: 88, comments: 'Carol writes great documentation.' },
      { evaluator: 3, evaluatee: 3, contribution: 3, communication: 3, reliability: 3, quality_of_work: 3, collaboration: 4, score: 70, comments: 'Still learning the codebase.' }
    ],
    // Phase 2 - Mid project
    2: [
      // Alice evaluates everyone
      { evaluator: 0, evaluatee: 0, contribution: 4, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 88, comments: 'Making good progress on features.' },
      { evaluator: 0, evaluatee: 1, contribution: 5, communication: 4, reliability: 5, quality_of_work: 5, collaboration: 4, score: 88, comments: 'Bob has really stepped up his contributions.' },
      { evaluator: 0, evaluatee: 2, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 92, comments: 'Carol continues to excel.' },
      { evaluator: 0, evaluatee: 3, contribution: 4, communication: 4, reliability: 4, quality_of_work: 4, collaboration: 4, score: 82, comments: 'David has improved significantly!' },
      // Bob evaluates everyone
      { evaluator: 1, evaluatee: 0, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 94, comments: 'Alice is doing fantastic work.' },
      { evaluator: 1, evaluatee: 1, contribution: 4, communication: 4, reliability: 5, quality_of_work: 4, collaboration: 4, score: 85, comments: 'Good progress on API development.' },
      { evaluator: 1, evaluatee: 2, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 90, comments: 'Carol keeps documentation up to date.' },
      { evaluator: 1, evaluatee: 3, contribution: 4, communication: 4, reliability: 4, quality_of_work: 4, collaboration: 5, score: 80, comments: 'David is contributing more actively now.' },
      // Carol evaluates everyone
      { evaluator: 2, evaluatee: 0, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 96, comments: 'Alice is an excellent project manager.' },
      { evaluator: 2, evaluatee: 1, contribution: 5, communication: 4, reliability: 5, quality_of_work: 5, collaboration: 4, score: 87, comments: 'Bob delivers quality code.' },
      { evaluator: 2, evaluatee: 2, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 90, comments: 'Keeping all documentation organized.' },
      { evaluator: 2, evaluatee: 3, contribution: 4, communication: 4, reliability: 4, quality_of_work: 4, collaboration: 5, score: 78, comments: 'David is more engaged in meetings.' },
      // David evaluates everyone
      { evaluator: 3, evaluatee: 0, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 92, comments: 'Alice mentors me well.' },
      { evaluator: 3, evaluatee: 1, contribution: 5, communication: 4, reliability: 5, quality_of_work: 5, collaboration: 4, score: 86, comments: 'Bob helped me understand the architecture.' },
      { evaluator: 3, evaluatee: 2, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 90, comments: 'Carol is always willing to help.' },
      { evaluator: 3, evaluatee: 3, contribution: 4, communication: 4, reliability: 4, quality_of_work: 4, collaboration: 4, score: 78, comments: 'Contributing more to the project now.' }
    ],
    // Phase 3 - Late project
    3: [
      // Alice evaluates everyone
      { evaluator: 0, evaluatee: 0, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 90, comments: 'Proud of what we accomplished together.' },
      { evaluator: 0, evaluatee: 1, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 92, comments: 'Bob exceeded expectations in the final push.' },
      { evaluator: 0, evaluatee: 2, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 95, comments: 'Carol was exceptional throughout.' },
      { evaluator: 0, evaluatee: 3, contribution: 5, communication: 4, reliability: 5, quality_of_work: 4, collaboration: 5, score: 88, comments: 'David grew so much during this project!' },
      // Bob evaluates everyone
      { evaluator: 1, evaluatee: 0, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 96, comments: 'Alice was the heart of this team.' },
      { evaluator: 1, evaluatee: 1, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 88, comments: 'Happy with my final contributions.' },
      { evaluator: 1, evaluatee: 2, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 94, comments: 'Carol helped us stay organized.' },
      { evaluator: 1, evaluatee: 3, contribution: 5, communication: 4, reliability: 5, quality_of_work: 4, collaboration: 5, score: 85, comments: 'David really came through at the end.' },
      // Carol evaluates everyone
      { evaluator: 2, evaluatee: 0, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 98, comments: 'Alice led us to success.' },
      { evaluator: 2, evaluatee: 1, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 90, comments: 'Bob was a great teammate.' },
      { evaluator: 2, evaluatee: 2, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 92, comments: 'Satisfied with my work on this project.' },
      { evaluator: 2, evaluatee: 3, contribution: 5, communication: 5, reliability: 4, quality_of_work: 4, collaboration: 5, score: 86, comments: 'David finished strong.' },
      // David evaluates everyone
      { evaluator: 3, evaluatee: 0, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 95, comments: 'Alice is an amazing leader.' },
      { evaluator: 3, evaluatee: 1, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 90, comments: 'Bob taught me a lot.' },
      { evaluator: 3, evaluatee: 2, contribution: 5, communication: 5, reliability: 5, quality_of_work: 5, collaboration: 5, score: 93, comments: 'Carol was wonderful to work with.' },
      { evaluator: 3, evaluatee: 3, contribution: 4, communication: 4, reliability: 5, quality_of_work: 4, collaboration: 5, score: 82, comments: 'Learned so much from this experience.' }
    ]
  };

  // Final comments and points - each person distributes 23 points
  const finalData = [
    // Alice's distribution: 7, 6, 6, 4 = 23
    { evaluator: 0, evaluatee: 0, points: 7, comments: 'I led the project organization and feature implementation. Very proud of our team.' },
    { evaluator: 0, evaluatee: 1, points: 6, comments: 'Bob was a reliable backend developer. His API work was solid.' },
    { evaluator: 0, evaluatee: 2, points: 6, comments: 'Carol kept us organized with excellent documentation throughout.' },
    { evaluator: 0, evaluatee: 3, points: 4, comments: 'David grew significantly. Started slow but finished strong.' },
    // Bob's distribution: 8, 5, 6, 4 = 23
    { evaluator: 1, evaluatee: 0, points: 8, comments: 'Alice was the best project lead I\'ve worked with.' },
    { evaluator: 1, evaluatee: 1, points: 5, comments: 'Did my best on the backend systems.' },
    { evaluator: 1, evaluatee: 2, points: 6, comments: 'Carol\'s documentation saved us many times.' },
    { evaluator: 1, evaluatee: 3, points: 4, comments: 'David improved a lot over the semester.' },
    // Carol's distribution: 7, 6, 6, 4 = 23
    { evaluator: 2, evaluatee: 0, points: 7, comments: 'Alice\'s leadership was crucial to our success.' },
    { evaluator: 2, evaluatee: 1, points: 6, comments: 'Bob delivered quality code consistently.' },
    { evaluator: 2, evaluatee: 2, points: 6, comments: 'Happy with my documentation contributions.' },
    { evaluator: 2, evaluatee: 3, points: 4, comments: 'David showed great improvement and attitude.' },
    // David's distribution: 7, 6, 6, 4 = 23
    { evaluator: 3, evaluatee: 0, points: 7, comments: 'Alice was patient and helped me learn so much.' },
    { evaluator: 3, evaluatee: 1, points: 6, comments: 'Bob was always willing to explain technical concepts.' },
    { evaluator: 3, evaluatee: 2, points: 6, comments: 'Carol\'s documentation helped me understand the project.' },
    { evaluator: 3, evaluatee: 3, points: 4, comments: 'I grew a lot during this project thanks to my teammates.' }
  ];

  // Insert all evaluations
  let totalEvals = 0;
  const totalExpected = 48 + 16; // 16 evals per phase * 3 phases + 16 final comments

  // Insert phase evaluations
  [1, 2, 3].forEach(phase => {
    evaluationData[phase].forEach(evalItem => {
      const sql = isPostgres
        ? `INSERT INTO evaluations (evaluator_id, evaluatee_id, phase, contribution, communication, reliability, quality_of_work, collaboration, score, comments)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (evaluator_id, evaluatee_id, phase) DO UPDATE SET
           contribution = $4, communication = $5, reliability = $6, quality_of_work = $7, collaboration = $8, score = $9, comments = $10`
        : `INSERT OR REPLACE INTO evaluations (evaluator_id, evaluatee_id, phase, contribution, communication, reliability, quality_of_work, collaboration, score, comments)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      db.run(sql, [
        studentIds[evalItem.evaluator],
        studentIds[evalItem.evaluatee],
        phase,
        evalItem.contribution,
        evalItem.communication,
        evalItem.reliability,
        evalItem.quality_of_work,
        evalItem.collaboration,
        evalItem.score,
        evalItem.comments
      ], (err) => {
        if (err) console.error('Error inserting evaluation:', err);
        totalEvals++;
        if (totalEvals === totalExpected) {
          console.log('Sample data creation complete!');
          resolve();
        }
      });
    });
  });

  // Insert final comments
  finalData.forEach(item => {
    const sql = isPostgres
      ? `INSERT INTO final_comments (evaluator_id, evaluatee_id, comments, final_points)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (evaluator_id, evaluatee_id) DO UPDATE SET comments = $3, final_points = $4`
      : `INSERT OR REPLACE INTO final_comments (evaluator_id, evaluatee_id, comments, final_points)
         VALUES (?, ?, ?, ?)`;

    db.run(sql, [
      studentIds[item.evaluator],
      studentIds[item.evaluatee],
      item.comments,
      item.points
    ], (err) => {
      if (err) console.error('Error inserting final comment:', err);
      totalEvals++;
      if (totalEvals === totalExpected) {
        console.log('Sample data creation complete!');
        resolve();
      }
    });
  });
}

module.exports = { createSampleData };

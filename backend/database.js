const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'peereval.db');
const db = new sqlite3.Database(dbPath);

function initializeDatabase() {
  db.serialize(() => {
    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        first_name TEXT NOT NULL DEFAULT '',
        last_name TEXT NOT NULL DEFAULT '',
        university_id TEXT,
        role TEXT DEFAULT 'student',
        must_change_password INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add columns if they don't exist (for existing databases)
    db.run(`ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0`, (err) => {
      // Ignore error if column already exists
    });

    db.run(`ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT ''`, (err) => {
      // Ignore error if column already exists
    });

    db.run(`ALTER TABLE users ADD COLUMN last_name TEXT NOT NULL DEFAULT ''`, (err) => {
      // Ignore error if column already exists
    });

    db.run(`ALTER TABLE users ADD COLUMN university_id TEXT`, (err) => {
      // Ignore error if column already exists
    });

    // Migrate existing name data to first_name/last_name if name column exists
    db.run(`UPDATE users SET first_name = name WHERE first_name = '' AND name IS NOT NULL AND name != ''`, (err) => {
      // Ignore errors
    });

    // Classes table
    db.run(`
      CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        section TEXT,
        semester TEXT,
        teacher_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (teacher_id) REFERENCES users(id)
      )
    `);

    // Class enrollments table (students in classes)
    db.run(`
      CREATE TABLE IF NOT EXISTS class_enrollments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_id) REFERENCES classes(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(class_id, user_id)
      )
    `);

    // Groups table
    db.run(`
      CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        class_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_id) REFERENCES classes(id)
      )
    `);

    // Add class_id column to groups if it doesn't exist (for existing databases)
    db.run(`ALTER TABLE groups ADD COLUMN class_id INTEGER`, (err) => {
      // Ignore error if column already exists
    });

    // Group members table
    db.run(`
      CREATE TABLE IF NOT EXISTS group_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        FOREIGN KEY (group_id) REFERENCES groups(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(group_id, user_id)
      )
    `);

    // Evaluations table
    db.run(`
      CREATE TABLE IF NOT EXISTS evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        evaluator_id INTEGER NOT NULL,
        evaluatee_id INTEGER NOT NULL,
        phase INTEGER NOT NULL,
        contribution INTEGER,
        communication INTEGER,
        reliability INTEGER,
        quality_of_work INTEGER,
        collaboration INTEGER,
        score INTEGER,
        comments TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (evaluator_id) REFERENCES users(id),
        FOREIGN KEY (evaluatee_id) REFERENCES users(id),
        UNIQUE(evaluator_id, evaluatee_id, phase)
      )
    `);

    // Final comments table
    db.run(`
      CREATE TABLE IF NOT EXISTS final_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        evaluator_id INTEGER NOT NULL,
        evaluatee_id INTEGER NOT NULL,
        comments TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (evaluator_id) REFERENCES users(id),
        FOREIGN KEY (evaluatee_id) REFERENCES users(id),
        UNIQUE(evaluator_id, evaluatee_id)
      )
    `);

    // Add protected column if it doesn't exist (for existing databases)
    db.run(`ALTER TABLE users ADD COLUMN protected INTEGER DEFAULT 0`, (err) => {
      // Ignore error if column already exists
    });

    // Create protected admin users
    const bcrypt = require('bcryptjs');
    const hashedPassword = bcrypt.hashSync('changeme', 10);

    // Admin 1: jxbvcs@rit.edu
    db.run(`
      INSERT OR IGNORE INTO users (email, password, first_name, last_name, role, must_change_password, protected)
      VALUES ('jxbvcs@rit.edu', ?, 'Admin', 'JXB', 'admin', 1, 1)
    `, [hashedPassword]);

    // Admin 2: sxjcs@rit.edu
    db.run(`
      INSERT OR IGNORE INTO users (email, password, first_name, last_name, role, must_change_password, protected)
      VALUES ('sxjcs@rit.edu', ?, 'Admin', 'SXJ', 'admin', 1, 1)
    `, [hashedPassword]);
  });

  console.log('Database initialized');
}

module.exports = { db, initializeDatabase };

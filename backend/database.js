const path = require('path');
const { createSampleData } = require('./sampleData');

// Database abstraction layer - supports both SQLite (local) and PostgreSQL (production)
let db;
let isPostgres = false;

if (process.env.DATABASE_URL) {
  // PostgreSQL for production
  const { Pool } = require('pg');
  isPostgres = true;

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  // Wrapper to match sqlite3 interface
  db = {
    run: (sql, params, callback) => {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      // Convert ? placeholders to $1, $2, etc for PostgreSQL
      let paramIndex = 0;
      let pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);

      // Convert INSERT OR IGNORE to PostgreSQL syntax
      pgSql = pgSql.replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO');
      if (sql.match(/INSERT OR IGNORE INTO/i)) {
        pgSql = pgSql.replace(/VALUES\s*\([^)]+\)/i, (match) => match + ' ON CONFLICT DO NOTHING');
      }

      // Add RETURNING id for INSERT statements to get lastID
      if (pgSql.match(/^INSERT/i) && !pgSql.match(/RETURNING/i)) {
        pgSql = pgSql.replace(/;?\s*$/, ' RETURNING id');
      }

      pool.query(pgSql, params || [])
        .then(result => {
          if (callback) {
            // Simulate sqlite3's this.lastID
            const lastID = result.rows && result.rows[0] ? result.rows[0].id : null;
            callback.call({ lastID, changes: result.rowCount }, null);
          }
        })
        .catch(err => {
          if (callback) callback(err);
        });
    },
    get: (sql, params, callback) => {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      let paramIndex = 0;
      const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);

      pool.query(pgSql, params || [])
        .then(result => {
          if (callback) callback(null, result.rows[0]);
        })
        .catch(err => {
          if (callback) callback(err);
        });
    },
    all: (sql, params, callback) => {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      let paramIndex = 0;
      const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);

      pool.query(pgSql, params || [])
        .then(result => {
          if (callback) callback(null, result.rows);
        })
        .catch(err => {
          if (callback) callback(err);
        });
    },
    serialize: (callback) => {
      // PostgreSQL doesn't need serialize, just run the callback
      callback();
    }
  };
} else {
  // SQLite for local development
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, 'peereval.db');
  db = new sqlite3.Database(dbPath);

  // Wrap run to return lastID properly
  const originalRun = db.run.bind(db);
  db.run = function(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    originalRun(sql, params, function(err) {
      if (callback) callback.call(this, err);
    });
  };
}

async function initializeDatabase() {
  const bcrypt = require('bcryptjs');
  const hashedPassword = bcrypt.hashSync('changeme', 10);

  if (isPostgres) {
    // PostgreSQL schema
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
      // Users table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          first_name TEXT NOT NULL DEFAULT '',
          last_name TEXT NOT NULL DEFAULT '',
          university_id TEXT,
          role TEXT DEFAULT 'student',
          must_change_password INTEGER DEFAULT 0,
          protected INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Classes table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS classes (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          section TEXT,
          semester TEXT,
          teacher_id INTEGER NOT NULL REFERENCES users(id),
          num_phases INTEGER DEFAULT 3,
          has_final_evaluation INTEGER DEFAULT 1,
          due_date TEXT,
          due_date_timezone TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Add new columns if they don't exist (for existing databases)
      try {
        await pool.query(`ALTER TABLE classes ADD COLUMN num_phases INTEGER DEFAULT 3`);
      } catch (e) {
        // Column may already exist
      }
      try {
        await pool.query(`ALTER TABLE classes ADD COLUMN has_final_evaluation INTEGER DEFAULT 1`);
      } catch (e) {
        // Column may already exist
      }
      try {
        await pool.query(`ALTER TABLE classes ADD COLUMN due_date TEXT`);
      } catch (e) {
        // Column may already exist
      }
      try {
        await pool.query(`ALTER TABLE classes ADD COLUMN due_date_timezone TEXT`);
      } catch (e) {
        // Column may already exist
      }
      try {
        await pool.query(`ALTER TABLE classes ADD COLUMN archived INTEGER DEFAULT 0`);
      } catch (e) {
        // Column may already exist
      }
      try {
        await pool.query(`ALTER TABLE classes ADD COLUMN min_comment_words INTEGER DEFAULT 0`);
      } catch (e) {
        // Column may already exist
      }

      // Class instructors table (for multiple instructors per class)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS class_instructors (
          id SERIAL PRIMARY KEY,
          class_id INTEGER NOT NULL REFERENCES classes(id),
          user_id INTEGER NOT NULL REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(class_id, user_id)
        )
      `);

      // Class enrollments table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS class_enrollments (
          id SERIAL PRIMARY KEY,
          class_id INTEGER NOT NULL REFERENCES classes(id),
          user_id INTEGER NOT NULL REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(class_id, user_id)
        )
      `);

      // Groups table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS groups (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          class_id INTEGER REFERENCES classes(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Group members table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS group_members (
          id SERIAL PRIMARY KEY,
          group_id INTEGER NOT NULL REFERENCES groups(id),
          user_id INTEGER NOT NULL REFERENCES users(id),
          UNIQUE(group_id, user_id)
        )
      `);

      // Evaluations table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS evaluations (
          id SERIAL PRIMARY KEY,
          evaluator_id INTEGER NOT NULL REFERENCES users(id),
          evaluatee_id INTEGER NOT NULL REFERENCES users(id),
          phase INTEGER NOT NULL,
          contribution INTEGER,
          communication INTEGER,
          reliability INTEGER,
          quality_of_work INTEGER,
          collaboration INTEGER,
          score INTEGER,
          comments TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(evaluator_id, evaluatee_id, phase)
        )
      `);

      // Final comments table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS final_comments (
          id SERIAL PRIMARY KEY,
          evaluator_id INTEGER NOT NULL REFERENCES users(id),
          evaluatee_id INTEGER NOT NULL REFERENCES users(id),
          comments TEXT,
          final_points INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(evaluator_id, evaluatee_id)
        )
      `);

      // Add final_points column if it doesn't exist (for existing databases)
      try {
        await pool.query(`ALTER TABLE final_comments ADD COLUMN final_points INTEGER DEFAULT 0`);
      } catch (e) {
        // Column may already exist
      }

      // Add class_id to evaluations for filtering by class
      try {
        await pool.query(`ALTER TABLE evaluations ADD COLUMN class_id INTEGER REFERENCES classes(id)`);
      } catch (e) {
        // Column may already exist
      }

      // Add class_id to final_comments for filtering by class
      try {
        await pool.query(`ALTER TABLE final_comments ADD COLUMN class_id INTEGER REFERENCES classes(id)`);
      } catch (e) {
        // Column may already exist
      }

      // One-time migration: set class_id = 1 for existing evaluations/final_comments without class_id
      try {
        await pool.query(`UPDATE evaluations SET class_id = 1 WHERE class_id IS NULL`);
        await pool.query(`UPDATE final_comments SET class_id = 1 WHERE class_id IS NULL`);
      } catch (e) {
        // Ignore errors (e.g., if class 1 doesn't exist)
      }

      // Phase due dates table (for per-phase due dates)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS phase_due_dates (
          id SERIAL PRIMARY KEY,
          class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
          phase INTEGER NOT NULL,
          due_date TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(class_id, phase)
        )
      `);

      // Migrate existing due_date from classes to phase_due_dates
      // Apply old due_date to the last phase (final if enabled, otherwise last numbered phase)
      try {
        const classesWithDueDates = await pool.query(`
          SELECT id, due_date, num_phases, has_final_evaluation
          FROM classes
          WHERE due_date IS NOT NULL
        `);
        for (const cls of classesWithDueDates.rows) {
          // Determine the last phase: if has_final_evaluation, use 0 (representing 'final'), otherwise num_phases
          const lastPhase = cls.has_final_evaluation ? 0 : cls.num_phases;
          await pool.query(`
            INSERT INTO phase_due_dates (class_id, phase, due_date)
            VALUES ($1, $2, $3)
            ON CONFLICT (class_id, phase) DO NOTHING
          `, [cls.id, lastPhase, cls.due_date]);
        }
      } catch (e) {
        console.log('Migration of due dates may have already been done or no data to migrate');
      }

      // Student extensions table (for individual student deadline extensions)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS student_extensions (
          id SERIAL PRIMARY KEY,
          class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          phase INTEGER NOT NULL,
          extended_due_date TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(class_id, user_id, phase)
        )
      `);

      // Create protected admin users (using ON CONFLICT for PostgreSQL)
      await pool.query(`
        INSERT INTO users (email, password, first_name, last_name, role, must_change_password, protected)
        VALUES ($1, $2, 'Jeremy', 'Brown', 'admin', 1, 1)
        ON CONFLICT (email) DO NOTHING
      `, ['jxbvcs@rit.edu', hashedPassword]);

      await pool.query(`
        INSERT INTO users (email, password, first_name, last_name, role, must_change_password, protected)
        VALUES ($1, $2, 'Scott', 'Johnson', 'admin', 1, 1)
        ON CONFLICT (email) DO NOTHING
      `, ['sxjcs@rit.edu', hashedPassword]);

      console.log('PostgreSQL database initialized');

      // Create sample data for demo purposes
      await createSampleData(db, isPostgres);
    } catch (err) {
      console.error('Error initializing PostgreSQL database:', err);
    }
  } else {
    // SQLite schema
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
          protected INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Add columns if they don't exist (for existing databases)
      db.run(`ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0`, () => {});
      db.run(`ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT ''`, () => {});
      db.run(`ALTER TABLE users ADD COLUMN last_name TEXT NOT NULL DEFAULT ''`, () => {});
      db.run(`ALTER TABLE users ADD COLUMN university_id TEXT`, () => {});
      db.run(`ALTER TABLE users ADD COLUMN protected INTEGER DEFAULT 0`, () => {});

      // Migrate existing name data
      db.run(`UPDATE users SET first_name = name WHERE first_name = '' AND name IS NOT NULL AND name != ''`, () => {});

      // Classes table
      db.run(`
        CREATE TABLE IF NOT EXISTS classes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          section TEXT,
          semester TEXT,
          teacher_id INTEGER NOT NULL,
          num_phases INTEGER DEFAULT 3,
          has_final_evaluation INTEGER DEFAULT 1,
          due_date TEXT,
          due_date_timezone TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (teacher_id) REFERENCES users(id)
        )
      `);

      // Add new columns if they don't exist (for existing databases)
      db.run(`ALTER TABLE classes ADD COLUMN num_phases INTEGER DEFAULT 3`, () => {});
      db.run(`ALTER TABLE classes ADD COLUMN has_final_evaluation INTEGER DEFAULT 1`, () => {});
      db.run(`ALTER TABLE classes ADD COLUMN due_date TEXT`, () => {});
      db.run(`ALTER TABLE classes ADD COLUMN due_date_timezone TEXT`, () => {});
      db.run(`ALTER TABLE classes ADD COLUMN archived INTEGER DEFAULT 0`, () => {});
      db.run(`ALTER TABLE classes ADD COLUMN min_comment_words INTEGER DEFAULT 0`, () => {});

      // Class instructors table (for multiple instructors per class)
      db.run(`
        CREATE TABLE IF NOT EXISTS class_instructors (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          class_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (class_id) REFERENCES classes(id),
          FOREIGN KEY (user_id) REFERENCES users(id),
          UNIQUE(class_id, user_id)
        )
      `);

      // Class enrollments table
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

      db.run(`ALTER TABLE groups ADD COLUMN class_id INTEGER`, () => {});

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
          final_points INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (evaluator_id) REFERENCES users(id),
          FOREIGN KEY (evaluatee_id) REFERENCES users(id),
          UNIQUE(evaluator_id, evaluatee_id)
        )
      `);

      // Add final_points column if it doesn't exist (for existing databases)
      db.run(`ALTER TABLE final_comments ADD COLUMN final_points INTEGER DEFAULT 0`, () => {});

      // Add class_id to evaluations for filtering by class
      db.run(`ALTER TABLE evaluations ADD COLUMN class_id INTEGER`, () => {});

      // Add class_id to final_comments for filtering by class
      db.run(`ALTER TABLE final_comments ADD COLUMN class_id INTEGER`, () => {});

      // One-time migration: set class_id = 1 for existing evaluations/final_comments without class_id
      db.run(`UPDATE evaluations SET class_id = 1 WHERE class_id IS NULL`, () => {});
      db.run(`UPDATE final_comments SET class_id = 1 WHERE class_id IS NULL`, () => {});

      // Phase due dates table (for per-phase due dates)
      db.run(`
        CREATE TABLE IF NOT EXISTS phase_due_dates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          class_id INTEGER NOT NULL,
          phase INTEGER NOT NULL,
          due_date TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
          UNIQUE(class_id, phase)
        )
      `);

      // Migrate existing due_date from classes to phase_due_dates
      db.all(`
        SELECT id, due_date, num_phases, has_final_evaluation
        FROM classes
        WHERE due_date IS NOT NULL
      `, [], (err, rows) => {
        if (!err && rows) {
          rows.forEach(cls => {
            // Determine the last phase: if has_final_evaluation, use 0 (representing 'final'), otherwise num_phases
            const lastPhase = cls.has_final_evaluation ? 0 : (cls.num_phases || 3);
            db.run(`
              INSERT OR IGNORE INTO phase_due_dates (class_id, phase, due_date)
              VALUES (?, ?, ?)
            `, [cls.id, lastPhase, cls.due_date]);
          });
        }
      });

      // Student extensions table (for individual student deadline extensions)
      db.run(`
        CREATE TABLE IF NOT EXISTS student_extensions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          class_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          phase INTEGER NOT NULL,
          extended_due_date TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(class_id, user_id, phase)
        )
      `);

      // Create protected admin users
      db.run(`
        INSERT OR IGNORE INTO users (email, password, first_name, last_name, role, must_change_password, protected)
        VALUES ('jxbvcs@rit.edu', ?, 'Jeremy', 'Brown', 'admin', 1, 1)
      `, [hashedPassword]);

      db.run(`
        INSERT OR IGNORE INTO users (email, password, first_name, last_name, role, must_change_password, protected)
        VALUES ('sxjcs@rit.edu', ?, 'Scott', 'Johnson', 'admin', 1, 1)
      `, [hashedPassword]);

      // Update existing admin names (in case they already exist)
      db.run(`UPDATE users SET first_name = 'Jeremy', last_name = 'Brown' WHERE email = 'jxbvcs@rit.edu'`);
      db.run(`UPDATE users SET first_name = 'Scott', last_name = 'Johnson' WHERE email = 'sxjcs@rit.edu'`);
    });

    console.log('SQLite database initialized');

    // Create sample data for demo purposes (with delay to ensure tables exist)
    setTimeout(() => {
      createSampleData(db, isPostgres);
    }, 1000);
  }
}

module.exports = { db, initializeDatabase, isPostgres };

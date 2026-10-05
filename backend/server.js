const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const groupRoutes = require('./routes/groups');
const evaluationRoutes = require('./routes/evaluations');
const ssoRoutes = require('./routes/sso');
const classRoutes = require('./routes/classes');
const templateRoutes = require('./routes/templates');
const assignmentRoutes = require('./routes/assignments');
const notificationRoutes = require('./routes/notifications');
const nudgeTemplateRoutes = require('./routes/nudgeTemplates');
const reminderScheduleRoutes = require('./routes/reminderSchedules');
const activityLogRoutes = require('./routes/activityLogs');
const paperReviewRoutes = require('./routes/paperReview');
const { initializeDatabase } = require('./database');
const { startScheduler } = require('./services/reminderScheduler');

const app = express();
const PORT = process.env.PORT || 3001;

// Railway (and most hosts) sit behind a reverse proxy; needed so rate
// limiting sees the real client IP from X-Forwarded-For.
app.set('trust proxy', 1);

// ============================================
// KILL SWITCH
// Set MAINTENANCE_MODE=true in the Railway service variables to take the
// whole app offline (Railway redeploys automatically when a variable
// changes). Every request gets a 503; nothing else runs. The health check
// stays up so the platform doesn't mark the service as crashed.
// ============================================
const MAINTENANCE = /^(1|true|yes|on)$/i.test(process.env.MAINTENANCE_MODE || '');
if (MAINTENANCE) {
  console.warn('MAINTENANCE_MODE is on: all requests will receive 503');
  const maintenanceHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>PeerEval is temporarily offline</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;color:#1a1a1a}
  main{max-width:480px;padding:32px;text-align:center}
  h1{font-size:1.5rem;margin:0 0 12px}p{margin:0;color:#555;line-height:1.5}
  @media (prefers-color-scheme:dark){body{background:#111;color:#eee}p{color:#aaa}}
</style></head><body><main>
<h1>PeerEval is temporarily offline</h1>
<p>We're doing some maintenance. Please check back shortly.</p>
</main></body></html>`;
  app.use((req, res) => {
    if (req.path === '/api/health') return res.json({ status: 'maintenance' });
    res.set('Retry-After', '600');
    if (req.path.startsWith('/api/')) {
      return res.status(503).json({ error: 'PeerEval is temporarily offline for maintenance.' });
    }
    res.status(503).type('html').send(maintenanceHtml);
  });
}

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? true  // Allow same-origin in production
    : process.env.FRONTEND_URL || 'http://localhost:3002',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session for passport (required for SAML)
app.use(session({
  secret: process.env.SESSION_SECRET || 'peer-eval-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
  }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Initialize database
initializeDatabase();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/sso', ssoRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/nudge-templates', nudgeTemplateRoutes);
app.use('/api/reminder-schedules', reminderScheduleRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/paper-review', paperReviewRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve frontend in non-development environments (production, beta, etc.)
if (process.env.NODE_ENV !== 'development') {
  const frontendBuildPath = path.join(__dirname, '../frontend/build');
  app.use(express.static(frontendBuildPath));

  // Handle client-side routing
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Start the reminder scheduler (production only — avoid duplicate jobs from beta/staging)
  if (MAINTENANCE) {
    console.log('Scheduler disabled: MAINTENANCE_MODE is on');
  } else if (process.env.NODE_ENV === 'production') {
    startScheduler();
  } else {
    console.log(`Scheduler disabled for NODE_ENV=${process.env.NODE_ENV}`);
  }
});

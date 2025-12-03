const express = require('express');
const passport = require('passport');
const { Strategy: SamlStrategy } = require('@node-saml/passport-saml');
const jwt = require('jsonwebtoken');
const { db } = require('../database');
const { JWT_SECRET } = require('../middleware/auth');
const samlConfig = require('../config/saml');
const { logActivityAsync, ACTIONS } = require('../services/activityLogger');

const router = express.Router();

// Only set up SAML if enabled
if (samlConfig.enabled) {
  // Configure SAML Strategy
  const samlStrategy = new SamlStrategy(
    {
      callbackUrl: samlConfig.callbackUrl,
      entryPoint: samlConfig.entryPoint,
      issuer: samlConfig.issuer,
      cert: samlConfig.cert,
      identifierFormat: null,
      acceptedClockSkewMs: -1
    },
    (profile, done) => {
      // Extract user info from SAML response
      const email = profile[samlConfig.attributeMapping.email] ||
                    profile.email ||
                    profile.nameID;

      const displayName = profile[samlConfig.attributeMapping.displayName] ||
                          profile.displayName;

      const firstName = profile[samlConfig.attributeMapping.firstName] ||
                        profile.givenName ||
                        '';

      const lastName = profile[samlConfig.attributeMapping.lastName] ||
                       profile.sn ||
                       '';

      const name = displayName || `${firstName} ${lastName}`.trim() || email.split('@')[0];

      return done(null, {
        email: email,
        name: name,
        uid: profile[samlConfig.attributeMapping.uid] || email
      });
    },
    (profile, done) => {
      // Logout callback
      return done(null, profile);
    }
  );

  passport.use('saml', samlStrategy);
}

// Check if SSO is enabled
router.get('/status', (req, res) => {
  res.json({
    enabled: samlConfig.enabled,
    issuer: samlConfig.issuer
  });
});

// Initiate SSO login
router.get('/login', (req, res, next) => {
  if (!samlConfig.enabled) {
    return res.status(400).json({ error: 'SSO is not enabled' });
  }
  passport.authenticate('saml')(req, res, next);
});

// SSO callback (where RIT sends the SAML response)
router.post('/callback',
  (req, res, next) => {
    if (!samlConfig.enabled) {
      return res.status(400).json({ error: 'SSO is not enabled' });
    }
    passport.authenticate('saml', { session: false })(req, res, next);
  },
  async (req, res) => {
    try {
      const { email, name } = req.user;

      // Find or create user
      db.get('SELECT * FROM users WHERE email = ?', [email], (err, existingUser) => {
        if (err) {
          console.error('Database error:', err);
          return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3002'}/login?error=database`);
        }

        const handleLogin = (user) => {
          // Generate JWT token
          const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.name },
            JWT_SECRET,
            { expiresIn: '24h' }
          );

          // Log SSO login
          logActivityAsync({
            userId: user.id,
            action: ACTIONS.LOGIN_SSO,
            req
          });

          // Redirect to frontend with token
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
          res.redirect(`${frontendUrl}/sso-callback?token=${token}`);
        };

        if (existingUser) {
          // Update name if changed
          if (existingUser.name !== name) {
            db.run('UPDATE users SET name = ? WHERE id = ?', [name, existingUser.id]);
          }
          handleLogin(existingUser);
        } else {
          // Create new user (as student by default)
          db.run(
            'INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)',
            [email, 'SSO_USER', name, 'student'],
            function(err) {
              if (err) {
                console.error('Error creating user:', err);
                return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3002'}/login?error=create_user`);
              }
              handleLogin({ id: this.lastID, email, name, role: 'student' });
            }
          );
        }
      });
    } catch (error) {
      console.error('SSO callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3002'}/login?error=sso_failed`);
    }
  }
);

// Get SP metadata (for RIT IT to configure their IdP)
router.get('/metadata', (req, res) => {
  if (!samlConfig.enabled) {
    return res.status(400).json({ error: 'SSO is not enabled' });
  }

  const strategy = passport._strategy('saml');
  if (strategy && strategy.generateServiceProviderMetadata) {
    res.type('application/xml');
    res.send(strategy.generateServiceProviderMetadata());
  } else {
    res.status(500).json({ error: 'Could not generate metadata' });
  }
});

module.exports = router;

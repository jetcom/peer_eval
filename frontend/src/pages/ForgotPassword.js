import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useTheme } from '../contexts/ThemeContext';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const { darkMode, toggleDarkMode } = useTheme();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await axios.post('/api/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h1 style={{ margin: 0 }}>Check Your Email</h1>
            <button
              type="button"
              onClick={toggleDarkMode}
              style={{
                background: darkMode ? '#3498db' : '#2c3e50',
                color: 'white',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              {darkMode ? 'Light' : 'Dark'}
            </button>
          </div>

          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: darkMode ? '#1e3a5f' : '#e8f4fc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              fontSize: '24px'
            }}>
              ✉️
            </div>
            <p style={{ color: darkMode ? '#a0a0a0' : '#666', marginBottom: '20px' }}>
              If an account exists for <strong>{email}</strong>, you'll receive an email with a link to reset your password.
            </p>
            <p style={{ color: darkMode ? '#888' : '#888', fontSize: '0.9rem' }}>
              The link will expire in 1 hour.
            </p>
          </div>

          <Link
            to="/login"
            className="btn btn-primary"
            style={{ width: '100%', display: 'block', textAlign: 'center', textDecoration: 'none' }}
          >
            Return to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1 style={{ margin: 0 }}>Forgot Password</h1>
          <button
            type="button"
            onClick={toggleDarkMode}
            style={{
              background: darkMode ? '#3498db' : '#2c3e50',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            {darkMode ? 'Light' : 'Dark'}
          </button>
        </div>

        <p style={{ color: darkMode ? '#a0a0a0' : '#666', marginBottom: '20px' }}>
          Enter your email address and we'll send you a link to reset your password.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              autoFocus
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center', borderTop: `1px solid ${darkMode ? '#2d4a6f' : '#e0e0e0'}`, paddingTop: '20px' }}>
          <Link to="/login" style={{ color: darkMode ? '#268bd2' : '#3498db', textDecoration: 'none', fontSize: '0.9rem' }}>
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;

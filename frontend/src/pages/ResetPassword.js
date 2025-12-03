import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useTheme } from '../contexts/ThemeContext';

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const { darkMode, toggleDarkMode } = useTheme();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await axios.post('/api/auth/reset-password', { token, newPassword: password });
      setSuccess(true);
      // Redirect to login after 3 seconds
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  // No token provided
  if (!token) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h1 style={{ marginBottom: '20px' }}>Invalid Link</h1>
          <p style={{ color: darkMode ? '#a0a0a0' : '#666', marginBottom: '20px' }}>
            This password reset link is invalid or has expired.
          </p>
          <Link
            to="/forgot-password"
            className="btn btn-primary"
            style={{ width: '100%', display: 'block', textAlign: 'center', textDecoration: 'none' }}
          >
            Request New Reset Link
          </Link>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h1 style={{ margin: 0 }}>Password Reset!</h1>
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
              background: darkMode ? '#1e3f2e' : '#e8fcf0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              fontSize: '24px'
            }}>
              ✓
            </div>
            <p style={{ color: darkMode ? '#a0a0a0' : '#666', marginBottom: '20px' }}>
              Your password has been reset successfully.
            </p>
            <p style={{ color: darkMode ? '#888' : '#888', fontSize: '0.9rem' }}>
              Redirecting to login...
            </p>
          </div>

          <Link
            to="/login"
            className="btn btn-primary"
            style={{ width: '100%', display: 'block', textAlign: 'center', textDecoration: 'none' }}
          >
            Log In Now
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1 style={{ margin: 0 }}>Reset Password</h1>
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
          Enter your new password below.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="At least 6 characters"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Enter password again"
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Resetting...' : 'Reset Password'}
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

export default ResetPassword;

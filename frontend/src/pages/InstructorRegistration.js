import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useTheme } from '../contexts/ThemeContext';

function InstructorRegistration() {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    university: '',
    department: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { darkMode, toggleDarkMode } = useTheme();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await axios.post('/api/auth/register-instructor', {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        university: formData.university,
        department: formData.department,
        password: formData.password
      });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '20px' }}>&#9989;</div>
            <h2 style={{ marginTop: 0, marginBottom: '15px' }}>Registration Submitted</h2>
            <p style={{ marginBottom: '20px', color: darkMode ? '#93a1a1' : '#666' }}>
              Your instructor account request has been submitted successfully.
              An administrator will review and approve your account.
            </p>
            <p style={{ marginBottom: '25px', color: darkMode ? '#93a1a1' : '#666' }}>
              You will be able to log in once your account is approved.
            </p>
            <Link to="/login" className="btn btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>
              Return to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card" style={{ maxWidth: '600px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Instructor Registration</h1>
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

        <p style={{ marginBottom: '20px', color: darkMode ? '#93a1a1' : '#666', fontSize: '0.9rem' }}>
          Register for an instructor account. Your request will be reviewed by an administrator.
        </p>

        <div style={{
          padding: '12px 15px',
          marginBottom: '20px',
          backgroundColor: darkMode ? '#1a3a4a' : '#eaf4fc',
          border: `1px solid ${darkMode ? '#2a5a6a' : '#b8daff'}`,
          borderRadius: '6px',
          fontSize: '0.85rem',
          color: darkMode ? '#93a1a1' : '#555'
        }}>
          <strong>Are you a student?</strong> You don't need to register here. Your instructor will add you to the class.
          Go to <Link to="/login" style={{ color: darkMode ? '#268bd2' : '#3498db' }}>Login</Link> and
          use "Forgot Password" if you need to set up your password.
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>First Name</label>
              <input
                type="text"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Last Name</label>
              <input
                type="text"
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>University / School</label>
            <input
              type="text"
              name="university"
              value={formData.university}
              onChange={handleChange}
              required
              placeholder="e.g., Rochester Institute of Technology"
            />
          </div>

          <div className="form-group">
            <label>Department</label>
            <input
              type="text"
              name="department"
              value={formData.department}
              onChange={handleChange}
              required
              placeholder="e.g., Computer Science"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label>Confirm Password</label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
            />
          </div>

          {error && <p className="error">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '10px' }}
            disabled={loading}
          >
            {loading ? 'Submitting...' : 'Request Instructor Access'}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <Link to="/login" style={{ color: darkMode ? '#268bd2' : '#3498db', textDecoration: 'none' }}>
            Already have an account? Login
          </Link>
        </div>
      </div>
    </div>
  );
}

export default InstructorRegistration;

import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

function SSOCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');

    if (token) {
      // Store token and set up axios
      localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      // Get user info and redirect
      axios.get('/api/auth/me')
        .then(response => {
          // Force a page reload to update auth context
          window.location.href = response.data.role === 'admin' ? '/admin' : '/dashboard';
        })
        .catch(() => {
          localStorage.removeItem('token');
          navigate('/login?error=invalid_token');
        });
    } else {
      navigate('/login?error=no_token');
    }
  }, [searchParams, navigate, login]);

  return (
    <div className="loading">
      Completing SSO login...
    </div>
  );
}

export default SSOCallback;

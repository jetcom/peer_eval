import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import Evaluation from './pages/Evaluation';
import AssignmentEvaluation from './pages/AssignmentEvaluation';
import SSOCallback from './pages/SSOCallback';
import InstructorRegistration from './pages/InstructorRegistration';
import PaperSubmission from './pages/PaperSubmission';
import PaperReview from './pages/PaperReview';
import PaperFeedback from './pages/PaperFeedback';
import './App.css';

function PrivateRoute({ children, adminOnly = false, teacherOnly = false }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/dashboard" />;
  }

  if (teacherOnly && user.role !== 'teacher' && user.role !== 'admin') {
    return <Navigate to="/dashboard" />;
  }

  return children;
}

function RoleBasedRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (user.role === 'admin') {
    return <Navigate to="/admin" />;
  }

  if (user.role === 'teacher') {
    return <Navigate to="/teacher" />;
  }

  return <Navigate to="/dashboard" />;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <div className="app">
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/register-instructor" element={<InstructorRegistration />} />
              <Route path="/sso-callback" element={<SSOCallback />} />
              <Route
                path="/dashboard"
                element={
                  <PrivateRoute>
                    <Dashboard />
                  </PrivateRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <PrivateRoute adminOnly>
                    <AdminDashboard />
                  </PrivateRoute>
                }
              />
              <Route
                path="/teacher"
                element={
                  <PrivateRoute teacherOnly>
                    <TeacherDashboard />
                  </PrivateRoute>
                }
              />
              <Route
                path="/evaluate/:phase"
                element={
                  <PrivateRoute>
                    <Evaluation />
                  </PrivateRoute>
                }
              />
              <Route
                path="/evaluate-assignment/:assignmentId/:evalTypeId"
                element={
                  <PrivateRoute>
                    <AssignmentEvaluation />
                  </PrivateRoute>
                }
              />
              <Route
                path="/paper-review/:roundId/submit"
                element={
                  <PrivateRoute>
                    <PaperSubmission />
                  </PrivateRoute>
                }
              />
              <Route
                path="/paper-review/:roundId/review"
                element={
                  <PrivateRoute>
                    <PaperReview />
                  </PrivateRoute>
                }
              />
              <Route
                path="/paper-review/:roundId/feedback"
                element={
                  <PrivateRoute>
                    <PaperFeedback />
                  </PrivateRoute>
                }
              />
              <Route path="/home" element={<RoleBasedRedirect />} />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;

import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

function Landing() {
  const { darkMode, toggleDarkMode } = useTheme();

  const features = [
    {
      icon: '📊',
      title: 'Multi-Phase Evaluations',
      description: 'Configure 1-5 evaluation phases per semester. Perfect for tracking student contribution throughout the project lifecycle.'
    },
    {
      icon: '📝',
      title: 'Comprehensive Rubrics',
      description: '5-point Likert scale covering Contribution, Communication, Reliability, Quality of Work, and Collaboration.'
    },
    {
      icon: '💾',
      title: 'Auto-Save',
      description: 'Evaluations save automatically as students type. No lost work, no frustration.'
    },
    {
      icon: '📈',
      title: 'Visual Progress Tracking',
      description: 'Heat maps and progress dashboards show completion status at a glance.'
    },
    {
      icon: '⏰',
      title: 'Deadline Management',
      description: 'Set per-phase deadlines with timezone support. Past-due phases lock automatically.'
    },
    {
      icon: '📁',
      title: 'Bulk Import',
      description: 'Import students and groups via CSV. Set up your entire class in seconds.'
    },
    {
      icon: '🌙',
      title: 'Dark Mode',
      description: 'Modern dark theme for comfortable viewing in any lighting condition.'
    },
    {
      icon: '👥',
      title: 'Role-Based Access',
      description: 'Separate dashboards for students, teachers, and admins. Everyone sees exactly what they need.'
    },
    {
      icon: '📋',
      title: 'Detailed Reports',
      description: 'Export evaluation results and analytics. Identify team dynamics and individual contributions.'
    }
  ];

  return (
    <div className={`landing-page ${darkMode ? 'dark' : ''}`}>
      {/* Navigation */}
      <nav className="landing-nav">
        <div className="landing-nav-content">
          <div className="landing-logo">
            <span className="landing-logo-icon">📊</span>
            <span className="landing-logo-text">PeerEval</span>
          </div>
          <div className="landing-nav-actions">
            <a href="https://peerevals.app/login" className="landing-login-link">
              Login
            </a>
            <button className="theme-toggle" onClick={toggleDarkMode}>
              {darkMode ? '☀️ Light' : '🌙 Dark'}
            </button>
            <a href="https://peerevals.app/register-instructor" className="landing-btn landing-btn-primary">
              Get Started
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="landing-hero-content">
          <h1 className="landing-hero-title">
            Peer Evaluations
            <span className="landing-hero-highlight"> Made Simple</span>
          </h1>
          <p className="landing-hero-subtitle">
            A comprehensive peer evaluation platform designed for educators.
            Track team contributions, gather meaningful feedback, and foster accountability
            in group projects.
          </p>
          <div className="landing-hero-actions">
            <a href="https://peerevals.app/register-instructor" className="landing-btn landing-btn-primary landing-btn-lg">
              Get Started Free
            </a>
            <a href="#features" className="landing-btn landing-btn-outline landing-btn-lg">
              Learn More
            </a>
          </div>
          <div className="landing-hero-stats">
            <div className="landing-stat">
              <span className="landing-stat-number">5</span>
              <span className="landing-stat-label">Evaluation Phases</span>
            </div>
            <div className="landing-stat">
              <span className="landing-stat-number">100%</span>
              <span className="landing-stat-label">Auto-Save</span>
            </div>
            <div className="landing-stat">
              <span className="landing-stat-number">CSV</span>
              <span className="landing-stat-label">Bulk Import</span>
            </div>
          </div>
        </div>
        <div className="landing-hero-image">
          <div className="landing-screenshot-container">
            <div className="landing-screenshot-header">
              <span className="landing-screenshot-dot red"></span>
              <span className="landing-screenshot-dot yellow"></span>
              <span className="landing-screenshot-dot green"></span>
            </div>
            <div className="landing-screenshot-content">
              <div className="landing-screenshot-sidebar">
                <div className="landing-screenshot-menu-item active"></div>
                <div className="landing-screenshot-menu-item"></div>
                <div className="landing-screenshot-menu-item"></div>
                <div className="landing-screenshot-menu-item"></div>
              </div>
              <div className="landing-screenshot-main">
                <div className="landing-screenshot-card">
                  <div className="landing-screenshot-card-header"></div>
                  <div className="landing-screenshot-progress">
                    <div className="landing-screenshot-progress-bar" style={{width: '75%'}}></div>
                  </div>
                  <div className="landing-screenshot-rows">
                    <div className="landing-screenshot-row">
                      <div className="landing-screenshot-avatar"></div>
                      <div className="landing-screenshot-text"></div>
                      <div className="landing-screenshot-badge complete"></div>
                    </div>
                    <div className="landing-screenshot-row">
                      <div className="landing-screenshot-avatar"></div>
                      <div className="landing-screenshot-text"></div>
                      <div className="landing-screenshot-badge complete"></div>
                    </div>
                    <div className="landing-screenshot-row">
                      <div className="landing-screenshot-avatar"></div>
                      <div className="landing-screenshot-text"></div>
                      <div className="landing-screenshot-badge pending"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="landing-features">
        <div className="landing-section-content">
          <h2 className="landing-section-title">Everything You Need</h2>
          <p className="landing-section-subtitle">
            Powerful features designed to make peer evaluations effortless for instructors and students alike.
          </p>
          <div className="landing-features-grid">
            {features.map((feature, index) => (
              <div key={index} className="landing-feature-card">
                <div className="landing-feature-icon">{feature.icon}</div>
                <h3 className="landing-feature-title">{feature.title}</h3>
                <p className="landing-feature-description">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="landing-how-it-works">
        <div className="landing-section-content">
          <h2 className="landing-section-title">How It Works</h2>
          <p className="landing-section-subtitle">
            Get started in minutes with our simple setup process.
          </p>
          <div className="landing-steps">
            <div className="landing-step">
              <div className="landing-step-number">1</div>
              <h3 className="landing-step-title">Create Your Class</h3>
              <p className="landing-step-description">
                Set up your class with evaluation phases, deadlines, and rubric criteria. Use our templates or customize your own.
              </p>
            </div>
            <div className="landing-step-connector"></div>
            <div className="landing-step">
              <div className="landing-step-number">2</div>
              <h3 className="landing-step-title">Import Students</h3>
              <p className="landing-step-description">
                Upload your roster via CSV or add students manually. Organize them into project groups.
              </p>
            </div>
            <div className="landing-step-connector"></div>
            <div className="landing-step">
              <div className="landing-step-number">3</div>
              <h3 className="landing-step-title">Collect Evaluations</h3>
              <p className="landing-step-description">
                Students evaluate their teammates on contribution, communication, and more. Auto-save ensures no work is lost.
              </p>
            </div>
            <div className="landing-step-connector"></div>
            <div className="landing-step">
              <div className="landing-step-number">4</div>
              <h3 className="landing-step-title">Review Results</h3>
              <p className="landing-step-description">
                View comprehensive reports, identify patterns, and export data for grading purposes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Screenshot Gallery */}
      <section className="landing-screenshots">
        <div className="landing-section-content">
          <h2 className="landing-section-title">See It In Action</h2>
          <p className="landing-section-subtitle">
            Intuitive interfaces for both instructors and students.
          </p>
          <div className="landing-screenshot-gallery">
            <div className="landing-gallery-item">
              <div className="landing-gallery-preview admin">
                <div className="landing-gallery-mock-header">Admin Dashboard</div>
                <div className="landing-gallery-mock-stats">
                  <div className="landing-gallery-mock-stat"></div>
                  <div className="landing-gallery-mock-stat"></div>
                  <div className="landing-gallery-mock-stat"></div>
                  <div className="landing-gallery-mock-stat"></div>
                </div>
                <div className="landing-gallery-mock-tabs">
                  <div className="landing-gallery-mock-tab active"></div>
                  <div className="landing-gallery-mock-tab"></div>
                  <div className="landing-gallery-mock-tab"></div>
                </div>
                <div className="landing-gallery-mock-table">
                  <div className="landing-gallery-mock-row"></div>
                  <div className="landing-gallery-mock-row"></div>
                  <div className="landing-gallery-mock-row"></div>
                </div>
              </div>
              <h3>Admin Dashboard</h3>
              <p>Track progress, manage groups, and generate reports from a centralized dashboard.</p>
            </div>
            <div className="landing-gallery-item">
              <div className="landing-gallery-preview student">
                <div className="landing-gallery-mock-header">Student View</div>
                <div className="landing-gallery-mock-phases">
                  <div className="landing-gallery-mock-phase complete"></div>
                  <div className="landing-gallery-mock-phase complete"></div>
                  <div className="landing-gallery-mock-phase active"></div>
                  <div className="landing-gallery-mock-phase"></div>
                </div>
                <div className="landing-gallery-mock-eval">
                  <div className="landing-gallery-mock-member"></div>
                  <div className="landing-gallery-mock-likert">
                    <div className="landing-gallery-mock-dot"></div>
                    <div className="landing-gallery-mock-dot"></div>
                    <div className="landing-gallery-mock-dot selected"></div>
                    <div className="landing-gallery-mock-dot"></div>
                    <div className="landing-gallery-mock-dot"></div>
                  </div>
                </div>
              </div>
              <h3>Student Evaluation</h3>
              <p>Clean, intuitive interface for students to rate teammates and provide feedback.</p>
            </div>
            <div className="landing-gallery-item">
              <div className="landing-gallery-preview reports">
                <div className="landing-gallery-mock-header">Reports</div>
                <div className="landing-gallery-mock-chart">
                  <div className="landing-gallery-mock-bar" style={{height: '60%'}}></div>
                  <div className="landing-gallery-mock-bar" style={{height: '80%'}}></div>
                  <div className="landing-gallery-mock-bar" style={{height: '45%'}}></div>
                  <div className="landing-gallery-mock-bar" style={{height: '90%'}}></div>
                  <div className="landing-gallery-mock-bar" style={{height: '70%'}}></div>
                </div>
                <div className="landing-gallery-mock-legend">
                  <div className="landing-gallery-mock-legend-item"></div>
                  <div className="landing-gallery-mock-legend-item"></div>
                </div>
              </div>
              <h3>Detailed Reports</h3>
              <p>Visualize team dynamics and individual contributions with comprehensive analytics.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial/Use Case Section */}
      <section className="landing-use-cases">
        <div className="landing-section-content">
          <h2 className="landing-section-title">Perfect For</h2>
          <div className="landing-use-cases-grid">
            <div className="landing-use-case">
              <div className="landing-use-case-icon">🎓</div>
              <h3>University Courses</h3>
              <p>Ideal for capstone projects, group assignments, and semester-long team collaborations.</p>
            </div>
            <div className="landing-use-case">
              <div className="landing-use-case-icon">💼</div>
              <h3>Professional Programs</h3>
              <p>MBA programs, executive education, and professional development courses with team components.</p>
            </div>
            <div className="landing-use-case">
              <div className="landing-use-case-icon">🔬</div>
              <h3>Research Teams</h3>
              <p>Lab groups and research teams looking to track contributions and foster accountability.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="landing-cta">
        <div className="landing-cta-content">
          <h2>Ready to Transform Your Peer Evaluations?</h2>
          <p>Join educators who are making team assessments more meaningful and manageable. It's completely free.</p>
          <a href="https://peerevals.app/register-instructor" className="landing-btn landing-btn-white landing-btn-lg">
            Start Using PeerEval
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-content">
          <div className="landing-footer-brand">
            <span className="landing-logo-icon">📊</span>
            <span className="landing-logo-text">PeerEval</span>
          </div>
          <div className="landing-footer-links">
            <a href="https://peerevals.app/login">Sign In</a>
            <a href="https://peerevals.app/register-instructor">Register</a>
            <a href="mailto:support@peerevals.app">Contact</a>
          </div>
          <div className="landing-footer-copyright">
            © {new Date().getFullYear()} PeerEval. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Landing;

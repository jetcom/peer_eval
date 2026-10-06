import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

function Landing() {
  const { darkMode, toggleDarkMode } = useTheme();

  const features = [
    {
      icon: '👥',
      title: 'Team Peer Evaluations',
      description: 'Teammates rate each other across up to five phases plus an optional final evaluation, or once per assignment.'
    },
    {
      icon: '🎤',
      title: 'In-Class Audience Evaluations',
      description: 'While a group presents, the rest of the class rates it. Presenters get feedback from the whole room, not just the instructor.'
    },
    {
      icon: '📄',
      title: 'Paper Peer Review',
      description: 'Students upload a PDF, get matched with an anonymous reviewer, annotate directly on the paper, and score it against your rubric.'
    },
    {
      icon: '📝',
      title: 'Custom Rubrics & Templates',
      description: 'Build templates with your own rating criteria and open-response questions, and set a minimum comment length so feedback is more than a number.'
    },
    {
      icon: '⏰',
      title: 'Deadlines & Extensions',
      description: 'Per-phase and per-assignment deadlines with timezone support, individual student extensions, and an optional late-submission window.'
    },
    {
      icon: '🔔',
      title: 'Automatic Reminders',
      description: 'Scheduled reminder emails go only to students who have not finished, using wording you can customize.'
    },
    {
      icon: '📁',
      title: 'Roster Import',
      description: 'Upload a CSV of students and groups, including a grade export from your LMS, and preview exactly what will change before anything is saved.'
    },
    {
      icon: '🔗',
      title: 'Links for Your LMS',
      description: 'Copy a student link to a class or a specific assignment and paste it into your course site. Students land in the right place after logging in.'
    },
    {
      icon: '📈',
      title: 'Progress Tracking',
      description: 'Heat maps and progress dashboards show who has finished and who has not, at a glance.'
    },
    {
      icon: '📋',
      title: 'Reports & Export',
      description: 'Review results by student, group, phase or assignment, and export to CSV for grading.'
    },
    {
      icon: '💾',
      title: 'Auto-Save',
      description: 'Evaluations save automatically as students type. No lost work, no frustration.'
    },
    {
      icon: '🔒',
      title: 'Verified Instructors',
      description: 'Instructor accounts are reviewed before they are approved. Students never sign up on their own: their instructor adds them to a class.'
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
            <a href="/login" className="landing-login-link">
              Login
            </a>
            <button className="theme-toggle" onClick={toggleDarkMode}>
              {darkMode ? '☀️ Light' : '🌙 Dark'}
            </button>
            <a href="/register-instructor" className="landing-btn landing-btn-primary">
              Request Access
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
            A peer evaluation platform designed for educators.
            Track team contributions, collect in-class feedback on presentations,
            and run anonymous peer review of papers, all in one place.
          </p>
          <div className="landing-hero-actions">
            <a href="/register-instructor" className="landing-btn landing-btn-primary landing-btn-lg">
              Request Instructor Access
            </a>
            <a href="#features" className="landing-btn landing-btn-outline landing-btn-lg">
              Learn More
            </a>
          </div>
          <p style={{ marginTop: '15px', fontSize: '0.9rem', opacity: 0.8 }}>
            Student? Your instructor sets up your account. <a href="/login" style={{ color: 'inherit' }}>Log in here</a>.
          </p>
          <div className="landing-hero-stats">
            <div className="landing-stat">
              <span className="landing-stat-number">Custom</span>
              <span className="landing-stat-label">Rubric Templates</span>
            </div>
            <div className="landing-stat">
              <span className="landing-stat-number">100%</span>
              <span className="landing-stat-label">Auto-Save</span>
            </div>
            <div className="landing-stat">
              <span className="landing-stat-number">CSV</span>
              <span className="landing-stat-label">Roster Import</span>
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
            From an approved account to collected evaluations in four steps.
          </p>
          <div className="landing-steps">
            <div className="landing-step">
              <div className="landing-step-number">1</div>
              <h3 className="landing-step-title">Request Access</h3>
              <p className="landing-step-description">
                Register as an instructor. Requests are reviewed, and you get an email as soon as your account is approved.
              </p>
            </div>
            <div className="landing-step-connector"></div>
            <div className="landing-step">
              <div className="landing-step-number">2</div>
              <h3 className="landing-step-title">Set Up Your Class</h3>
              <p className="landing-step-description">
                Choose phases or assignments, pick or customize a rubric, and import your roster and project groups from a CSV.
              </p>
            </div>
            <div className="landing-step-connector"></div>
            <div className="landing-step">
              <div className="landing-step-number">3</div>
              <h3 className="landing-step-title">Collect Evaluations</h3>
              <p className="landing-step-description">
                Share a link from your LMS. Students rate teammates, presenting groups, or each other's papers, and reminders chase the stragglers.
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
                <div className="landing-gallery-mock-header">Instructor Dashboard</div>
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
              <h3>Instructor Dashboard</h3>
              <p>Track progress, manage groups, and generate reports for your classes from one dashboard.</p>
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
              <p>Clean, intuitive interface for students to rate teammates, presentations, and papers.</p>
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
              <h3>Team Projects</h3>
              <p>Capstones, studio courses, and semester-long group work: see each member's contribution phase by phase.</p>
            </div>
            <div className="landing-use-case">
              <div className="landing-use-case-icon">🎤</div>
              <h3>In-Class Presentations</h3>
              <p>Have the audience rate each presenting group, so presenters hear from the whole class.</p>
            </div>
            <div className="landing-use-case">
              <div className="landing-use-case-icon">✍️</div>
              <h3>Writing & Research Courses</h3>
              <p>Run anonymous peer review of papers with on-page annotations and rubric scoring.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="landing-cta">
        <div className="landing-cta-content">
          <h2>Ready to Transform Your Peer Evaluations?</h2>
          <p>Join educators who are making team assessments more meaningful and manageable. It's completely free for approved instructors.</p>
          <a href="/register-instructor" className="landing-btn landing-btn-white landing-btn-lg">
            Request Instructor Access
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
            <a href="/login">Sign In</a>
            <a href="/register-instructor">Instructor Registration</a>
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

import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import heroProgressLight from '../assets/landing/hero-progress-light.webp';
import heroProgressDark from '../assets/landing/hero-progress-dark.webp';
import heroStudentLight from '../assets/landing/hero-student-light.webp';
import heroStudentDark from '../assets/landing/hero-student-dark.webp';
import heroAudienceLight from '../assets/landing/hero-audience-light.webp';
import heroAudienceDark from '../assets/landing/hero-audience-dark.webp';
import heroReportsLight from '../assets/landing/hero-reports-light.webp';
import heroReportsDark from '../assets/landing/hero-reports-dark.webp';
import instructorLight from '../assets/landing/instructor-light.webp';
import instructorDark from '../assets/landing/instructor-dark.webp';
import studentLight from '../assets/landing/student-light.webp';
import studentDark from '../assets/landing/student-dark.webp';
import reportsLight from '../assets/landing/reports-light.webp';
import reportsDark from '../assets/landing/reports-dark.webp';
import audienceLight from '../assets/landing/audience-light.webp';
import audienceDark from '../assets/landing/audience-dark.webp';
import assignmentsLight from '../assets/landing/assignments-light.webp';
import assignmentsDark from '../assets/landing/assignments-dark.webp';
import settingsLight from '../assets/landing/settings-light.webp';
import settingsDark from '../assets/landing/settings-dark.webp';

// Screens the hero cycles through; all captured at the same aspect ratio
const HERO_SLIDES = [
  { label: 'Progress', light: heroProgressLight, dark: heroProgressDark, alt: 'Instructor progress view showing completion by phase and an evaluation heat map' },
  { label: 'Evaluate', light: heroStudentLight, dark: heroStudentDark, alt: 'Student form rating a teammate from 1 to 5 on each criterion' },
  { label: 'Audience', light: heroAudienceLight, dark: heroAudienceDark, alt: 'Audience evaluation form rating a presenting team' },
  { label: 'Reports', light: heroReportsLight, dark: heroReportsDark, alt: "Report comparing each student's average ratings across phases" }
];
const HERO_INTERVAL_MS = 5000;

function Landing() {
  const { darkMode, toggleDarkMode } = useTheme();
  const [heroSlide, setHeroSlide] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);

  // Advance the hero slowly; hold still while hovered or when the visitor
  // has asked the OS for reduced motion
  useEffect(() => {
    if (heroPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = setInterval(() => setHeroSlide(s => (s + 1) % HERO_SLIDES.length), HERO_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [heroPaused]);

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
            <a href="/register-instructor" className="landing-login-link">
              New Instructor?
            </a>
            <button className="theme-toggle" onClick={toggleDarkMode}>
              {darkMode ? '☀️ Light' : '🌙 Dark'}
            </button>
            <a href="/login" className="landing-btn landing-btn-primary">
              Log In
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
            <a href="/login" className="landing-btn landing-btn-primary landing-btn-lg">
              Log In
            </a>
            <a href="/register-instructor" className="landing-btn landing-btn-outline landing-btn-lg">
              New Instructor? Request Access
            </a>
          </div>
          <p style={{ marginTop: '15px', fontSize: '0.9rem', opacity: 0.8 }}>
            Students: just log in. Your instructor has already set up your account, so there is nothing to request.
          </p>
        </div>
        <div className="landing-hero-image">
          <div
            className="landing-screenshot-container"
            onMouseEnter={() => setHeroPaused(true)}
            onMouseLeave={() => setHeroPaused(false)}
          >
            <div className="landing-screenshot-header">
              <span className="landing-screenshot-dot red"></span>
              <span className="landing-screenshot-dot yellow"></span>
              <span className="landing-screenshot-dot green"></span>
            </div>
            <div className="landing-screenshot-slides">
              {HERO_SLIDES.map((slide, i) => (
                <img
                  key={slide.label}
                  className={`landing-screenshot-img${i === heroSlide ? ' active' : ''}`}
                  src={darkMode ? slide.dark : slide.light}
                  alt={slide.alt}
                  aria-hidden={i !== heroSlide}
                />
              ))}
            </div>
            <div className="landing-screenshot-tabs">
              {HERO_SLIDES.map((slide, i) => (
                <button
                  key={slide.label}
                  type="button"
                  className={i === heroSlide ? 'active' : ''}
                  aria-pressed={i === heroSlide}
                  onClick={() => setHeroSlide(i)}
                >
                  {slide.label}
                </button>
              ))}
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
              <div className="landing-gallery-preview">
                <img
                  src={darkMode ? instructorDark : instructorLight}
                  alt="List of students who have not finished a phase, ready to be sent a reminder"
                  loading="lazy"
                />
              </div>
              <h3>Instructor Dashboard</h3>
              <p>See who has finished, who is in progress, and who needs a nudge, then remind exactly those students.</p>
            </div>
            <div className="landing-gallery-item">
              <div className="landing-gallery-preview">
                <img
                  src={darkMode ? studentDark : studentLight}
                  alt="Student form rating a teammate from 1 to 5 on each criterion"
                  loading="lazy"
                />
              </div>
              <h3>Student Evaluation</h3>
              <p>Clean, intuitive interface for students to rate teammates, presentations, and papers.</p>
            </div>
            <div className="landing-gallery-item">
              <div className="landing-gallery-preview">
                <img
                  src={darkMode ? audienceDark : audienceLight}
                  alt="Audience evaluation form rating a presenting team on clarity and research depth"
                  loading="lazy"
                />
              </div>
              <h3>In-Class Audience Evaluation</h3>
              <p>While a team presents, everyone else rates it on the rubric you chose.</p>
            </div>
            <div className="landing-gallery-item">
              <div className="landing-gallery-preview">
                <img
                  src={darkMode ? assignmentsDark : assignmentsLight}
                  alt="Student's list of assignments with their evaluations, due dates and completion status"
                  loading="lazy"
                />
              </div>
              <h3>Assignment View</h3>
              <p>Students see each assignment's evaluations, due dates, and what is still pending.</p>
            </div>
            <div className="landing-gallery-item">
              <div className="landing-gallery-preview">
                <img
                  src={darkMode ? settingsDark : settingsLight}
                  alt="Class settings listing assignments with their evaluation types, rubric templates and a copy student link button"
                  loading="lazy"
                />
              </div>
              <h3>Class Setup</h3>
              <p>Choose evaluation types and rubric templates per assignment, and copy a student link for your LMS.</p>
            </div>
            <div className="landing-gallery-item">
              <div className="landing-gallery-preview">
                <img
                  src={darkMode ? reportsDark : reportsLight}
                  alt="Report comparing each student's average ratings across phases"
                  loading="lazy"
                />
              </div>
              <h3>Detailed Reports</h3>
              <p>Compare each student's ratings across phases, and export scores and comments for grading.</p>
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
            New Instructor? Request Access
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
            <a href="/login">Log In</a>
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

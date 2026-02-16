import React, { useState, useEffect } from 'react';
import ClassTypeStep from './steps/ClassTypeStep';
import BasicInfoStep from './steps/BasicInfoStep';
import PhaseConfigStep from './steps/PhaseConfigStep';
import AssignmentSetupStep from './steps/AssignmentSetupStep';
import CriteriaStep from './steps/CriteriaStep';
import DueDatesStep from './steps/DueDatesStep';
import OptionsStep from './steps/OptionsStep';

const STEPS_PHASES = ['type', 'basic', 'phases', 'criteria', 'dueDates', 'options'];
const STEPS_ASSIGNMENTS = ['type', 'basic', 'assignments', 'options'];

const STEP_TITLES = {
  type: 'Class Type',
  basic: 'Basic Info',
  phases: 'Phases',
  assignments: 'Assignments',
  criteria: 'Evaluation Criteria',
  dueDates: 'Due Dates',
  options: 'Options'
};

const getDefaultClassData = (currentUser) => ({
  name: '',
  section: '',
  semester: '',
  evaluation_mode: 'phases', // 'phases' or 'assignments'
  num_phases: 3,
  has_final_evaluation: true,
  assignments: [], // For assignment mode
  peer_template_id: null,
  audience_template_id: null,
  self_template_id: null,
  paper_review_template_id: null,
  include_self_eval: false,
  include_peer_eval: true,
  include_audience_eval: false,
  include_paper_review: false,
  custom_criteria: [], // Custom criteria overrides
  phase_due_dates: {},
  due_date_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  min_comment_words: 0,
  allow_late: false,
  late_window_hours: 48, // Default 48 hours (2 days)
  instructor_ids: currentUser ? [currentUser.id] : []
});

function ClassWizard({ darkMode, currentUser, onSubmit, onClose }) {
  const [classData, setClassData] = useState(() => getDefaultClassData(currentUser));
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState('');

  // Fetch templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/templates', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setTemplates(data);
        }
      } catch (err) {
        console.error('Failed to fetch templates:', err);
      }
    };
    fetchTemplates();
  }, []);

  // Get the steps array based on evaluation mode
  const steps = classData.evaluation_mode === 'phases' ? STEPS_PHASES : STEPS_ASSIGNMENTS;
  const currentStep = steps[currentStepIndex];

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
      setError('');
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
      setError('');
    }
  };

  const handleStepClick = (index) => {
    // Allow clicking on completed steps
    if (index < currentStepIndex) {
      setCurrentStepIndex(index);
      setError('');
    }
  };

  const handleSubmit = async () => {
    setError('');
    try {
      await onSubmit(classData);
    } catch (err) {
      setError(err.message || 'Failed to create class');
    }
  };

  const updateClassData = (updates) => {
    setClassData(prev => ({ ...prev, ...updates }));
  };

  const isLastStep = currentStepIndex === steps.length - 1;

  // Validate current step before allowing next
  const canProceed = () => {
    switch (currentStep) {
      case 'type':
        return true; // Always can proceed from type selection
      case 'basic':
        return classData.name.trim() !== '';
      case 'phases':
        return classData.num_phases > 0;
      case 'assignments':
        return true; // Assignments can be added later
      case 'criteria':
        return true; // Criteria uses defaults
      case 'dueDates':
        // At least the final due date should be set
        if (classData.evaluation_mode === 'phases') {
          const finalPhase = classData.has_final_evaluation ? 0 : classData.num_phases;
          return !!classData.phase_due_dates[finalPhase];
        }
        return true;
      case 'options':
        return true;
      default:
        return true;
    }
  };

  const renderStep = () => {
    const commonProps = {
      darkMode,
      classData,
      updateClassData,
      templates
    };

    switch (currentStep) {
      case 'type':
        return <ClassTypeStep {...commonProps} />;
      case 'basic':
        return <BasicInfoStep {...commonProps} currentUser={currentUser} />;
      case 'phases':
        return <PhaseConfigStep {...commonProps} />;
      case 'assignments':
        return <AssignmentSetupStep {...commonProps} templates={templates} />;
      case 'criteria':
        return <CriteriaStep {...commonProps} />;
      case 'dueDates':
        return <DueDatesStep {...commonProps} />;
      case 'options':
        return <OptionsStep {...commonProps} />;
      default:
        return null;
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: darkMode ? '#1a1a1a' : '#fff',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '900px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: darkMode ? '1px solid #333' : '1px solid #e0e0e0',
        boxShadow: darkMode ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.15)'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 25px',
          borderBottom: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`,
          background: darkMode ? '#141414' : '#f8f9fa'
        }}>
          <h2 style={{ margin: 0, marginBottom: '15px' }}>Create New Class</h2>

          {/* Step indicators */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {steps.map((step, index) => (
              <button
                key={step}
                onClick={() => handleStepClick(index)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '0.85rem',
                  cursor: index < currentStepIndex ? 'pointer' : 'default',
                  background: index === currentStepIndex
                    ? '#3498db'
                    : index < currentStepIndex
                      ? '#27ae60'
                      : (darkMode ? '#333' : '#e0e0e0'),
                  color: index <= currentStepIndex
                    ? '#fff'
                    : (darkMode ? '#888' : '#666'),
                  transition: 'background 0.2s'
                }}
              >
                {index + 1}. {STEP_TITLES[step]}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '25px'
        }}>
          {error && (
            <div style={{
              padding: '10px 15px',
              marginBottom: '15px',
              borderRadius: '4px',
              background: darkMode ? '#2d1a1a' : '#fde8e8',
              border: '1px solid #e74c3c',
              color: '#e74c3c'
            }}>
              {error}
            </div>
          )}
          {renderStep()}
        </div>

        {/* Footer */}
        <div style={{
          padding: '15px 25px',
          borderTop: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`,
          display: 'flex',
          justifyContent: 'space-between',
          background: darkMode ? '#141414' : '#f8f9fa'
        }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            {currentStepIndex > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleBack}
              >
                Back
              </button>
            )}

            {isLastStep ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={!canProceed()}
              >
                Create Class
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleNext}
                disabled={!canProceed()}
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ClassWizard;

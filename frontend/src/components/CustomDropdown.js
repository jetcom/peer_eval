import React, { useState, useRef, useEffect } from 'react';

function CustomDropdown({ value, onChange, options, darkMode, style, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const selectedOption = options.find(opt => opt.value === value);
  // Use headerLabel if provided, otherwise fall back to label
  const displayLabel = selectedOption ? (selectedOption.headerLabel || selectedOption.label) : null;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    // Listen for both mouse and touch events for mobile compatibility
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const handleToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <div ref={dropdownRef} style={{
      position: 'relative',
      zIndex: isOpen ? 9999 : 'auto',
      ...style
    }}>
      <div
        onClick={handleToggle}
        onTouchEnd={handleToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        style={{
          padding: '12px 16px',
          borderRadius: '4px',
          border: '1px solid #ccc',
          backgroundColor: darkMode ? '#2a3a5a' : '#fff',
          color: darkMode ? '#e0e0e0' : '#000',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          minWidth: '250px',
          minHeight: '44px', // Minimum touch target size for mobile
          userSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation'
        }}
      >
        <span style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginRight: '8px'
        }}>
          {displayLabel || (placeholder || 'Select...')}
        </span>
        <span style={{
          fontSize: '0.8em',
          flexShrink: 0,
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s'
        }}>▼</span>
      </div>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            backgroundColor: darkMode ? '#2a3a5a' : '#fff',
            border: '1px solid #ccc',
            borderRadius: '4px',
            maxHeight: '300px',
            overflowY: 'auto',
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {options.map((option, index) => (
            <div
              key={option.value ?? index}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSelect(option.value);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSelect(option.value);
              }}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                backgroundColor: value === option.value
                  ? (darkMode ? '#1e3a5f' : '#e8f4fc')
                  : (darkMode ? '#2a3a5a' : '#fff'),
                color: darkMode ? '#e0e0e0' : '#000',
                transition: 'background-color 0.15s',
                minHeight: '44px', // Minimum touch target size
                display: 'flex',
                alignItems: 'center',
                borderBottom: index < options.length - 1 ? `1px solid ${darkMode ? '#3a4a6a' : '#eee'}` : 'none'
              }}
              onMouseEnter={(e) => {
                if (value !== option.value) {
                  e.currentTarget.style.backgroundColor = darkMode ? '#1e3a5f' : '#f5f5f5';
                }
              }}
              onMouseLeave={(e) => {
                if (value !== option.value) {
                  e.currentTarget.style.backgroundColor = darkMode ? '#2a3a5a' : '#fff';
                }
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CustomDropdown;

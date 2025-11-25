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

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', ...style }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '8px 12px',
          borderRadius: '4px',
          border: '1px solid #ccc',
          backgroundColor: darkMode ? '#2a3a5a' : '#fff',
          color: darkMode ? '#e0e0e0' : '#000',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          minWidth: '200px',
          userSelect: 'none'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayLabel || (placeholder || 'Select...')}</span>
        <span style={{ marginLeft: '8px', fontSize: '0.8em', flexShrink: 0 }}>▼</span>
      </div>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '2px',
            backgroundColor: darkMode ? '#2a3a5a' : '#fff',
            border: '1px solid #ccc',
            borderRadius: '4px',
            maxHeight: '300px',
            overflowY: 'auto',
            zIndex: 1000,
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}
        >
          {options.map(option => (
            <div
              key={option.value}
              onClick={() => handleSelect(option.value)}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                backgroundColor: value === option.value
                  ? (darkMode ? '#1e3a5f' : '#f0f0f0')
                  : (darkMode ? '#2a3a5a' : '#fff'),
                color: darkMode ? '#e0e0e0' : '#000',
                transition: 'background-color 0.15s'
              }}
              onMouseEnter={(e) => {
                if (value !== option.value) {
                  e.target.style.backgroundColor = darkMode ? '#1e3a5f' : '#f5f5f5';
                }
              }}
              onMouseLeave={(e) => {
                if (value !== option.value) {
                  e.target.style.backgroundColor = darkMode ? '#2a3a5a' : '#fff';
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

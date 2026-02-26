import React, { useState, useRef, useEffect, useCallback } from 'react';

function CustomDropdown({ value, onChange, options, darkMode, style, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);

  const selectedOption = options.find(opt => opt.value === value);
  // Use headerLabel if provided, otherwise fall back to label
  const displayLabel = selectedOption ? (selectedOption.headerLabel || selectedOption.label) : null;

  // Update dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is outside both the container and the fixed-position list
      const isOutsideContainer = containerRef.current && !containerRef.current.contains(event.target);
      const isOutsideList = listRef.current && !listRef.current.contains(event.target);

      if (isOutsideContainer && (isOutsideList || !listRef.current)) {
        setIsOpen(false);
      }
    };

    // Only listen for mousedown - handle touch via onTouchEnd on elements
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Close dropdown when clicking outside on mobile
  useEffect(() => {
    if (!isOpen) return;

    const handleTouchOutside = (event) => {
      const isOutsideContainer = containerRef.current && !containerRef.current.contains(event.target);
      const isOutsideList = listRef.current && !listRef.current.contains(event.target);

      if (isOutsideContainer && (isOutsideList || !listRef.current)) {
        setIsOpen(false);
      }
    };

    // Small delay to prevent immediate close on the same touch that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener('touchstart', handleTouchOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('touchstart', handleTouchOutside);
    };
  }, [isOpen]);

  const handleSelect = useCallback((optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
  }, [onChange]);

  const handleToggle = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(prev => !prev);
  }, []);

  return (
    <div ref={containerRef} style={{
      position: 'relative',
      ...style
    }}>
      <div
        ref={buttonRef}
        onClick={handleToggle}
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
          border: '1px solid var(--border-color)',
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
          ref={listRef}
          style={{
            position: 'fixed',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
            backgroundColor: darkMode ? '#2a3a5a' : '#fff',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            maxHeight: '300px',
            overflowY: 'auto',
            zIndex: 99999,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {options.map((option, index) => (
            <div
              key={option.value ?? index}
              onClick={() => handleSelect(option.value)}
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

import React from 'react';

// Colored score badge; thresholds are relative to the scale
function ScoreBadge({ value, max = 5, digits = 1 }) {
  if (value == null) return <span style={{ color: '#999' }}>-</span>;
  const ratio = max > 0 ? value / max : 0;
  const background = ratio >= 0.8 ? '#27ae60' : ratio >= 0.6 ? '#f39c12' : '#e74c3c';
  return (
    <span style={{ padding: '2px 8px', borderRadius: '3px', background, color: 'white', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
      {Number(value).toFixed(digits)}
    </span>
  );
}

export default ScoreBadge;

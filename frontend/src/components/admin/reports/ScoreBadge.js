import React from 'react';

// Colored score badge; thresholds are relative to the scale. With percent,
// the value is already a percentage of the maximum.
function ScoreBadge({ value, max = 5, digits = 1, percent = false }) {
  if (value == null) return <span style={{ color: '#999' }}>-</span>;
  const scale = percent ? 100 : max;
  const ratio = scale > 0 ? value / scale : 0;
  const background = ratio >= 0.8 ? '#27ae60' : ratio >= 0.6 ? '#f39c12' : '#e74c3c';
  return (
    <span style={{ padding: '2px 8px', borderRadius: '3px', background, color: 'white', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
      {percent ? `${Math.round(value)}%` : Number(value).toFixed(digits)}
    </span>
  );
}

export default ScoreBadge;

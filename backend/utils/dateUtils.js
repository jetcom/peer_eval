/**
 * Get current time formatted in the given timezone as YYYY-MM-DDTHH:mm
 * for string comparison against due dates stored in that format.
 */
function getNowInTimezone(timezone) {
  const tz = timezone || 'America/New_York';
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now);

  const get = (type) => parts.find(p => p.type === type)?.value;
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

/**
 * Check if a due date (stored as YYYY-MM-DDTHH:mm) has passed,
 * using the class's timezone for the comparison.
 * Returns true if the deadline has passed.
 */
function isPastDueDate(dueDate, timezone) {
  if (!dueDate) return false;
  const nowInTz = getNowInTimezone(timezone);
  return nowInTz > dueDate;
}

/**
 * Convert a due date (stored as YYYY-MM-DDTHH:mm wall-clock time in the
 * given timezone) to an absolute Date.
 */
function dueDateToUtc(dueDate, timezone) {
  const tz = timezone || 'America/New_York';
  const [datePart, timePart = '00:00'] = dueDate.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  const wallClockAsUtc = Date.UTC(y, mo - 1, d, h, mi);

  // Offset of the timezone from UTC at a given instant, in ms
  const offsetAt = (ms) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'
    }).formatToParts(new Date(ms));
    const get = (type) => Number(parts.find(p => p.type === type).value);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - Math.floor(ms / 60000) * 60000;
  };

  // Two passes settles the offset across DST transitions
  let utc = wallClockAsUtc - offsetAt(wallClockAsUtc);
  utc = wallClockAsUtc - offsetAt(utc);
  return new Date(utc);
}

module.exports = { getNowInTimezone, isPastDueDate, dueDateToUtc };

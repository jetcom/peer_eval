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

module.exports = { getNowInTimezone, isPastDueDate };

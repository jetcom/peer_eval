// Helpers for due dates and presentation times, which the server stores as
// wall-clock strings ("YYYY-MM-DDTHH:mm") in the class's timezone.

export function parseWallClock(dateStr) {
  if (!dateStr) return null;
  const [datePart, timePart = '00:00'] = dateStr.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  return { y, mo, d, h, mi };
}

/** Add hours without any timezone shift (matches the server's arithmetic). */
export function addHoursWallClock(dateStr, hours) {
  const p = parseWallClock(dateStr);
  if (!p) return null;
  const t = new Date(Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) + Number(hours) * 3600000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

/** "Fri, Oct 24, 2:00 PM" style display of a wall-clock string. */
export function formatWallClock(dateStr, options) {
  const p = parseWallClock(dateStr);
  if (!p) return '';
  return new Date(p.y, p.mo - 1, p.d, p.h, p.mi).toLocaleString('en-US', options || {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

/** "Oct 24" style short display. */
export function formatWallClockShort(dateStr) {
  return formatWallClock(dateStr, { month: 'short', day: 'numeric' });
}

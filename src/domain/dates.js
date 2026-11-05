const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const systemClock = () => new Date();

function pad(number, width) {
  return String(number).padStart(width, '0');
}

export function todayLocal(clock = systemClock) {
  const now = clock();
  const year = pad(now.getFullYear(), 4);
  const month = pad(now.getMonth() + 1, 2);
  const day = pad(now.getDate(), 2);
  return `${year}-${month}-${day}`;
}

export function isValidCalendarDate(value) {
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function isBefore(date, otherDate) {
  return date < otherDate;
}

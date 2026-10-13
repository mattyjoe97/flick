const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const WORKDAY_MINUTES = 8 * 60;

/** One real second is one office minute; the office day runs 9 to 5, weekdays only. */
export function officeClock(seconds: number) {
  const minutes = Math.floor(seconds);
  const day = Math.floor(minutes / WORKDAY_MINUTES);
  const week = Math.floor(day / 5) + 1;
  const ofDay = 9 * 60 + (minutes % WORKDAY_MINUTES);
  return `Week ${week}, ${DAYS[day % 5]} ${timeOfDay(ofDay)}`;
}

export function officeTime(seconds: number) {
  const ofDay = 9 * 60 + (Math.floor(seconds) % WORKDAY_MINUTES);
  return timeOfDay(ofDay);
}

function timeOfDay(minutes: number) {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

export function fmt(n: number) {
  const v = Math.floor(n);
  if (v < 1_000_000) return v.toLocaleString('en-US');
  if (v < 1_000_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  return `${(v / 1_000_000_000).toFixed(2)}B`;
}

export function money(n: number) {
  return `$${fmt(n)}`;
}

export function rate(n: number) {
  if (n <= 0) return '';
  return n < 10 ? n.toFixed(2) : n.toFixed(1);
}

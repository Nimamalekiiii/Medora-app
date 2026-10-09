/**
 * Helpers for calendar dates stored as local `YYYY-MM-DD` keys (exam dates,
 * study days). Keys avoid the time zone shifts that ISO timestamps cause when
 * only the day matters. This module is pure: no storage, no React.
 */

const DAY_MS = 86_400_000;

/** Local calendar day of a Date as `YYYY-MM-DD`. */
export function dateToKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Local midnight of a `YYYY-MM-DD` key. */
export function keyToDate(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** A date key written out in full, e.g. "8 October 2026". */
export function formatLongDate(dateKey: string): string {
  return keyToDate(dateKey).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Whole calendar days from `todayKey` to `dateKey`: 0 is today, negative is in
 * the past. Returns -1 when `dateKey` is not a real calendar date.
 */
export function getDaysUntil(dateKey: string, todayKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = todayKey.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (!year || !month || !day || parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return -1;
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / DAY_MS);
}

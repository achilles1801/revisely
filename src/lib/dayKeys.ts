/**
 * Day keys: calendar days written 'YYYY-MM-DD', counted in whole days.
 *
 * A key names a calendar day, not a moment, so these read it as UTC midnight. Every day is then exactly
 * 86,400,000 ms, whatever the phone's time zone or daylight saving does. A longer string (an ISO timestamp) is read
 * by its first ten characters, its calendar day as written.
 *
 * Before Nov 2026 each file that needed these wrote its own copy (seven in src/lib). Some read only the first ten
 * characters and some didn't, so a timestamp gave NaN in those.
 */

const DAY_MS = 86_400_000;

/** The day's number: whole days since 1970-01-01. */
export function dayNumber(day: string): number {
  return Math.round(Date.parse(`${day.slice(0, 10)}T00:00:00Z`) / DAY_MS);
}

/** The day key for a day number. */
export function dayFromNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`: 0 for the same day, negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** The day `days` after `day` (before it when negative). */
export function shiftDay(day: string, days: number): string {
  return dayFromNumber(dayNumber(day) + days);
}

import { User } from '../types';
import { getPrayerPrefs } from './prayer/prefs';
import { CALCULATION_METHODS, DEFAULT_METHOD, dayTimes } from './prayer/times';

/**
 * Supported adhan calculation methods, surfaced as a small picker in
 * Settings (lib/prayer/times has the list; prayer times use the same one).
 */
export const FAJR_CALCULATION_METHODS = CALCULATION_METHODS.map(({ id, label }) => ({ id, label }));

export const DEFAULT_FAJR_METHOD = DEFAULT_METHOD;

/**
 * Fajr time for a given date at the user's coords + method. Returned as a
 * native Date (local timezone of the device). Worked out exactly as the prayer
 * times are (lib/prayer/times): the account's method with this phone's
 * high-latitude rule and adjustments, so the day starts at the Fajr the Prayer
 * sheet shows. (It used to force the twilight-angle rule.)
 */
export function getFajrTimeFor(date: Date, user: User): Date | null {
  if (!user.locationCoords) return null;
  const prefs = getPrayerPrefs();
  // adhan gives no fajr (null here) in a polar summer.
  return dayTimes(user.locationCoords, date, {
    method: user.fajrCalculationMethod || DEFAULT_FAJR_METHOD,
    highLatitude: prefs.highLatitude,
    madhab: prefs.madhab,
    adjustments: prefs.adjustments,
  }).fajr;
}

function formatLocalDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The date string that represents "today" for revision purposes. When the
 * fajr boundary is on, anything before today's fajr counts as the previous
 * day — matching how late-night revisers experience their session.
 */
export function getRevisionDayForUser(
  user: User | null | undefined,
  now: Date = new Date(),
): string {
  if (!user || !user.fajrBoundaryEnabled || !user.locationCoords) {
    return formatLocalDay(now);
  }
  const todaysFajr = getFajrTimeFor(now, user);
  if (!todaysFajr) return formatLocalDay(now);

  if (now.getTime() < todaysFajr.getTime()) {
    // Roll back to yesterday's date string.
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return formatLocalDay(yesterday);
  }
  return formatLocalDay(now);
}

/**
 * The revision day as a Date at local midnight. Scheduling looks days up by
 * date, so it must be given this rather than `new Date()`: between midnight
 * and fajr the calendar has moved on but the revision day has not.
 */
export function getRevisionDateForUser(
  user: User | null | undefined,
  now: Date = new Date(),
): Date {
  const [y, m, d] = getRevisionDayForUser(user, now).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * When the revision day next changes: the next fajr when the boundary is on,
 * otherwise the next local midnight.
 */
export function getNextRevisionDayStart(
  user: User | null | undefined,
  now: Date = new Date(),
): Date {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (!user || !user.fajrBoundaryEnabled || !user.locationCoords) return midnight;
  const todaysFajr = getFajrTimeFor(now, user);
  if (todaysFajr && todaysFajr.getTime() > now.getTime()) return todaysFajr;
  const tomorrowsFajr = getFajrTimeFor(midnight, user);
  // Past already when the device's time zone is far from the saved location;
  // the day then turns at midnight.
  return tomorrowsFajr && tomorrowsFajr.getTime() > now.getTime() ? tomorrowsFajr : midnight;
}

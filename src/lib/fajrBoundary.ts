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
  return revisionDayAt(now, (d) => getFajrTimeFor(d, user));
}

/** The revision day at `now`, given each local day's Fajr: the day before until that day's Fajr. */
function revisionDayAt(now: Date, fajrOf: (day: Date) => Date | null): string {
  const todaysFajr = fajrOf(now);
  if (todaysFajr && now.getTime() < todaysFajr.getTime()) {
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
 * When the revision day next changes: the next local midnight with the boundary
 * off; with it on, the first moment getRevisionDayForUser gives another day.
 *
 * That day only changes at a local midnight or at a day's Fajr, so those are
 * the moments tried, in order. Usually it is the next Fajr. With a saved place
 * far from the phone's zone a day's Fajr can fall the evening before, or the
 * day before altogether; the day then turns at midnight, and a Fajr that comes
 * first changes nothing (it used to be returned anyway).
 */
export function getNextRevisionDayStart(
  user: User | null | undefined,
  now: Date = new Date(),
): Date {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (!user || !user.fajrBoundaryEnabled || !user.locationCoords) return midnight;
  // A day's Fajr depends only on its local date: worked out once a day here.
  const known = new Map<string, Date | null>();
  const fajrOf = (d: Date) => {
    const key = formatLocalDay(d);
    if (!known.has(key)) known.set(key, getFajrTimeFor(d, user));
    return known.get(key)!;
  };
  const today = revisionDayAt(now, fajrOf);
  const day = (k: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + k);
  const moments = [day(1), day(2), ...[0, 1, 2].map((k) => fajrOf(day(k)))]
    .filter((d): d is Date => d !== null && d.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  return moments.find((d) => revisionDayAt(d, fajrOf) !== today) ?? midnight;
}

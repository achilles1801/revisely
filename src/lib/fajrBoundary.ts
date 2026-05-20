import {
  Coordinates,
  CalculationMethod,
  HighLatitudeRule,
  PrayerTimes,
} from 'adhan';
import { User } from '../types';

/**
 * Supported adhan calculation methods, surfaced as a small picker in
 * Settings. Names match adhan's static factory functions so we can resolve
 * them dynamically.
 */
export const FAJR_CALCULATION_METHODS = [
  { id: 'MuslimWorldLeague', label: 'Muslim World League' },
  { id: 'Egyptian', label: 'Egyptian' },
  { id: 'Karachi', label: 'Karachi' },
  { id: 'UmmAlQura', label: 'Umm al-Qura (Makkah)' },
  { id: 'Dubai', label: 'Dubai' },
  { id: 'MoonsightingCommittee', label: 'Moonsighting Committee' },
  { id: 'NorthAmerica', label: 'ISNA (North America)' },
  { id: 'Kuwait', label: 'Kuwait' },
  { id: 'Qatar', label: 'Qatar' },
  { id: 'Singapore', label: 'Singapore' },
  { id: 'Turkey', label: 'Turkey' },
  { id: 'Tehran', label: 'Tehran' },
] as const;

export const DEFAULT_FAJR_METHOD = 'NorthAmerica';

function paramsFor(methodId: string) {
  const cm = CalculationMethod as unknown as Record<string, () => ReturnType<typeof CalculationMethod.MuslimWorldLeague>>;
  const factory = cm[methodId] ?? cm[DEFAULT_FAJR_METHOD];
  const params = factory();
  // At very high latitudes adhan would otherwise return invalid times. Pick
  // a sane default rule rather than crashing the UI.
  params.highLatitudeRule = HighLatitudeRule.TwilightAngle;
  return params;
}

/**
 * Fajr time for a given date at the user's coords + method. Returned as a
 * native Date (local timezone of the device).
 */
export function getFajrTimeFor(date: Date, user: User): Date | null {
  if (!user.locationCoords) return null;
  const coords = new Coordinates(
    user.locationCoords.latitude,
    user.locationCoords.longitude,
  );
  const params = paramsFor(user.fajrCalculationMethod || DEFAULT_FAJR_METHOD);
  const prayerTimes = new PrayerTimes(coords, date, params);
  return prayerTimes.fajr;
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

import type { ReadingSession, RevisionLog, User } from '../types';
import { getPagesForSurah } from './quranData';
import type { Place, PrayerPrefs } from './prayer/prefs';
import { dayTimes, localDay, type CalcSettings } from './prayer/times';
import { prayerPlace, prayerSettings } from './prayer/place';
import { bundledCities } from './qibla';

/** Friday's sunnah: reading Surah Al-Kahf. */
export const KAHF_SURAH = 18;

/** Minutes offered when marking Al-Kahf as read. */
export const KAHF_MINUTE_CHOICES = [10, 15, 20, 30, 45, 60];
export const KAHF_DEFAULT_MINUTES = 20;

/** Mushaf pages of Al-Kahf (293–304), from the surah table. */
export function kahfPages(): number[] {
  return getPagesForSurah(KAHF_SURAH);
}

/**
 * The Islamic Friday the Al-Kahf card is for (KAHF-1): from Thursday's maghrib
 * to Friday's maghrib.
 */
export interface KahfFriday {
  /** The Friday ('YYYY-MM-DD', the phone's calendar). Keys "Not today" (KAHF-3). */
  day: string;
  /** Thursday's maghrib (ms since epoch): the window opens. */
  start: number;
  /** Friday's maghrib (ms since epoch): the window closes. */
  end: number;
}

/** A local day's maghrib; `day` is any moment of that day. */
export type MaghribOf = (day: Date) => Date;

/** Maghrib's stand-in when it can't be worked out (no place at all): 18:00 on the phone's clock. */
export const KAHF_FALLBACK_MAGHRIB_HOUR = 18;

function dayFrom(at: Date, k: number): Date {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate() + k);
}

/** The phone's time zone (an IANA name), if the runtime says. */
export function phoneZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The bundled city a time zone is named after ('America/Chicago' → Chicago,
 * 'America/New_York' → New York), or null when the list has none. A stand-in
 * for where the user is when the app knows no place: it never asks for one.
 */
export function zonePlace(zone: string | null | undefined): Place | null {
  const name = zone?.split('/').pop()?.replace(/_/g, ' ');
  if (!name) return null;
  const city = bundledCities().find((c) => c.name === name);
  return city ? { latitude: city.latitude, longitude: city.longitude } : null;
}

/**
 * Where Friday's maghrib is worked out (KAHF-1): the Prayer sheet's place (the
 * phone's last position, else the saved Fajr location), else the time zone's
 * city. Null: 18:00 stands in.
 */
export function kahfPlace(
  user: User | null | undefined,
  prefs: Pick<PrayerPrefs, 'place'>,
  zone: string | null | undefined = phoneZone(),
): Place | null {
  return prayerPlace(user, prefs) ?? zonePlace(zone);
}

/**
 * Each day's maghrib as the Prayer sheet works it out (the account's method,
 * this phone's settings and adjustments), at `place`; 18:00 with no place, or on
 * a day it can't be worked out. Remembered per day.
 */
export function kahfMaghribOf(place: Place | null, settings: CalcSettings): MaghribOf {
  const known = new Map<string, Date>();
  return (day) => {
    const key = localDay(day);
    let maghrib = known.get(key);
    if (!maghrib) {
      maghrib =
        (place ? dayTimes(place, day, settings).maghrib : null) ??
        new Date(day.getFullYear(), day.getMonth(), day.getDate(), KAHF_FALLBACK_MAGHRIB_HOUR);
      known.set(key, maghrib);
    }
    return maghrib;
  };
}

/** The account's maghrib for the card: kahfMaghribOf at kahfPlace, with the Prayer sheet's settings. */
export function kahfMaghribForUser(
  user: User | null | undefined,
  prefs: Pick<PrayerPrefs, 'place' | 'highLatitude' | 'madhab' | 'adjustments'>,
  zone: string | null | undefined = phoneZone(),
): MaghribOf {
  return kahfMaghribOf(kahfPlace(user, prefs, zone), prayerSettings(user, prefs));
}

/**
 * The Islamic Friday `now` is in, from Thursday's maghrib up to Friday's, or
 * null outside it (KAHF-1). Not the revision day: Thursday evening is Friday's,
 * and Friday evening after maghrib is no longer.
 */
export function kahfFridayAt(now: Date, maghribOf: MaghribOf): KahfFriday | null {
  const t = now.getTime();
  // The Friday a window holding now could belong to is within a day or two of
  // it (two, for a saved place far from the phone's zone).
  for (let k = -1; k <= 2; k++) {
    const friday = dayFrom(now, k);
    if (friday.getDay() !== 5) continue;
    const start = maghribOf(dayFrom(friday, -1)).getTime();
    const end = maghribOf(friday).getTime();
    if (t >= start && t < end) return { day: localDay(friday), start, end };
  }
  return null;
}

/** When the card next comes or goes: the next Thursday or Friday maghrib after `now`. */
export function nextKahfChange(now: Date, maghribOf: MaghribOf): Date {
  for (let k = -1; k <= 8; k++) {
    const day = dayFrom(now, k);
    if (day.getDay() !== 4 && day.getDay() !== 5) continue;
    const maghrib = maghribOf(day);
    if (maghrib.getTime() > now.getTime()) return maghrib;
  }
  return new Date(now.getTime() + 60 * 60 * 1000);
}

/**
 * True once every page of Al-Kahf was read for `friday` (KAHF-2): in reading
 * sessions that ended inside its window (the pages logged and the pages opened
 * in the reader while the timer ran; "Mark as read" is one), and in the
 * revision log of Friday's own revision day, across any number of them. A
 * Thursday-evening reading counts; one before Thursday's maghrib doesn't.
 */
export function kahfReadOn(
  friday: KahfFriday,
  sessions: Pick<ReadingSession, 'date' | 'endedAt' | 'pages' | 'pagesVisited'>[],
  logs: Pick<RevisionLog, 'date' | 'pagesRevised'>[] = [],
): boolean {
  const read = new Set<number>();
  for (const s of sessions) {
    const inside = Number.isFinite(s.endedAt)
      ? s.endedAt >= friday.start && s.endedAt < friday.end
      : s.date === friday.day;
    if (!inside) continue;
    (s.pages ?? []).forEach((p) => read.add(p));
    (s.pagesVisited ?? []).forEach((p) => read.add(p));
  }
  // A revision log has a day, not a time. Friday's revision day starts after
  // Thursday's maghrib (at midnight, or at Fajr), so while the card shows, all
  // of it is inside the window; Thursday's can't tell its evening apart.
  for (const l of logs) {
    if (l.date === friday.day) l.pagesRevised.forEach((p) => read.add(p));
  }
  const pages = kahfPages();
  return pages.length > 0 && pages.every((p) => read.has(p));
}

/**
 * The reading session recorded by "Mark as read": Al-Kahf's pages, ending
 * now, lasting `minutes`. Shaped to pass the readingSessions rules (whole
 * seconds within a day, ended after it started, a stopwatch with no target).
 */
export function kahfReadingSession(
  today: string,
  minutes: number,
  now: number,
): Omit<ReadingSession, 'id'> {
  const safeMinutes = Number.isFinite(minutes)
    ? Math.min(24 * 60, Math.max(1, Math.round(minutes)))
    : KAHF_DEFAULT_MINUTES;
  const durationSeconds = safeMinutes * 60;
  return {
    date: today,
    startedAt: now - durationSeconds * 1000,
    endedAt: now,
    durationSeconds,
    mode: 'stopwatch',
    targetSeconds: null,
    pages: kahfPages(),
    pagesVisited: [],
  };
}

export type KahfCardState = 'hidden' | 'prompt' | 'done';

/** What Home shows for Al-Kahf: `friday` is the Islamic Friday it is now (kahfFridayAt), or null. */
export function kahfCardState({
  enabled,
  friday,
  dismissedDay,
  done,
}: {
  enabled: boolean;
  friday: string | null;
  /** The Friday "Not today" was last tapped for (per device), if ever. */
  dismissedDay: string | null;
  done: boolean;
}): KahfCardState {
  if (!enabled || !friday) return 'hidden';
  // "Not today" wins until Friday's maghrib (KAHF-3), even if it gets read later.
  if (dismissedDay === friday) return 'hidden';
  return done ? 'done' : 'prompt';
}

import type { ReadingSession, RevisionLog, User } from '../types';
import { getPagesForSurah } from './quranData';
import { getRevisionDayForUser } from './fajrBoundary';

/** Friday's sunnah: reading Surah Al-Kahf. */
export const KAHF_SURAH = 18;

/** Minutes offered when marking Al-Kahf as read. */
export const KAHF_MINUTE_CHOICES = [10, 15, 20, 30, 45, 60];
export const KAHF_DEFAULT_MINUTES = 20;

/** Mushaf pages of Al-Kahf (293–304), from the surah table. */
export function kahfPages(): number[] {
  return getPagesForSurah(KAHF_SURAH);
}

function weekdayOf(day: string): number {
  // Local date: new Date('YYYY-MM-DD') would be UTC midnight.
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * Whether a revision day ('YYYY-MM-DD') is a Friday. Uses the revision day,
 * not the clock: with the fajr boundary on, Thursday night up to Friday's fajr
 * is still Thursday.
 */
export function isKahfDay(revisionDay: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(revisionDay)) return false;
  return weekdayOf(revisionDay) === 5;
}

export function isKahfDayForUser(user: User | null | undefined, now: Date = new Date()): boolean {
  return isKahfDay(getRevisionDayForUser(user, now));
}

/**
 * True once every page of Al-Kahf was read on `today`, counting reading
 * sessions (the pages logged and the pages opened in the reader while the
 * timer ran) and revision logs, across any number of them.
 */
export function kahfReadOn(
  today: string,
  sessions: Pick<ReadingSession, 'date' | 'pages' | 'pagesVisited'>[],
  logs: Pick<RevisionLog, 'date' | 'pagesRevised'>[] = [],
): boolean {
  const read = new Set<number>();
  for (const s of sessions) {
    if (s.date !== today) continue;
    s.pages.forEach((p) => read.add(p));
    (s.pagesVisited ?? []).forEach((p) => read.add(p));
  }
  for (const l of logs) {
    if (l.date === today) l.pagesRevised.forEach((p) => read.add(p));
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

/** What Home shows for Al-Kahf on `today`. */
export function kahfCardState({
  enabled,
  today,
  dismissedDay,
  done,
}: {
  enabled: boolean;
  today: string;
  /** The day "Not today" was last tapped (per device), if ever. */
  dismissedDay: string | null;
  done: boolean;
}): KahfCardState {
  if (!enabled || !isKahfDay(today)) return 'hidden';
  // "Not today" wins for the rest of the day, even if it gets read later.
  if (dismissedDay === today) return 'hidden';
  return done ? 'done' : 'prompt';
}

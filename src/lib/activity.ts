import { JournalEntry, ReadingSession, RevisionLog, User } from '../types';
import { getRevisionDayForUser } from './fajrBoundary';
import {
  isJournalEntryEmpty,
  journalFilterRange,
  JournalFilter,
  journalTotalMinutes,
  shiftDay,
} from './journal';

/**
 * One revision day in the Activity timeline: everything logged on it, from
 * the three places activity is stored (revision session logs, timed reading
 * sessions and the daily log).
 */
export interface ActivityDay {
  /** Revision day, 'YYYY-MM-DD' (fajr-aware, like every stored date). */
  date: string;
  /** Revision sessions with at least one page revised. */
  revisions: RevisionLog[];
  /** Timed sessions, oldest first. */
  readings: ReadingSession[];
  /** The daily-log entry, when it has any content. */
  journal: JournalEntry | null;
  /** Voice recordings made that day (stored on this device). */
  recordings?: number;
}

export interface ActivitySources {
  logs: RevisionLog[];
  readings: ReadingSession[];
  journal: JournalEntry[];
  /** Revision day of each recording on this device. */
  recordingDays?: string[];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The day a reading session belongs to. Sessions always store their revision
 * day; a legacy or malformed document without one falls back to the revision
 * day it started on, and is dropped (null) when that is unknown too.
 */
export function readingSessionDay(
  session: Pick<ReadingSession, 'date' | 'startedAt'>,
  user?: User | null,
): string | null {
  if (typeof session.date === 'string' && DAY_RE.test(session.date)) return session.date;
  if (session.startedAt > 0) return getRevisionDayForUser(user, new Date(session.startedAt));
  return null;
}

/** Fill in fields a legacy document may lack, so the UI never sees undefined. */
export function normalizeReadingSession(
  session: ReadingSession,
  user?: User | null,
): ReadingSession | null {
  const date = readingSessionDay(session, user);
  if (!date) return null;
  const startedAt = session.startedAt || 0;
  return {
    ...session,
    date,
    startedAt,
    endedAt: session.endedAt || startedAt,
    durationSeconds: Math.max(0, session.durationSeconds || 0),
    mode: session.mode ?? 'stopwatch',
    targetSeconds: session.targetSeconds ?? null,
    pages: session.pages ?? [],
    pagesVisited: session.pagesVisited ?? [],
  };
}

/** Revision logs that count as activity (same rule as Home's recent sessions). */
export function isRevisionActivity(log: RevisionLog): boolean {
  return (log.pagesRevised?.length ?? 0) > 0;
}

/** Merge the three sources into one entry per day, newest day first. */
export function buildActivityDays(
  { logs, readings, journal, recordingDays = [] }: ActivitySources,
  user?: User | null,
): ActivityDay[] {
  const days = new Map<string, ActivityDay>();
  const dayFor = (date: string) => {
    let d = days.get(date);
    if (!d) {
      d = { date, revisions: [], readings: [], journal: null };
      days.set(date, d);
    }
    return d;
  };

  for (const log of logs) {
    if (!isRevisionActivity(log) || !DAY_RE.test(log.date)) continue;
    dayFor(log.date).revisions.push(log);
  }
  for (const raw of readings) {
    const s = normalizeReadingSession(raw, user);
    if (s) dayFor(s.date).readings.push(s);
  }
  for (const entry of journal) {
    if (!DAY_RE.test(entry.date) || isJournalEntryEmpty(entry)) continue;
    dayFor(entry.date).journal = entry;
  }
  // A day with only a recording (e.g. recorded while reading, no timer) still shows.
  for (const date of recordingDays) {
    if (!DAY_RE.test(date)) continue;
    const d = dayFor(date);
    d.recordings = (d.recordings ?? 0) + 1;
  }

  for (const d of days.values()) d.readings.sort((a, b) => a.startedAt - b.startedAt);
  return [...days.values()].sort(byDateDesc);
}

function byDateDesc(a: { date: string }, b: { date: string }): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
}

export function emptyActivityDay(date: string): ActivityDay {
  return { date, revisions: [], readings: [], journal: null };
}

export function isActivityDayEmpty(day: ActivityDay): boolean {
  return (
    day.revisions.length === 0 && day.readings.length === 0 && !day.journal && !day.recordings
  );
}

export interface ActivityDaySummary {
  /** Distinct pages revised across the day's revision sessions. */
  revisedPages: number;
  /** Logged revision-session minutes, null when none recorded a duration. */
  revisionMinutes: number | null;
  readingCount: number;
  readingSeconds: number;
  /** Memorization + revision minutes from the daily log, null if neither. */
  journalMinutes: number | null;
  /** Total time across all three, in minutes (rounded). */
  totalMinutes: number;
  /** Latest save time we know of (journal updatedAt, reading endedAt), ms. */
  lastActivityAt: number;
}

export function summarizeActivityDay(day: ActivityDay): ActivityDaySummary {
  const pages = new Set<number>();
  let revisionMinutes: number | null = null;
  for (const log of day.revisions) {
    log.pagesRevised.forEach((p) => pages.add(p));
    if (log.durationMinutes != null) revisionMinutes = (revisionMinutes ?? 0) + log.durationMinutes;
  }
  let readingSeconds = 0;
  let lastActivityAt = day.journal?.updatedAt ?? 0;
  for (const s of day.readings) {
    readingSeconds += s.durationSeconds;
    lastActivityAt = Math.max(lastActivityAt, s.endedAt);
  }
  const journalMinutes = day.journal ? journalTotalMinutes(day.journal) : null;
  const totalMinutes = Math.round(
    (revisionMinutes ?? 0) + readingSeconds / 60 + (journalMinutes ?? 0),
  );
  return {
    revisedPages: pages.size,
    revisionMinutes,
    readingCount: day.readings.length,
    readingSeconds,
    journalMinutes,
    totalMinutes,
    lastActivityAt,
  };
}

/**
 * The last `count` days ending at `today`, newest first, with the activity of
 * each (empty days included, so a missed day is one tap to backfill). Days
 * before `firstDay` (sign-up) are left out unless they have activity; today
 * is always included.
 */
export function recentActivityDays(
  days: ActivityDay[],
  today: string,
  count: number,
  firstDay?: string | null,
): ActivityDay[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: ActivityDay[] = [];
  for (let i = 0; i < count; i++) {
    const date = shiftDay(today, -i);
    const day = byDate.get(date);
    if (i > 0 && firstDay && date < firstDay && !day) continue;
    out.push(day ?? emptyActivityDay(date));
  }
  return out;
}

export function filterActivityDays(
  days: ActivityDay[],
  filter: JournalFilter,
  today: string,
): ActivityDay[] {
  const range = journalFilterRange(filter, today);
  if (!range) return days;
  return days.filter((d) => d.date >= range.from && d.date <= range.to);
}

export type ActivitySort = 'newest' | 'oldest' | 'recentlyLogged' | 'mostTime';

export const ACTIVITY_SORT_LABELS: Record<ActivitySort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  recentlyLogged: 'Recently logged',
  mostTime: 'Most time spent',
};

export function sortActivityDays(days: ActivityDay[], sort: ActivitySort): ActivityDay[] {
  const sorted = [...days];
  switch (sort) {
    case 'newest':
      return sorted.sort(byDateDesc);
    case 'oldest':
      return sorted.sort((a, b) => byDateDesc(b, a));
    case 'recentlyLogged':
      return sorted.sort(
        (a, b) =>
          summarizeActivityDay(b).lastActivityAt - summarizeActivityDay(a).lastActivityAt ||
          byDateDesc(a, b),
      );
    case 'mostTime':
      return sorted.sort(
        (a, b) =>
          summarizeActivityDay(b).totalMinutes - summarizeActivityDay(a).totalMinutes ||
          byDateDesc(a, b),
      );
  }
}

/** Distinct months with activity, newest first ('YYYY-MM'). */
export function activityMonths(days: ActivityDay[]): string[] {
  return [...new Set(days.map((d) => d.date.slice(0, 7)))].sort().reverse();
}

export interface ActivityTotals {
  revisedPages: number;
  readingSeconds: number;
  /** Daily-log minutes (memorization + revision). */
  journalMinutes: number;
  activeDays: number;
}

/** Totals over the given days (pages are summed per day, not deduplicated). */
export function sumActivity(days: ActivityDay[]): ActivityTotals {
  const totals: ActivityTotals = { revisedPages: 0, readingSeconds: 0, journalMinutes: 0, activeDays: 0 };
  for (const d of days) {
    if (isActivityDayEmpty(d)) continue;
    const s = summarizeActivityDay(d);
    totals.revisedPages += s.revisedPages;
    totals.readingSeconds += s.readingSeconds;
    totals.journalMinutes += s.journalMinutes ?? 0;
    totals.activeDays++;
  }
  return totals;
}

/** Days in the `count`-day window ending at `today`. */
export function activityInWindow(days: ActivityDay[], today: string, count: number): ActivityDay[] {
  const from = shiftDay(today, -(count - 1));
  return days.filter((d) => d.date >= from && d.date <= today);
}

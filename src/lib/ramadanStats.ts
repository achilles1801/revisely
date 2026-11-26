// What a Ramadan has held so far (BEHAVIOUR.md THEME-6, THEME-7), from the phone's own days: which days had a revision,
// the pages revised and read with their minutes, and how many of the Qur'an's 604 pages were revised or read since
// 1 Ramadan (a khatmah once it reaches them all). Insights' Ramadan row and page, and the end card, read it.
//
// A day is a revision day (YYYY-MM-DD, Fajr-aware), as every log and timed reading already keeps it. A reading's pages are
// the ones the user gave it, or else those the reader opened while the timer ran (lib/activityItems does the same).

import type { ReadingSession, RevisionLog } from '../types';
import { daysBetween } from './dayKeys';
import { ramadanDayOf, type RamadanDates } from './ramadanDates';

export const QURAN_PAGES = 604;

export interface RamadanStats {
  /** Ramadan's days up to today (all of them once it has ended). */
  daysSoFar: number;
  /** The month's days (1 to 29 or 30) that had a revision. */
  revisedDays: number[];
  /** Pages revised, each time it was revised. */
  pagesRevised: number;
  minutesRevised: number;
  /** Different pages read. */
  pagesRead: number;
  minutesRead: number;
  /** Different pages revised or read since 1 Ramadan, at most 604. */
  covered: number;
}

type Log = Pick<RevisionLog, 'date' | 'pagesRevised' | 'durationMinutes'>;
type Reading = Pick<ReadingSession, 'date' | 'pages' | 'pagesVisited' | 'durationSeconds'>;

export function ramadanStats(logs: readonly Log[], readings: readonly Reading[], dates: RamadanDates, today: string): RamadanStats {
  const length = daysBetween(dates.start, dates.eid);
  const soFar = Math.max(0, Math.min(length, daysBetween(dates.start, today) + 1));
  /** The day's number in Ramadan, if it's in it and not after today. */
  const dayOf = (day: string): number | null => {
    const n = ramadanDayOf(day, dates);
    return n != null && n <= soFar ? n : null;
  };
  const revised = new Set<number>();
  const read = new Set<number>();
  const days = new Set<number>();
  let pagesRevised = 0;
  let minutesRevised = 0;
  let minutesRead = 0;
  for (const log of logs) {
    const n = dayOf(log.date);
    if (n == null || log.pagesRevised.length === 0) continue;
    days.add(n);
    pagesRevised += log.pagesRevised.length;
    minutesRevised += log.durationMinutes ?? 0;
    log.pagesRevised.forEach((p) => revised.add(p));
  }
  for (const r of readings) {
    if (dayOf(r.date) == null) continue;
    const pages = r.pages.length > 0 ? r.pages : (r.pagesVisited ?? []);
    pages.forEach((p) => read.add(p));
    minutesRead += Math.max(0, r.durationSeconds) / 60;
  }
  const covered = new Set([...revised, ...read].filter((p) => p >= 1 && p <= QURAN_PAGES));
  return {
    daysSoFar: soFar,
    revisedDays: [...days].sort((a, b) => a - b),
    pagesRevised,
    minutesRevised: Math.round(minutesRevised),
    pagesRead: read.size,
    minutesRead: Math.round(minutesRead),
    covered: covered.size,
  };
}

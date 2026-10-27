import { ActivityDay, isActivityDayEmpty, summarizeActivityDay } from './activity';
import { shiftDay } from './journal';

// Activity's calendar (new design): a month (or a week) of revision days, each
// in jade by how much it held.
// Days are revision days ('YYYY-MM-DD', fajr-aware), so a session after
// midnight but before fajr lands on the day it belongs to.

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/**
 * Scores at which a day reaches levels 2, 3 and 4 (any activity at all is 1).
 * A juz revised (20 pages) is level 3; a juz with its time recorded, or two
 * juz, is level 4.
 */
export const HEAT_STEPS = [10, 20, 40] as const;

/**
 * One number for how much a day held: pages revised, plus minutes timed, plus
 * minutes written in the daily log. A revision session's own duration isn't
 * added: its pages already count it.
 */
export function activityScore(day: ActivityDay): number {
  const s = summarizeActivityDay(day);
  return s.revisedPages + Math.round(s.readingSeconds / 60) + (s.journalMinutes ?? 0);
}

export function heatLevel(day: ActivityDay | undefined): HeatLevel {
  if (!day || isActivityDayEmpty(day)) return 0;
  const score = activityScore(day);
  if (score >= HEAT_STEPS[2]) return 4;
  if (score >= HEAT_STEPS[1]) return 3;
  if (score >= HEAT_STEPS[0]) return 2;
  // A note or a recording on its own still shows.
  return 1;
}

function localDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole days from `from` to `to` (both 'YYYY-MM-DD'). */
export function daysBetween(from: string, to: string): number {
  return Math.round((localDay(to).getTime() - localDay(from).getTime()) / 86_400_000);
}

/** The Sunday that starts the week holding `day`. */
export function weekStart(day: string): string {
  return shiftDay(day, -localDay(day).getDay());
}

/** The week holding `day`, Sunday to Saturday. */
export function weekOf(day: string): string[] {
  const sunday = weekStart(day);
  return Array.from({ length: 7 }, (_, i) => shiftDay(sunday, i));
}

/** 'YYYY-MM' moved by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * A month as calendar rows, Sunday to Saturday; days outside the month are
 * null. Four to six rows.
 */
export function monthGrid(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const rows: (string | null)[][] = [];
  let day = weekStart(first);
  while (rows.length === 0 || day.slice(0, 7) === month) {
    const row = Array.from({ length: 7 }, (_, i) => {
      const d = shiftDay(day, i);
      return d.slice(0, 7) === month ? d : null;
    });
    rows.push(row);
    day = shiftDay(day, 7);
  }
  return rows;
}

/** "October 2026". */
export function monthTitle(month: string): string {
  return localDay(`${month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** "Oct 25 – 31", "Sep 27 – Oct 3", with the year when it isn't this year's. */
export function weekTitle(sunday: string, today: string): string {
  const saturday = shiftDay(sunday, 6);
  const a = localDay(sunday);
  const b = localDay(saturday);
  const mon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  const end = a.getMonth() === b.getMonth() ? `${b.getDate()}` : `${mon(b)} ${b.getDate()}`;
  const year = saturday.slice(0, 4) !== today.slice(0, 4) ? `, ${b.getFullYear()}` : '';
  return `${mon(a)} ${a.getDate()} – ${end}${year}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "34 min", "1h 5m". */
export function formatMinutesShort(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** What a day held, as short parts: "12 pages revised", "18 read", "34 min", "1 recording". */
export function dayFacts(day: ActivityDay | undefined): string[] {
  if (!day || isActivityDayEmpty(day)) return [];
  const s = summarizeActivityDay(day);
  const read = new Set(day.readings.flatMap((r) => r.pages)).size;
  const parts: string[] = [];
  if (s.revisedPages > 0) parts.push(`${plural(s.revisedPages, 'page')} revised`);
  if (read > 0) parts.push(s.revisedPages > 0 ? `${read} read` : `${plural(read, 'page')} read`);
  if (s.totalMinutes > 0) parts.push(formatMinutesShort(s.totalMinutes));
  if ((day.recordings ?? 0) > 0) parts.push(plural(day.recordings ?? 0, 'recording'));
  // Only the daily log, with nothing countable in it.
  if (parts.length === 0 && day.journal) parts.push('Daily log');
  return parts;
}

/** "Sat, Oct 24" (with the year when it isn't this year's). */
export function heatDayLabel(date: string, today: string): string {
  const d = localDay(date);
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** VoiceOver's name for a cell: "Saturday, October 24: 12 pages revised, 34 min". */
export function heatCellLabel(date: string, day: ActivityDay | undefined): string {
  const name = localDay(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const facts = dayFacts(day);
  return `${name}: ${facts.length > 0 ? facts.join(', ') : 'no activity'}`;
}

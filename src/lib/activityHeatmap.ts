import { ActivityDay, isActivityDayEmpty, summarizeActivityDay } from './activity';
import { shiftDay } from './journal';

// The contribution graph on Activity (new design): a column per week, a row per
// weekday (Sunday on top), a cell per revision day, darker the more it held.
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

/**
 * `count` week columns ending with the week that holds `today`, oldest first.
 * Each column is Sunday to Saturday; days after today are null.
 */
export function heatmapWeeks(today: string, count: number): (string | null)[][] {
  const sunday = shiftDay(today, -localDay(today).getDay());
  const weeks: (string | null)[][] = [];
  for (let w = count - 1; w >= 0; w--) {
    const start = shiftDay(sunday, -7 * w);
    const col: (string | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const date = shiftDay(start, d);
      col.push(date > today ? null : date);
    }
    weeks.push(col);
  }
  return weeks;
}

/**
 * Month names over the columns where a month starts ("Oct" over the first week
 * whose Sunday is in October). The first column's label is dropped when the
 * next one would sit on top of it.
 */
export function monthLabels(weeks: (string | null)[][]): { index: number; label: string }[] {
  const out: { index: number; label: string }[] = [];
  let prev = '';
  weeks.forEach((col, index) => {
    const first = col.find((d): d is string => d != null);
    if (!first) return;
    const month = first.slice(0, 7);
    if (month !== prev) {
      out.push({ index, label: localDay(first).toLocaleDateString('en-US', { month: 'short' }) });
      prev = month;
    }
  });
  if (out.length > 1 && out[1].index - out[0].index < 3) out.shift();
  return out;
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

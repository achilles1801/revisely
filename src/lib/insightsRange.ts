// Insights' time range (Majd, Nov 7 2026: "why is insights restricted to just the last 30 days?"; the
// NOTE's table, mocks i1 and i2): one range for the whole tab, chosen from the "30 days ⌄" chip and kept
// on the phone. 7 days, 30 days (the default), 3 months and All time (since the account's first day:
// Coverage in cycles, a weeks grid from the start).

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);
const shiftDay = (day: string, n: number) => new Date((dayNumber(day) + n) * 86_400_000).toISOString().slice(0, 10);

export type InsightsRange = 7 | 30 | 90 | 'all';
export const INSIGHTS_RANGES: InsightsRange[] = [7, 30, 90, 'all'];
export const INSIGHTS_RANGE_KEY = 'activity.insightsRange';

/** The last choice, or 30 days when there is none (or it is unreadable). */
export function parseRange(value: string | null | undefined): InsightsRange {
  if (value === 'all') return 'all';
  const n = Number(value);
  return n === 7 || n === 90 ? n : 30;
}

/** The chip's and the menu's words: "7 days", "30 days", "3 months", "All time". */
export function rangeLabel(range: InsightsRange): string {
  return range === 'all' ? 'All time' : range === 90 ? '3 months' : `${range} days`;
}

/** "7 days", "30 days", "3 months" (a range of days, in a sentence). */
export function rangeWords(range: Exclude<InsightsRange, 'all'>): string {
  return range === 90 ? '3 months' : `${range} days`;
}

/** Pace's comparison: "the week before", "the month before", "the 3 months before". */
export function beforeWords(range: Exclude<InsightsRange, 'all'>): string {
  return range === 7 ? 'the week before' : range === 30 ? 'the month before' : 'the 3 months before';
}

/** "9 September" (a day, as "since …" says it). */
export function dayAndMonth(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** A range as each section reads it: how many days, and the words for them. */
export interface RangeSpan {
  /** Days, today included: the range's, or since the account's first day (All time). */
  window: number;
  /** "in 30 days" / "since 9 September". */
  inWords: string;
  /** "last 30 days" / "since 9 September". */
  lastWords: string;
  /** "in the last 30 days" / "since 9 September". */
  inTheLast: string;
  /** Pace's comparison ("the month before"); none for All time. */
  before: string | null;
  all: boolean;
}

export function rangeSpan(range: InsightsRange, today: string, firstDay?: string | null): RangeSpan {
  if (range !== 'all') {
    const w = rangeWords(range);
    return { window: range, inWords: `in ${w}`, lastWords: `last ${w}`, inTheLast: `in the last ${w}`, before: beforeWords(range), all: false };
  }
  const since = firstDay ? `since ${dayAndMonth(firstDay)}` : 'since you started';
  const window = firstDay ? Math.max(1, daysBetween(firstDay, today) + 1) : 3650;
  return { window, inWords: since, lastWords: since, inTheLast: since, before: null, all: true };
}

/** Days of items the tab needs: the range and the same length before it (Pace compares the two), 90 at
 *  least; All time, every day since the account's first. */
export function daysToLoad(range: InsightsRange, today?: string, firstDay?: string | null): number {
  if (range === 'all') return today && firstDay ? Math.max(90, daysBetween(firstDay, today) + 1) : 730;
  return Math.max(90, range * 2);
}

/** Coverage over All time, in cycles: page revisions on record, over the memorized pages ("3.1"). */
export function coverageCycles(revised: { countsFor: string; pages: number[] }[], today: string, memorized: number): string {
  if (memorized <= 0) return '0';
  const pages = revised.filter((r) => daysBetween(r.countsFor, today) >= 0).reduce((n, r) => n + r.pages.length, 0);
  return (pages / memorized).toFixed(1).replace(/\.0$/, '');
}

/**
 * Coverage's percentage: rounded, but never 100% while a page is left (at 3 months 304 of 305 would
 * round to 100%: one page missing still shows, as 99%).
 */
export function coveragePercent(revised: number, of: number): number {
  if (of <= 0) return 0;
  const pct = Math.round((revised / of) * 100);
  return pct >= 100 && revised < of ? 99 : pct;
}

/**
 * Active days in the range (a revision or a read: ACT-4), out of its days, or out of the days since the
 * account started when that is shorter ("50 of 56 days since 9 September").
 */
export function activeDays(active: Set<string>, today: string, range: number, firstDay?: string | null): { done: number; of: number; sinceStart: string | null } {
  const since = firstDay ? daysBetween(firstDay, today) + 1 : Infinity;
  const of = Math.max(1, Math.min(range, since));
  let done = 0;
  for (let k = 0; k < of; k++) if (active.has(shiftDay(today, -k))) done++;
  return { done, of, sinceStart: since < range && firstDay ? firstDay : null };
}

export type GridCell = { day: string; state: 'done' | 'missed' | 'before' | 'after' };

/**
 * The weeks grid (3 months): a column per week, Sunday to Saturday, ending with this week. Days before
 * the account started, or after today, are blank.
 */
export function weeksGrid(active: Set<string>, today: string, weeks: number, firstDay?: string | null): GridCell[][] {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const lastSunday = shiftDay(today, -dow);
  const cols: GridCell[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const sunday = shiftDay(lastSunday, -7 * w);
    const col: GridCell[] = [];
    for (let d = 0; d < 7; d++) {
      const day = shiftDay(sunday, d);
      const state = day > today ? 'after' : firstDay && day < firstDay ? 'before' : active.has(day) ? 'done' : 'missed';
      col.push({ day, state });
    }
    cols.push(col);
  }
  return cols;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * A pattern in the missed days of the range, if there is a plain one: "Every missed day was a Saturday",
 * "Every missed day was a Friday or a Saturday" (two days side by side), "Most missed days were
 * Sundays (4 of 6)", which needs three of that day. Nothing under three missed days, or with no clear pattern. Weekdays are named, never
 * "weekend", which differs by country.
 */
export function missedPattern(active: Set<string>, today: string, range: number, firstDay?: string | null): string | null {
  const { of } = activeDays(active, today, range, firstDay);
  const byDay = new Array(7).fill(0);
  let missed = 0;
  // Today isn't over: it never counts as missed.
  for (let k = 1; k < of; k++) {
    const day = shiftDay(today, -k);
    if (active.has(day)) continue;
    missed++;
    byDay[new Date(`${day}T00:00:00Z`).getUTCDay()]++;
  }
  if (missed < 3) return null;
  const order = byDay.map((n, d) => ({ n, d })).sort((a, b) => b.n - a.n || a.d - b.d);
  const [top, second] = order;
  if (top.n === missed) return `Every missed day was a ${WEEKDAYS[top.d]}`;
  const sideBySide = (a: number, b: number) => (a - b + 7) % 7 === 1 || (b - a + 7) % 7 === 1;
  if (top.n + second.n === missed && sideBySide(top.d, second.d)) {
    const [a, b] = [top.d, second.d].sort((x, y) => ((x - y + 7) % 7 === 1 ? 1 : -1));
    return `Every missed day was a ${WEEKDAYS[a]} or a ${WEEKDAYS[b]}`;
  }
  if (top.n >= 3 && top.n * 2 >= missed) return `Most missed days were ${WEEKDAYS[top.d]}s (${top.n} of ${missed})`;
  return null;
}

/** Pages memorized in the range ("+9 in 30 days"). */
export function memorizedIn(items: { day: string; pages: number[] }[], today: string, range: number): number {
  return items.filter((i) => {
    const age = daysBetween(i.day, today);
    return age >= 0 && age < range;
  }).reduce((n, i) => n + i.pages.length, 0);
}

/**
 * Pace week by week (All time, the NOTE's table): minutes a page of each week's timed revisions, oldest
 * first, the last week ending today; null for a week with none. At most `weeks` weeks, from the first
 * week that has any.
 */
export function weeklyPace(
  revised: { day: string; countsFor?: string; pages: number[]; minutes: number | null }[],
  today: string,
  weeks = 26,
): (number | null)[] {
  const sums = Array.from({ length: weeks }, () => ({ minutes: 0, pages: 0 }));
  for (const r of revised) {
    if (r.countsFor != null && r.countsFor !== r.day) continue;
    if (r.minutes == null || r.minutes <= 0 || r.pages.length === 0) continue;
    const age = daysBetween(r.day, today);
    if (age < 0) continue;
    const w = weeks - 1 - Math.floor(age / 7);
    if (w < 0) continue;
    sums[w].minutes += r.minutes;
    sums[w].pages += r.pages.length;
  }
  const out = sums.map((s) => (s.pages > 0 ? s.minutes / s.pages : null));
  const first = out.findIndex((v) => v != null);
  return first < 0 ? [] : out.slice(first);
}

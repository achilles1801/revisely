// Insights' time range (Majd, Nov 7 2026: "why is insights restricted to just the last 30 days?"; the
// NOTE's table, mocks i1 and i2): one range for the whole tab, chosen from the "30 days ⌄" chip and kept
// on the phone. 7 days, 30 days (the default) and 3 months; All time follows (cycles, a weeks grid
// from the account's start).

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);
const shiftDay = (day: string, n: number) => new Date((dayNumber(day) + n) * 86_400_000).toISOString().slice(0, 10);

export type InsightsRange = 7 | 30 | 90;
export const INSIGHTS_RANGES: InsightsRange[] = [7, 30, 90];
export const INSIGHTS_RANGE_KEY = 'activity.insightsRange';

/** The last choice, or 30 days when there is none (or it is unreadable). */
export function parseRange(value: string | null | undefined): InsightsRange {
  const n = Number(value);
  return n === 7 || n === 90 ? n : 30;
}

/** "7 days", "30 days", "3 months": the chip and the sections' words. */
export function rangeWords(range: InsightsRange): string {
  return range === 90 ? '3 months' : `${range} days`;
}

/** Pace's comparison: "the week before", "the month before", "the 3 months before". */
export function beforeWords(range: InsightsRange): string {
  return range === 7 ? 'the week before' : range === 30 ? 'the month before' : 'the 3 months before';
}

/** Days of items the tab needs: the range, and the same length before it (Pace compares the two). */
export function daysToLoad(range: InsightsRange): number {
  return Math.max(90, range * 2);
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
export function activeDays(active: Set<string>, today: string, range: InsightsRange, firstDay?: string | null): { done: number; of: number; sinceStart: string | null } {
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
export function missedPattern(active: Set<string>, today: string, range: InsightsRange, firstDay?: string | null): string | null {
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
export function memorizedIn(items: { day: string; pages: number[] }[], today: string, range: InsightsRange): number {
  return items.filter((i) => {
    const age = daysBetween(i.day, today);
    return age >= 0 && age < range;
  }).reduce((n, i) => n + i.pages.length, 0);
}

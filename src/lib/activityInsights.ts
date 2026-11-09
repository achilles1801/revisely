// Activity's Insights and calendar marks, from items (Activity spec section 5, C3).
// Pure: the screens pass in items and get the figures. Days are YYYY-MM-DD revision days.

export interface Revised { day: string; pages: number[]; assigned?: number[]; minutes: number | null; countsFor: string; }
export interface Memorized { day: string; pages: number[]; }
export interface Read { day: string; pages: number[]; minutes: number | null; }

/** Pace shows only when at least this many items carry minutes (suggested; open point). */
export const PACE_MIN_ITEMS = 10;

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);

/** The last day each page was revised (own or credited items, by the day it counts for). */
/**
 * Each page's last revision: the day it was revised, whatever day it was credited to (AHEAD-6). Pages
 * revised ahead (Keep going) or caught up are revised that day; they count for their own day only in the
 * schedule (lib/aheadCredit). Before Nov 9 2026 this read the credited day and skipped a credit for a later
 * day, so pages revised ahead were missing from Coverage until their day came.
 */
export function lastRevisedByPage(revised: Revised[], today: string): Map<number, string> {
  const last = new Map<number, string>();
  for (const r of revised) {
    const on = r.day ?? r.countsFor;
    if (daysBetween(on, today) < 0) continue;
    for (const p of r.pages) {
      const prev = last.get(p);
      if (prev == null || on > prev) last.set(p, on);
    }
  }
  return last;
}

/** Share of memorized pages revised within the last `window` days (today included). */
export function coverage(memorized: Set<number>, last: Map<number, string>, today: string, window: number): number {
  if (memorized.size === 0) return 0;
  let n = 0;
  for (const p of memorized) {
    const d = last.get(p);
    if (d != null && daysBetween(d, today) < window) n++;
  }
  return n / memorized.size;
}

/** The juz whose memorized pages were revised longest ago (or never). */
export function juzUntouchedLongest(
  juzOf: (page: number) => number,
  memorized: Set<number>,
  last: Map<number, string>,
  today: string,
): { juz: number; daysSince: number | null } | null {
  const oldest = new Map<number, number | null>(); // juz -> days since its newest revision (null: never)
  for (const p of memorized) {
    const j = juzOf(p);
    const d = last.get(p);
    const since = d == null ? null : daysBetween(d, today);
    if (!oldest.has(j)) oldest.set(j, since);
    else {
      const cur = oldest.get(j);
      // The juz is as untouched as its least recently revised page.
      if (since == null || (cur != null && since > cur)) oldest.set(j, since);
    }
  }
  let best: { juz: number; daysSince: number | null } | null = null;
  for (const [juz, since] of oldest) {
    if (best == null || (since == null && best.daysSince != null) || (since != null && best.daysSince != null && since > best.daysSince)) {
      best = { juz, daysSince: since };
    }
  }
  return best;
}

/** Days with any Revised or Read item in the window, and per weekday (0 = Sunday). */
export function consistency(
  items: { day: string }[],
  today: string,
  window: number,
): { days: number; of: number; perWeekday: number[] } {
  const seen = new Set<string>();
  for (const i of items) if (daysBetween(i.day, today) >= 0 && daysBetween(i.day, today) < window) seen.add(i.day);
  const perWeekday = [0, 0, 0, 0, 0, 0, 0];
  for (const d of seen) perWeekday[new Date(`${d}T00:00:00Z`).getUTCDay()]++;
  return { days: seen.size, of: window, perWeekday };
}

/** Pages memorized per month, from memorization items (YYYY-MM -> pages). */
export function growthByMonth(memorized: Memorized[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of memorized) {
    const month = m.day.slice(0, 7);
    out.set(month, (out.get(month) ?? 0) + m.pages.length);
  }
  return out;
}

/** Minutes per page over the window, or null when too few items carry minutes. */
export function pace(items: { pages: number[]; minutes: number | null; day: string }[], today: string, window: number): number | null {
  const timed = items.filter((i) => i.minutes != null && i.minutes > 0 && daysBetween(i.day, today) >= 0 && daysBetween(i.day, today) < window);
  if (timed.length < PACE_MIN_ITEMS) return null;
  const minutes = timed.reduce((n, i) => n + (i.minutes ?? 0), 0);
  const pages = timed.reduce((n, i) => n + i.pages.length, 0);
  return pages > 0 ? minutes / pages : null;
}

/** One calendar day's marks (C3): the ring is the share of assigned pages revised. */
export function dayMarks(
  day: string,
  input: { revised: Revised[]; memorized: Memorized[]; read: Read[]; noteDays: Set<string> },
): { ring: number | null; memorized: boolean; read: boolean; note: boolean } {
  const own = input.revised.filter((r) => r.day === day && r.countsFor === day);
  const assigned = own.reduce((n, r) => n + (r.assigned?.length ?? 0), 0);
  const revised = own.reduce((n, r) => n + r.pages.length, 0);
  return {
    ring: assigned > 0 ? Math.min(1, revised / assigned) : null,
    memorized: input.memorized.some((m) => m.day === day),
    read: input.read.some((r) => r.day === day),
    note: input.noteDays.has(day),
  };
}

/** What a calendar day previews under the grid: the blocks it holds, with their figures. */
export function dayPreview(
  day: string,
  input: { revised: Revised[]; memorized: Memorized[]; read: Read[]; noteDays: Set<string> },
): { revised: { done: number; assigned: number; minutes: number | null } | null; memorizedPages: number; readPages: number; readMinutes: number | null; notes: boolean } {
  const own = input.revised.filter((r) => r.day === day && r.countsFor === day);
  const assigned = own.reduce((n, r) => n + (r.assigned?.length ?? 0), 0);
  const done = own.reduce((n, r) => n + r.pages.length, 0);
  const minutes = own.reduce<number | null>((n, r) => (r.minutes == null ? n : (n ?? 0) + r.minutes), null);
  const reads = input.read.filter((r) => r.day === day);
  const readMinutes = reads.reduce<number | null>((n, r) => (r.minutes == null ? n : (n ?? 0) + r.minutes), null);
  return {
    revised: own.length > 0 ? { done, assigned, minutes } : null,
    memorizedPages: input.memorized.filter((m) => m.day === day).reduce((n, m) => n + m.pages.length, 0),
    readPages: reads.reduce((n, r) => n + r.pages.length, 0),
    readMinutes,
    notes: input.noteDays.has(day),
  };
}

/** The window's days, oldest first, each with whether it had a revision or a read (the consistency picture). */
export function dayPattern(items: { day: string }[], today: string, window: number): boolean[] {
  const had = new Set(items.map((i) => i.day));
  const out: boolean[] = [];
  for (let k = window - 1; k >= 0; k--) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - k);
    out.push(had.has(d.toISOString().slice(0, 10)));
  }
  return out;
}


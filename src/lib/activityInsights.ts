// Activity's Insights and calendar marks, from items (Activity spec section 5, C3).
// Pure: the screens pass in items and get the figures. Days are YYYY-MM-DD revision days.

export interface Revised { day: string; pages: number[]; minutes: number | null; countsFor: string; }
export interface Memorized { day: string; pages: number[]; }
export interface Read { day: string; pages: number[]; minutes: number | null; }

/** Pace shows only when at least this many items carry minutes (suggested; open point). */
export const PACE_MIN_ITEMS = 10;

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);

/** The last day each page was revised (own or credited items, by the day it counts for). */
export function lastRevisedByPage(revised: Revised[], today: string): Map<number, string> {
  const last = new Map<number, string>();
  for (const r of revised) {
    if (daysBetween(r.countsFor, today) < 0) continue; // a credit for a later day is not a revision yet
    for (const p of r.pages) {
      const prev = last.get(p);
      if (prev == null || r.countsFor > prev) last.set(p, r.countsFor);
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
  const assigned = own.reduce((n, r) => n + (r.pages.length > 0 ? r.pages.length : 0), 0);
  const revised = own.reduce((n, r) => n + r.pages.length, 0);
  return {
    ring: assigned > 0 ? Math.min(1, revised / assigned) : null,
    memorized: input.memorized.some((m) => m.day === day),
    read: input.read.some((r) => r.day === day),
    note: input.noteDays.has(day),
  };
}

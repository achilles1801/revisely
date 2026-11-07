// What Insights draws (gap audit §5, mock d4), from items: the juz tiles and the juz untouched longest
// (Coverage), the week's circles, a month's count and the minutes by hour (Consistency), the weak-spot
// rows, the months of memorization and the pace tiles. Pure: the screen passes the data in.
// Days are YYYY-MM-DD revision days; definitions follow ACT-4 (lib/activityInsights).

import { getPagesForJuz, getSurahsForPage } from './quranData';
import { PACE_MIN_ITEMS } from './activityInsights';

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);
const shiftDay = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const within = (day: string, today: string, window: number) => {
  const since = daysBetween(day, today);
  return since >= 0 && since < window;
};

// ── Coverage ─────────────────────────────────────────────────────────────

/** A juz tile: revised this week, this month, over 30 days ago (or never), or not memorized (yet). */
export type JuzState = 'week' | 'month' | 'stale' | 'none';
export interface JuzTile {
  juz: number;
  state: JuzState;
  /** Not memorized yet, with pages memorized or being learned (the tile's dot). */
  learning: boolean;
  /** Days since its least recently revised memorized page (null: one was never revised, or none memorized). */
  daysSince: number | null;
}

/**
 * The 30 juz. A juz is memorized once at least half its pages are; one with fewer is being learned (not
 * memorized, with the dot), so a page memorized today never makes its juz "untouched the longest". A
 * memorized juz is as recent as its least recently revised memorized page (ACT-4's "juz untouched
 * longest"): this week when that is within 7 days, this month within 30, otherwise (or never) stale.
 */
export function juzTiles(memorized: Set<number>, learning: Set<number>, last: Map<number, string>, today: string): JuzTile[] {
  const tiles: JuzTile[] = [];
  for (let juz = 1; juz <= 30; juz++) {
    const pages = getPagesForJuz(juz);
    const mine = pages.filter((p) => memorized.has(p));
    if (mine.length * 2 < pages.length) {
      tiles.push({ juz, state: 'none', learning: mine.length > 0 || pages.some((p) => learning.has(p)), daysSince: null });
      continue;
    }
    let oldest: number | null = 0;
    for (const p of mine) {
      const d = last.get(p);
      if (d == null) {
        oldest = null;
        break;
      }
      oldest = Math.max(oldest, daysBetween(d, today));
    }
    const state: JuzState = oldest == null || oldest >= 30 ? 'stale' : oldest < 7 ? 'week' : 'month';
    tiles.push({ juz, state, learning: false, daysSince: oldest });
  }
  return tiles;
}

/**
 * The juz untouched the longest and the next one, when the longest is stale (over 30 days, or never):
 * "Juz 4, untouched the longest · Last revised 41 days ago · Juz 5, 33 days".
 */
export function untouchedJuz(tiles: JuzTile[]): { first: JuzTile; next: JuzTile | null } | null {
  const memorized = tiles.filter((t) => t.state !== 'none');
  const age = (t: JuzTile) => (t.daysSince == null ? Number.POSITIVE_INFINITY : t.daysSince);
  const sorted = [...memorized].sort((a, b) => age(b) - age(a) || a.juz - b.juz);
  if (sorted.length === 0 || sorted[0].state !== 'stale') return null;
  return { first: sorted[0], next: sorted[1] ?? null };
}

/** Memorized pages revised within the window: "265 of 305". */
export function coverageCount(memorized: Set<number>, last: Map<number, string>, today: string, window: number): { revised: number; of: number } {
  let revised = 0;
  for (const p of memorized) {
    const d = last.get(p);
    if (d != null && within(d, today, window)) revised++;
  }
  return { revised, of: memorized.size };
}

// ── Consistency ──────────────────────────────────────────────────────────

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** The last seven days, oldest first, each with its weekday letter and whether it was active. */
export function weekCircles(active: Set<string>, today: string): { day: string; letter: string; done: boolean }[] {
  const out: { day: string; letter: string; done: boolean }[] = [];
  for (let k = 6; k >= 0; k--) {
    const day = shiftDay(today, -k);
    out.push({ day, letter: LETTERS[new Date(`${day}T00:00:00Z`).getUTCDay()], done: active.has(day) });
  }
  return out;
}

/**
 * The month Insights reports on: this month from its 7th day, before that the month just ended (on
 * 3 November, "26 of 31 in October" and "+9 in October": three days are too few to say much).
 */
export function reportMonth(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  if (d >= 7) return today.slice(0, 7);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** "October". */
export function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
}

/** Active days in the month, out of its days so far (all of them once it is over). */
export function monthCount(active: Set<string>, month: string, today: string): { done: number; of: number } {
  const [y, m] = month.split('-').map(Number);
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const of = today.startsWith(month) ? Number(today.slice(8, 10)) : length;
  let done = 0;
  for (let d = 1; d <= of; d++) if (active.has(`${month}-${String(d).padStart(2, '0')}`)) done++;
  return { done, of };
}

/**
 * Minutes by hour of the day (local time) over the window, each item's minutes spread from its start:
 * a 34-minute session from 5:40 gives 20 to 5 AM and 14 to 6 AM.
 */
export function minutesByHour(
  items: { day: string; occurredAt?: number | null; minutes: number | null }[],
  today: string,
  window: number,
): number[] {
  const hours = new Array<number>(24).fill(0);
  for (const i of items) {
    if (i.occurredAt == null || i.minutes == null || i.minutes <= 0 || !within(i.day, today, window)) continue;
    let at = new Date(i.occurredAt);
    let left = i.minutes;
    while (left > 0) {
      const room = 60 - at.getMinutes();
      const take = Math.min(left, room);
      hours[at.getHours()] += take;
      left -= take;
      at = new Date(at.getTime() + take * 60_000);
    }
  }
  return hours;
}

const hourParts = (h: number) => ({ n: h % 12 === 0 ? 12 : h % 12, p: h % 24 < 12 ? 'AM' : 'PM' });
/** Hours [from, to) as "5–7 AM", "11 AM–1 PM". */
export function hourRange(from: number, to: number): string {
  const a = hourParts(from);
  const b = hourParts(to);
  return a.p === b.p ? `${a.n}–${b.n} ${b.p}` : `${a.n} ${a.p}–${b.n} ${b.p}`;
}

/**
 * "Mostly 5–7 AM, then 9–10 PM": the busiest runs of hours (each hour at least half the busiest),
 * the biggest first. Null with no timed minutes.
 */
export function busiestHours(hours: number[]): string | null {
  const max = Math.max(0, ...hours);
  if (max <= 0) return null;
  const runs: { from: number; to: number; total: number }[] = [];
  for (let h = 0; h < 24; h++) {
    if (hours[h] < max / 2) continue;
    const prev = runs[runs.length - 1];
    if (prev && prev.to === h) {
      prev.to = h + 1;
      prev.total += hours[h];
    } else runs.push({ from: h, to: h + 1, total: hours[h] });
  }
  runs.sort((a, b) => b.total - a.total || a.from - b.from);
  const [first, second] = runs;
  return second ? `Mostly ${hourRange(first.from, first.to)}, then ${hourRange(second.from, second.to)}` : `Mostly ${hourRange(first.from, first.to)}`;
}

// ── Weak spots ───────────────────────────────────────────────────────────

export interface WeakSpotRow {
  surah: string;
  pages: number[];
  /** "p. 548–549". */
  label: string;
  weakNow: boolean;
  /** Times its pages were rated weak, and skipped, in the window (the most of any of its pages). */
  ratedWeak: number;
  skipped: number;
  reason: string;
}

/**
 * Memorized pages weak now (rated 1–2), or skipped at least twice in the window, as runs of pages within
 * a surah: the most flagged first (times rated weak and skipped in the window), then weak now, then by
 * page. At most `limit` rows.
 */
export function weakSpotRows(input: {
  memorized: Set<number>;
  rating: (page: number) => number | undefined;
  /** Times each page was rated weak (1–2) in the window, from the sessions' ratings. */
  ratedWeak: Map<number, number>;
  revisions: { day: string; skipped: number[] }[];
  today: string;
  window?: number;
  limit?: number;
}): WeakSpotRow[] {
  const window = input.window ?? 30;
  const skips = new Map<number, number>();
  for (const r of input.revisions) {
    if (!within(r.day, input.today, window)) continue;
    for (const p of new Set(r.skipped)) skips.set(p, (skips.get(p) ?? 0) + 1);
  }
  const flagged = [...input.memorized]
    .filter((p) => (input.rating(p) ?? 5) <= 2 || (skips.get(p) ?? 0) >= 2)
    .sort((a, b) => a - b);
  const surahOf = (p: number) => getSurahsForPage(p)[0]?.name ?? '';
  const rows: WeakSpotRow[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const weakNow = run.some((p) => (input.rating(p) ?? 5) <= 2);
    const ratedWeak = Math.max(...run.map((p) => input.ratedWeak.get(p) ?? 0));
    const skipped = Math.max(...run.map((p) => skips.get(p) ?? 0));
    const parts = [
      weakNow ? 'Weak now' : null,
      weakNow && ratedWeak >= 2 ? `rated weak ${ratedWeak} times in ${window} days` : null,
      skipped >= 2 ? `${weakNow ? 'skipped' : 'Skipped'} ${skipped} times in ${window} days` : null,
    ].filter(Boolean);
    rows.push({
      surah: surahOf(run[0]),
      pages: run,
      label: run.length === 1 ? `p. ${run[0]}` : `p. ${run[0]}–${run[run.length - 1]}`,
      weakNow,
      ratedWeak,
      skipped,
      reason: parts.slice(0, 2).join(' · '),
    });
    run = [];
  };
  for (const p of flagged) {
    const prev = run[run.length - 1];
    if (prev != null && (p !== prev + 1 || surahOf(p) !== surahOf(prev))) flush();
    run.push(p);
  }
  flush();
  rows.sort(
    (a, b) => b.ratedWeak + b.skipped - (a.ratedWeak + a.skipped) || Number(b.weakNow) - Number(a.weakNow) || a.pages[0] - b.pages[0],
  );
  return rows.slice(0, input.limit ?? 5);
}

/** Times each page was rated weak (1–2) by a session in the window. */
export function ratedWeakCounts(logs: { date: string; weaknessUpdates?: { page: number; rating: number }[] }[], today: string, window = 30): Map<number, number> {
  const out = new Map<number, number>();
  for (const l of logs) {
    if (!within(l.date, today, window)) continue;
    for (const w of l.weaknessUpdates ?? []) if (w.rating <= 2) out.set(w.page, (out.get(w.page) ?? 0) + 1);
  }
  return out;
}

// ── Memorization ─────────────────────────────────────────────────────────

/** Pages memorized each month, the 12 months ending `last`, oldest first. */
export function memorizationMonths(items: { day: string; pages: number[] }[], last: string): { month: string; pages: number }[] {
  const months: string[] = [];
  let [y, m] = last.split('-').map(Number);
  for (let k = 0; k < 12; k++) {
    months.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  const counts = new Map(months.map((mo) => [mo, 0]));
  for (const i of items) {
    const mo = i.day.slice(0, 7);
    if (counts.has(mo)) counts.set(mo, (counts.get(mo) ?? 0) + new Set(i.pages).size);
  }
  return months.map((month) => ({ month, pages: counts.get(month) ?? 0 }));
}

/** A month's label under its bar: its initial, or "Nov" at either end. */
export function monthLabel(month: string, first: boolean): string {
  const short = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return first ? short : short.charAt(0);
}

/** How much of the Quran `pages` is, in words when it is near a simple share ("half the Quran"). */
export function quranShare(pages: number): string | null {
  if (pages <= 0) return null;
  if (pages >= 604) return 'all of the Quran';
  const f = pages / 604;
  const words: [number, string][] = [
    [1 / 4, 'a quarter of the Quran'],
    [1 / 3, 'a third of the Quran'],
    [1 / 2, 'half the Quran'],
    [2 / 3, 'two thirds of the Quran'],
    [3 / 4, 'three quarters of the Quran'],
  ];
  for (const [v, w] of words) if (Math.abs(f - v) <= 0.02) return w;
  return `${Math.max(1, Math.round(f * 100))}% of the Quran`;
}

// ── Pace ─────────────────────────────────────────────────────────────────

export interface PaceView {
  /** Minutes a page revising, last 30 days. */
  perPage: number;
  /** The same over the 30 days before, when there were timed revisions. */
  before: number | null;
  /** Minutes for a day of `capacity` pages at that pace. */
  dayMinutes: number;
  capacity: number;
  /** Timed revisions in the window. */
  revisions: number;
  /** Minutes a page reading, when there were timed reads. */
  readingPerPage: number | null;
}

const rate = (items: { pages: number[]; minutes: number | null }[]) => {
  const pages = items.reduce((n, i) => n + i.pages.length, 0);
  const minutes = items.reduce((n, i) => n + (i.minutes ?? 0), 0);
  return pages > 0 ? minutes / pages : null;
};

/** The pace tiles, or null under PACE_MIN_ITEMS items with minutes in the window (ACT-4). */
export function paceView(input: {
  revised: { day: string; pages: number[]; minutes: number | null }[];
  read: { day: string; pages: number[]; minutes: number | null }[];
  today: string;
  capacity: number;
  window?: number;
}): PaceView | null {
  const window = input.window ?? 30;
  const timed = <T extends { day: string; minutes: number | null; pages: number[] }>(items: T[], from: number, to: number) =>
    items.filter((i) => i.minutes != null && i.minutes > 0 && i.pages.length > 0 && daysBetween(i.day, input.today) >= from && daysBetween(i.day, input.today) < to);
  const revisions = timed(input.revised, 0, window);
  const reads = timed(input.read, 0, window);
  if (revisions.length + reads.length < PACE_MIN_ITEMS) return null;
  const perPage = rate(revisions);
  if (perPage == null) return null;
  return {
    perPage,
    before: rate(timed(input.revised, window, window * 2)),
    dayMinutes: Math.round(perPage * input.capacity),
    capacity: input.capacity,
    revisions: revisions.length,
    readingPerPage: rate(reads),
  };
}

/** "1.8", "6", "12": a pace to one decimal under 10 (no ".0"), whole from there. */
export function formatPace(minutesPerPage: number): string {
  return minutesPerPage < 10 ? minutesPerPage.toFixed(1).replace(/\.0$/, '') : String(Math.round(minutesPerPage));
}

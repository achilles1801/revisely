// What Insights draws (gap audit §5, mock d4), from items: the juz tiles and the juz untouched longest
// (Coverage), the week's circles, a month's count and the minutes by hour (Consistency), the weak-spot
// rows, the months of memorization and the pace tiles. Pure: the screen passes the data in.
// Days are YYYY-MM-DD revision days; definitions follow ACT-4 (lib/activityInsights).

import { getPagesForJuz, getSurahsForPage } from './quranData';
import { describePassage, pagesNote, surahNameIn } from './passages';
import { PACE_MIN_ITEMS } from './activityInsights';
import { memorizedByMonth, memorizedItemShare, type MemorizationItemLike } from './memorizedAyahs';
import { coverageRecency, type CoverageRecency } from './recency';
import { formatDate, t, weekdayLetters, formatNumeral } from '../i18n';

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

/**
 * A juz tile: revised this week, this month, not revised yet (ACT-25), over 30 days ago (or never in
 * the 30+ days on record), or not memorized (yet).
 */
export type JuzState = 'week' | 'month' | 'new' | 'stale' | 'none';
export interface JuzTile {
  juz: number;
  state: JuzState;
  /** Not memorized yet, with pages memorized or being learned (the tile's dot). */
  learning: boolean;
  /**
   * Days since its least recently revised memorized page; null when a page of it 30+ days on record was
   * never revised, when none was revised yet, or with none memorized.
   */
  daysSince: number | null;
  /** Its memorized pages by where each stands (none for a juz not memorized). */
  counts: Record<CoverageRecency, number>;
}

const noCounts = (): Record<CoverageRecency, number> => ({ week: 0, month: 0, new: 0, stale: 0 });

/**
 * The 30 juz. A juz is memorized once at least half its pages are; one with fewer is being learned (not
 * memorized, with the dot), so a page memorized today never makes its juz "untouched the longest". A
 * memorized juz is as recent as its least recently revised memorized page (ACT-4's "juz untouched
 * longest"): this week when that is within 7 days, this month within 30, otherwise stale. A page never
 * revised counts from `sinceOf` (lib/recency coverageSince: when it was memorized, or the account's
 * first day): under 30 days it is "not revised yet", never stale (ACT-25); without `sinceOf`, stale.
 */
export function juzTiles(
  memorized: Set<number>,
  learning: Set<number>,
  last: Map<number, string>,
  today: string,
  sinceOf?: (page: number) => string | null | undefined,
): JuzTile[] {
  const tiles: JuzTile[] = [];
  for (let juz = 1; juz <= 30; juz++) {
    const pages = getPagesForJuz(juz);
    const mine = pages.filter((p) => memorized.has(p));
    if (mine.length * 2 < pages.length) {
      tiles.push({ juz, state: 'none', learning: mine.length > 0 || pages.some((p) => learning.has(p)), daysSince: null, counts: noCounts() });
      continue;
    }
    const counts = noCounts();
    let oldest = -1;
    let neverInTime = false;
    for (const p of mine) {
      const d = last.get(p);
      const where = coverageRecency(d, sinceOf?.(p), today);
      counts[where]++;
      if (d != null) oldest = Math.max(oldest, daysBetween(d, today));
      else if (where === 'stale') neverInTime = true;
    }
    const state: JuzState = counts.stale > 0 ? 'stale' : counts.new > 0 ? 'new' : counts.month > 0 ? 'month' : 'week';
    tiles.push({ juz, state, learning: false, daysSince: neverInTime || oldest < 0 ? null : oldest, counts });
  }
  return tiles;
}

/**
 * The juz untouched the longest and the next one, when the longest is stale (over 30 days, or never in
 * the 30+ days on record): "Juz 4, untouched the longest · Last revised 41 days ago · Juz 5, 33 days".
 * A juz with a page not revised yet (ACT-25) is never the longest for that page.
 */
export function untouchedJuz(tiles: JuzTile[]): { first: JuzTile; next: JuzTile | null } | null {
  const memorized = tiles.filter((t) => t.state !== 'none');
  const age = (t: JuzTile) => (t.daysSince != null ? t.daysSince : t.state === 'stale' ? Number.POSITIVE_INFINITY : -1);
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


/**
 * The last seven days, oldest first, each with its weekday letter, whether it was active, and whether it came before
 * the account's first day (drawn faintly, never "missed": ACT-31).
 */
export function weekCircles(active: Set<string>, today: string, firstDay?: string | null): { day: string; letter: string; done: boolean; before: boolean }[] {
  const out: { day: string; letter: string; done: boolean; before: boolean }[] = [];
  const first = firstDay ? firstDay.slice(0, 10) : null;
  for (let k = 6; k >= 0; k--) {
    const day = shiftDay(today, -k);
    out.push({ day, letter: weekdayLetters()[new Date(`${day}T00:00:00Z`).getUTCDay()], done: active.has(day), before: first != null && day < first });
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
  return formatDate(new Date(`${month}-01T00:00:00Z`), { month: 'long', timeZone: 'UTC' });
}

/**
 * Active days in the month, out of its days so far (all of them once it is over). An account begun in the month counts
 * from its first day (`from`: "10 of 12 since 8 November"); one begun after it has nothing to count (null).
 */
export function monthCount(active: Set<string>, month: string, today: string, firstDay?: string | null): { done: number; of: number; from: string | null } | null {
  const [y, m] = month.split('-').map(Number);
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = today.startsWith(month) ? Number(today.slice(8, 10)) : length;
  const first = firstDay ? firstDay.slice(0, 10) : null;
  if (first && first.slice(0, 7) > month) return null;
  const start = first && first.startsWith(month) ? Number(first.slice(8, 10)) : 1;
  let done = 0;
  for (let d = start; d <= end; d++) if (active.has(`${month}-${String(d).padStart(2, '0')}`)) done++;
  return { done, of: Math.max(0, end - start + 1), from: start > 1 ? first : null };
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

/** Consistency's hours show once timed revisions or reads fall on this many days of the range (ACT-31). */
export const HOURS_FROM_DAYS = 3;

/** The days of the range with a timed revision or read: the hours say little from fewer than HOURS_FROM_DAYS. */
export function timedDays(items: { day: string; occurredAt?: number | null; minutes: number | null }[], today: string, window: number): number {
  const days = new Set<string>();
  for (const i of items) if (i.occurredAt != null && i.minutes != null && i.minutes > 0 && within(i.day, today, window)) days.add(i.day);
  return days.size;
}

const hourParts = (h: number) => ({ n: h % 12 === 0 ? 12 : h % 12, p: h % 24 < 12 ? t('lib.insights.am') : t('lib.insights.pm') });
/** Hours [from, to) as "5–7 AM", "11 AM–1 PM"; in Arabic «٥–٧ ص». */
export function hourRange(from: number, to: number): string {
  const a = hourParts(from);
  const b = hourParts(to);
  return a.p === b.p
    ? t('lib.insights.hoursSame', { from: a.n, to: b.n, period: b.p })
    : t('lib.insights.hoursAcross', { from: a.n, fromPeriod: a.p, to: b.n, toPeriod: b.p });
}

/**
 * "Mostly 5–7 AM, then 9–10 PM": the busiest runs of hours (each hour at least half the busiest),
 * the biggest first. Null with no timed minutes.
 */
export function busiestHours(hours: number[]): string | null {
  const runs = busiestRuns(hours);
  if (runs.length === 0) return null;
  const [first, second] = runs;
  return second
    ? t('lib.insights.mostlyThen', { hours: hourRange(first.from, first.to), next: hourRange(second.from, second.to) })
    : t('lib.insights.mostly', { hours: hourRange(first.from, first.to) });
}

/** The busiest hours as words for the middle of a line ("5–7 AM"); null with no timed minutes (Consistency's Reading). */
export function busiestRun(hours: number[]): string | null {
  const [first] = busiestRuns(hours);
  return first ? hourRange(first.from, first.to) : null;
}

/** The runs of hours each at least half the busiest, the biggest first. */
function busiestRuns(hours: number[]): { from: number; to: number; total: number }[] {
  const max = Math.max(0, ...hours);
  if (max <= 0) return [];
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
  return runs;
}

// ── Weak spots ───────────────────────────────────────────────────────────

export interface WeakSpotRow {
  surah: string;
  pages: number[];
  /** By surah and ayahs (Majd, Nov 7 2026): "Al-Hashr, ayahs 17–24". */
  label: string;
  /** The pages, as a quiet detail after it: "p. 548". */
  pagesNote: string;
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
  /** The window in words ("in 30 days", "since 9 September"); `in ${window} days` when not given. */
  inWords?: string;
  limit?: number;
}): WeakSpotRow[] {
  const window = input.window ?? 30;
  const span = input.inWords ?? t('lib.insights.inDays', { count: window });
  const skips = new Map<number, number>();
  for (const r of input.revisions) {
    if (!within(r.day, input.today, window)) continue;
    for (const p of new Set(r.skipped)) skips.set(p, (skips.get(p) ?? 0) + 1);
  }
  const flagged = [...input.memorized]
    .filter((p) => (input.rating(p) ?? 5) <= 2 || (skips.get(p) ?? 0) >= 2)
    .sort((a, b) => a - b);
  const surahOf = (p: number) => {
    const s = getSurahsForPage(p)[0];
    return s ? surahNameIn(s.number) : '';
  };
  const rows: WeakSpotRow[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const weakNow = run.some((p) => (input.rating(p) ?? 5) <= 2);
    const ratedWeak = Math.max(...run.map((p) => input.ratedWeak.get(p) ?? 0));
    const skipped = Math.max(...run.map((p) => skips.get(p) ?? 0));
    const parts = [
      weakNow ? t('lib.insights.weakNow') : null,
      weakNow && ratedWeak >= 2 ? t('lib.insights.ratedWeak', { count: ratedWeak, span }) : null,
      skipped >= 2 ? t(weakNow ? 'lib.insights.skippedLower' : 'lib.insights.skipped', { count: skipped, span }) : null,
    ].filter(Boolean);
    rows.push({
      surah: surahOf(run[0]),
      pages: run,
      label: describePassage(run),
      pagesNote: pagesNote(run),
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

/** Pages memorized each month, the 12 months ending `last`, oldest first, by page share (lib/memorizedAyahs, MEM-2). */
export function memorizationMonths(items: MemorizationItemLike[], last: string): { month: string; pages: number }[] {
  return memorizedByMonth(items, last).map(({ month, pages }) => ({ month, pages }));
}

/**
 * Memorization's chart (MEM-10; Majd, Nov 27 2026: "not necessarily having to show a bunch of empty previous months of no
 * memorization especially if someone just joined revisely and also having a daily view"). By month: the twelve months
 * ending `today`'s, from the first with a page memorized. By day: the 30 days ending `today`, from the first day with a page
 * memorized. Pages by their share (MEM-2), oldest first; empty when nothing was memorized in the span.
 */
export function memorizationSeries(
  items: MemorizationItemLike[],
  today: string,
  unit: 'month' | 'day',
): { key: string; pages: number }[] {
  if (unit === 'month') {
    const months = memorizedByMonth(items, today.slice(0, 7)).map(({ month, pages }) => ({ key: month, pages }));
    const first = months.findIndex((m) => m.pages > 0);
    return first < 0 ? [] : months.slice(first);
  }
  const from = shiftDay(today, -29);
  const sums = new Map<string, number>();
  for (const i of items) {
    if (i.day < from || i.day > today) continue;
    sums.set(i.day, (sums.get(i.day) ?? 0) + memorizedItemShare(i));
  }
  const days: { key: string; pages: number }[] = [];
  for (let d = 0; d < 30; d++) {
    const day = shiftDay(from, d);
    days.push({ key: day, pages: Math.round((sums.get(day) ?? 0) * 10) / 10 });
  }
  const first = days.findIndex((d) => d.pages > 0);
  return first < 0 ? [] : days.slice(first);
}

/** A month's label under its bar: its initial, or "Nov" at either end. */
export function monthLabel(month: string, first: boolean): string {
  const short = formatDate(new Date(`${month}-01T00:00:00Z`), { month: 'short', timeZone: 'UTC' });
  return first ? short : short.charAt(0);
}

/** How much of the Quran `pages` is, in words when it is near a simple share ("half the Quran"). */
export function quranShare(pages: number): string | null {
  if (pages <= 0) return null;
  if (pages >= 604) return t('lib.insights.allQuran');
  const f = pages / 604;
  const words: [number, string][] = [
    [1 / 4, t('lib.insights.quarter')],
    [1 / 3, t('lib.insights.third')],
    [1 / 2, t('lib.insights.half')],
    [2 / 3, t('lib.insights.twoThirds')],
    [3 / 4, t('lib.insights.threeQuarters')],
  ];
  for (const [v, w] of words) if (Math.abs(f - v) <= 0.02) return w;
  // Under 1%: "under 1% of the Quran", as Home says it (Majd, Nov 27 2026).
  if (f < 0.01) return t('lib.insights.underOneQuran');
  return t('lib.insights.percentQuran', { percent: Math.round(f * 100) });
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
  // In the language's digits («١٫٨» in Arabic).
  return formatNumeral(minutesPerPage < 10 ? minutesPerPage.toFixed(1).replace(/\.0$/, '') : String(Math.round(minutesPerPage)));
}

/**
 * The weak spots' one action, by surah (Majd, Nov 7 2026): one spot names it ("Revise Al-Hashr 17–24
 * first tomorrow"), several are "these weak spots".
 */
export function reviseFirstLabel(rows: { pages: number[] }[]): string {
  if (rows.length === 1) return t('lib.insights.reviseFirst', { what: describePassage(rows[0].pages, { form: 'short', sentence: true }) });
  return t('lib.insights.reviseTheseFirst');
}

// What Insights' own pages add to their sections (Revisely Dev; Majd, Nov 27 2026: "yes build all seven screens", boards in
// ~/Documents/revisely-today-mocks/insights-v2/). Each page starts from its point, then a figure with its trend against the
// same length of days before the range, then what to do about it. Pure: the screen passes the data in.
// Days are YYYY-MM-DD revision days, as in lib/insightsView.

import { getPagesForJuz } from './quranData';
import type { JuzTile } from './insightsView';
import { formatDate, formatDay, t } from '../i18n';

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);
const shiftDay = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ── Coverage (ACT-38) ────────────────────────────────────────────────────

/**
 * Coverage over the same length of days just before the range: of the pages memorized then (those memorized now, less
 * any memorized during the range), how many were revised in it. Null when the account is younger than both spans
 * together (the days before weren't all on record) or nothing was memorized then.
 */
export function coverageBefore(input: {
  memorized: Set<number>;
  revised: { day?: string; countsFor: string; pages: number[] }[];
  memorizations: { day: string; pages: number[] }[];
  today: string;
  window: number;
  firstDay?: string | null;
}): { revised: number; of: number } | null {
  const { memorized, revised, memorizations, today, window, firstDay } = input;
  if (!firstDay || daysBetween(firstDay.slice(0, 10), today) < 2 * window - 1) return null;
  // A page memorized during the range wasn't memorized in the days before it.
  const lately = new Set<number>();
  for (const m of memorizations) {
    const since = daysBetween(m.day, today);
    if (since >= 0 && since < window) for (const p of m.pages) lately.add(p);
  }
  const then = new Set([...memorized].filter((p) => !lately.has(p)));
  if (then.size === 0) return null;
  const done = new Set<number>();
  for (const r of revised) {
    const since = daysBetween(r.day ?? r.countsFor, today);
    if (since < window || since >= 2 * window) continue;
    for (const p of r.pages) if (then.has(p)) done.add(p);
  }
  return { revised: done.size, of: then.size };
}

/**
 * The juz slipping out of rotation (ACT-38): those over 30 days since their least recently revised page (ACT-4's stale
 * juz, never revised in the 30+ days on record included), and longer than the plan takes to go round when that is known.
 * The two left longest, longest first: the line names them and Plan them plans them.
 */
export function slippingJuz(tiles: JuzTile[], cycleDays?: number | null): JuzTile[] {
  const age = (tile: JuzTile) => tile.daysSince ?? Number.POSITIVE_INFINITY;
  return tiles
    .filter((tile) => tile.state === 'stale' && (cycleDays == null || age(tile) > cycleDays))
    .sort((a, b) => age(b) - age(a) || a.juz - b.juz)
    .slice(0, 2);
}

/** The line's words: "Juz 4 and Juz 5 are slipping out of rotation" over "Last revised 41 and 33 days ago; your plan goes round every 15 days." */
export function slippingWords(juz: JuzTile[], cycleDays?: number | null): { title: string; detail: string } {
  const [a, b] = juz;
  const title = b ? t('activity.insights.slippingTwo', { a: a.juz, b: b.juz }) : t('activity.insights.slippingOne', { juz: a.juz });
  const ages = !b
    ? a.daysSince == null
      ? t('activity.insights.neverRevised')
      : t('activity.insights.lastRevisedAgo', { count: a.daysSince })
    : a.daysSince != null && b.daysSince != null
      ? t('activity.insights.lastRevisedAgoTwo', { a: a.daysSince, b: b.daysSince })
      : [a, b]
          .map((tile) =>
            tile.daysSince == null ? t('activity.insights.juzNeverRevised', { juz: tile.juz }) : t('activity.insights.juzDaysAgo', { juz: tile.juz, count: tile.daysSince }),
          )
          .join(' · ');
  const detail = cycleDays != null && cycleDays > 0 ? t('activity.insights.slippingPlan', { ages, count: cycleDays }) : t('activity.insights.slippingAges', { ages });
  return { title, detail };
}

// ── Memorization (MEM-11) ────────────────────────────────────────────────

export interface JuzDoneBy {
  juz: number;
  /** Its pages not memorized yet. */
  left: number;
  /** Pages memorized a month lately, rounded ("about 10 a month"). */
  perMonth: number;
  /** The day it is done at that pace. */
  day: string;
}

/**
 * When the juz in progress is done at this pace (MEM-11): the juz the latest memorization went into that isn't all
 * memorized, at the pages memorized over the last 90 days (or since the account began, 30 days at least). Null with
 * no juz in progress, under a page a month, or two years or more away.
 */
export function juzDoneBy(input: {
  memorized: Set<number>;
  memorizations: { day: string; pages: number[] }[];
  today: string;
  firstDay?: string | null;
}): JuzDoneBy | null {
  const { memorized, memorizations, today, firstDay } = input;
  const juzOf = (page: number) => {
    for (let juz = 1; juz <= 30; juz++) if (getPagesForJuz(juz).includes(page)) return juz;
    return null;
  };
  const leftIn = (juz: number) => getPagesForJuz(juz).filter((p) => !memorized.has(p)).length;
  // The latest memorization into a juz still in progress.
  let juz: number | null = null;
  for (const m of [...memorizations].filter((x) => daysBetween(x.day, today) >= 0).sort((x, y) => (x.day < y.day ? 1 : -1))) {
    for (const p of m.pages) {
      const j = memorized.has(p) ? juzOf(p) : null;
      if (j != null && leftIn(j) > 0) {
        juz = j;
        break;
      }
    }
    if (juz != null) break;
  }
  if (juz == null) return null;
  const age = firstDay ? daysBetween(firstDay.slice(0, 10), today) + 1 : 90;
  const window = Math.max(30, Math.min(90, age));
  const lately = new Set<number>();
  for (const m of memorizations) {
    const since = daysBetween(m.day, today);
    if (since >= 0 && since < window) for (const p of m.pages) if (memorized.has(p)) lately.add(p);
  }
  const perDay = lately.size / window;
  const perMonth = Math.round(perDay * 30);
  if (perMonth < 1) return null;
  const left = leftIn(juz);
  const days = Math.ceil(left / perDay);
  if (days >= 730) return null;
  return { juz, left, perMonth, day: shiftDay(today, days) };
}

/** "early January", "mid-February", "late March", with the year when it isn't this one ("mid-January 2028" next year too). */
export function partOfMonth(day: string, today: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const d = date.getUTCDate();
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  const month = formatDate(date, sameYear ? { month: 'long', timeZone: 'UTC' } : { month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (d <= 10) return t('activity.insights.monthEarly', { month });
  if (d <= 20) return t('activity.insights.monthMid', { month });
  return t('activity.insights.monthLate', { month });
}

/** Memorization's line: "At this pace, Juz 29 is done in mid-January" over "11 pages to go, at about 10 a month." */
export function doneByWords(done: JuzDoneBy, today: string): { title: string; detail: string } {
  return {
    title: t('activity.insights.doneBy', { juz: done.juz, when: partOfMonth(done.day, today) }),
    detail: t('activity.insights.doneByDetail', { count: done.left, perMonth: done.perMonth }),
  };
}

// ── Weak spots (ACT-39) ──────────────────────────────────────────────────

type RatingLog = { date: string; weaknessUpdates?: { page: number; rating: number }[] };

/** Weak is a rating of 1–2, moderate 3 (an unrated page counts as strong). */
const isWeak = (r: number | undefined) => r != null && r <= 2;
const isModerate = (r: number | undefined) => r === 3;

/**
 * Each memorized page's rating at the end of `day`: its last session rating on or before it; a page rated only after it
 * counts as strong then (pages start strong); a page no session in the logs rated keeps its rating now.
 */
export function ratingsOn(input: { logs: RatingLog[]; memorized: Set<number>; rating: (page: number) => number | undefined; day: string }): Map<number, number | undefined> {
  const { logs, memorized, rating, day } = input;
  const until = new Map<number, number>();
  const later = new Set<number>();
  for (const log of [...logs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    for (const w of log.weaknessUpdates ?? []) {
      if (log.date <= day) until.set(w.page, w.rating);
      else later.add(w.page);
    }
  }
  const out = new Map<number, number | undefined>();
  for (const p of memorized) out.set(p, until.has(p) ? until.get(p) : later.has(p) ? undefined : rating(p));
  return out;
}

/** Memorized pages weak now, and as the range began (null over All time, or with no session before it in the logs). */
export function weakCount(input: {
  logs: RatingLog[];
  memorized: Set<number>;
  rating: (page: number) => number | undefined;
  today: string;
  window: number | null;
}): { now: number; before: number | null } {
  const { logs, memorized, rating, today, window } = input;
  const now = [...memorized].filter((p) => isWeak(rating(p))).length;
  if (window == null) return { now, before: null };
  const start = shiftDay(today, -window);
  if (!logs.some((l) => l.date <= start)) return { now, before: null };
  const then = ratingsOn({ logs, memorized, rating, day: start });
  return { now, before: [...then.values()].filter(isWeak).length };
}

/** Weak and moderate pages at the end of each of the last `weeks` weeks, oldest first, the last ending today. */
export function strengthWeeks(input: {
  logs: RatingLog[];
  memorized: Set<number>;
  rating: (page: number) => number | undefined;
  today: string;
  weeks: number;
}): { end: string; weak: number; moderate: number }[] {
  const out: { end: string; weak: number; moderate: number }[] = [];
  for (let k = input.weeks - 1; k >= 0; k--) {
    const end = shiftDay(input.today, -7 * k);
    const on = k === 0 ? new Map([...input.memorized].map((p) => [p, input.rating(p)])) : ratingsOn({ ...input, day: end });
    const values = [...on.values()];
    out.push({ end, weak: values.filter(isWeak).length, moderate: values.filter(isModerate).length });
  }
  return out;
}

/** The memorized page rated weak most often in the range (at least twice), the first by page on a tie. */
export function weakMostOften(ratedWeak: Map<number, number>, memorized: Set<number>): { page: number; times: number } | null {
  let best: { page: number; times: number } | null = null;
  for (const [page, times] of ratedWeak) {
    if (!memorized.has(page) || times < 2) continue;
    if (!best || times > best.times || (times === best.times && page < best.page)) best = { page, times };
  }
  return best;
}

// ── Weekly charts (ACT-39, ACT-40) ───────────────────────────────────────

const weekStartWords = (end: string) => formatDay(shiftDay(end, -6), { day: 'numeric', month: 'short' }, 'en-GB');

/** A week of a weekly chart, ending `end`: "This week", or "Week of 3 Nov" by its first day (the line over the chart). */
export function weekName(end: string, today: string): string {
  return end === today ? t('activity.insights.weekThis') : t('activity.insights.weekOf', { day: weekStartWords(end) });
}

/**
 * Under a week's bar. `short` (every bar labelled, 10 bars or fewer): its first day's number, "16", the line above naming
 * the week; "16 Nov" and "This wk" were cut on an SE at the largest text, in a 32 pt slot. Otherwise "16 Nov", and "This
 * wk" for the newest: only the ends and the pick are labelled then, each with room of its own.
 */
export function weekBarLabel(end: string, today: string, short: boolean): string {
  if (short) return formatDay(shiftDay(end, -6), { day: 'numeric' });
  return end === today ? t('activity.insights.weekThisShort') : weekStartWords(end);
}

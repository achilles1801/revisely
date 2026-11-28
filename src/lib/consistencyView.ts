// Consistency's own page (BEHAVIOUR.md ACT-43; Majd, Nov 27 2026: "i can't even see how my consistent is the last month or
// two weeks ago or what my trend is that's easily understandable ... what about consistency is completing our cycles? or
// consistency in terms of reading a page"). Three kinds on one switch, each from the items Activity reads:
//
//   Revising     the days with a revision, in the range and in as many days before it (the trend), and how many days most
//                weeks; the days of each week, week by week; the minutes by hour (lib/insightsView).
//   Full cycles  the days each full cycle took (every memorized page revised once, from the day after the last one ended),
//                against the plan's days for one: on time, or late by so many days.
//   Reading      the days read, the same way, with the time read.
//
// Pure: the screen passes the data in. Days are YYYY-MM-DD revision days.

import { formatDate, t } from '../i18n';
import { weekStart } from './activityHeatmap';
import { activeDays, type InsightsRange } from './insightsRange';
import { daysBetween, shiftDay } from './dayKeys';

export type ConsistencyKind = 'revising' | 'cycles' | 'reading';
export const CONSISTENCY_KINDS: readonly ConsistencyKind[] = ['revising', 'cycles', 'reading'];

/** The weeks chart's span: its own pills, 4 weeks, 3 months or a year. */
export type ChartSpan = '4w' | '3m' | '1y';
export const CHART_SPANS: readonly ChartSpan[] = ['4w', '3m', '1y'];
export const SPAN_WEEKS: Record<ChartSpan, number> = { '4w': 4, '3m': 13, '1y': 52 };

/** The days the page reads at least: a year of weeks (the chart's longest) and this one. */
export const CONSISTENCY_LOAD_DAYS = 7 * 53;

/** The chart opens on the span nearest the range: 7 and 30 days on 4 weeks, 3 months on 3 months, All time on a year. */
export function spanFor(range: InsightsRange): ChartSpan {
  return range === 'all' ? '1y' : range === 90 ? '3m' : '4w';
}

const dayOf = (day: string | null | undefined) => (day ? day.slice(0, 10) : null);

// ── The figure and its trend ────────────────────────────────────────────

export interface DaysFigure {
  /** Days with something in the range, out of its days (or out of the days since the account began, when fewer). */
  done: number;
  of: number;
  /** The same count over as many days before the range; null when the account or the items don't reach back so far. */
  before: number | null;
  /** The account's first day, when the range is longer than the account. */
  sinceStart: string | null;
}

/**
 * The days in the range with something, and in as many days just before it, for the trend. No trend over All time, on an
 * account younger than the two spans together, or when the items read don't go back that far.
 */
export function daysAgainstBefore(
  days: ReadonlySet<string>,
  today: string,
  window: number,
  all: boolean,
  firstDay?: string | null,
  itemsFrom?: string | null,
): DaysFigure {
  const now = activeDays(days as Set<string>, today, window, firstDay);
  const start = shiftDay(today, -(2 * window - 1));
  const first = dayOf(firstDay);
  const from = dayOf(itemsFrom);
  let before: number | null = null;
  if (!all && now.sinceStart == null && (first == null || first <= start) && (from == null || from <= start)) {
    before = 0;
    for (let k = window; k < 2 * window; k++) if (days.has(shiftDay(today, -k))) before++;
  }
  return { done: now.done, of: now.of, before, sinceStart: now.sinceStart };
}

export type TrendDir = 'up' | 'down' | 'same';
export interface Trend {
  dir: TrendDir;
  /** The count before ("↑ from 76"). */
  from: number;
}

/** Up, down or the same against the count before; none without one. */
export function trendOf(now: number, before: number | null): Trend | null {
  if (before == null) return null;
  return { dir: now > before ? 'up' : now < before ? 'down' : 'same', from: before };
}

/** "The last 3 months against the 3 before": what the trend compares. */
export function againstWords(range: InsightsRange): string | null {
  return range === 7 ? t('activity.consistency.against7') : range === 30 ? t('activity.consistency.against30') : range === 90 ? t('activity.consistency.against90') : null;
}

// ── Most weeks ──────────────────────────────────────────────────────────

/** The days of each whole week (Sunday to Saturday) inside the range and the account. */
export function wholeWeekCounts(days: ReadonlySet<string>, today: string, window: number, firstDay?: string | null): number[] {
  const first = dayOf(firstDay);
  const rangeStart = shiftDay(today, -(window - 1));
  const start = first != null && first > rangeStart ? first : rangeStart;
  let week = weekStart(start);
  if (week < start) week = shiftDay(week, 7);
  const out: number[] = [];
  while (shiftDay(week, 6) <= today) {
    let n = 0;
    for (let d = 0; d < 7; d++) if (days.has(shiftDay(week, d))) n++;
    out.push(n);
    week = shiftDay(week, 7);
  }
  return out;
}

/** The middle half of the whole weeks' counts (low and high); none under 3 whole weeks. */
export function mostWeeks(counts: readonly number[]): { lo: number; hi: number } | null {
  if (counts.length < 3) return null;
  const s = [...counts].sort((a, b) => a - b);
  return { lo: s[Math.floor((s.length - 1) * 0.25)], hi: s[Math.ceil((s.length - 1) * 0.75)] };
}

/** "7 days most weeks", "6 or 7 days most weeks", "3 to 6 days most weeks". */
export function mostWeeksWords(m: { lo: number; hi: number }): string {
  if (m.lo === m.hi) return t('activity.consistency.mostWeeks', { count: m.lo });
  return m.hi === m.lo + 1 ? t('activity.consistency.mostWeeksOr', { lo: m.lo, hi: m.hi }) : t('activity.consistency.mostWeeksTo', { lo: m.lo, hi: m.hi });
}

// ── Week by week ────────────────────────────────────────────────────────

export interface WeekBar {
  /** The week's Sunday. */
  week: string;
  /** Days with something, of the week's days counted (this week so far; the account's first week from its first day). */
  days: number;
  of: number;
  /** Minutes in the week (Reading's time). */
  minutes: number;
  current: boolean;
}

/** The last `weeks` weeks, this one last, none before the account's first week. */
export function weekBars(
  entries: readonly { day: string; minutes?: number | null }[],
  today: string,
  weeks: number,
  firstDay?: string | null,
): WeekBar[] {
  const first = dayOf(firstDay);
  const firstWeek = first ? weekStart(first) : null;
  const thisWeek = weekStart(today);
  const byDay = new Map<string, number>();
  for (const e of entries) {
    if (e.day > today) continue;
    byDay.set(e.day, (byDay.get(e.day) ?? 0) + Math.max(0, e.minutes ?? 0));
  }
  const out: WeekBar[] = [];
  for (let k = weeks - 1; k >= 0; k--) {
    const week = shiftDay(thisWeek, -7 * k);
    if (firstWeek != null && week < firstWeek) continue;
    let days = 0;
    let of = 0;
    let minutes = 0;
    for (let d = 0; d < 7; d++) {
      const day = shiftDay(week, d);
      if (day > today) break;
      if (first != null && day < first) continue;
      of++;
      const m = byDay.get(day);
      if (m != null) {
        days++;
        minutes += m;
      }
    }
    out.push({ week, days, of, minutes, current: week === thisWeek });
  }
  return out;
}

/** "Week of 12 Oct", or "This week". */
export function weekName(bar: WeekBar): string {
  return bar.current ? t('activity.consistency.thisWeek') : t('activity.consistency.weekOf', { day: shortDay(bar.week) });
}

/** "12 Oct". */
export function shortDay(day: string): string {
  return formatDate(new Date(`${day}T00:00:00Z`), { day: 'numeric', month: 'short', timeZone: 'UTC' }, 'en-GB');
}

/**
 * A week's label under its bar. Past ten bars only the ends (and the pick) are labelled, each with room of its own, so
 * they carry the date ("12 Oct"); up to ten every bar has one, in its own slot, too narrow for a date on an SE at large
 * text, so the day alone ("12"); the line above the chart names the week in full.
 */
export function weekLabel(week: string, count: number): string {
  if (count > 10) return shortDay(week);
  return formatDate(new Date(`${week}T00:00:00Z`), { day: 'numeric', timeZone: 'UTC' }, 'en-GB');
}

// ── Full cycles ─────────────────────────────────────────────────────────

export interface Cycle {
  /** The first day of the cycle: the first day read, then the day after the last cycle ended. */
  from: string;
  /** The day its last page was revised; null while it is under way. */
  to: string | null;
  /** Days from `from` to `to` (or today), both counted. */
  days: number;
  /** Pages revised in it, of the pages it needs (the memorized pages memorized by its first day). */
  covered: number;
  of: number;
}

/**
 * The full cycles in the items: each runs from its first day until every page it needs has been revised once (pages
 * memorized after it began join the next one), and the next begins the day after. The last is the one under way.
 */
export function fullCycles(input: {
  revised: readonly { day: string; pages: readonly number[] }[];
  memorized: ReadonlySet<number>;
  /** The day each memorized page counts from (memorized, or the account's first day); unknown counts as always. */
  since?: ReadonlyMap<number, string>;
  today: string;
}): Cycle[] {
  const { revised, memorized, since, today } = input;
  if (memorized.size === 0) return [];
  const byDay = new Map<string, number[]>();
  for (const r of revised) {
    if (r.day > today) continue;
    const list = byDay.get(r.day);
    if (list) list.push(...r.pages);
    else byDay.set(r.day, [...r.pages]);
  }
  const days = [...byDay.keys()].sort();
  if (days.length === 0) return [];
  const needed = (start: string) => {
    const need = new Set<number>();
    for (const p of memorized) {
      const s = dayOf(since?.get(p));
      if (s == null || s <= start) need.add(p);
    }
    // Every page memorized after it began: the whole of them, rather than a cycle of nothing.
    return need.size > 0 ? need : new Set(memorized);
  };
  const out: Cycle[] = [];
  let start = days[0];
  let need = needed(start);
  let seen = new Set<number>();
  for (const day of days) {
    for (const p of byDay.get(day) ?? []) if (need.has(p)) seen.add(p);
    if (seen.size >= need.size) {
      out.push({ from: start, to: day, days: daysBetween(start, day) + 1, covered: need.size, of: need.size });
      start = shiftDay(day, 1);
      need = needed(start);
      seen = new Set();
    }
  }
  if (start <= today) out.push({ from: start, to: null, days: daysBetween(start, today) + 1, covered: seen.size, of: need.size });
  return out;
}

/** The plan's days for one full cycle: how often it brings a page round (lib/gapsCycle), else the pages over a day's. */
export function planCycleDays(cycleDays: number | null | undefined, memorized: number, capacity: number): number {
  if (cycleDays != null && cycleDays > 0) return cycleDays;
  return Math.max(1, Math.ceil(memorized / Math.max(1, capacity)));
}

/** Days past the plan's (0 on time). */
export const lateBy = (c: Cycle, planDays: number) => Math.max(0, c.days - planDays);

export interface CyclesFigure {
  /** Full cycles that ended in the range, and those on time. */
  finished: Cycle[];
  onTime: number;
  /** Those on time in as many days before; null when that can't be measured. */
  before: number | null;
  /** The cycle under way. */
  current: Cycle | null;
}

const endedWithin = (c: Cycle, today: string, fromAgo: number, toAgo: number) => {
  if (c.to == null) return false;
  const ago = daysBetween(c.to, today);
  return ago >= fromAgo && ago < toAgo;
};

export function cyclesFigure(
  cycles: readonly Cycle[],
  planDays: number,
  today: string,
  window: number,
  all: boolean,
  firstDay?: string | null,
  itemsFrom?: string | null,
): CyclesFigure {
  const finished = cycles.filter((c) => endedWithin(c, today, 0, window));
  const onTime = finished.filter((c) => lateBy(c, planDays) === 0).length;
  const start = shiftDay(today, -(2 * window - 1));
  const first = dayOf(firstDay);
  const from = dayOf(itemsFrom);
  const measurable = !all && (first == null || first <= start) && (from == null || from <= start);
  const before = measurable ? cycles.filter((c) => endedWithin(c, today, window, 2 * window) && lateBy(c, planDays) === 0).length : null;
  const last = cycles[cycles.length - 1];
  return { finished, onTime, before, current: last && last.to == null ? last : null };
}

// ── Hours ───────────────────────────────────────────────────────────────

/** An hour under its bar: "12 AM", "6 PM". */
export function hourLabel(h: number): string {
  const n = h % 12 === 0 ? 12 : h % 12;
  return t('activity.consistency.hourAt', { n, period: h < 12 ? t('lib.insights.am') : t('lib.insights.pm') });
}

/**
 * Pure plan-building helpers for the schedule editor.
 *
 * Every builder returns one full cycle as `number[][]` with index 0 being
 * "today": the editor saves drafts with `cycleStartDate = today`
 * (see createCustomPlanFromDraft), so whatever sits at index 0 is what the
 * user revises today.
 */
import type { CustomPlan, User, UserPage } from '../types';
import { buildOneJuzPerDayPlanDays } from './algorithm';

export type PlanDirection = 'forward' | 'reverse';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Rough pages-per-juz used to translate a juz quota into a page quota. */
export const PAGES_PER_JUZ = 20;

/** Deduplicated, sorted page numbers in cycle order for `direction`. */
export function orderPages(pages: number[], direction: PlanDirection = 'forward'): number[] {
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  return direction === 'reverse' ? sorted.reverse() : sorted;
}

/**
 * Resolve an arbitrary Mushaf page (e.g. the first page of a surah the user
 * picked) to the memorized page the cycle should actually start on.
 *
 * forward: the first memorized page at or after `startPage`; past the last
 *          memorized page it wraps around to the first one.
 * reverse: the first memorized page at or before `startPage`; before the
 *          first memorized page it wraps around to the last one.
 *
 * Returns null when nothing is memorized. A missing `startPage` resolves to
 * the natural beginning of the cycle.
 */
export function resolveStartPage(
  memorizedPages: number[],
  startPage: number | null | undefined,
  direction: PlanDirection = 'forward',
): number | null {
  const ordered = orderPages(memorizedPages, direction);
  if (ordered.length === 0) return null;
  if (startPage == null || !Number.isFinite(startPage)) return ordered[0];
  const hit =
    direction === 'reverse'
      ? ordered.find((p) => p <= startPage)
      : ordered.find((p) => p >= startPage);
  return hit ?? ordered[0];
}

/**
 * The memorized pages in cycle order, rotated so the resolved start page is
 * first and everything before it wraps around to the end.
 */
export function rotatePagesToStart(
  memorizedPages: number[],
  startPage: number | null | undefined,
  direction: PlanDirection = 'forward',
): number[] {
  const ordered = orderPages(memorizedPages, direction);
  const resolved = resolveStartPage(ordered, startPage, direction);
  if (resolved === null) return [];
  const idx = ordered.indexOf(resolved);
  return [...ordered.slice(idx), ...ordered.slice(0, idx)];
}

/**
 * Split `pages` (already in order) into the fewest days that respect
 * `maxPerDay`, then even the days out so they differ by at most one page.
 * 25 pages at 10/day → [9, 8, 8] rather than [10, 10, 5]. No page repeats
 * and no day exceeds the quota.
 */
export function splitIntoBalancedDays(pages: number[], maxPerDay: number): number[][] {
  const total = pages.length;
  if (total === 0) return [];
  const cap = Math.max(1, Math.floor(maxPerDay) || 1);
  const dayCount = Math.ceil(total / cap);
  const base = Math.floor(total / dayCount);
  const extra = total % dayCount;
  const days: number[][] = [];
  let cursor = 0;
  for (let d = 0; d < dayCount; d++) {
    const size = base + (d < extra ? 1 : 0);
    days.push(pages.slice(cursor, cursor + size));
    cursor += size;
  }
  return days;
}

export interface BalancedPlanOptions {
  /** Daily quota in pages. Days never exceed it. */
  pagesPerDay: number;
  /** Any Mushaf page; resolved to the nearest memorized page. */
  startPage?: number | null;
  direction?: PlanDirection;
}

/**
 * "Auto-balance from here": lay the memorized pages out in order beginning at
 * `startPage` (wrapping back to the start of the memorized set), split into
 * evenly sized days of at most `pagesPerDay`. Day 1 (index 0) is today.
 */
export function buildBalancedPlanFromStart(
  memorizedPages: number[],
  { pagesPerDay, startPage, direction = 'forward' }: BalancedPlanOptions,
): number[][] {
  const rotated = rotatePagesToStart(memorizedPages, startPage, direction);
  return splitIntoBalancedDays(rotated, pagesPerDay);
}

/**
 * Rotate a cycle so the day containing the (resolved) start page comes first.
 * Leaves the cycle untouched if no day contains it.
 */
export function rotateDaysToStartPage(
  days: number[][],
  startPage: number | null | undefined,
  direction: PlanDirection = 'forward',
): number[][] {
  if (days.length === 0 || startPage == null) return days.map((d) => [...d]);
  const all = days.flat();
  const resolved = resolveStartPage(all, startPage, direction);
  const idx = resolved === null ? -1 : days.findIndex((d) => d.includes(resolved));
  if (idx <= 0) return days.map((d) => [...d]);
  return [...days.slice(idx), ...days.slice(0, idx)].map((d) => [...d]);
}

/** Merge every `size` consecutive days into one (the last group may be shorter). */
export function groupDays(days: number[][], size: number): number[][] {
  const k = Math.max(1, Math.floor(size) || 1);
  const out: number[][] = [];
  for (let i = 0; i < days.length; i += k) {
    out.push(days.slice(i, i + k).flat());
  }
  return out;
}

export interface JuzPlanOptions {
  juzPerDay?: number;
  startPage?: number | null;
  direction?: PlanDirection;
}

/**
 * "By juz": one group per memorized juz (surah-aware, matching the live juz
 * scheduler), optionally reversed, rotated so the juz holding `startPage` is
 * today, then `juzPerDay` juz merged into each day.
 */
export function buildJuzPlanFromStart(
  memorizedPages: UserPage[],
  { juzPerDay = 1, startPage, direction = 'forward' }: JuzPlanOptions = {},
): number[][] {
  let days = buildOneJuzPerDayPlanDays(memorizedPages);
  if (direction === 'reverse') days = [...days].reverse();
  days = rotateDaysToStartPage(days, startPage, direction);
  return groupDays(days, juzPerDay);
}

/** The user's daily quota expressed in pages (juz mode ≈ 20 pages per juz). */
export function effectiveDailyPages(
  user: Pick<User, 'scheduleMode' | 'dailyJuzCount' | 'dailyPageCapacity'>,
): number {
  if (user.scheduleMode === 'juz') {
    return Math.max(1, (user.dailyJuzCount || 1) * PAGES_PER_JUZ);
  }
  return Math.max(1, user.dailyPageCapacity || 1);
}

/**
 * Sensible default "start at" page for the builder: wherever today's
 * revision already begins, so rebalancing doesn't silently jump the user
 * back to page 1. Falls back to the first memorized page.
 */
export function defaultStartPage(
  currentDays: number[][],
  memorizedPages: number[],
): number | null {
  const today = currentDays[0];
  if (today && today.length > 0) return today[0];
  const firstNonEmpty = currentDays.find((d) => d.length > 0);
  if (firstNonEmpty) return firstNonEmpty[0];
  const ordered = orderPages(memorizedPages);
  return ordered.length > 0 ? ordered[0] : null;
}

export interface PlanStats {
  dayCount: number;
  totalPages: number;
  restDays: number;
  minPerDay: number;
  maxPerDay: number;
}

/** Summary numbers for a cycle. min/max ignore rest days. */
export function planStats(days: number[][]): PlanStats {
  const active = days.filter((d) => d.length > 0).map((d) => d.length);
  return {
    dayCount: days.length,
    totalPages: active.reduce((sum, n) => sum + n, 0),
    restDays: days.length - active.length,
    minPerDay: active.length ? Math.min(...active) : 0,
    maxPerDay: active.length ? Math.max(...active) : 0,
  };
}

function parseLocalISODay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * A saved custom plan stores days relative to `cycleStartDate`. The editor
 * treats index 0 as today and re-anchors to today on save, so it must see the
 * cycle rotated to today's slot — otherwise editing a plan saved three days
 * ago would silently rewind the user three days.
 *
 * If the cycle hasn't started yet (anchor in the future after "push back a
 * day"), the plan is returned unrotated.
 */
export function rotateCustomPlanToToday(
  plan: Pick<CustomPlan, 'days' | 'cycleStartDate'>,
  today: Date = new Date(),
): number[][] {
  const n = plan.days.length;
  if (n === 0) return [];
  const start = parseLocalISODay(plan.cycleStartDate);
  const diff = Math.round(
    (startOfLocalDay(today).getTime() - start.getTime()) / MS_PER_DAY,
  );
  if (!Number.isFinite(diff) || diff <= 0) return plan.days.map((d) => [...d]);
  const offset = diff % n;
  return [...plan.days.slice(offset), ...plan.days.slice(0, offset)].map((d) => [...d]);
}

/** Move the day at `from` to `to` (both clamped). Returns a new array. */
export function moveDay(days: number[][], from: number, to: number): number[][] {
  const next = days.map((d) => [...d]);
  if (from < 0 || from >= next.length) return next;
  const target = Math.max(0, Math.min(next.length - 1, to));
  if (target === from) return next;
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

export interface SelectableGroup {
  key: string;
  /** The memorized pages this group contributes. */
  pages: number[];
}

/** True when every page of the group is already on the day. */
export function isGroupFullyIncluded(dayPages: number[], group: SelectableGroup): boolean {
  if (group.pages.length === 0) return false;
  const set = new Set(dayPages);
  return group.pages.every((p) => set.has(p));
}

/**
 * Apply a surah/juz picker to a day as a *diff* against what was checked when
 * the picker opened, so pages the picker doesn't fully cover (e.g. half a
 * surah from auto-balance) are never dropped just by opening it and tapping
 * Done.
 *
 *   unchecked (was fully included) → its pages are removed
 *   newly checked                  → its pages are added
 *   untouched                      → left exactly as they were
 *
 * Existing pages keep their order; added pages are appended in page order.
 */
export function applyGroupSelection(
  dayPages: number[],
  groups: SelectableGroup[],
  initiallyChecked: ReadonlySet<string>,
  checked: ReadonlySet<string>,
): number[] {
  const remove = new Set<number>();
  const add = new Set<number>();
  for (const g of groups) {
    const was = initiallyChecked.has(g.key);
    const now = checked.has(g.key);
    if (was && !now) g.pages.forEach((p) => remove.add(p));
  }
  for (const g of groups) {
    const was = initiallyChecked.has(g.key);
    const now = checked.has(g.key);
    if (now && !was) g.pages.forEach((p) => add.add(p));
  }
  // A page that is both removed (via an unchecked juz) and re-added (via a
  // newly checked surah inside it) stays.
  const kept = dayPages.filter((p) => !remove.has(p) || add.has(p));
  const keptSet = new Set(kept);
  const appended = Array.from(add)
    .filter((p) => !keptSet.has(p))
    .sort((a, b) => a - b);
  return [...kept, ...appended];
}

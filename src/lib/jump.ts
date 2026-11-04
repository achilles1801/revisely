// "Jump to…" on Home: start today's revision at a juz, a surah or a page, and
// carry on from there on the following days, without making a new plan.
//
// The plan stays as it is; where it is read from moves:
//   automatic (pages a day) — the window over the memorized pages starts at the
//       chosen page: User.scheduleShiftPages, the same page offset carrying
//       over uses (lib/carryOver), so it is page-precise;
//   a custom plan — the same offset over the plan's days in order, starting
//       where the plan reaches the chosen juz or surah (its first page in the
//       plan's order); off days stay off, and on an off day the next revision
//       day starts there;
//   juz a day — today becomes the chosen juz (the start date moves); if the
//       juz pattern can't land on it (two juz a day over an odd split), the page
//       offset as above.
// Today follows the Fajr day (revisionDate). Pages already revised today stay
// counted and go first, then the new start's pages. Pages carried into today and
// not yet revised are dropped (they were the old start's), so the jump takes
// effect at once. Otherwise carry-over is left alone, so yesterday's leftovers are
// still offered.

import { getPagesForJuz, getPagesForSurah, getSurah, getSurahDisplay } from './quranData';
import {
  calendarDaysBetween,
  getPagesScheduledForDate,
  juzKeyForPage,
  juzModeCycle,
  scheduleStartingByToday,
} from './algorithm';
import { revisedOn } from './planChange';
import { dateToLocalISODay } from './schedulePlans';
import type { RevisionLog, User, UserPage } from '../types';

export type JumpTarget = { kind: 'juz'; juz: number } | { kind: 'surah'; surah: number } | { kind: 'page'; page: number };

export interface JumpContext {
  /** The revision day (Fajr-aware). */
  revisionDate: Date;
  memorized: UserPage[];
  logs: RevisionLog[];
}

export interface JumpResult {
  user: User;
  /** The page the new start begins at. */
  startPage: number;
  /** False when today is a custom plan's off day: the next revision day starts there. */
  today: boolean;
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The pages a target covers (only its memorized ones count). */
export function targetPages(target: JumpTarget): number[] {
  if (target.kind === 'juz') return getPagesForJuz(target.juz);
  if (target.kind === 'surah') return getPagesForSurah(target.surah);
  return [target.page];
}

function hasCustomPlan(user: User): boolean {
  return !!user.customPlan && user.customPlan.days.length > 0;
}

/** Juz a day (no custom plan): the sheet offers juz only. */
export function isJuzMode(user: User): boolean {
  return !hasCustomPlan(user) && user.scheduleMode === 'juz' && (user.dailyJuzCount ?? 0) > 0;
}

/** The pages the schedule goes through: a custom plan's pages, else the memorized ones. */
export function jumpablePages(user: User, memorized: UserPage[]): Set<number> {
  const mine = new Set(memorized.map((p) => p.pageNumber));
  if (!hasCustomPlan(user)) return mine;
  return new Set(user.customPlan!.days.flat().filter((p) => mine.has(p)));
}

/** Where today's scheduled pages start (before anything carried into today), or null. */
export function todayStartPage(user: User, revisionDate: Date, memorized: UserPage[]): number | null {
  return getPagesScheduledForDate(user, revisionDate, memorized)[0] ?? null;
}

/**
 * Where a target starts in a cycle of pages read from `from` onward: the first
 * position holding one of its pages whose page before isn't one (where the
 * cycle enters it). The cycle's own start if it holds nothing else. Null when
 * the cycle doesn't hold the target.
 */
export function targetStart(seq: number[], from: number, target: Set<number>): number | null {
  const n = seq.length;
  if (n === 0 || !seq.some((p) => target.has(p))) return null;
  for (let j = 0; j < n; j++) {
    const i = mod(from + j, n);
    if (target.has(seq[i]) && !target.has(seq[mod(i - 1, n)])) return i;
  }
  return 0;
}

/** The offset that makes `dayPosition` (where a day starts in the cycle) read from `start`. */
const shiftFor = (dayPosition: number, start: number, total: number) => mod(dayPosition - start, total);

/** Where day `index` of `days` starts in the days read in order. */
const positionOf = (days: number[][], index: number) => days.slice(0, index).reduce((n, d) => n + d.length, 0);

/** Automatic: the window over the memorized pages starts at the target. */
function jumpPages(user: User, ctx: JumpContext, target: Set<number>) {
  const seq = ctx.memorized.map((p) => p.pageNumber).sort((a, b) => a - b);
  const total = seq.length;
  const perDay = Math.min(user.dailyPageCapacity, total);
  if (perDay <= 0) return null;
  const days = calendarDaysBetween(new Date(user.scheduleAnchorDate || user.createdAt), ctx.revisionDate);
  const dayPosition = days * perDay;
  const start = targetStart(seq, mod(dayPosition - (user.scheduleShiftPages ?? 0), total), target);
  if (start == null) return null;
  return { fields: { scheduleShiftPages: shiftFor(dayPosition, start, total) }, startPage: seq[start], today: true };
}

/** A cycle of days (a custom plan, juz mode's pattern) read from day `index`: the offset that starts it at the target. */
function jumpCycle(days: number[][], index: number, shift: number, target: Set<number>) {
  const seq = days.flat();
  const total = seq.length;
  if (total === 0) return null;
  // Today, or the next day with pages (an off day stays off).
  let day = index;
  for (let k = 0; k < days.length && days[day].length === 0; k++) day = (day + 1) % days.length;
  if (days[day].length === 0) return null;
  const dayPosition = positionOf(days, day);
  const start = targetStart(seq, mod(dayPosition - shift, total), target);
  if (start == null) return null;
  return { fields: { scheduleShiftPages: shiftFor(dayPosition, start, total) }, startPage: seq[start], today: day === index };
}

/** A custom plan: the offset over its days in order. */
function jumpCustomPlan(user: User, ctx: JumpContext, target: Set<number>) {
  const plan = user.customPlan!;
  const [y, m, d] = plan.cycleStartDate.split('-').map(Number);
  const days = calendarDaysBetween(new Date(y, (m || 1) - 1, d || 1), ctx.revisionDate);
  return jumpCycle(plan.days, mod(days, plan.days.length), user.scheduleShiftPages ?? 0, target);
}

/** Juz a day: today becomes the target's juz; else the offset over the juz pattern. */
function jumpJuz(user: User, ctx: JumpContext, target: Set<number>) {
  const juz = juzModeCycle(user, ctx.memorized);
  if (!juz) return null;
  const first = ctx.memorized
    .map((p) => p.pageNumber)
    .filter((p) => target.has(p))
    .sort((a, b) => a - b)[0];
  if (first == null) return null;
  const index = juz.juzList.indexOf(juzKeyForPage(first));
  if (index < 0) return null;
  for (let n = 0; n < juz.cycle.length; n++) {
    if ((n * juz.juzPerDay) % juz.juzList.length !== index) continue;
    // Day n of the pattern is today: the start date n days back, nothing shifted.
    const anchor = new Date(ctx.revisionDate.getFullYear(), ctx.revisionDate.getMonth(), ctx.revisionDate.getDate() - n);
    return { fields: { scheduleAnchorDate: anchor.toISOString(), scheduleShiftPages: 0 }, startPage: juz.cycle[n][0], today: true };
  }
  const days = calendarDaysBetween(new Date(user.scheduleAnchorDate || user.createdAt), ctx.revisionDate);
  const juzPages = new Set(ctx.memorized.map((p) => p.pageNumber).filter((p) => juzKeyForPage(p) === juz.juzList[index]));
  return jumpCycle(juz.cycle, mod(days, juz.cycle.length), user.scheduleShiftPages ?? 0, juzPages);
}

/**
 * The user with today's revision starting at `target`, or null when the
 * schedule doesn't go through it (nothing of it memorized, or not in the plan).
 */
export function jumpTo(before: User, target: JumpTarget, ctx: JumpContext): JumpResult | null {
  // A schedule that starts after today gives today nothing; start it today first.
  const user = scheduleStartingByToday(before, ctx.revisionDate) ?? before;
  const pages = new Set(targetPages(target));
  const moved = hasCustomPlan(user)
    ? jumpCustomPlan(user, ctx, pages)
    : isJuzMode(user)
      ? jumpJuz(user, ctx, pages)
      : jumpPages(user, ctx, pages);
  if (!moved) return null;

  // Today: what was revised today stays counted, and goes first. Pages carried into
  // today and not revised belong to the start being jumped from, so they are dropped:
  // a carry left in front of the new start would hold today where it was.
  const today = dateToLocalISODay(ctx.revisionDate);
  const memorizedSet = new Set(ctx.memorized.map((p) => p.pageNumber));
  const keep = [...new Set(revisedOn(ctx.logs, today))].filter((p) => memorizedSet.has(p));
  const carryOver =
    keep.length > 0 || user.carryOver?.day === today ? { day: today, pages: keep, skip: 0 } : user.carryOver;

  return { user: { ...user, ...moved.fields, carryOver }, startPage: moved.startPage, today: moved.today };
}

/** What a jump changes, from `before`, to put back with Undo (null clears a carry-over). */
export function undoJump(current: User, before: User): User {
  return {
    ...current,
    customPlan: before.customPlan,
    scheduleAnchorDate: before.scheduleAnchorDate,
    scheduleShiftPages: before.scheduleShiftPages ?? 0,
    carryOver: before.carryOver ?? null,
  };
}

/** "Juz 12 · p. 222", "Al-Kahf · p. 293", for the toast. */
export function describeStart(target: JumpTarget, startPage: number): string {
  if (target.kind === 'juz') return `Juz ${target.juz} · p. ${startPage}`;
  if (target.kind === 'surah') {
    const name = getSurahDisplay(target.surah)?.nameDisplay ?? getSurah(target.surah)?.name ?? `Surah ${target.surah}`;
    return `${name} · p. ${startPage}`;
  }
  return `p. ${startPage}`;
}

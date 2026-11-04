// Carrying unrevised pages from yesterday's session into today's.
//
// Two ways to make room, chosen in Settings ("Keep daily amount"):
//   'shift' (default) — the leftovers go first and today keeps its usual size:
//       the end of today's pages moves to tomorrow, and the rest of the plan
//       slides back by the same number of pages. Stored as a page offset on the
//       schedule (User.scheduleShiftPages) plus today's carried pages, so the
//       plan itself, its start date and the schedule type stay as they are.
//   'add' — the leftovers are added on top of today's pages; nothing else moves.
//
// Carrying over happens at most once per revision day.

import { RevisionLog, User, UserPage } from '../types';
import { getPagesForDay, getPagesScheduledForDate } from './algorithm';
import { creditIndex } from './aheadCredit';
import { dateToLocalISODay } from './schedulePlans';

export type CarryOverMode = 'shift' | 'add';
export const DEFAULT_CARRY_OVER_MODE: CarryOverMode = 'shift';

/**
 * How many past revision days to collect leftovers from. Only yesterday for now;
 * a setting could raise it later (findLeftoverPages already takes it).
 */
/**
 * How many past revision days to collect leftovers from: yesterday and the two
 * days before it. A day missed entirely is offered too, so a missed day is
 * never simply gone.
 */
export const CARRY_OVER_LOOKBACK_DAYS = 3;

function addDays(isoDay: string, delta: number): string {
  const [y, m, d] = isoDay.split('-').map(Number);
  return dateToLocalISODay(new Date(y, m - 1, d + delta));
}

/** The pages to catch up on, and the days they were scheduled for. */
export interface Leftovers {
  pages: number[];
  /** The days that gave pages, oldest first. `missed`: nothing at all was revised that day. */
  days: { day: string; ago: number; missed: boolean }[];
}

/**
 * Pages scheduled on the previous `lookbackDays` revision days that have not
 * been revised since. A day with a session plans the pages of that session; a
 * day with no session plans what the schedule gave it (`scheduledOn`), so a
 * day missed entirely is offered in full. Pages of the day already revised, or
 * already in today's session, are left out. Oldest day first, in session order.
 */
export function findLeftovers(
  logs: RevisionLog[],
  today: string,
  todaysPages: number[],
  memorized: Set<number>,
  lookbackDays: number = CARRY_OVER_LOOKBACK_DAYS,
  scheduledOn: (day: string) => number[] = () => [],
): Leftovers {
  const firstDay = addDays(today, -lookbackDays);
  const revisedSince = new Map<number, string>(); // page -> latest day revised
  for (const log of logs) {
    if (log.date < firstDay || log.date > today) continue;
    for (const p of log.pagesRevised) {
      const prev = revisedSince.get(p);
      if (!prev || log.date > prev) revisedSince.set(p, log.date);
    }
  }

  const exclude = new Set(todaysPages);
  const credit = creditIndex(logs);
  const out: Leftovers = { pages: [], days: [] };
  for (let back = lookbackDays; back >= 1; back--) {
    const day = addDays(today, -back);
    const dayLogs = logs.filter((l) => l.date === day);
    const assigned = [...new Set(dayLogs.flatMap((l) => l.assignedPages ?? []))];
    const planned = assigned.length > 0 ? assigned : scheduledOn(day);
    const before = out.pages.length;
    for (const p of planned) {
      const revised = revisedSince.get(p);
      if (revised && revised >= day) continue;
      // Revised ahead for this day: done, not a leftover.
      if (credit.get(day)?.has(p)) continue;
      if (exclude.has(p) || !memorized.has(p)) continue;
      exclude.add(p);
      out.pages.push(p);
    }
    if (out.pages.length > before) {
      out.days.push({ day, ago: back, missed: !dayLogs.some((l) => l.pagesRevised.length > 0) });
    }
  }
  return out;
}

/**
 * What Home offers to catch up on for the revision day `today`: findLeftovers
 * with the schedule read from the user. A day before the last carry-over is not
 * read from the schedule: a carry moves the whole schedule, so an earlier day
 * would show pages it never had. Nothing is offered once today has carried over.
 */
export function leftoversFor(
  user: User,
  logs: RevisionLog[],
  today: string,
  todaysPages: number[],
  memorizedPages: UserPage[],
): Leftovers {
  const none: Leftovers = { pages: [], days: [] };
  if (hasCarriedOver(user, today)) return none;
  const memorized = new Set(memorizedPages.map((p) => p.pageNumber));
  const carriedDay = user.carryOver?.day;
  const scheduledOn = (day: string) => {
    if (carriedDay && day < carriedDay) return [];
    const [y, m, d] = day.split('-').map(Number);
    return getPagesForDay(user, new Date(y, m - 1, d), memorizedPages);
  };
  return findLeftovers(logs, today, todaysPages, memorized, CARRY_OVER_LOOKBACK_DAYS, scheduledOn);
}

/** The leftover pages alone (see findLeftovers). */
export function findLeftoverPages(
  logs: RevisionLog[],
  today: string,
  todaysPages: number[],
  memorized: Set<number>,
  lookbackDays: number = CARRY_OVER_LOOKBACK_DAYS,
): number[] {
  return findLeftovers(logs, today, todaysPages, memorized, lookbackDays).pages;
}

/** Whether pages were already carried into the revision day `today`. */
export function hasCarriedOver(user: User | null | undefined, today: string): boolean {
  return user?.carryOver?.day === today;
}

/**
 * The user after carrying `leftovers` into the revision day `revisionDate`.
 *
 * 'shift': the schedule moves back by `skip` pages, so today's scheduled pages
 * start with the `skip` pages before them in the plan (yesterday's tail, which
 * was revised or is among the leftovers); those are replaced by the leftovers.
 * `skip` is capped at today's size: with more leftovers than that, today holds
 * all of them and the whole of today's plan moves to tomorrow. On an off day
 * nothing shifts and the leftovers are simply today's pages.
 */
export function applyCarryOver(
  user: User,
  memorizedPages: UserPage[],
  leftovers: number[],
  revisionDate: Date,
): User {
  const today = dateToLocalISODay(revisionDate);
  if (leftovers.length === 0 || hasCarriedOver(user, today)) return user;
  const mode = user.carryOverMode ?? DEFAULT_CARRY_OVER_MODE;
  if (mode === 'add') {
    return { ...user, carryOver: { day: today, pages: [...leftovers], skip: 0 } };
  }
  const scheduled = getPagesScheduledForDate(user, revisionDate, memorizedPages);
  const skip = Math.min(leftovers.length, scheduled.length);
  return {
    ...user,
    scheduleShiftPages: (user.scheduleShiftPages ?? 0) + skip,
    carryOver: { day: today, pages: [...leftovers], skip },
  };
}

/**
 * The user after saving a new plan in the editor. The editor showed the shifted
 * schedule, so the shift is now part of the plan; pages carried into today stay
 * today, on top of the new plan's first day.
 */
export function settleCarryOverForNewPlan(user: User, today: string): User {
  const carry = user.carryOver;
  return {
    ...user,
    ...(user.scheduleShiftPages ? { scheduleShiftPages: 0 } : {}),
    ...(carry && carry.day === today && carry.skip ? { carryOver: { ...carry, skip: 0 } } : {}),
  };
}

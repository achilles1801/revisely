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
import { getPagesScheduledForDate } from './algorithm';
import { dateToLocalISODay } from './schedulePlans';

export type CarryOverMode = 'shift' | 'add';
export const DEFAULT_CARRY_OVER_MODE: CarryOverMode = 'shift';

/**
 * How many past revision days to collect leftovers from. Only yesterday for now;
 * a setting could raise it later (findLeftoverPages already takes it).
 */
export const CARRY_OVER_LOOKBACK_DAYS = 1;

function addDays(isoDay: string, delta: number): string {
  const [y, m, d] = isoDay.split('-').map(Number);
  return dateToLocalISODay(new Date(y, m - 1, d + delta));
}

/**
 * Pages assigned on the previous `lookbackDays` revision days that were started
 * but not finished, and that have not been revised since. Days with no session
 * at all are left to "Go back a day". Oldest day first, in session order.
 */
export function findLeftoverPages(
  logs: RevisionLog[],
  today: string,
  todaysPages: number[],
  memorized: Set<number>,
  lookbackDays: number = CARRY_OVER_LOOKBACK_DAYS,
): number[] {
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
  const out: number[] = [];
  for (let back = lookbackDays; back >= 1; back--) {
    const day = addDays(today, -back);
    const dayLogs = logs.filter((l) => l.date === day && (l.assignedPages?.length ?? 0) > 0);
    if (!dayLogs.some((l) => l.pagesRevised.length > 0)) continue;
    for (const log of dayLogs) {
      for (const p of log.assignedPages ?? []) {
        const revised = revisedSince.get(p);
        if (revised && revised >= day) continue;
        if (exclude.has(p) || !memorized.has(p)) continue;
        exclude.add(p);
        out.push(p);
      }
    }
  }
  return out;
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

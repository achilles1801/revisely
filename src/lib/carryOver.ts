// Carrying unrevised pages from yesterday's session into today's.
//
// Two ways to make room, chosen in Settings ("Keep daily amount"):
//   'shift' (default) — today keeps its usual size: the leftovers go first, the
//       end of today's pages moves to tomorrow, and the rest of the plan slides
//       back by as many pages as were carried over.
//   'add' — the leftovers are added on top of today's pages; nothing else moves.
//
// 'shift' rewrites the cycle as a custom plan starting today, because only a
// custom plan can express a schedule moved by a number of pages rather than
// whole days. 'add' records the extra pages for today on the user.

import { RevisionLog, User, UserPage } from '../types';
import { buildDefaultPlanDays, buildJuzCycleDays } from './algorithm';
import { rotateCustomPlanToToday } from './planBuilder';
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

/**
 * The 'shift' rewrite of a cycle whose index 0 is today: the leftovers move to
 * the front and every day keeps its size, so pages flow onward by
 * `leftovers.length`. Each leftover is taken out of the cycle at its last
 * occurrence, which is yesterday's day, at the end of a cycle rotated to today.
 */
export function shiftDaysForCarryOver(days: number[][], leftovers: number[]): number[][] {
  const sizes = days.map((d) => d.length);
  const seq = days.flat();
  for (const p of leftovers) {
    const i = seq.lastIndexOf(p);
    if (i >= 0) seq.splice(i, 1);
  }
  const flow = [...leftovers, ...seq];
  const out: number[][] = [];
  let at = 0;
  for (const size of sizes) {
    out.push(flow.slice(at, at + size));
    at += size;
  }
  // Only possible if a leftover was not in the cycle; callers filter those out.
  if (at < flow.length && out.length > 0) out[out.length - 1].push(...flow.slice(at));
  return out;
}

function withExtras(user: User, today: string, pages: number[]): User {
  const existing = user.carryOver?.day === today ? user.carryOver.pages : [];
  const merged = [...existing, ...pages.filter((p) => !existing.includes(p))];
  return { ...user, carryOver: { day: today, pages: merged } };
}

/** The user after carrying `leftovers` into the revision day `revisionDate`. */
export function applyCarryOver(
  user: User,
  memorizedPages: UserPage[],
  leftovers: number[],
  revisionDate: Date,
): User {
  if (leftovers.length === 0) return user;
  const today = dateToLocalISODay(revisionDate);
  const mode = user.carryOverMode ?? DEFAULT_CARRY_OVER_MODE;
  if (mode === 'add') return withExtras(user, today, leftovers);

  const plan = user.customPlan && user.customPlan.days.length > 0 ? user.customPlan : null;
  // A plan pushed back past today has no slot for today to make room in.
  if (plan && plan.cycleStartDate > today) return withExtras(user, today, leftovers);

  const days = plan
    ? rotateCustomPlanToToday(plan, revisionDate)
    : user.scheduleMode === 'juz' && (user.dailyJuzCount ?? 0) > 0
      ? buildJuzCycleDays(user, memorizedPages, revisionDate)
      : buildDefaultPlanDays(user, memorizedPages, 'forward', revisionDate);
  if (days.length === 0) return withExtras(user, today, leftovers);

  const inCycle = new Set(days.flat());
  const shifted = leftovers.filter((p) => inCycle.has(p));
  const outside = leftovers.filter((p) => !inCycle.has(p));

  let next: User = {
    ...user,
    customPlan: {
      days: shiftDaysForCarryOver(days, shifted),
      cycleStartDate: today,
      direction: plan?.direction ?? 'forward',
    },
  };
  if (outside.length > 0) next = withExtras(next, today, outside);
  return next;
}

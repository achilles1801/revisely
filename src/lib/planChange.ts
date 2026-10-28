// Switching to a new schedule (a plan built or loaded in the plan editor, an
// edit to today's day, or back to the automatic one) and today's revision.
//
// Today switches to the new schedule at once, whether or not today's revision
// was started: today's pages are the pages already revised today (they stay
// counted, shown done), then the new schedule's day for today. Yesterday's
// leftovers carried into today (from the old schedule) go, and aren't offered
// again today. Only an edit that leaves today's day as it was (a later day
// changed) keeps today exactly as it is, leftovers included.
//
// Today's pages are set with the carry-over (User.carryOver for today, see
// lib/carryOver): its pages go first, then the scheduled ones not among them.

import { RevisionLog, User, UserPage } from '../types';
import { getPagesScheduledForDate } from './algorithm';
import { settleCarryOverForNewPlan } from './carryOver';
import { dateToLocalISODay } from './schedulePlans';

/** Every page revised on the revision day `day`, once each, in the order revised. */
export function revisedOn(logs: RevisionLog[], day: string): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const log of logs) {
    if (log.date !== day) continue;
    for (const p of log.pagesRevised) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((p) => s.has(p));
}

/**
 * The user to save when `before` switches to `schedule` (its `customPlan`, or
 * null for the automatic schedule) on the revision day `revisionDate`.
 * `newPlan`: a plan built or loaded (not an edit of the one shown), or the
 * automatic schedule; it always takes over today.
 */
export function userWithNewSchedule(
  before: User,
  schedule: Pick<User, 'customPlan'>,
  ctx: { revisionDate: Date; memorized: UserPage[]; logs: RevisionLog[]; newPlan: boolean },
): User {
  const { revisionDate, memorized, logs, newPlan } = ctx;
  const today = dateToLocalISODay(revisionDate);
  // The editor showed the schedule with any carry-over shift in it, so the
  // shift is now part of what was saved.
  const settled: User = { ...settleCarryOverForNewPlan(before, today), customPlan: schedule.customPlan };

  const changesToday = !sameSet(
    getPagesScheduledForDate(before, revisionDate, memorized),
    getPagesScheduledForDate(settled, revisionDate, memorized),
  );
  if (!newPlan && !changesToday) return settled;

  const memorizedSet = new Set(memorized.map((p) => p.pageNumber));
  const revised = revisedOn(logs, today).filter((p) => memorizedSet.has(p));
  return { ...settled, carryOver: { day: today, pages: revised, skip: 0 } };
}

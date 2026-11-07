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
import { getPagesForDay, getPagesScheduledForDate, keepLaterCarry } from './algorithm';
import { settleCarryOverForNewPlan } from './carryOver';
import { dateToLocalISODay } from './schedulePlans';

/**
 * Every page revised on the revision day `day` (or ahead for it, lib/aheadCredit),
 * once each, in the order revised.
 */
export function revisedOn(logs: RevisionLog[], day: string): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const log of logs) {
    const pages = [...(log.date === day ? log.pagesRevised : []), ...(log.ahead?.[day] ?? [])];
    for (const p of pages) {
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
  const settled: User = { ...settleCarryOverForNewPlan(before), customPlan: schedule.customPlan };

  const changesToday = !sameSet(
    getPagesScheduledForDate(before, revisionDate, memorized),
    getPagesScheduledForDate(settled, revisionDate, memorized),
  );
  if (!newPlan && !changesToday) return keepingToday(before, settled, revisionDate, memorized);

  const memorizedSet = new Set(memorized.map((p) => p.pageNumber));
  const revised = revisedOn(logs, today).filter((p) => memorizedSet.has(p));
  return { ...settled, carryOver: { day: today, pages: revised, skip: 0, ...keepLaterCarry(before, today) } };
}

const samePages = (a: number[], b: number[]) => a.length === b.length && a.every((p, i) => p === b[i]);

/**
 * `settled` with today's pages exactly as they were in `before` (CARRY-5): an
 * edit that leaves today's day alone leaves today alone, carried pages
 * included.
 *
 * Usually the carry-over as it was does it: the saved day starts with the pages
 * the leftovers stand in for, as before. A page that ends yesterday and also
 * starts today is shown once in the editor's day, so its `skip` can count one
 * page too many; the carry-over is then rewritten with the fewest of today's
 * pages marked as carried that gives today back. (Setting `skip` to 0, as
 * saving once did, brought a page revised yesterday back into today.)
 */
function keepingToday(before: User, settled: User, revisionDate: Date, memorized: UserPage[]): User {
  const today = dateToLocalISODay(revisionDate);
  if (before.carryOver?.day !== today) return settled;
  const want = getPagesForDay(before, revisionDate, memorized);
  const gives = (u: User) => samePages(getPagesForDay(u, revisionDate, memorized), want);
  if (gives(settled)) return settled;
  const day = getPagesScheduledForDate(settled, revisionDate, memorized);
  for (let skip = 0; skip <= day.length; skip++) {
    const rest = day.slice(skip);
    if (rest.length > want.length) continue;
    const carried = want.slice(0, want.length - rest.length);
    const candidate: User = { ...settled, carryOver: { day: today, pages: carried, skip, ...keepLaterCarry(before, today) } };
    if (gives(candidate)) return candidate;
  }
  // Not reached (skip = the whole day gives `want`), but never lose today.
  return { ...settled, carryOver: { day: today, pages: want, skip: day.length, ...keepLaterCarry(before, today) } };
}

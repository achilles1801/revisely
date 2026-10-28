// Switching to a new schedule (a plan saved in the plan editor, or back to the
// automatic one) and what it does to today's revision.
//
// A save that leaves today's day as it was (an edit to a later day) keeps today
// exactly as it is, leftovers carried into it included. A save that changes
// today's pages:
//   - nothing revised today yet: the new plan starts today. Today is exactly its
//     first day; yesterday's leftovers carried into today (from the old schedule)
//     go, and aren't offered again today.
//   - part of today revised: the user chooses. Today: the pages already revised
//     stay on today as done, then the new first day. Tomorrow: today stays as it
//     is and the new plan's first day is tomorrow.
//   - today done: the new plan starts tomorrow (today stays done).
//
// Today's pages are held with the carry-over (User.carryOver for today, see
// lib/carryOver): its pages go first, and `skip` hides that many scheduled pages.
// "Tomorrow" is stored without a start date in the future: the plan starts today
// with its days turned by one (tomorrow is its first day), and today's slot is
// hidden behind today's held pages. Every version of the app reads that the
// same way; a start after today would be moved back to today by older ones
// (DashboardScreen's repair, scheduleStartingByToday).

import { RevisionLog, User, UserPage } from '../types';
import { getPagesForDay, getPagesScheduledForDate } from './algorithm';
import { settleCarryOverForNewPlan } from './carryOver';
import { dateToLocalISODay } from './schedulePlans';

/** How far today's revision has got: nothing revised, some of it, or all of today's pages. */
export type TodayProgress = 'none' | 'partial' | 'done';

/** Where a new schedule's first day lands. */
export type PlanStart = 'today' | 'tomorrow';

export interface ScheduleChange {
  /** Whether the new schedule changes the pages scheduled today. */
  changesToday: boolean;
  progress: TodayProgress;
  /** Where it starts without asking; null: part of today is revised, ask. */
  defaultStart: PlanStart | null;
  /** The user to save, the new schedule starting `start`. */
  apply: (start: PlanStart) => User;
}

interface Context {
  revisionDate: Date;
  memorized: UserPage[];
}

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

/** `before` on `schedule`, the carry-over shift folded in (the editor showed the shifted days). */
function settledOn(before: User, schedule: Pick<User, 'customPlan'>, today: string): User {
  return { ...settleCarryOverForNewPlan(before, today), customPlan: schedule.customPlan };
}

/**
 * Whether today is held for a schedule that starts tomorrow: today's pages are
 * the carry-over's, and today's own slot is hidden. (A carry-over that keeps the
 * daily amount also hides pages, but it always comes with a shift.)
 */
export function holdsToday(user: User | null | undefined, revisionDate: Date): boolean {
  const carry = user?.carryOver;
  return (
    !!carry &&
    carry.day === dateToLocalISODay(revisionDate) &&
    carry.pages.length > 0 &&
    (carry.skip ?? 0) > 0 &&
    !(user?.scheduleShiftPages ?? 0)
  );
}

/**
 * The user with `schedule` starting tomorrow, today held exactly as it is now.
 * A plan starts today with its last day first, so tomorrow is its first day.
 */
export function scheduleFromTomorrow(before: User, schedule: Pick<User, 'customPlan'>, ctx: Context): User {
  const { revisionDate, memorized } = ctx;
  const today = dateToLocalISODay(revisionDate);
  const settled = settledOn(before, schedule, today);
  const todaysPages = getPagesForDay(before, revisionDate, memorized);
  // skip is at least 1, so a held day is recognisable even over a rest day.
  if (settled.customPlan && settled.customPlan.days.length > 0) {
    const days = settled.customPlan.days;
    const turned = [days[days.length - 1], ...days.slice(0, -1)].map((d) => [...d]);
    return {
      ...settled,
      customPlan: { ...settled.customPlan, days: turned, cycleStartDate: today },
      carryOver: { day: today, pages: todaysPages, skip: Math.max(1, turned[0].length) },
    };
  }
  // The automatic schedule carries on from its anchor; today's slot is hidden.
  const scheduled = getPagesScheduledForDate(settled, revisionDate, memorized);
  return { ...settled, carryOver: { day: today, pages: todaysPages, skip: Math.max(1, scheduled.length) } };
}

/**
 * What switching `before` to `schedule` (its `customPlan`, or null for the
 * automatic schedule) does to today, the revision day `revisionDate`.
 */
export function planScheduleChange(
  before: User,
  schedule: Pick<User, 'customPlan'>,
  ctx: Context & { logs: RevisionLog[] },
): ScheduleChange {
  const { revisionDate, memorized, logs } = ctx;
  const today = dateToLocalISODay(revisionDate);
  const settled = settledOn(before, schedule, today);

  const changesToday = !sameSet(
    getPagesScheduledForDate(before, revisionDate, memorized),
    getPagesScheduledForDate(settled, revisionDate, memorized),
  );
  const todaysPages = getPagesForDay(before, revisionDate, memorized);
  const revised = revisedOn(logs, today);
  const revisedSet = new Set(revised);
  const progress: TodayProgress =
    revised.length === 0 ? 'none' : todaysPages.every((p) => revisedSet.has(p)) ? 'done' : 'partial';

  if (!changesToday) {
    return { changesToday, progress, defaultStart: 'today', apply: () => settled };
  }

  const memorizedSet = new Set(memorized.map((p) => p.pageNumber));
  const apply = (start: PlanStart): User =>
    start === 'today'
      ? // Pages revised today stay on today (done); nothing else carried in.
        { ...settled, carryOver: { day: today, pages: revised.filter((p) => memorizedSet.has(p)), skip: 0 } }
      : scheduleFromTomorrow(before, schedule, ctx);

  return {
    changesToday,
    progress,
    defaultStart: progress === 'none' ? 'today' : progress === 'done' ? 'tomorrow' : null,
    apply,
  };
}

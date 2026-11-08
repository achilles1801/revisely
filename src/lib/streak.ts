// The streak, one rule for Home, the widget and the reminders (C5, Nov 2026, owner-approved):
// a day counts when every page scheduled for it is credited to it, ahead credits included (a
// page revised on another day counts for the day it is scheduled on). The streak stays alive
// through yesterday until today's revision day ends. Pure: the callers pass the logs and pages.

import { RevisionLog, User, UserPage } from '../types';
import { catchUpIndex, creditIndex, needDone, needDoneCount } from './aheadCredit';
import { planDuePages } from './carryOver';
import { revisablePages } from './memorizedAyahs';

/** The day before an ISO day ('YYYY-MM-DD'). UTC calendar arithmetic: no daylight-saving shift. */
export function previousIsoDay(s: string): string {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** The day after an ISO day ('YYYY-MM-DD'), as previousIsoDay. */
export function nextIsoDay(s: string): string {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * The days whose scheduled pages are all credited to them. `credited` maps each day to the
 * pages credited to it (creditIndex); `scheduled` gives a day's pages. A day with nothing
 * scheduled never counts. `caughtUp` (catchUpIndex): a day the carried pages fill is done when
 * its sessions have revised them all, though they are credited to the days they were missed
 * (SESS-7, lib/aheadCredit needDone).
 */
export function completedDays(
  credited: ReadonlyMap<string, ReadonlySet<number>>,
  scheduled: (day: string) => readonly number[],
  caughtUp: ReadonlyMap<string, ReadonlySet<number>> = new Map(),
): Set<string> {
  const done = new Set<string>();
  for (const day of new Set([...credited.keys(), ...caughtUp.keys()])) {
    if (needDone(scheduled(day), credited.get(day), caughtUp.get(day))) done.add(day);
  }
  return done;
}

/**
 * Days in a row, counting back from `today` if it is done, else from yesterday: the streak is
 * alive until today's revision day ends.
 */
export function aliveStreak(done: ReadonlySet<string>, today: string): number {
  let cursor = done.has(today) ? today : previousIsoDay(today);
  let streak = 0;
  while (done.has(cursor)) {
    streak++;
    cursor = previousIsoDay(cursor);
  }
  return streak;
}

/**
 * The streak from the revision logs. A logged day's scheduled pages are its own assignment
 * snapshot (assignedPages); a day without a log is scheduled by the plan.
 */
export function streakFromLogs(input: {
  user: User;
  pages: readonly UserPage[];
  logs: readonly RevisionLog[];
  today: string;
}): number {
  const memorized = revisablePages(input.pages);
  const logOf = new Map(input.logs.map((l) => [l.date, l]));
  const scheduled = (day: string): readonly number[] => {
    const assigned = logOf.get(day)?.assignedPages;
    if (assigned) return assigned;
    return planDuePages(input.user, day, memorized);
  };
  return aliveStreak(completedDays(creditIndex(input.logs), scheduled, catchUpIndex(input.logs)), input.today);
}

/** A day's progress: its scheduled pages and how many are credited to it. */
export interface DayProgress {
  scheduled: number;
  credited: number;
}

/**
 * The streak as Home and the widget show it (SESS-6). `done` is every day all its pages are
 * credited to, at any time. `onTime` is the days done in time: by the end of their grace window,
 * the revision day after them. Only those carry the run behind them. A day restored in its grace
 * window counts as on time from then on, so the streak it brought back is still there the next
 * morning (D4, Majd, Nov 7 2026); a day done later counts itself but carries nothing.
 * `grace` is set when yesterday is missed but the run before it is intact: the streak reads 0
 * until yesterday is done, and `previous` is the streak that comes back if it is.
 */
export interface StreakReading {
  streak: number;
  grace: null | { previous: number; progress: DayProgress };
}

export function streakReading(input: {
  done: ReadonlySet<string>;
  onTime: ReadonlySet<string>;
  scheduled: (day: string) => readonly number[];
  credited: ReadonlyMap<string, ReadonlySet<number>>;
  /** Catch-up pages revised in each day's sessions (completedDays): they count for a day they fill. */
  caughtUp?: ReadonlyMap<string, ReadonlySet<number>>;
  today: string;
}): StreakReading {
  const { done, onTime, today } = input;
  const yesterday = previousIsoDay(today);
  // The streak through yesterday. Yesterday counts itself when it is done (today is its grace
  // window); the run behind it counts only the days done in time. Nothing scheduled yesterday is
  // no missed day: the run before it carries on.
  const throughYesterday = done.has(yesterday)
    ? 1 + runFrom(onTime, previousIsoDay(yesterday))
    : input.scheduled(yesterday).length === 0
      ? runFrom(onTime, previousIsoDay(yesterday))
      : null;
  // Today done adds itself to that. (Counting back from today through the on-time days alone
  // dropped a restored yesterday, and the run behind it, once today was done: Nov 2026.)
  if (done.has(today)) return { streak: 1 + (throughYesterday ?? 0), grace: null };
  if (throughYesterday != null) return { streak: throughYesterday, grace: null };
  // Yesterday missed. The run before it must have been done in time, or the streak is broken.
  const previous = runFrom(onTime, previousIsoDay(yesterday));
  if (previous === 0) return { streak: 0, grace: null };
  const need = input.scheduled(yesterday);
  const credited = needDoneCount(need, input.credited.get(yesterday), input.caughtUp?.get(yesterday));
  return {
    streak: 0,
    grace: { previous, progress: { scheduled: need.length, credited } },
  };
}

/** Days in a row in `set`, counting back from `day` (no alive rule: the caller picks the start). */
function runFrom(set: ReadonlySet<string>, day: string): number {
  let cursor = day;
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = previousIsoDay(cursor);
  }
  return n;
}

/**
 * A streak reading with the days behind it: which days are done (every scheduled page credited)
 * and what each day had scheduled. Revo's week reads these, so it says what the streak counts.
 */
export interface StreakDetail {
  reading: StreakReading;
  done: ReadonlySet<string>;
  scheduled: (day: string) => readonly number[];
}

/** The streak reading from the revision logs: the logs' pages, ahead credits and each day's assignment. */
export function streakReadingFromLogs(input: { user: User; pages: readonly UserPage[]; logs: readonly RevisionLog[]; today: string }): StreakReading {
  return streakDetailFromLogs(input).reading;
}

/** streakReadingFromLogs, with the days behind it. */
export function streakDetailFromLogs(input: { user: User; pages: readonly UserPage[]; logs: readonly RevisionLog[]; today: string }): StreakDetail {
  const memorized = revisablePages(input.pages);
  const logOf = new Map(input.logs.map((l) => [l.date, l]));
  const scheduled = (day: string): readonly number[] => {
    const assigned = logOf.get(day)?.assignedPages;
    if (assigned) return assigned;
    return planDuePages(input.user, day, memorized);
  };
  const credited = creditIndex(input.logs);
  // A day the carried pages fill is done by its sessions' catch-up pages (SESS-7).
  const caughtUp = catchUpIndex(input.logs);
  const done = completedDays(credited, scheduled, caughtUp);
  // The logs alone cannot say when a page was revised. Until the items carry a time, a day counts
  // as on time when it is done (the grace rule then matches the done-day rule).
  return { reading: streakReading({ done, onTime: done, scheduled, credited, caughtUp, today: input.today }), done, scheduled };
}

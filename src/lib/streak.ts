// The streak, one rule for Home, the widget and the reminders (C5, Nov 2026, owner-approved):
// a day counts when every page scheduled for it is credited to it, ahead credits included (a
// page revised on another day counts for the day it is scheduled on). The streak stays alive
// through yesterday until today's revision day ends. Pure: the callers pass the logs and pages.

import { RevisionLog, User, UserPage } from '../types';
import { getPagesForDay } from './algorithm';
import { creditIndex } from './aheadCredit';

/** The day before an ISO day ('YYYY-MM-DD'). UTC calendar arithmetic: no daylight-saving shift. */
export function previousIsoDay(s: string): string {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * The days whose scheduled pages are all credited to them. `credited` maps each day to the
 * pages credited to it (creditIndex); `scheduled` gives a day's pages. A day with nothing
 * scheduled never counts.
 */
export function completedDays(
  credited: ReadonlyMap<string, ReadonlySet<number>>,
  scheduled: (day: string) => readonly number[],
): Set<string> {
  const done = new Set<string>();
  for (const [day, pages] of credited) {
    const need = scheduled(day);
    if (need.length > 0 && need.every((p) => pages.has(p))) done.add(day);
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
  const memorized = input.pages.filter((p) => p.status === 'memorized');
  const logOf = new Map(input.logs.map((l) => [l.date, l]));
  const scheduled = (day: string): readonly number[] => {
    const assigned = logOf.get(day)?.assignedPages;
    if (assigned) return assigned;
    const [y, m, d] = day.split('-').map(Number);
    return getPagesForDay(input.user, new Date(y, m - 1, d), memorized);
  };
  return aliveStreak(completedDays(creditIndex(input.logs), scheduled), input.today);
}

// Planning the revise-ahead days (#168): the next revision day for "Keep going",
// and the days a streak counts because their pages were all revised ahead.
// The credit rule itself is in lib/aheadCredit.

import { RevisionLog, User, UserPage } from '../types';
import { getPagesForDay } from './algorithm';
import { creditIndex } from './aheadCredit';
import { dateToLocalISODay } from './schedulePlans';

const MAX_DAYS_AHEAD = 400;

function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** The revision day after `day` (calendar), as 'YYYY-MM-DD'. */
export function revisionDayAfter(day: string): string {
  return addDays(day, 1);
}

/** "Wed": a revision day's weekday, for the header and Activity. */
export function weekdayLabel(day: string): string {
  return parseDay(day).toLocaleDateString('en-US', { weekday: 'short' });
}

function addDays(day: string, delta: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + delta);
  return dateToLocalISODay(d);
}

export interface RevisionDayPlan {
  day: string;
  pages: number[];
}

/**
 * The next revision day after `after` that has pages to revise, for "Keep going".
 * Off days (an empty custom-plan day) are skipped. Stops (null) at the end of one
 * cycle: when the next day's pages were already taken (`taken`: this session's
 * pages so far), the schedule has come round again.
 */
export function nextRevisionDayPlan(
  user: User,
  pages: readonly UserPage[],
  after: string,
  taken: ReadonlySet<number>,
  logs: readonly RevisionLog[] = [],
): RevisionDayPlan | null {
  const memorized = pages.filter((p) => p.status === 'memorized');
  const index = creditIndex(logs);
  for (let delta = 1; delta <= MAX_DAYS_AHEAD; delta++) {
    const day = addDays(after, delta);
    const scheduled = getPagesForDay(user, parseDay(day), memorized);
    if (scheduled.length === 0) continue;
    if (scheduled.some((p) => taken.has(p))) return null;
    // A day already done ahead is passed over: Keep going moves to the next.
    const credited = index.get(day);
    if (credited && scheduled.every((p) => credited.has(p))) continue;
    return { day, pages: [...scheduled] };
  }
  return null;
}

/** The pages of one revision day, as a plan (Home's "starts at" line opens it). */
export function revisionDayPlan(user: User, pages: readonly UserPage[], day: string): RevisionDayPlan {
  const memorized = pages.filter((p) => p.status === 'memorized');
  return { day, pages: [...getPagesForDay(user, parseDay(day), memorized)] };
}

/**
 * Days that count toward the streak beyond the days with a session: a day whose
 * scheduled pages were all credited ahead ("done ahead") is a day done.
 */
export function daysDoneAhead(
  user: User,
  pages: readonly UserPage[],
  logs: readonly RevisionLog[],
): Set<string> {
  const memorized = pages.filter((p) => p.status === 'memorized');
  const index = creditIndex(logs);
  const done = new Set<string>();
  for (const log of logs) {
    for (const day of Object.keys(log.ahead ?? {})) {
      if (done.has(day)) continue;
      const scheduled = getPagesForDay(user, parseDay(day), memorized);
      const credited = index.get(day);
      if (scheduled.length > 0 && credited && scheduled.every((p) => credited.has(p))) done.add(day);
    }
  }
  return done;
}

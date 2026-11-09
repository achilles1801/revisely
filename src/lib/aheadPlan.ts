// Planning the revise-ahead days (#168): the next revision day for "Keep going",
// and the days a streak counts because their pages were all revised ahead.
// The credit rule itself is in lib/aheadCredit.

import { RevisionLog, User, UserPage } from '../types';
import { calendarDaysBetween, getPagesForDay, juzModeCycle } from './algorithm';
import { creditIndex } from './aheadCredit';
import { dateToLocalISODay } from './schedulePlans';
import { revisablePages } from './memorizedAyahs';

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

/**
 * A later revision day named from `today`: its weekday within the week ("Thu"), else its weekday and
 * date ("Mon 16 Nov"), so a day a cycle on (AHEAD-3) never reads as today's own weekday.
 */
export function aheadDayLabel(today: string, day: string, opts: { long?: boolean } = {}): string {
  const d = parseDay(day);
  const weekday = opts.long ? d.toLocaleDateString('en-US', { weekday: 'long' }) : weekdayLabel(day);
  if (calendarDaysBetween(parseDay(today), d) < 7) return weekday;
  return `${weekday} ${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })}`;
}

function addDays(day: string, delta: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + delta);
  return dateToLocalISODay(d);
}

export interface RevisionDayPlan {
  day: string;
  pages: number[];
  /**
   * The day repeats pages the session already holds: the schedule has come round (a whole cycle
   * revised from where the session started). It starts a new round, revised apart from the pages
   * before it (AHEAD-3: Majd, Nov 9 2026, the cycle restarts). Absent otherwise.
   */
  round?: true;
}

/**
 * The next revision day after `after` that still has pages to revise, for
 * "Keep going" and "Tomorrow starts at". The plan holds only the pages not yet
 * done on that day (a partly done day continues from its first page not done);
 * a day whose pages are all done ahead is passed over. Off days (an empty
 * custom-plan day) are skipped.
 *
 * It never stops at the end of a cycle (AHEAD-3). When the day's pages include
 * pages already taken (`taken`: this session's pages so far, or today's on
 * Home), the schedule has come round: the plan is marked `round`, and the day
 * is revised as a new round, apart from those pages. Null only when nothing is
 * left to revise at all.
 */
export function nextRevisionDayPlan(
  user: User,
  pages: readonly UserPage[],
  after: string,
  taken: ReadonlySet<number>,
  logs: readonly RevisionLog[] = [],
): RevisionDayPlan | null {
  const memorized = revisablePages(pages);
  const index = creditIndex(logs);
  for (let delta = 1; delta <= MAX_DAYS_AHEAD; delta++) {
    const day = addDays(after, delta);
    const scheduled = getPagesForDay(user, parseDay(day), memorized);
    if (scheduled.length === 0) continue;
    const credited = index.get(day);
    const remaining = credited ? scheduled.filter((p) => !credited.has(p)) : scheduled;
    if (remaining.length === 0) continue;
    return remaining.some((p) => taken.has(p)) ? { day, pages: remaining, round: true } : { day, pages: remaining };
  }
  return null;
}

/**
 * Whether a revision day begins a pass through the plan from its first page, `first` being the page
 * it would open on: day one of a custom plan or of the juz cycle, or, on the pages-a-day plan, a day
 * that starts on the first memorized page. A day that ends one pass and begins the next (its pages
 * run past the last page and on from the first) doesn't: it opens on the old pass's pages.
 */
export function startsCycle(user: User, pages: readonly UserPage[], day: string, first: number): boolean {
  const memorized = revisablePages(pages);
  if (memorized.length === 0) return false;
  const custom = user.customPlan;
  if (custom && custom.days.length > 0) {
    const firstDay = custom.days.findIndex((d) => d.length > 0);
    if (firstDay < 0) return false;
    const since = calendarDaysBetween(parseDay(custom.cycleStartDate), parseDay(day));
    if (since < 0) return false;
    const n = custom.days.length;
    return ((since % n) + n) % n === firstDay && first === custom.days[firstDay][0];
  }
  if (user.scheduleMode === 'juz' && (user.dailyJuzCount ?? 0) > 0) {
    const juz = juzModeCycle(user, memorized);
    if (!juz) return false;
    const since = calendarDaysBetween(new Date(user.scheduleAnchorDate || user.createdAt), parseDay(day));
    if (since < 0) return false;
    return since % juz.cycle.length === 0 && first === juz.cycle[0][0];
  }
  return first === Math.min(...memorized.map((p) => p.pageNumber));
}

/**
 * How Home names the next revision day (before "starts at …"), and Revo with it: "Tomorrow" for the day
 * after `today`; "Next cycle" for a day that begins a pass through the plan (AHEAD-3: revising ahead goes
 * on into the next cycle); else its weekday, "Thu" (with its date a week or more on, aheadDayLabel).
 */
export function aheadLead(
  user: User,
  pages: readonly UserPage[],
  today: string,
  plan: RevisionDayPlan,
  /** The weekday in full ("Thursday"), as Revo words it. */
  opts: { long?: boolean } = {},
): string {
  if (plan.day === revisionDayAfter(today)) return 'Tomorrow';
  if (plan.pages.length > 0 && startsCycle(user, pages, plan.day, plan.pages[0])) return 'Next cycle';
  return aheadDayLabel(today, plan.day, opts);
}

/**
 * The pages of one revision day still to revise, as a plan (Home's "starts at"
 * line opens it). Pages of that day already done (`logs`, see creditedOnDay)
 * are left out, so the session opens on the first page not yet done.
 */
export function revisionDayPlan(
  user: User,
  pages: readonly UserPage[],
  day: string,
  logs: readonly RevisionLog[] = [],
): RevisionDayPlan {
  const memorized = revisablePages(pages);
  const credited = creditIndex(logs).get(day);
  const scheduled = getPagesForDay(user, parseDay(day), memorized);
  return { day, pages: credited ? scheduled.filter((p) => !credited.has(p)) : [...scheduled] };
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
  const memorized = revisablePages(pages);
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

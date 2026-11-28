// Today as Home shows it, in one place: today's pages and how far they've got, whether the day is
// done, and the streak. Home's Today post and Revo's context are both built from this, so Revo
// can never say something about today, the week or the streak that Home doesn't (Nov 7 2026: Revo
// read the logs its own way and contradicted itself and Home).

import type { RevisionLog, User, UserPage } from '../types';
import { caughtUpOnDay, creditedOnDay, doneOnDay, needDoneCount } from './aheadCredit';
import { handLogsOf, withPhoneSessions } from './activityHistory';
import { carryOverOn } from './algorithm';
import { duePagesOf, insightsPagesOn } from './carryOver';
import { streakDetailFromLogs, type StreakDetail } from './streak';
import { streakDetailFromItems, type HistoryItem } from './streakFromItems';
import { revisablePages } from './memorizedAyahs';

export type TodayStatus = 'not_started' | 'partial' | 'completed';

export interface TodaySnapshot {
  /** The revision day. */
  day: string;
  /** Today's pages in the session's order, carried pages first: the list Home's lines describe. */
  pages: number[];
  /**
   * Of them, the pages that make today done (SESS-7, lib/carryOver duePagesOf): its own pages, or
   * the carried pages when Keep daily amount filled the day with them.
   */
  own: number[];
  /** Of them, the pages carried in from earlier days ("4 from yesterday first"). */
  carried: number[];
  /** Pages done for today: credited to it or revised in its sessions. Home's "Done · N". */
  done: ReadonlySet<number>;
  /** Today's pages done: Home's "N of total". */
  pagesDone: number;
  /** Not started, part done, or done (its own pages credited to it). */
  status: TodayStatus;
  /** Carried pages still to revise. */
  carriedLeft: number;
  /** How many of the carried pages Insights put there ("Revise these first tomorrow"); the rest are leftovers. */
  carriedInsights: number;
  /** The streak, and the days behind it, as Home reads it. */
  streak: StreakDetail;
}

/**
 * Home's status for today: done when its due pages are (SESS-7): credited to it, or, for a day the
 * carried pages fill, caught up in its sessions (`caughtUp`, lib/aheadCredit needDone).
 */
export function todayStatusOf(
  own: readonly number[],
  credited: ReadonlySet<number>,
  caughtUp?: ReadonlySet<number>,
): { status: TodayStatus; pagesCompleted: number } {
  const completed = needDoneCount(own, credited, caughtUp);
  // Pages revised today and the assignment later shrank (a custom-plan edit, an un-memorized surah):
  // done, rather than a negative "left".
  if (completed > 0 && completed >= own.length) return { status: 'completed', pagesCompleted: completed };
  if (completed > 0) return { status: 'partial', pagesCompleted: completed };
  return { status: 'not_started', pagesCompleted: 0 };
}

/** The pages carried into `day` that are among its pages. */
export function carriedPagesOn(user: User | null, day: string, pages: readonly number[]): number[] {
  // The carry for that day: today's own, or the next day's held beside it (carryOver.next).
  const carry = carryOverOn(user, day);
  if (!carry) return [];
  const carried = new Set(carry.pages);
  return pages.filter((p) => carried.has(p));
}

/** A day's pages and how far they've got, without the streak: what Home, the widget and the reminders all read (USER-2). */
export interface DayProgress {
  /** The day's pages in the session's order, carried pages first. */
  pages: number[];
  /** Of them, the pages that make the day done (SESS-7, lib/carryOver duePagesOf). */
  own: number[];
  /** Pages done for the day: credited to it, revised in its sessions, or logged by hand for it (ACT-15). */
  done: Set<number>;
  /**
   * The pages that finish the day, as a count to show: its own, or on a day with none of its own (an off day given pages
   * from Insights), all its pages.
   */
  finishing: number[];
  /** Of `finishing`, how many are done, as the status counts them. */
  finishingDone: number;
  status: TodayStatus;
}

/**
 * How far a revision day has got, as Home counts it (SESS-2, SESS-7, AHEAD-2, ACT-15). The widget and the reminders read
 * the same, so a day Home calls done is done on the widget, and no reminder asks for it (USER-2; Nov 27 2026, the
 * user-matrix sweep: both counted only the day's own sessions, so a day revised ahead or logged by hand still read as
 * not started there).
 */
export function dayProgress(input: {
  user: User;
  pages: readonly UserPage[];
  logs: readonly RevisionLog[];
  /** The revision day. */
  day: string;
  /** Its assignment (generateDailyAssignment's pages), carried pages included. */
  assignment: readonly number[];
  /** The Activity items (lib/activityHistory): the pages logged by hand among them count. Null until they've loaded. */
  history: readonly HistoryItem[] | null;
}): DayProgress {
  const { user, pages, logs, day, assignment, history } = input;
  const list = [...new Set(assignment)];
  const own = duePagesOf(list, user, day, revisablePages(pages));
  // Pages logged by hand for the day count as its sessions' do (ACT-15), once each.
  const counted = history ? [...logs, ...handLogsOf(history)] : logs;
  const credited = creditedOnDay(counted, day);
  const caughtUp = caughtUpOnDay(counted, day);
  // Done for the day: credited to it, caught up in its sessions, or revised in them for a later day (SESS-4's "Done · N").
  // But one revision counts for one day (AHEAD-3): a page of the day's own revised in its sessions only for a later day
  // counts there, not here. After a flight west across the date line, yesterday's session is today's, and its pages
  // revised ahead for tomorrow read "1 of 1" done on a day still to start (the user-matrix sweep, Nov 27 2026).
  const listed = new Set(list);
  const done = new Set([...doneOnDay(counted, day)].filter((p) => credited.has(p) || caughtUp.has(p) || !listed.has(p)));
  // A day with none of its own pages (an off day given pages from Insights) is done once its pages are:
  // Home said "N of N" and Continue revision for good (Nov 8 2026).
  if (own.length === 0) {
    const finishingDone = list.filter((p) => done.has(p)).length;
    const status = list.length > 0 && finishingDone === list.length ? 'completed' : finishingDone > 0 ? 'partial' : 'not_started';
    return { pages: list, own, done, finishing: list, finishingDone, status };
  }
  const { status, pagesCompleted } = todayStatusOf(own, credited, caughtUp);
  return { pages: list, own, done, finishing: own, finishingDone: Math.min(pagesCompleted, own.length), status };
}

export function todaySnapshot(input: {
  user: User;
  pages: readonly UserPage[];
  logs: readonly RevisionLog[];
  /** The revision day. */
  day: string;
  /** Today's assignment (generateDailyAssignment's pages), carried pages included. */
  assignment: readonly number[];
  /** The Activity items Home's streak reads (lib/activityHistory), or null until they've loaded. */
  history: readonly HistoryItem[] | null;
  now: number;
}): TodaySnapshot {
  const { user, pages, logs, day, history } = input;
  const { pages: list, own, done, status } = dayProgress(input);
  const carried = carriedPagesOn(user, day, list);
  const insights = insightsPagesOn(user, day);
  // From the Activity items once they've loaded, with the phone's sessions over them; the logs until then.
  const streak = history
    ? streakDetailFromItems({ user, pages, items: withPhoneSessions(history, logs, input.now), today: day })
    : streakDetailFromLogs({ user, pages, logs, today: day });
  return {
    day,
    pages: list,
    own,
    carried,
    done,
    pagesDone: list.filter((p) => done.has(p)).length,
    status,
    carriedLeft: carried.filter((p) => !done.has(p)).length,
    carriedInsights: carried.filter((p) => insights.has(p)).length,
    streak,
  };
}

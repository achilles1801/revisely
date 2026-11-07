// The streak from the Activity items (C5): the Revised items of the history, not the session logs.
// Same rule as lib/streak (SESS-2, SESS-6): a day is done when every page scheduled for it is
// credited to it. A day done in time carries the run behind it: by the end of its grace window,
// the revision day after it (D4, Majd, Nov 7 2026). A day's scheduled pages are its own item's
// `assigned` snapshot, or the plan when it has no item of its own.

import { User, UserPage } from '../types';
import { getFajrTimeFor } from './fajrBoundary';
import { planDuePages } from './carryOver';
import { completedDays, nextIsoDay, streakReading, type StreakDetail, type StreakReading } from './streak';

export interface HistoryItem {
  /** The item's id: a session's own day (`day`) or `day-ahead-<countsFor>`; a manual add's `manual-…`. */
  id?: string;
  day: string;
  countsFor: string;
  pages: number[];
  assigned: number[];
  occurredAt: number | null;
}

/**
 * When revision day `day` ends: the Fajr that starts the next day when the Fajr boundary is on (DAY-2:
 * from midnight until Fajr it is still the day before); the next local midnight otherwise.
 */
export function dayEndMs(day: string, user?: User | null): number {
  const [y, m, d] = day.split('-').map(Number);
  const nextDay = new Date(y, m - 1, d + 1);
  const midnight = nextDay.getTime();
  if (!user || !user.fajrBoundaryEnabled || !user.locationCoords) return midnight;
  const fajr = getFajrTimeFor(nextDay, user);
  return fajr ? fajr.getTime() : midnight;
}

/**
 * When a day's grace window ends (SESS-6): the end of the revision day after it. A day done by then
 * is done in time, and carries the run behind it from then on (D4, Majd, Nov 7 2026: a day restored
 * in its grace window still counts the next morning).
 */
export function graceEndMs(day: string, user?: User | null): number {
  return dayEndMs(nextIsoDay(day), user);
}

export function streakReadingFromItems(input: {
  user: User;
  pages: readonly UserPage[];
  items: readonly HistoryItem[];
  today: string;
}): StreakReading {
  return streakDetailFromItems(input).reading;
}

/** streakReadingFromItems, with the days behind it (lib/streak's StreakDetail). */
export function streakDetailFromItems(input: {
  user: User;
  pages: readonly UserPage[];
  items: readonly HistoryItem[];
  today: string;
}): StreakDetail {
  const memorized = input.pages.filter((p) => p.status === 'memorized');
  const own = new Map<string, HistoryItem>();
  const credited = new Map<string, Set<number>>();
  // The pages credited to each day by the end of its grace window (graceEndMs).
  const onTime = new Map<string, Set<number>>();
  // Catch-up pages by the day they were revised on (lib/aheadCredit catchUpIndex), and of them those
  // revised by the end of that day's grace window: a day the carried pages fill is done by them (SESS-7).
  const caughtUp = new Map<string, Set<number>>();
  const caughtUpOnTime = new Map<string, Set<number>>();
  const add = (map: Map<string, Set<number>>, day: string, pages: readonly number[]) => {
    const set = map.get(day) ?? new Set<number>();
    for (const p of pages) set.add(p);
    map.set(day, set);
  };
  for (const item of input.items) {
    const day = item.countsFor;
    if (item.day === day) own.set(day, item);
    add(credited, day, item.pages);
    if (item.occurredAt != null && item.occurredAt < graceEndMs(day, input.user)) add(onTime, day, item.pages);
    if (day < item.day) {
      add(caughtUp, item.day, item.pages);
      if (item.occurredAt != null && item.occurredAt < graceEndMs(item.day, input.user)) add(caughtUpOnTime, item.day, item.pages);
    }
  }
  const scheduled = (day: string): readonly number[] => {
    const item = own.get(day);
    if (item) return item.assigned;
    return planDuePages(input.user, day, memorized);
  };
  const done = completedDays(credited, scheduled, caughtUp);
  const early = completedDays(onTime, scheduled, caughtUpOnTime);
  return { reading: streakReading({ done, onTime: early, scheduled, credited, caughtUp, today: input.today }), done, scheduled };
}

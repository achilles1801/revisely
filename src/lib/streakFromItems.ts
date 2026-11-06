// The streak from the Activity items (C5): the Revised items of the history, not the session logs.
// Same rule as lib/streak (SESS-2, SESS-6): a day is done when every page scheduled for it is
// credited to it; a day done late does not carry a run behind a missed day. A day's scheduled
// pages are its own item's `assigned` snapshot, or the plan when it has no item of its own.

import { User, UserPage } from '../types';
import { getPagesForDay } from './algorithm';
import { ownPagesOf } from './carryOver';
import { completedDays, streakReading, type StreakReading } from './streak';

export interface HistoryItem {
  day: string;
  countsFor: string;
  pages: number[];
  assigned: number[];
  occurredAt: number | null;
}

/** The local midnight that ends `day` (the revision day's end, ignoring the Fajr boundary). */
export function dayEndMs(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d + 1).getTime();
}

export function streakReadingFromItems(input: {
  user: User;
  pages: readonly UserPage[];
  items: readonly HistoryItem[];
  today: string;
}): StreakReading {
  const memorized = input.pages.filter((p) => p.status === 'memorized');
  const own = new Map<string, HistoryItem>();
  const credited = new Map<string, Set<number>>();
  const onTime = new Map<string, Set<number>>();
  for (const item of input.items) {
    const day = item.countsFor;
    if (item.day === day) own.set(day, item);
    const set = credited.get(day) ?? new Set<number>();
    for (const p of item.pages) set.add(p);
    credited.set(day, set);
    if (item.occurredAt != null && item.occurredAt < dayEndMs(day)) {
      const early = onTime.get(day) ?? new Set<number>();
      for (const p of item.pages) early.add(p);
      onTime.set(day, early);
    }
  }
  const scheduled = (day: string): readonly number[] => {
    const item = own.get(day);
    if (item) return item.assigned;
    const [y, m, d] = day.split('-').map(Number);
    return ownPagesOf(getPagesForDay(input.user, new Date(y, m - 1, d), memorized), input.user, day);
  };
  const done = completedDays(credited, scheduled);
  const early = completedDays(onTime, scheduled);
  return streakReading({ done, onTime: early, scheduled, credited, today: input.today });
}

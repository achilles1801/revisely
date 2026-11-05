// The History/Overview calendar's labels and spans (Majd, Nov 2026): one screen with a
// Week | Month toggle. The screen's label is one constant until Majd confirms the name.

import { shiftDay } from './journal';
import { weekOf, weekStart } from './activityHeatmap';

/** The name of the calendar screen (Majd chose "Overview"). */
export const CALENDAR_SCREEN_LABEL = 'Overview';

export type CalendarSpan = 'week' | 'month';
export const CALENDAR_SPAN_KEY = 'activity.calendarSpan';

/** The last choice, or the month when there is none (or it is unreadable). */
export function parseSpan(value: string | null | undefined): CalendarSpan {
  return value === 'week' ? 'week' : 'month';
}

/** The seven days of the week that starts on `start` (a Sunday). */
export function weekDays(start: string): string[] {
  return weekOf(start);
}

export function shiftWeek(start: string, delta: number): string {
  return shiftDay(start, 7 * delta);
}

/** "Nov 1 – 7" or "Oct 26 – Nov 1" for a week. */
export function weekTitle(start: string): string {
  const days = weekDays(start);
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', opts);
  };
  const first = fmt(days[0], { month: 'short', day: 'numeric' });
  const last = days[6].slice(5, 7) === days[0].slice(5, 7)
    ? fmt(days[6], { day: 'numeric' })
    : fmt(days[6], { month: 'short', day: 'numeric' });
  return `${first} – ${last}`;
}

export { weekStart };

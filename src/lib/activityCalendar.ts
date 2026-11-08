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

/** Where the calendar stands: the month shown and the week shown (each kept while the other span shows). */
export interface CalendarPeriod {
  month: string;
  week: string;
}

/**
 * The period to show after switching to `next`, so the switch keeps you where you were: the picked day
 * when it is on screen, else today when it is, else the middle of what was shown (a week's Wednesday,
 * whose month holds most of it; a month's first day).
 */
export function periodForSpan(
  next: CalendarSpan,
  { span, month, week, picked, today }: CalendarPeriod & { span: CalendarSpan; picked: string | null; today: string },
): CalendarPeriod {
  if (next === span) return { month, week };
  const shown = span === 'week' ? weekDays(week) : null;
  const onScreen = (d: string | null): d is string => d != null && (shown ? shown.includes(d) : d.startsWith(`${month}-`));
  const anchor = onScreen(picked) ? picked : onScreen(today) ? today : shown ? shown[3] : `${month}-01`;
  return next === 'week' ? { month, week: weekStart(anchor) } : { month: anchor.slice(0, 7), week };
}

/** Whether the calendar shows today's month (or week): when it doesn't, Today brings it back. */
export function showsToday(span: CalendarSpan, { month, week }: CalendarPeriod, today: string): boolean {
  return span === 'week' ? week === weekStart(today) : month === today.slice(0, 7);
}

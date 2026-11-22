// The History/Overview calendar's labels and spans (Majd, Nov 2026): one screen with a
// Week | Month toggle. The screen's label is one constant until Majd confirms the name.

import { shiftDay } from './journal';
import { weekOf, weekStart } from './activityHeatmap';
import { formatDate, t } from '../i18n';

/** The name of the calendar screen (Majd chose "Overview"). */
export const calendarScreenLabel = () => t('lib.activity.overview');

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
    return formatDate(new Date(y, m - 1, day), opts);
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

// ── A gap on the calendar (ACT-28) ──────────────────────────────────────
//
// A gap in Insights opens Overview with the gap marked on it (Majd, Nov 16 2026: "it should take them to the
// overview tab with some 'animation' or visual que showing the user their gap on the calendar itself"). The band
// covers its days without a revision (an open gap: up to today), as the gap is counted (lib/insightsGaps).

/** The gap marked: its two ends (days), the words above the grid, and a key per opening (it draws in once). */
export interface CalendarGap {
  from: string;
  to: string;
  cue: string;
  key: number;
}

/**
 * Where the calendar opens for a gap. Month: the month holding most of its days (the earlier of equals), so as
 * much of it shows as can. Week: the week it begins in, so it reads forwards; › carries on with it. Both are set,
 * each kept while the other span shows (as periodForSpan keeps them).
 */
export function periodForGap(gap: Pick<CalendarGap, 'from' | 'to'>): CalendarPeriod {
  const counts = new Map<string, number>();
  for (let d = gap.from; d <= gap.to; d = shiftDay(d, 1)) counts.set(d.slice(0, 7), (counts.get(d.slice(0, 7)) ?? 0) + 1);
  let month = gap.from.slice(0, 7);
  for (const [m, n] of counts) if (n > (counts.get(month) ?? 0)) month = m;
  return { month, week: weekStart(gap.from) };
}

/**
 * The part of the band in one row of the grid (seven days, null for a blank cell): the first and last column it
 * covers, and whether it begins and ends there (a rounded end) or carries on past the row, the month or the week
 * (a flat end). null when the row holds none of it.
 */
export function bandInRow(
  row: readonly (string | null)[],
  gap: Pick<CalendarGap, 'from' | 'to'>,
): { first: number; last: number; starts: boolean; ends: boolean } | null {
  let first = -1;
  let last = -1;
  row.forEach((d, i) => {
    if (d == null || d < gap.from || d > gap.to) return;
    if (first < 0) first = i;
    last = i;
  });
  if (first < 0) return null;
  return { first, last, starts: row[first] === gap.from, ends: row[last] === gap.to };
}

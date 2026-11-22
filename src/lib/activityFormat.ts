// Activity's number formats (gap audit §1 H): minutes read as "8 min" and "1 h 5 min", never "8m".

import { describePageRuns, pageRuns } from './pageRanges';
import { describePassage } from './passages';
import { dayMonth, t, weekdayName } from '../i18n';

/** "p. 562", "p. 548–549": page numbers, only where the user works by page (From and To). */
export function formatPagesShort(pages: Iterable<number>): string {
  return describePageRuns(pageRuns(pages)).replace(/^Pages? /, 'p. ');
}

export function formatMinutesLong(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return t('lib.activity.minutes', { n: total });
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? t('lib.activity.hours', { h }) : t('lib.activity.hoursMinutes', { h, m });
}

/** "Wednesday 28 October": the weekday, the day, the month (the mocks' order, no comma). */
export function formatDayLong(day: string): string {
  return dayMonth(new Date(`${day}T00:00:00`), { weekday: 'long' });
}

/**
 * The day view's two-line title (gap audit §4): "Today" / "Tuesday 3 November", "Yesterday" /
 * "Monday 2 November", and before that "Wednesday" / "28 October".
 */
export function dayTitle(day: string, today: string): { title: string; subtitle: string } {
  const date = new Date(`${day}T00:00:00`);
  const now = new Date(`${today}T00:00:00`);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() && date.getMonth() === yesterday.getMonth() && date.getDate() === yesterday.getDate();
  if (day === today) return { title: t('lib.activity.today'), subtitle: formatDayLong(day) };
  if (isYesterday) return { title: t('lib.activity.yesterday'), subtitle: formatDayLong(day) };
  return { title: weekdayName(date), subtitle: dayMonth(date, { year: date.getFullYear() !== now.getFullYear() }) };
}

/**
 * The day view's footer (gap audit §4): the window the revision day covers. With the Fajr boundary it
 * names the next day for the Fajr that ends it ("Tuesday: Fajr 5:07 AM to Wednesday’s Fajr 5:08 AM"):
 * "Tuesday runs Fajr to Fajr, 5:07 AM to 5:08 AM" read as a one-minute window (Nov 2026). Otherwise
 * "Tuesday: midnight to midnight". One line at ordinary text sizes.
 */
export function windowFooter(day: string, window: { from: string; to: string } | null): string {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = (offset: number) => weekdayName(new Date(y, m - 1, d + offset));
  return window
    ? t('lib.activity.windowFajr', { day: weekday(0), from: window.from, next: weekday(1), to: window.to })
    : t('lib.activity.windowMidnight', { day: weekday(0) });
}

/**
 * Pages revised on one day that count for another (AHEAD-2, SESS-7), as a line under the Revised block,
 * named by surah (Majd, Nov 7 2026):
 *  - revised here for a later day: "Ahead for Wednesday 4 November: Al-Mulk 1–26";
 *  - revised here for an earlier day it was carried from: "Catch-up for Monday 2 November: At-Taghabun";
 *  - revised earlier for this day: "Done ahead on Monday 2 November: …";
 *  - revised later for this day: "Caught up on Wednesday 4 November: …".
 */
export function creditLine(day: string, credit: { countsFor: string; pages: number[] } | { fromDay: string; pages: number[] }): string {
  const pages = describePassage(credit.pages, { form: 'compact' });
  if ('countsFor' in credit) {
    return credit.countsFor > day
      ? t('lib.activity.aheadFor', { day: formatDayLong(credit.countsFor), pages })
      : t('lib.activity.catchUpFor', { day: formatDayLong(credit.countsFor), pages });
  }
  return credit.fromDay < day
    ? t('lib.activity.doneAheadOn', { day: formatDayLong(credit.fromDay), pages })
    : t('lib.activity.caughtUpOn', { day: formatDayLong(credit.fromDay), pages });
}

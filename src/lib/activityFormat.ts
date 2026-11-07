// Activity's number formats (gap audit §1 H): minutes read as "8 min" and "1 h 5 min", never "8m".

import { describePageRuns, pageRuns } from './pageRanges';

/** "p. 562", "p. 548–549", "p. 540–541 and 548": the mocks' short page form (d1, d5–d7). */
export function formatPagesShort(pages: Iterable<number>): string {
  return describePageRuns(pageRuns(pages)).replace(/^Pages? /, 'p. ');
}

export function formatMinutesLong(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "Wednesday 28 October": the weekday, the day, the month (the mocks' order, no comma). */
export function formatDayLong(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  return `${weekday} ${date.getDate()} ${month}`;
}

/**
 * The day view's two-line title (gap audit §4): "Today" / "Tuesday 3 November", "Yesterday" /
 * "Monday 2 November", and before that "Wednesday" / "28 October".
 */
export function dayTitle(day: string, today: string): { title: string; subtitle: string } {
  const date = new Date(`${day}T00:00:00`);
  const t = new Date(`${today}T00:00:00`);
  const yesterday = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() && date.getMonth() === yesterday.getMonth() && date.getDate() === yesterday.getDate();
  if (day === today) return { title: 'Today', subtitle: formatDayLong(day) };
  if (isYesterday) return { title: 'Yesterday', subtitle: formatDayLong(day) };
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  const year = date.getFullYear() !== t.getFullYear() ? ` ${date.getFullYear()}` : '';
  return { title: date.toLocaleDateString('en-US', { weekday: 'long' }), subtitle: `${date.getDate()} ${month}${year}` };
}

/**
 * The day view's footer (gap audit §4): which window the day covers, "runs" while it is today or
 * ahead, "ran" once it is over. "Tuesday runs Fajr to Fajr, 5:22 AM to 5:23 AM", "Sunday ran
 * midnight to midnight".
 */
export function windowFooter(day: string, today: string, window: { from: string; to: string } | null): string {
  const weekday = new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
  const verb = day < today ? 'ran' : 'runs';
  return window ? `${weekday} ${verb} Fajr to Fajr, ${window.from} to ${window.to}` : `${weekday} ${verb} midnight to midnight`;
}

/**
 * Pages revised on one day that count for another (AHEAD-2, SESS-7), as a line under the Revised block:
 *  - revised here for a later day: "Ahead for Wednesday 4 November: p. 562–563";
 *  - revised here for an earlier day it was carried from: "Catch-up for Monday 2 November: p. 556–557";
 *  - revised earlier for this day: "Done ahead on Monday 2 November: p. 540–541";
 *  - revised later for this day: "Caught up on Wednesday 4 November: p. 556–557".
 */
export function creditLine(day: string, credit: { countsFor: string; pages: number[] } | { fromDay: string; pages: number[] }): string {
  const pages = formatPagesShort(credit.pages);
  if ('countsFor' in credit) {
    return credit.countsFor > day
      ? `Ahead for ${formatDayLong(credit.countsFor)}: ${pages}`
      : `Catch-up for ${formatDayLong(credit.countsFor)}: ${pages}`;
  }
  return credit.fromDay < day
    ? `Done ahead on ${formatDayLong(credit.fromDay)}: ${pages}`
    : `Caught up on ${formatDayLong(credit.fromDay)}: ${pages}`;
}

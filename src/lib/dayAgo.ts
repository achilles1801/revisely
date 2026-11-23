// How long ago a revision day was, the way a feed says it: "Today",
// "Yesterday", "3d", "2w", then the date ("Sep 14", or "Sep 14, 2025" in an
// earlier year). Days are local 'YYYY-MM-DD' strings (revision days).

import { formatDate, t, weekdayName } from '../i18n';

function localDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function dayAgo(day: string, today: string): string {
  const then = localDay(day);
  const now = localDay(today);
  const days = Math.round((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return t('lib.dayAgo.today');
  if (days === 1) return t('lib.dayAgo.yesterday');
  if (days < 7) return t('lib.dayAgo.days', { n: days });
  if (days < 35) return t('lib.dayAgo.weeks', { n: Math.floor(days / 7) });
  const sameYear = then.getFullYear() === now.getFullYear();
  return formatDate(then, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** "Saturday" for a revision day. */
export function weekday(day: string): string {
  return weekdayName(localDay(day));
}

/** The day of the month, for a mark: "24". */
export function dayOfMonth(day: string): string {
  return String(localDay(day).getDate());
}

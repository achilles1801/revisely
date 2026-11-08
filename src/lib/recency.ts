// When a part of the Qur'an was last revised, and how often: what the app shows in place of
// strength when Smart Tracking is off (Majd, Nov 8 2026: strength means nothing without ratings).
// One wording everywhere: Revo’s charts and Activity use these.
//
//   recencyLine(4, 3)        "Last revised 4 days ago · 3 times in 30 days"
//   recencyLine(0, 1)        "Last revised today · once in 30 days"
//   recencyLine(41, 0)       "Last revised 41 days ago · not in the last 30 days"
//   recencyLine(null, 0)     "Never revised"

/** "once", "twice", "3 times". */
export const timesWord = (n: number): string => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/** "Last revised today", "Last revised yesterday", "Last revised 4 days ago", "Never revised". */
export function lastRevisedWords(daysAgo: number | null): string {
  if (daysAgo == null) return 'Never revised';
  if (daysAgo <= 0) return 'Last revised today';
  if (daysAgo === 1) return 'Last revised yesterday';
  return `Last revised ${daysAgo} days ago`;
}

/**
 * When it was last revised, then how many times in the last `windowDays`. `daysAgo` is whole days
 * since the last revision (daysSince), null when never revised; `timesInWindow` is how often it
 * was revised in the window (a page: its revisions; a juz or surah: in full, every page).
 */
export function recencyLine(daysAgo: number | null, timesInWindow: number, windowDays = 30): string {
  if (daysAgo == null) return lastRevisedWords(null);
  const often = timesInWindow > 0 ? `${timesWord(timesInWindow)} in ${windowDays} days` : `not in the last ${windowDays} days`;
  return `${lastRevisedWords(daysAgo)} · ${often}`;
}

const DAY_MS = 86_400_000;

/**
 * Whole days from `day` to `today`. Either may be a timestamp ("2026-11-02T09:00:00.000Z", as a
 * page's lastRevisedDate is in the app): its first ten characters are the day, as AppContext reads it.
 */
export function daysSince(day: string, today: string): number {
  const n = (d: string) => Math.round(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) / DAY_MS);
  return n(today) - n(day);
}

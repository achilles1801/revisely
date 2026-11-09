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

// ── Coverage ─────────────────────────────────────────────────────────────

/**
 * A memorized page in Coverage (ACT-4, ACT-25): revised this week (under 7 days), this month (under
 * 30), not revised yet (never, but memorized or on record under 30 days ago), or 30+ days (revised 30
 * or more days ago, or never in the 30 or more days since it was memorized or on record).
 */
export type CoverageRecency = 'week' | 'month' | 'new' | 'stale';

/** Days without a revision before a memorized page counts as left too long. */
export const COVERAGE_STALE_DAYS = 30;

/**
 * The day a never-revised memorized page counts from: when it was memorized, or the account's first
 * day when that is later (nothing before it is on record). Null when neither is known.
 */
export function coverageSince(dateMemorized: string | null | undefined, firstDay: string | null | undefined): string | null {
  const memorized = dateMemorized ? dateMemorized.slice(0, 10) : null;
  const first = firstDay ? firstDay.slice(0, 10) : null;
  if (memorized && first) return memorized > first ? memorized : first;
  return memorized ?? first;
}

/** Where a memorized page stands (CoverageRecency); with no `since`, a page never revised is 30+ days. */
export function coverageRecency(lastDay: string | null | undefined, since: string | null | undefined, today: string): CoverageRecency {
  if (lastDay) {
    const ago = daysSince(lastDay, today);
    return ago < 7 ? 'week' : ago < COVERAGE_STALE_DAYS ? 'month' : 'stale';
  }
  return since != null && daysSince(since, today) < COVERAGE_STALE_DAYS ? 'new' : 'stale';
}

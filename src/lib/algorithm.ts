import { User, UserPage, QuranPage, DailyAssignment, RevisionLog } from '../types';
import { getRevisionDayForUser } from './fajrBoundary';

const DEFAULT_WEAKNESS_RATING = 4;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Re-derive per-page revision state from the canonical list of session logs.
 *
 * The fields that depend on session history (`lastRevisedDate`,
 * `totalRevisionCount`, `skipCount`, `weaknessRating`) are recomputed from
 * scratch. User-controlled fields (`status`, `dateMemorized`, `pageNumber`)
 * are preserved.
 *
 * Use this whenever logs change (add / edit / delete) so insights and the
 * scheduling algorithm stay consistent with what the user has actually logged.
 */
export function recomputePagesFromLogs(
  pages: UserPage[],
  logs: RevisionLog[],
): UserPage[] {
  // Sort chronologically so the *last* matching log wins for rating / date.
  const sortedLogs = [...logs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  return pages.map((page) => {
    let lastRevisedDate: string | null = null;
    let totalRevisionCount = 0;
    let weaknessRating = DEFAULT_WEAKNESS_RATING;

    for (const log of sortedLogs) {
      if (log.pagesRevised.includes(page.pageNumber)) {
        totalRevisionCount++;
        lastRevisedDate = log.date;
      }
      const wu = log.weaknessUpdates.find((w) => w.page === page.pageNumber);
      if (wu) weaknessRating = wu.rating;
    }

    // skipCount = consecutive skips since the most recent revision.
    let skipCount = 0;
    for (const log of sortedLogs) {
      if (lastRevisedDate && log.date <= lastRevisedDate) continue;
      if (log.pagesSkipped.includes(page.pageNumber)) skipCount++;
    }

    return {
      ...page,
      lastRevisedDate,
      totalRevisionCount,
      skipCount,
      weaknessRating,
    };
  });
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateToISODay(date: Date): string {
  const d = startOfDay(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Single source of truth for "what day are we in for revision purposes."
// When the user has opted into the fajr boundary, the day rolls over at
// fajr instead of midnight; otherwise it's the local calendar date. Pass
// the user to opt in; passing null/undefined falls back to local midnight.
export function getCurrentRevisionDay(user?: User | null): string {
  return getRevisionDayForUser(user ?? null);
}

// YYYY-MM-DD → local midnight Date. Without this, `new Date('2026-01-01')`
// parses as UTC midnight which can shift the day backward in negative
// timezones — silently breaking schedule lookups.
function parseLocalDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * Resolve the plan for a given date.
 *
 * If the user has a custom plan (from the editor), that wins — each day
 * maps to a slot in `customPlan.days`, looping after the cycle ends.
 *
 * Otherwise: sliding window. Every day shows exactly `dailyPageCapacity`
 * pages (or the whole memorized set if it's smaller). The cursor
 * advances by `dailyPageCapacity` pages each calendar day, wrapping back
 * to the start when it reaches the end of the memorized set. Returned
 * pages stay in slice order — on a wrap day, that means tail-of-cycle
 * pages come first, then start-of-cycle pages, reflecting "finishing the
 * old cycle and starting the new one mid-day."
 */
export function getPagesScheduledForDate(
  user: User,
  date: Date,
  memorizedPages: UserPage[],
): number[] {
  if (memorizedPages.length === 0) return [];

  // Custom plan takes precedence when present.
  if (user.customPlan && user.customPlan.days.length > 0) {
    const cycleStart = parseLocalDateString(user.customPlan.cycleStartDate);
    const target = startOfDay(date);
    const daysSinceStart = Math.floor(
      (target.getTime() - cycleStart.getTime()) / MS_PER_DAY,
    );
    if (daysSinceStart < 0) return [];
    const idx =
      ((daysSinceStart % user.customPlan.days.length) +
        user.customPlan.days.length) %
      user.customPlan.days.length;
    return [...user.customPlan.days[idx]];
  }

  const sortedPageNumbers = [...memorizedPages]
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((p) => p.pageNumber);

  const total = sortedPageNumbers.length;
  const perDay = Math.min(user.dailyPageCapacity, total);
  if (perDay <= 0) return [];

  const start = startOfDay(new Date(user.scheduleAnchorDate || user.createdAt));
  const target = startOfDay(date);
  const daysSinceStart = Math.floor((target.getTime() - start.getTime()) / MS_PER_DAY);
  if (daysSinceStart < 0) return [];

  const cycleOffset = ((daysSinceStart * perDay) % total + total) % total;
  const result: number[] = [];
  for (let i = 0; i < perDay; i++) {
    result.push(sortedPageNumbers[(cycleOffset + i) % total]);
  }
  return result;
}

/**
 * Build the default sequential plan as the editor sees it: one full pass
 * (`ceil(total / perDay)` days) through the memorized set with the
 * sliding window, **rotated so today's day is at index 0**. Each day is
 * exactly `perDay` pages; the last day of the cycle wraps from the tail
 * back to the start of the memorized set.
 */
export function buildDefaultPlanDays(
  user: User,
  memorizedPages: UserPage[],
  direction: 'forward' | 'reverse' = 'forward',
  today: Date = new Date(),
): number[][] {
  if (memorizedPages.length === 0) return [];

  const sortedNumbers = [...memorizedPages]
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((p) => p.pageNumber);
  const ordered = direction === 'reverse' ? sortedNumbers.reverse() : sortedNumbers;

  const total = ordered.length;
  const perDay = Math.min(user.dailyPageCapacity, total);
  if (perDay <= 0) return [];

  const cycleLength = Math.ceil(total / perDay);

  // Today's offset matches the live scheduler exactly.
  const start = startOfDay(new Date(user.scheduleAnchorDate || user.createdAt));
  const todayStart = startOfDay(today);
  const daysSinceStart = Math.max(
    0,
    Math.floor((todayStart.getTime() - start.getTime()) / MS_PER_DAY),
  );
  const startOffset = ((daysSinceStart * perDay) % total + total) % total;

  const days: number[][] = [];
  for (let d = 0; d < cycleLength; d++) {
    const dayStart = (startOffset + d * perDay) % total;
    const slice: number[] = [];
    for (let i = 0; i < perDay; i++) {
      slice.push(ordered[(dayStart + i) % total]);
    }
    days.push(slice);
  }
  return days;
}

/**
 * Count how many times this page was scheduled and not revised since the
 * page's last successful revision (or since the user signed up, whichever
 * is more recent). This is the page's "consistency debt" — the core signal
 * the smart-tracking algorithm uses to decide what needs attention.
 *
 * A scheduled revision is "completed" if a session log for that day
 * includes the page in `pagesRevised`. Anything else (skipped or absent
 * session) counts as a missed scheduled revision.
 */
export function getMissedScheduledRevisions(
  page: UserPage,
  user: User,
  memorizedPages: UserPage[],
  sessions: RevisionLog[],
  today: Date = new Date(),
): number {
  if (page.status !== 'memorized') return 0;
  if (memorizedPages.length === 0) return 0;

  const userStart = startOfDay(new Date(user.createdAt));
  const lastRevised = page.lastRevisedDate
    ? startOfDay(new Date(page.lastRevisedDate))
    : userStart;
  // Begin counting from the day after the most recent successful revision.
  const cursor = new Date(Math.max(lastRevised.getTime(), userStart.getTime()));
  cursor.setDate(cursor.getDate() + 1);

  const todayStart = startOfDay(today);
  if (cursor.getTime() > todayStart.getTime()) return 0;

  // Index sessions by date for O(1) lookup.
  const sessionByDate = new Map<string, RevisionLog>();
  for (const s of sessions) sessionByDate.set(s.date, s);

  let missed = 0;
  while (cursor.getTime() <= todayStart.getTime()) {
    const scheduled = getPagesScheduledForDate(user, cursor, memorizedPages);
    if (scheduled.includes(page.pageNumber)) {
      const session = sessionByDate.get(dateToISODay(cursor));
      const wasRevised = !!session && session.pagesRevised.includes(page.pageNumber);
      if (!wasRevised) missed++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return missed;
}

/**
 * Urgency = consistency debt × strength multiplier, with a recency bonus
 * for newly memorized pages so they bubble up even when on schedule.
 *
 * Returns 0 for non-memorized pages. The score has no natural upper bound;
 * call sites should use relative ordering, not absolute thresholds.
 */
export function calculatePageUrgency(
  page: UserPage,
  user: User,
  memorizedPages: UserPage[],
  sessions: RevisionLog[],
  today: Date = new Date(),
): number {
  if (page.status !== 'memorized') return 0;

  const missed = getMissedScheduledRevisions(page, user, memorizedPages, sessions, today);

  // Strength multiplier: rating 4 (default / unrated) is neutral (1.0).
  // Lower ratings amplify urgency, higher ratings dampen it.
  //   rating 1 → 1.6   rating 2 → 1.4   rating 3 → 1.2
  //   rating 4 → 1.0   rating 5 → 0.8
  const strengthMultiplier = 1 + (4 - page.weaknessRating) * 0.2;

  // Recency bonus: newly memorized pages need extra attention for ~30 days
  // regardless of consistency, decaying linearly to zero.
  let recencyBonus = 0;
  if (page.dateMemorized) {
    const daysSinceMemorized = Math.floor(
      (today.getTime() - new Date(page.dateMemorized).getTime()) / MS_PER_DAY,
    );
    if (daysSinceMemorized >= 0 && daysSinceMemorized < 30) {
      recencyBonus = (30 - daysSinceMemorized) / 30;
    }
  }

  return (missed + recencyBonus) * strengthMultiplier;
}

/**
 * Today's revision assignment. Driven directly by the schedule — the
 * algorithm picks no pages of its own. Smart Tracking influences only
 * the insights/ranking layer, not what's due to revise today.
 */
export function generateDailyAssignment(
  pages: UserPage[],
  quranData: QuranPage[],
  user: User,
  today: Date = new Date(),
): DailyAssignment {
  const memorized = pages.filter((p) => p.status === 'memorized');
  // Slice order preserved on purpose — on wrap days the user sees the
  // tail of the previous cycle before the start of the new one, which
  // matches the scheduler's "you crossed the cycle boundary today" model.
  const selectedPages = getPagesScheduledForDate(user, today, memorized);

  // juzBreakdown collapses by juz (insertion order) for display.
  const juzMap = new Map<number, number[]>();
  for (const pageNum of selectedPages) {
    const quranPage = quranData.find((q) => q.pageNumber === pageNum);
    if (quranPage) {
      const existing = juzMap.get(quranPage.juzNumber) || [];
      existing.push(pageNum);
      juzMap.set(quranPage.juzNumber, existing);
    }
  }

  const juzBreakdown = Array.from(juzMap.entries()).map(([juz, ps]) => ({
    juz,
    pages: ps,
  }));

  return {
    date: dateToISODay(today),
    pages: selectedPages,
    juzBreakdown,
    totalPages: selectedPages.length,
  };
}

/** Minimum completed sessions before the Insights tab populates with data. */
export const INSIGHTS_MIN_SESSIONS = 5;

/**
 * Count sessions where the user actually revised at least one page. Used to
 * gate the Insights tab — below this floor the consistency signal is too
 * sparse to be meaningful.
 */
export function countCompletedSessions(sessions: RevisionLog[]): number {
  return sessions.filter((s) => s.pagesRevised.length > 0).length;
}

// What Revo is told about the user, built on the phone from the account's own data: the
// totals behind Insights and today's blocks, as numbers and page numbers. Notes, recordings
// and names are never in it; they go only as an attachment the user picks (attachments.ts).

import type { RevisionLog, User, UserPage } from '../../types';
import { consistency, coverage, lastRevisedByPage, type Revised } from '../activityInsights';
import { doneOnDay } from '../aheadCredit';
import { shiftDay } from '../journal';
import { streakReadingFromLogs } from '../streak';
import type { RevoContext, RevoTotals } from './types';

const MAX_PAGES = 20;
const MAX_WEAK = 30;

/** Revision logs as Activity's Revised items (by the day they count for). */
export function revisedItems(logs: readonly RevisionLog[]): Revised[] {
  return logs
    .filter((l) => l.pagesRevised.length > 0)
    .map((l) => ({ day: l.date, pages: l.pagesRevised, minutes: l.durationMinutes, countsFor: l.date }));
}

/** The pages revised on `day` (any session that day). */
function pagesOn(logs: readonly RevisionLog[], day: string): number {
  return logs.filter((l) => l.date === day).reduce((n, l) => n + l.pagesRevised.length, 0);
}

const isWeak = (p: UserPage) => p.weaknessRating <= 2;

export function revoTotals(input: { user: User | null; pages: readonly UserPage[]; logs: readonly RevisionLog[]; today: string }): RevoTotals {
  const { user, pages, logs, today } = input;
  const memorizedPages = pages.filter((p) => p.status === 'memorized');
  const memorized = new Set(memorizedPages.map((p) => p.pageNumber));
  const revised = revisedItems(logs);
  const last = lastRevisedByPage(revised, today);
  const from7 = shiftDay(today, -6);
  const from30 = shiftDay(today, -29);
  const within = (from: string) => revised.filter((r) => r.day >= from && r.day <= today);
  const r7 = within(from7);
  const r30 = within(from30);
  const weak = new Set(memorizedPages.filter(isWeak).map((p) => p.pageNumber));
  const streakDays = user ? streakReadingFromLogs({ user, pages, logs, today }).streak : 0;
  return {
    memorizedPages: memorized.size,
    revisedWithin7Days: Math.round(coverage(memorized, last, today, 7) * memorized.size),
    revisedWithin30Days: Math.round(coverage(memorized, last, today, 30) * memorized.size),
    daysWithSession30: consistency(revised, today, 30).days,
    streakDays,
    sessions30: r30.length,
    weakPages: weak.size,
    moderatePages: memorizedPages.filter((p) => p.weaknessRating === 3).length,
    strongPages: memorizedPages.filter((p) => p.weaknessRating >= 4).length,
    weakRevisedLast7Days: r7.reduce((n, r) => n + r.pages.filter((p) => weak.has(p)).length, 0),
    pagesPerDay7: Math.round((r7.reduce((n, r) => n + r.pages.length, 0) / 7) * 10) / 10,
    pagesPerDay30: Math.round((r30.reduce((n, r) => n + r.pages.length, 0) / 30) * 10) / 10,
    plannedPerDay: user?.dailyPageCapacity ?? 0,
  };
}

export function buildRevoContext(input: {
  user: User | null;
  pages: readonly UserPage[];
  logs: readonly RevisionLog[];
  /** The revision day, YYYY-MM-DD. */
  today: string;
  /** Today's own pages, in order (Home's assignment). */
  assignment: readonly number[];
  now?: Date;
}): RevoContext {
  const { pages, logs, today, assignment } = input;
  const byNumber = new Map(pages.map((p) => [p.pageNumber, p]));
  const done = doneOnDay(logs, today);
  const next = assignment.filter((p) => !done.has(p));
  const revisedToday = assignment.length - next.length;
  const minutes = logs.filter((l) => l.date === today).reduce((n, l) => n + (l.durationMinutes ?? 0), 0);
  const memorizedToday = pages.filter((p) => p.dateMemorized != null && p.dateMemorized.slice(0, 10) === today).length;
  const last = lastRevisedByPage(revisedItems(logs), today);
  const weakPages = pages
    .filter((p) => p.status === 'memorized' && isWeak(p))
    .sort((a, b) => (last.get(a.pageNumber) ?? '').localeCompare(last.get(b.pageNumber) ?? '') || a.pageNumber - b.pageNumber)
    .map((p) => p.pageNumber)
    .slice(0, MAX_WEAK);
  const now = input.now ?? new Date();
  return {
    totals: revoTotals(input),
    today: {
      plannedPages: assignment.length,
      revisedPages: revisedToday,
      minutes,
      memorizedPages: memorizedToday,
      nextPages: next.slice(0, MAX_PAGES),
      weakNext: next.filter((p) => {
        const page = byNumber.get(p);
        return page != null && isWeak(page);
      }).slice(0, MAX_PAGES),
      done: assignment.length > 0 && next.length === 0,
    },
    weakPages,
    week: Array.from({ length: 7 }, (_, i) => {
      const day = shiftDay(today, i - 6);
      return { day, pages: pagesOn(logs, day) };
    }),
    localTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  };
}

/** Whether the day had anything to review (Day in review is skipped otherwise). */
export function dayHadActivity(ctx: RevoContext): boolean {
  return ctx.today.revisedPages > 0 || ctx.today.memorizedPages > 0 || ctx.today.minutes > 0;
}

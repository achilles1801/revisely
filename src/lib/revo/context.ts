// What Revo is told about the user, built on the phone from the account's own data: the
// totals behind Insights and today's blocks, as numbers and page numbers. Notes, recordings
// and names are never in it; they go only as an attachment the user picks (attachments.ts).

import type { RevisionLog, User, UserPage } from '../../types';
import { consistency, coverage, lastRevisedByPage, type Revised } from '../activityInsights';
import { reviewedOn } from '../aheadCredit';
import { revisionDayOf } from '../fajrBoundary';
import { shiftDay } from '../journal';
import type { HistoryItem } from '../streakFromItems';
import type { TodaySnapshot } from '../todaySnapshot';
import { daySignals, revoPatterns, sessionStarts } from './patterns';
import type { RevoContext, RevoTotals } from './types';
import { contextWords, memorizedWords } from './words';
import { isRevisable, memorizedAyahs, memorizedPageShare, partlyMemorizedAyahs, revisablePages } from '../memorizedAyahs';

const MAX_PAGES = 20;
const MAX_WEAK = 30;

/** Every page a session revised: its own, ahead for later days, and catch-up pages (kept in `ahead`, SESS-7). */
function sessionRevised(l: RevisionLog): number[] {
  return [...new Set([...l.pagesRevised, ...Object.values(l.ahead ?? {}).flat()])];
}

/** Revision logs as Activity's Revised items, by the day they were revised. */
export function revisedItems(logs: readonly RevisionLog[]): Revised[] {
  return logs
    .map((l) => ({ day: l.date, pages: sessionRevised(l), minutes: l.durationMinutes, countsFor: l.date }))
    .filter((r) => r.pages.length > 0);
}

/** The pages revised on `day`, in its sessions (each page once): what Revo's week and charts count. */
export function pagesRevisedOn(logs: readonly RevisionLog[], day: string): number {
  return reviewedOn(logs, day).size;
}

const isWeak = (p: UserPage) => p.weaknessRating <= 2;

export function revoTotals(input: { pages: readonly UserPage[]; logs: readonly RevisionLog[]; today: string; streakDays: number; plannedPerDay: number }): RevoTotals {
  const { pages, logs, today } = input;
  // Memorized and partly memorized pages: both are revised (MEM-4).
  const memorizedPages = revisablePages(pages);
  const memorized = new Set(memorizedPages.map((p) => p.pageNumber));
  const revised = revisedItems(logs);
  const last = lastRevisedByPage(revised, today);
  const from7 = shiftDay(today, -6);
  const from30 = shiftDay(today, -29);
  const within = (from: string) => revised.filter((r) => r.day >= from && r.day <= today);
  const r7 = within(from7);
  const r30 = within(from30);
  const weak = new Set(memorizedPages.filter(isWeak).map((p) => p.pageNumber));
  return {
    // A partly memorized page counts by its share (MEM-2): "305.6 pages memorized".
    memorizedPages: Math.round(memorizedPageShare(pages) * 10) / 10,
    revisedWithin7Days: Math.round(coverage(memorized, last, today, 7) * memorized.size),
    revisedWithin30Days: Math.round(coverage(memorized, last, today, 30) * memorized.size),
    daysWithSession30: consistency(revised, today, 30).days,
    streakDays: input.streakDays,
    sessions30: r30.length,
    weakPages: weak.size,
    moderatePages: memorizedPages.filter((p) => p.weaknessRating === 3).length,
    strongPages: memorizedPages.filter((p) => p.weaknessRating >= 4).length,
    weakRevisedLast7Days: r7.reduce((n, r) => n + r.pages.filter((p) => weak.has(p)).length, 0),
    pagesPerDay7: Math.round((r7.reduce((n, r) => n + r.pages.length, 0) / 7) * 10) / 10,
    pagesPerDay30: Math.round((r30.reduce((n, r) => n + r.pages.length, 0) / 30) * 10) / 10,
    plannedPerDay: input.plannedPerDay,
  };
}

export function buildRevoContext(input: {
  user: User;
  pages: readonly UserPage[];
  logs: readonly RevisionLog[];
  /** Today as Home shows it (lib/todaySnapshot): today, the week and the streak come from it. */
  snapshot: TodaySnapshot;
  /** The Activity items Home's streak read: when each day's revision started (REVO-40). Null until loaded. */
  history?: readonly HistoryItem[] | null;
  /**
   * Send the patterns and each day's facts (REVO-40): only once config/app.revoPatterns says the server
   * takes them (lib/revo/release revoPatternsOn); otherwise the context is as before, which every server takes.
   */
  patterns?: boolean;
  now?: Date;
}): RevoContext {
  const { user, pages, logs, snapshot } = input;
  const today = snapshot.day;
  const byNumber = new Map(pages.map((p) => [p.pageNumber, p]));
  const list = new Set(snapshot.pages);
  const next = snapshot.pages.filter((p) => !snapshot.done.has(p));
  const revisedHere = reviewedOn(logs, today);
  const minutes = logs.filter((l) => l.date === today).reduce((n, l) => n + (l.durationMinutes ?? 0), 0);
  // The revision day each page was marked on (DAY-2), not the UTC date of the timestamp.
  const memorizedTodayPages = pages.filter(
    (p) => isRevisable(p) && p.dateMemorized != null && revisionDayOf(new Date(p.dateMemorized), user) === today,
  );
  const memorizedToday = memorizedTodayPages.length;
  // What was added, by surah and ayah (MEM-1): "Al-Mulk, ayahs 1–20".
  const memorizedTodayWords = memorizedToday > 0 ? memorizedWords(memorizedAyahs(memorizedTodayPages)) : null;
  const last = lastRevisedByPage(revisedItems(logs), today);
  const weakPages = pages
    .filter((p) => isRevisable(p) && isWeak(p))
    .sort((a, b) => (last.get(a.pageNumber) ?? '').localeCompare(last.get(b.pageNumber) ?? '') || a.pageNumber - b.pageNumber)
    .map((p) => p.pageNumber)
    .slice(0, MAX_WEAK);
  const { reading, done: doneDays, scheduled } = snapshot.streak;
  const now = input.now ?? new Date();
  const nextPages = next.slice(0, MAX_PAGES);
  const weakNext = next
    .filter((p) => {
      const page = byNumber.get(p);
      return page != null && isWeak(page);
    })
    .slice(0, MAX_PAGES);
  const starts = sessionStarts(input.history);
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(today, i - 6);
    // Today as Home says it; earlier days as the streak counts them.
    const base =
      day === today
        ? { day, pages: revisedHere.size, planned: snapshot.own.length, done: snapshot.status === 'completed' }
        : { day, pages: pagesRevisedOn(logs, day), planned: scheduled(day).length, done: doneDays.has(day) };
    return { ...base, ...daySignals(logs, day, starts) };
  });
  // REVO-40: what was caught up, revised ahead and when, read into at most a few patterns.
  const patterns = revoPatterns({ today, week, starts, streakDays: reading.streak, keepDailyAmount: user.carryOverMode !== 'add' });
  // Surah and juz first (lib/passages): the model names parts of the Qur'an with these words.
  const words = contextWords({ today: snapshot.pages, next: nextPages, weakNext, weak: weakPages }, partlyMemorizedAyahs(pages));
  return {
    totals: revoTotals({ pages, logs, today, streakDays: reading.streak, plannedPerDay: user.dailyPageCapacity ?? 0 }),
    today: {
      plannedPages: snapshot.pages.length,
      revisedPages: snapshot.pagesDone,
      carriedPages: snapshot.carried.length,
      doneEarlier: snapshot.pages.filter((p) => snapshot.done.has(p) && !revisedHere.has(p)).length,
      otherPages: [...revisedHere].filter((p) => !list.has(p)).length,
      minutes,
      memorizedPages: memorizedToday,
      nextPages,
      weakNext,
      done: snapshot.status === 'completed',
    },
    weakPages,
    ...(input.patterns
      ? { week: week.map(({ caughtUpFor: _caught, aheadFor: _ahead, ...w }) => w), patterns }
      : { week: week.map(({ day, pages, planned, done }) => ({ day, pages, planned, done })) }),
    streak: {
      days: reading.streak,
      atRisk: reading.grace
        ? { previous: reading.grace.previous, yesterdayPlanned: reading.grace.progress.scheduled, yesterdayDone: reading.grace.progress.credited }
        : null,
    },
    passages: memorizedTodayWords ? { ...words.passages, memorizedToday: memorizedTodayWords } : words.passages,
    pageNames: words.pageNames,
    localTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  };
}

/** Whether the day had anything to review (Day in review is skipped otherwise). */
export function dayHadActivity(ctx: RevoContext): boolean {
  return ctx.today.revisedPages > 0 || ctx.today.memorizedPages > 0 || ctx.today.minutes > 0;
}

// A schedule Revo drafts (REVO-43, Revisely Dev; Majd, Nov 25 2026, of the orchestrator's description: "all ur picks for
// ... #2 are fine"). Revo never changes the schedule: its card shows what would change, and its button opens Edit
// schedule filled in with these days, not saved. Only Save keeps them. The days are built as "Create new plan" builds
// them (Balanced or By Juz), from where today starts, with a rest day after every so many days if asked.

import { buildBalancedPlanFromStart, buildJuzPlanFromStart, defaultStartPage, planStats, type PlanDirection } from '../planBuilder';
import { liveScheduleDays, scheduleAmount } from '../scheduleSummary';
import { t } from '../../i18n';
import type { User, UserPage } from '../../types';

/** What Revo's draftSchedule action asks for (functions/src/revo/reply.ts checks the same ranges). */
export interface ScheduleDraft {
  mode: 'pages' | 'juz';
  /** Pages a day (1–40) or juz a day (1–3). */
  perDay: number;
  /** A rest day after every `restEvery - 1` revision days (2–14); none when absent. */
  restEvery?: number;
  reverse?: boolean;
}

const whole = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Whether a draft is one this app can build. */
export function validDraft(d: Partial<ScheduleDraft> | null | undefined): d is ScheduleDraft {
  if (!d || (d.mode !== 'pages' && d.mode !== 'juz')) return false;
  if (!whole(d.perDay, 1, d.mode === 'pages' ? 40 : 3)) return false;
  if (d.restEvery != null && !whole(d.restEvery, 2, 14)) return false;
  return d.reverse == null || typeof d.reverse === 'boolean';
}

/** A rest day after every `every - 1` revision days. */
export function withRestDays(days: number[][], every: number): number[][] {
  const out: number[][] = [];
  days.forEach((day, i) => {
    out.push(day);
    if ((i + 1) % (every - 1) === 0) out.push([]);
  });
  // A cycle shorter than one stretch still rests once a round.
  if (!out.some((d) => d.length === 0) && out.length > 0) out.push([]);
  return out;
}

/** The draft's days, starting where today starts, as Edit schedule shows them (index 0 is today). */
export function draftScheduleDays(
  user: User,
  memorizedPages: UserPage[],
  revisionDate: Date,
  d: ScheduleDraft,
): { days: number[][]; direction: PlanDirection } {
  const numbers = memorizedPages.map((p) => p.pageNumber).sort((a, b) => a - b);
  const start = defaultStartPage(liveScheduleDays(user, memorizedPages, revisionDate).days, numbers);
  const direction: PlanDirection = d.reverse ? 'reverse' : 'forward';
  let days =
    d.mode === 'juz'
      ? buildJuzPlanFromStart(memorizedPages, { juzPerDay: d.perDay, startPage: start, direction })
      : buildBalancedPlanFromStart(numbers, { pagesPerDay: d.perDay, startPage: start, direction });
  if (d.restEvery != null && days.length > 0) days = withRestDays(days, d.restEvery);
  return { days, direction };
}

/** One row of the card: what it is now, and with the draft. */
export interface DraftRow {
  label: string;
  now: string;
  draft: string;
}

const restWords = (n: number) => (n === 0 ? t('revo.card.restNone') : t('revo.card.restCount', { count: n }));

/** The card's rows: how much a day, how often each page comes round, and rest days. */
export function draftRows(user: User, memorizedPages: UserPage[], revisionDate: Date, d: ScheduleDraft): DraftRow[] {
  const now = liveScheduleDays(user, memorizedPages, revisionDate).days;
  const next = draftScheduleDays(user, memorizedPages, revisionDate, d).days;
  if (now.length === 0 || next.length === 0) return [];
  // A juz draft is days of whole juz: say so, as Edit schedule says an automatic juz schedule.
  const nextAmount = d.mode === 'juz' ? t('common.juzCount', { count: d.perDay }) : scheduleAmount({ ...user, customPlan: null, scheduleMode: 'pages' }, next);
  return [
    { label: t('revo.card.aDay'), now: scheduleAmount(user, now), draft: nextAmount },
    { label: t('revo.card.aRound'), now: t('revo.card.everyDays', { count: now.length }), draft: t('revo.card.everyDays', { count: next.length }) },
    { label: t('revo.card.rest'), now: restWords(planStats(now).restDays), draft: restWords(planStats(next).restDays) },
  ];
}

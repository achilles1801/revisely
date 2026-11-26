// A schedule Revo drafts (REVO-43, Revisely Dev; Majd, Nov 25 2026, of the orchestrator's description: "all ur picks for
// ... #2 are fine"). Revo never changes the schedule: its card shows what would change, and its button opens Edit
// schedule filled in with these days, not saved. Only Save keeps them. The days are built as "Create new plan" builds
// them (Balanced or By Juz), from where today starts. Rest days are weekdays (the board: "6 pages a day with Fridays
// off"): the round is then whole weeks counted from today, the day it's saved, so they stay on those weekdays.

import { buildBalancedPlanFromStart, buildJuzPlanFromStart, defaultStartPage, planStats, type PlanDirection } from '../planBuilder';
import { liveScheduleDays, scheduleAmount } from '../scheduleSummary';
import { t, weekdayName } from '../../i18n';
import type { User, UserPage } from '../../types';

/** What Revo's draftSchedule action asks for (functions/src/revo/reply.ts checks the same ranges). */
export interface ScheduleDraft {
  mode: 'pages' | 'juz';
  /** Pages a day (1–40) or juz a day (1–3). */
  perDay: number;
  /** Weekdays with nothing to revise (0 Sunday … 6 Saturday, 1–3 of them; pages a day only); none when absent. */
  restDays?: number[];
  reverse?: boolean;
}

const whole = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Whether a draft is one this app can build. */
export function validDraft(d: Partial<ScheduleDraft> | null | undefined): d is ScheduleDraft {
  if (!d || (d.mode !== 'pages' && d.mode !== 'juz')) return false;
  if (!whole(d.perDay, 1, d.mode === 'pages' ? 40 : 3)) return false;
  if (d.restDays != null) {
    const r = d.restDays;
    if (d.mode !== 'pages' || !Array.isArray(r) || r.length < 1 || r.length > 3 || new Set(r).size !== r.length) return false;
    if (!r.every((w) => whole(w, 0, 6))) return false;
  }
  return d.reverse == null || typeof d.reverse === 'boolean';
}

/** `pages` in exactly `n` days, as even as can be (the first ones a page longer). */
function evenDays(pages: number[], n: number): number[][] {
  const base = Math.floor(pages.length / n);
  const extra = pages.length % n;
  const out: number[][] = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    const size = base + (i < extra ? 1 : 0);
    out.push(pages.slice(at, at + size));
    at += size;
  }
  return out;
}

/**
 * Rest on these weekdays: the round becomes whole weeks from `firstWeekday` (today's), as few as hold the pages at no
 * more than the draft's amount a day, the pages spread evenly over the other days. A custom plan loops from the day it
 * is saved, so a round of whole weeks keeps the rest days on their weekdays.
 */
export function withRestWeekdays(days: number[][], rest: readonly number[], firstWeekday: number): number[][] {
  const pages = days.flat();
  if (pages.length === 0) return days;
  const most = Math.max(...days.map((d) => d.length));
  const perWeek = 7 - rest.length;
  const weeks = Math.max(1, Math.ceil(Math.ceil(pages.length / most) / perWeek));
  const spread = evenDays(pages, weeks * perWeek);
  const out: number[][] = [];
  let k = 0;
  for (let i = 0; i < weeks * 7; i++) out.push(rest.includes((firstWeekday + i) % 7) ? [] : spread[k++]);
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
  if (d.restDays != null && d.mode === 'pages' && days.length > 0) days = withRestWeekdays(days, d.restDays, revisionDate.getDay());
  return { days, direction };
}

/** One row of the card: what it is now, and with the draft. */
export interface DraftRow {
  label: string;
  now: string;
  draft: string;
}

const restWords = (n: number) => (n === 0 ? t('revo.card.restNone') : t('revo.card.restCount', { count: n }));
/** The weekdays' names, Sunday first: 2 Nov 2025 was a Sunday. */
const weekdays = (list: readonly number[]) => [...list].sort((a, b) => a - b).map((w) => weekdayName(new Date(2025, 10, 2 + w))).join(', ');

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
    { label: t('revo.card.rest'), now: restWords(planStats(now).restDays), draft: d.restDays?.length ? weekdays(d.restDays) : restWords(planStats(next).restDays) },
  ];
}

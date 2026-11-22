// Edit schedule (SCHED-8; Majd chose option B of the Edit schedule audit, Nov 22 2026: "i feel like option B is way
// better and cleaner let's do that"). The screen's settings build the days: Revise by (pages or juz), how many a day,
// Order, and where today starts. Days can then be changed by hand. Nothing is saved until Save.
//
// A plan made from the settings alone, in mushaf order, is saved as the automatic schedule, so pages memorized later
// join it by themselves (MEM-6). Days changed by hand, An-Nas to Al-Fatihah, or weakest first make a custom plan.

import type { RevisionLog, User, UserPage } from '../types';
import { buildDefaultPlanDays, buildJuzCycleDays, buildWeakestFirstPlanDays } from './algorithm';
import { automaticStartFields } from './jump';
import {
  buildBalancedPlanFromStart,
  buildJuzPlanFromStart,
  liveCustomPlanDays,
  PlanDirection,
  resolveStartPage,
  rotateDaysToStartPage,
} from './planBuilder';
import { memorizedJuzGroups } from './planDisplay';
import type { ScheduleFields } from './planChange';

export type ReviseBy = 'pages' | 'juz';
export type PlanOrder = 'forward' | 'reverse' | 'weakest';

/**
 * Whether changing Revise by, the amount or Order rebuilds days changed by hand (the audit's mock B5: the screen says
 * so before Save). Majd hasn't decided (Nov 22 2026). Off, those days stay as they are and the screen offers "Rebuild
 * days from these settings" instead. Where today starts never rebuilds: it turns the days so today starts there.
 */
export const REBUILD_OVER_HAND_EDITS = true;

export const MAX_PAGES_PER_DAY = 60;
export const MAX_JUZ_PER_DAY = 5;

export interface ScheduleSettings {
  by: ReviseBy;
  pagesPerDay: number;
  juzPerDay: number;
  order: PlanOrder;
  /** The page today starts at (null with nothing memorized). Weakest first has no start of its own. */
  startPage: number | null;
}

export interface EditorContext {
  user: User;
  memorized: UserPage[];
  logs: RevisionLog[];
  /** The revision day (Fajr-aware), fixed while the editor is open. */
  revisionDate: Date;
}

export interface ScheduleDraft {
  settings: ScheduleSettings;
  days: number[][];
  /** Days changed by hand (or a custom plan's own days, or a saved plan loaded): not the settings' alone. */
  edited: boolean;
  /** A settings change rebuilt days that had been changed by hand: the screen says so before Save. */
  rebuilt: boolean;
  /** REBUILD_OVER_HAND_EDITS off: the settings changed, the days changed by hand stayed. */
  stale: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n) || lo));

export const directionOf = (order: PlanOrder): PlanDirection => (order === 'reverse' ? 'reverse' : 'forward');

export function sameSettings(a: ScheduleSettings, b: ScheduleSettings): boolean {
  return a.by === b.by && a.pagesPerDay === b.pagesPerDay && a.juzPerDay === b.juzPerDay && a.order === b.order && a.startPage === b.startPage;
}

/** The most a day can hold: 60 pages, or 5 juz (never more than is memorized). */
export function amountLimits(memorized: UserPage[]): { pages: number; juz: number } {
  const numbers = memorized.map((p) => p.pageNumber);
  return {
    pages: Math.max(1, Math.min(MAX_PAGES_PER_DAY, numbers.length)),
    juz: Math.max(1, Math.min(MAX_JUZ_PER_DAY, memorizedJuzGroups(numbers).length)),
  };
}

/** Saved as the automatic schedule (MEM-6): made from the settings alone, in mushaf order. */
export const savesAsAutomatic = (draft: Pick<ScheduleDraft, 'settings' | 'edited' | 'stale'>): boolean =>
  !draft.edited && !draft.stale && draft.settings.order === 'forward';

/** What the automatic schedule these settings make is saved as: the amount, and where today starts. */
export function automaticFields(settings: ScheduleSettings, ctx: EditorContext): ScheduleFields {
  const amount = {
    scheduleMode: settings.by,
    dailyPageCapacity: settings.pagesPerDay,
    dailyJuzCount: settings.juzPerDay,
  } as const;
  const base: User = { ...ctx.user, customPlan: null, ...amount };
  const start = settings.startPage == null ? null : automaticStartFields(base, settings.startPage, ctx);
  return { customPlan: null, ...amount, ...(start ?? {}) };
}

/** The days these settings make, today first. */
export function buildDays(settings: ScheduleSettings, ctx: EditorContext): number[][] {
  const { memorized, revisionDate } = ctx;
  if (memorized.length === 0) return [];
  if (settings.order === 'forward') {
    const user: User = { ...ctx.user, ...automaticFields(settings, ctx) };
    return settings.by === 'juz'
      ? buildJuzCycleDays(user, memorized, revisionDate)
      : buildDefaultPlanDays(user, memorized, 'forward', revisionDate);
  }
  if (settings.order === 'weakest') {
    return buildWeakestFirstPlanDays({ ...ctx.user, dailyPageCapacity: settings.pagesPerDay }, memorized, ctx.logs, revisionDate);
  }
  const numbers = memorized.map((p) => p.pageNumber).sort((a, b) => a - b);
  const startPage = resolveStartPage(numbers, settings.startPage, 'reverse');
  return settings.by === 'juz'
    ? buildJuzPlanFromStart(memorized, { juzPerDay: settings.juzPerDay, startPage, direction: 'reverse' })
    : buildBalancedPlanFromStart(numbers, { pagesPerDay: settings.pagesPerDay, startPage, direction: 'reverse' });
}

/** The schedule as it is now, for the editor: today first. A custom plan's days are its own (`edited`). */
export function initialDraft(ctx: EditorContext): ScheduleDraft {
  const { user, memorized, revisionDate } = ctx;
  const limits = amountLimits(memorized);
  const custom = !!user.customPlan && user.customPlan.days.length > 0;
  const days = custom
    ? liveCustomPlanDays(user, memorized, revisionDate)
    : user.scheduleMode === 'juz' && (user.dailyJuzCount ?? 0) > 0
      ? buildJuzCycleDays(user, memorized, revisionDate)
      : buildDefaultPlanDays(user, memorized, 'forward', revisionDate);
  const settings: ScheduleSettings = {
    by: user.scheduleMode === 'juz' ? 'juz' : 'pages',
    pagesPerDay: clamp(user.dailyPageCapacity || 10, 1, limits.pages),
    juzPerDay: clamp(user.dailyJuzCount || 1, 1, limits.juz),
    order: custom && user.customPlan!.direction === 'reverse' ? 'reverse' : 'forward',
    startPage: days.find((d) => d.length > 0)?.[0] ?? null,
  };
  return { settings, days, edited: custom, rebuilt: false, stale: false };
}

const onlyStartChanged = (a: ScheduleSettings, b: ScheduleSettings) => a.startPage !== b.startPage && sameSettings({ ...a, startPage: b.startPage }, b);

/**
 * The draft after a settings change. Back to the settings it opened with: the schedule as it was. Where today starts,
 * on days changed by hand: the same days, turned so today starts there. Anything else rebuilds the days from the
 * settings (REBUILD_OVER_HAND_EDITS; off, days changed by hand stay and the draft is `stale`).
 */
export function changeSettings(
  draft: ScheduleDraft,
  next: ScheduleSettings,
  ctx: EditorContext,
  opened: ScheduleDraft,
  rebuildOverHandEdits: boolean = REBUILD_OVER_HAND_EDITS,
): ScheduleDraft {
  if (sameSettings(next, opened.settings)) return { ...opened, days: opened.days.map((d) => [...d]) };
  if (draft.edited && onlyStartChanged(draft.settings, next)) {
    return { ...draft, settings: next, days: rotateDaysToStartPage(draft.days, next.startPage, directionOf(next.order)) };
  }
  if (draft.edited && !rebuildOverHandEdits) return { ...draft, settings: next, stale: true };
  return { settings: next, days: buildDays(next, ctx), edited: false, rebuilt: draft.edited || draft.rebuilt, stale: false };
}

/** "Rebuild days from these settings" (REBUILD_OVER_HAND_EDITS off). */
export function rebuildDraft(draft: ScheduleDraft, ctx: EditorContext): ScheduleDraft {
  return { settings: draft.settings, days: buildDays(draft.settings, ctx), edited: false, rebuilt: true, stale: false };
}

/** Days changed by hand: a day's content, a day added, moved or deleted, pages added from outside the plan. */
export function editDays(draft: ScheduleDraft, days: number[][]): ScheduleDraft {
  return { ...draft, days, edited: true };
}

// The schedule as it is now, in the words Edit schedule's header uses (SCHED-7): how much a day ("10 pages a day") and
// how often each page comes round ("Every page comes round every 11 days"). Edit schedule reads its days from here, and
// Settings → Revision's Schedule row says the same two things (SET-1), so the two never disagree.

import { buildDefaultPlanDays, buildJuzCycleDays } from './algorithm';
import { liveCustomPlanDays, planStats, type PlanDirection } from './planBuilder';
import { pageCountLabel } from './planDisplay';
import { t } from '../i18n';
import type { User, UserPage } from '../types';

/** The schedule's days as they stand, rotated so the first is the revision day `revisionDate`. */
export function liveScheduleDays(
  user: User,
  memorizedPages: UserPage[],
  revisionDate: Date,
): { days: number[][]; direction: PlanDirection } {
  if (user.customPlan && user.customPlan.days.length > 0) {
    // With a carry-over shift, the days as they are now scheduled ("Add to plan" reads the same).
    return { days: liveCustomPlanDays(user, memorizedPages, revisionDate), direction: user.customPlan.direction as PlanDirection };
  }
  if (user.scheduleMode === 'juz' && (user.dailyJuzCount ?? 0) > 0) {
    return { days: buildJuzCycleDays(user, memorizedPages, revisionDate), direction: 'forward' };
  }
  return { days: buildDefaultPlanDays(user, memorizedPages, 'forward', revisionDate), direction: 'forward' };
}

/**
 * How much a day: the automatic schedule's own amount ("10 pages", "1 juz") until it is edited, else what the days
 * hold ("10 pages", or "8–10 pages" when they differ).
 */
export function scheduleAmount(user: User, days: number[][], edited = false): string {
  if (!user.customPlan && !edited && user.scheduleMode === 'juz') return t('common.juzCount', { count: user.dailyJuzCount ?? 1 });
  const stats = planStats(days);
  return stats.minPerDay === stats.maxPerDay
    ? pageCountLabel(stats.maxPerDay)
    : t('plan.builder.pagesRange', { min: stats.minPerDay, max: stats.maxPerDay });
}

/** The two lines, or null with nothing memorized or no days (Edit schedule says why). */
export function scheduleSummary(user: User, memorizedPages: UserPage[], revisionDate: Date): { perDay: string; repeats: string } | null {
  if (memorizedPages.length === 0) return null;
  const { days } = liveScheduleDays(user, memorizedPages, revisionDate);
  if (days.length === 0) return null;
  return {
    perDay: t('plan.edit.perDay', { amount: scheduleAmount(user, days) }),
    repeats: t('plan.edit.everyPage', { count: days.length }),
  };
}

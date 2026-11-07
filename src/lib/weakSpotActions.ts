// Weak spots' two actions (Insights, Majd's defaults):
//  - "Revise these first tomorrow": the weak pages go to the FRONT of tomorrow's session,
//    as tomorrow's carry (they count for tomorrow when revised);
//  - "Plan it": the plan day for tomorrow, pre-filled with those pages.

import type { User } from '../types';

type CarryOver = NonNullable<User['carryOver']>;

/** The calendar day before `day` ('YYYY-MM-DD'). */
function dayBefore(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * The carry-over once the weak pages go in front of tomorrow, then any already carried for
 * tomorrow. Today's own carry (Add to today: its pages, the days they came from, its skip) stays
 * as it is, with tomorrow's held beside it (`next`). Replacing it dropped today's carried pages,
 * and their catch-up credit with them (SESS-7, Nov 2026).
 */
export function carryForTomorrow(tomorrow: string, weak: number[], existing: User['carryOver']): CarryOver {
  const already = existing?.day === tomorrow ? existing.pages : existing?.next?.day === tomorrow ? existing.next.pages : [];
  const pages = [...new Set([...weak, ...already])];
  const today = dayBefore(tomorrow);
  const own =
    existing?.day === today
      ? existing
      : existing?.next?.day === today
        ? { day: today, pages: existing.next.pages, skip: 0, ...(existing.next.source ? { source: existing.next.source } : {}) }
        : null;
  if (!own) return { day: tomorrow, pages, skip: 0, source: 'insights' };
  const { next: _drop, ...todays } = own as CarryOver;
  return { ...todays, next: { day: tomorrow, pages, source: 'insights' } };
}

/**
 * "Plan it" for every plan type (decision, documented in the PR): a custom plan opens its
 * day for tomorrow pre-filled; a pages or juz plan has no day editor, so the pages go to
 * the front of tomorrow's session, as "Revise these first tomorrow" does.
 */
export function planItAction(hasCustomPlan: boolean): 'plan-day' | 'carry' {
  return hasCustomPlan ? 'plan-day' : 'carry';
}

/** The plan day "Plan it" opens: tomorrow's position in the plan, with the weak pages. */
export const PLAN_IT_DAY_INDEX = 1;

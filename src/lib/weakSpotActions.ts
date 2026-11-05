// Weak spots' two actions (Insights, Majd's defaults):
//  - "Revise these first tomorrow": the weak pages go to the FRONT of tomorrow's session,
//    as tomorrow's carry (they count for tomorrow when revised);
//  - "Plan it": the plan day for tomorrow, pre-filled with those pages.

import type { User } from '../types';

type CarryOver = NonNullable<User['carryOver']>;

/** Tomorrow's carry: the weak pages in front, then any already carried for tomorrow. */
export function carryForTomorrow(
  tomorrow: string,
  weak: number[],
  existing: { day: string; pages: number[] } | null | undefined,
): CarryOver {
  const kept = existing && existing.day === tomorrow ? existing.pages : [];
  return { day: tomorrow, pages: [...new Set([...weak, ...kept])], skip: 0 };
}

/** The plan day "Plan it" opens: tomorrow's position in the plan, with the weak pages. */
export const PLAN_IT_DAY_INDEX = 1;

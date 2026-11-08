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

/** The pages already put in front of `tomorrow` (Insights' carry): their buttons show they're done. */
export function firstTomorrowPages(user: Pick<User, 'carryOver'> | null | undefined, tomorrow: string): Set<number> {
  const carry = user?.carryOver;
  if (!carry) return new Set();
  if (carry.day === tomorrow) return new Set(carry.pages);
  return new Set(carry.next?.day === tomorrow ? carry.next.pages : []);
}

/** Whether every one of `pages` already goes first tomorrow (a button's done state). */
export function allFirstTomorrow(pages: readonly number[], first: ReadonlySet<number>): boolean {
  return pages.length > 0 && pages.every((p) => first.has(p));
}

/**
 * The toast after putting pages first tomorrow (by surah, NAME-1): "Al-Hashr 17–24 goes first tomorrow".
 * Several passages lead with the outcome, "6 pages go first tomorrow: Al-Baqarah 246–252, …", so a toast
 * cut to two lines loses names, never what happened (a long name cut off "first tomorrow" on a phone).
 */
export function firstTomorrowText(name: string, pages: number): string {
  if (!/,| and /.test(name)) return `${name} goes first tomorrow`;
  return `${pages} ${pages === 1 ? 'page goes' : 'pages go'} first tomorrow: ${name}`;
}

/**
 * Puts `pages` first tomorrow and returns what the toast says, with its Undo (ACT-24). Undo puts the
 * carry back as it was before, on the latest user (`latest()`), so a change made since stays.
 */
export async function putFirstTomorrow(input: {
  user: User;
  saveUser: (user: User) => Promise<void>;
  /** Today's revision day. */
  today: string;
  pages: number[];
  /** The pages in words ("Al-Hashr 17–24"). */
  name: string;
  latest: () => User | null | undefined;
}): Promise<{ text: string; undo: () => Promise<void> }> {
  const { user, saveUser, today, pages, name, latest } = input;
  const before = user.carryOver ?? null;
  const [y, m, d] = today.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  await saveUser({ ...user, carryOver: carryForTomorrow(tomorrow, pages, user.carryOver) });
  return {
    text: firstTomorrowText(name, new Set(pages).size),
    undo: async () => {
      const now = latest();
      if (now) await saveUser({ ...now, carryOver: before });
    },
  };
}

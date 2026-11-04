// Revising ahead (#168): pages revised before their day come round.
//
// A page scheduled for revision day D is done when it was revised on D, or was
// revised earlier, in a session of another day, and credited to D. Credit goes
// to the day the page is scheduled for, so the schedule never moves: a user who
// does Monday's and Tuesday's pages on Monday has Tuesday free. The credit is
// stored on the session it was done in (`ahead: { '<day>': pages }`); the same
// pages also sit in that session's `pagesRevised`, so last-revised dates and
// counts stay right.
//
// Every "is this day done" question goes through creditedOnDay, so Home, the
// widgets, Activity, the streak, Insights and carry-over agree.

import { RevisionLog } from '../types';

/** Pages credited to each revision day across the sessions: day → page numbers. */
export type CreditIndex = Map<string, Set<number>>;

/**
 * Every day's credited pages in one pass: the pages revised in that day's own
 * session, plus the pages revised ahead for it in earlier sessions.
 */
export function creditIndex(logs: readonly RevisionLog[]): CreditIndex {
  const index: CreditIndex = new Map();
  const add = (day: string, pages: readonly number[]) => {
    const set = index.get(day) ?? new Set<number>();
    for (const p of pages) set.add(p);
    index.set(day, set);
  };
  for (const log of logs) {
    add(log.date, log.pagesRevised);
    for (const [day, pages] of Object.entries(log.ahead ?? {})) add(day, pages);
  }
  return index;
}

/** The pages credited to `day` (see creditIndex). Empty when none. */
export function creditedOnDay(logs: readonly RevisionLog[], day: string): ReadonlySet<number> {
  return creditIndex(logs).get(day) ?? new Set<number>();
}

/**
 * `day`'s credit as a `ahead` map for a session: the pages (of `pages`) that are
 * credited to a day other than `sessionDay`, grouped by that day. Pages of the
 * session's own day are left out (they are its pagesRevised).
 */
export function aheadCreditFor(
  pageDays: ReadonlyMap<number, string>,
  pages: readonly number[],
  sessionDay: string,
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const p of pages) {
    const day = pageDays.get(p);
    if (!day || day === sessionDay) continue;
    (out[day] ??= []).push(p);
  }
  return out;
}

/** Merge two `ahead` maps, pages per day unioned in order. */
export function mergeAhead(
  a: Record<string, number[]> | undefined,
  b: Record<string, number[]> | undefined,
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const source of [a ?? {}, b ?? {}]) {
    for (const [day, pages] of Object.entries(source)) {
      out[day] = [...new Set([...(out[day] ?? []), ...pages])];
    }
  }
  return out;
}

/**
 * `ahead` kept to the pages revised here: credit for a later day exists only
 * for a page the session has revised (checked), so a stale or partial map can
 * never credit a page the session doesn't hold.
 */
export function aheadWithin(
  ahead: Record<string, number[]> | undefined,
  revised: readonly number[],
): Record<string, number[]> {
  const set = new Set(revised);
  const out: Record<string, number[]> = {};
  for (const [day, pages] of Object.entries(ahead ?? {})) {
    const kept = pages.filter((p) => set.has(p));
    if (kept.length > 0) out[day] = kept;
  }
  return out;
}

/** `ahead` without these pages, days left empty dropped. */
export function removeAheadPages(
  ahead: Record<string, number[]> | undefined,
  pages: readonly number[],
): Record<string, number[]> {
  const remove = new Set(pages);
  const out: Record<string, number[]> = {};
  for (const [day, list] of Object.entries(ahead ?? {})) {
    const kept = list.filter((p) => !remove.has(p));
    if (kept.length > 0) out[day] = kept;
  }
  return out;
}

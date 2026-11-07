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

/** The catch-up pages a session revised: its credit for days before its own (SESS-7). */
export function catchUpPagesOf(log: Pick<RevisionLog, 'date' | 'ahead'>): number[] {
  return Object.entries(log.ahead ?? {})
    .filter(([day]) => day < log.date)
    .flatMap(([, pages]) => pages);
}

/**
 * The catch-up pages each day's sessions revised, by the session's day. They are credited to the
 * days they were missed (SESS-7); they finish the session's own day only when they are all it
 * needs: Keep daily amount filled the day with them (lib/carryOver duePagesOf). A day with pages
 * of its own is never finished by them, even a page that is both (a small plan wraps round).
 */
export function catchUpIndex(logs: readonly RevisionLog[]): CreditIndex {
  const index: CreditIndex = new Map();
  for (const log of logs) {
    const pages = catchUpPagesOf(log);
    if (pages.length === 0) continue;
    const set = index.get(log.date) ?? new Set<number>();
    for (const p of pages) set.add(p);
    index.set(log.date, set);
  }
  return index;
}

/** `day`'s pages in catchUpIndex. Empty when none. */
export function caughtUpOnDay(logs: readonly RevisionLog[], day: string): ReadonlySet<number> {
  return catchUpIndex(logs).get(day) ?? new Set<number>();
}

/**
 * Whether `need` (a day's due pages) is done: every page credited to the day, or, for a day the
 * carried pages fill, every page caught up in its sessions. Never some of each (SESS-7).
 */
export function needDone(
  need: readonly number[],
  credited: ReadonlySet<number> | undefined,
  caughtUp: ReadonlySet<number> | undefined,
): boolean {
  if (need.length === 0) return false;
  return need.every((p) => credited?.has(p)) || need.every((p) => caughtUp?.has(p));
}

/** How many of `need` are done, the way needDone counts them. */
export function needDoneCount(
  need: readonly number[],
  credited: ReadonlySet<number> | undefined,
  caughtUp: ReadonlySet<number> | undefined,
): number {
  const byCredit = need.filter((p) => credited?.has(p)).length;
  const byCatchUp = need.filter((p) => caughtUp?.has(p)).length;
  return Math.max(byCredit, byCatchUp);
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

/**
 * The pages a day's review covers: the pages its sessions revised, and the
 * pages those sessions revised ahead for later days. Each page once. This is
 * what "Review session" shows and counts, so the total is the day's whole work.
 */
export function reviewedOn(logs: readonly RevisionLog[], day: string): Set<number> {
  const out = new Set<number>();
  for (const log of logs) {
    if (log.date !== day) continue;
    for (const p of log.pagesRevised) out.add(p);
    for (const pages of Object.values(log.ahead ?? {})) for (const p of pages) out.add(p);
  }
  return out;
}

/** Pages done for `day`: credited to it (see creditedOnDay) or reviewed in its own sessions. */
export function doneOnDay(logs: readonly RevisionLog[], day: string): Set<number> {
  return new Set([...creditedOnDay(logs, day), ...reviewedOn(logs, day)]);
}

/**
 * The pages of a day's review in the order the review shows them (Majd, Nov 5
 * 2026): the day's own pages first, in its assignment's order (then any other
 * page credited to it), then the pages its sessions revised ahead, the earliest
 * later day first, each in the order they were revised. The same set as
 * doneOnDay, so Home's "Done · N" and the review still agree.
 */
export function reviewPagesInOrder(
  logs: readonly RevisionLog[],
  day: string,
  assigned: readonly number[],
): number[] {
  const aheadByDay = new Map<string, number[]>();
  for (const log of logs) {
    if (log.date !== day) continue;
    for (const [later, pages] of Object.entries(log.ahead ?? {})) {
      aheadByDay.set(later, [...(aheadByDay.get(later) ?? []), ...pages]);
    }
  }
  const aheadPages = new Set([...aheadByDay.values()].flat());
  // A page revised ahead also sits in its session's pagesRevised: it belongs
  // to the later day here, unless the day itself has it too.
  const ownDay = new Set(assigned);
  const own = [...creditedOnDay(logs, day)].filter((p) => ownDay.has(p) || !aheadPages.has(p));

  const out: number[] = [];
  const seen = new Set<number>();
  const push = (p: number) => {
    if (seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };
  const ownSet = new Set(own);
  for (const p of assigned) if (ownSet.has(p)) push(p);
  for (const p of [...own].sort((a, b) => a - b)) push(p);
  for (const later of [...aheadByDay.keys()].sort()) for (const p of aheadByDay.get(later)!) push(p);
  // Anything else the day's sessions hold (nothing, unless a log is odd).
  for (const p of [...doneOnDay(logs, day)].sort((a, b) => a - b)) push(p);
  return out;
}

/**
 * How a session's pages are credited when saved (SESS-7). A page whose day is before the session's
 * (a catch-up page, credited to the day it was missed) is kept out of this session's pagesRevised,
 * so it never counts toward today; it goes to `ahead` under its own day. Other pages are as before.
 */
export function sessionCredit(
  pages: readonly number[],
  pageDays: ReadonlyMap<number, string>,
  sessionDay: string,
): { pagesRevised: number[]; ahead: Record<string, number[]> } {
  const pagesRevised = pages.filter((p) => {
    const d = pageDays.get(p);
    return !(d && d < sessionDay);
  });
  return { pagesRevised, ahead: aheadCreditFor(pageDays, pages, sessionDay) };
}

// Patterns in the account's own days, for Revo (REVO-40; Majd, Nov 9 2026: "it should know such
// jargon like hey seems like you were making up blah blah blah how about we try..."). Worked out
// here, on the phone, from what Activity and the streak read: the logs' credits (lib/aheadCredit:
// catch-up pages are credited to earlier days, SESS-7; pages revised ahead to later ones, AHEAD-2)
// and each day's session time (its Activity item). Revo is told what was found, in words, and picks
// at most one to mention when it fits; it never infers a pattern itself.

import type { RevisionLog } from '../../types';
import { catchUpPagesOf } from '../aheadCredit';
import { shiftDay } from '../journal';
import type { HistoryItem } from '../streakFromItems';

/** One day's revision, beyond its pages: what it caught up, what it revised ahead and when it started. */
export interface RevoDaySignals {
  /** Pages revised that day for earlier days, missed or left (SESS-7). */
  caughtUp: number;
  /** The earlier days they were credited to, oldest first. */
  caughtUpFor: string[];
  /** Pages revised that day ahead, for later days (AHEAD-2). */
  ahead: number;
  /** The later revision days they were credited to, oldest first. */
  aheadFor: string[];
  /** When the day's revision started, local "HH:MM" (its session's Activity item); null when unknown. */
  started: string | null;
}

export type RevoPattern =
  /** A day that made up for earlier days: "Looks like you were making up for Tuesday and Wednesday." */
  | { kind: 'catchingUp'; day: string; pages: number; forDays: string[]; keepDailyAmount: boolean }
  /** Several days revised ahead in one day, and how many days since had nothing left to revise. */
  | { kind: 'aheadBurst'; day: string; pages: number; days: number; quietDays: number }
  /** Revision that often starts late at night: `late` of the last `of` days with a known start. */
  | { kind: 'lateNights'; late: number; of: number }
  /** A run of days, each done on its own day this week. */
  | { kind: 'steady'; days: number };

/** Late at night: a session started from 10 PM until 4 AM, local time. */
export const LATE_FROM_HOUR = 22;
export const LATE_UNTIL_HOUR = 4;
/** The days whose start times are read for late nights. */
export const LATE_WINDOW_DAYS = 14;
/** A streak this long, with no catching up this week, is steady. */
export const STEADY_MIN_DAYS = 7;
/** Pages revised ahead count as a burst when they cover this many later days. */
export const AHEAD_MIN_DAYS = 3;

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** When each day's revision started: its session's own Activity item (`id` is the day), local time. */
export function sessionStarts(history: readonly HistoryItem[] | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const x of history ?? []) {
    if (x.id === x.day && x.occurredAt != null && x.occurredAt > 0) out.set(x.day, hhmm(x.occurredAt));
  }
  return out;
}

/** What `day`'s sessions caught up and revised ahead, by the credit rules Activity reads (lib/aheadCredit). */
export function daySignals(logs: readonly RevisionLog[], day: string, starts: ReadonlyMap<string, string>): RevoDaySignals {
  const caught = new Set<number>();
  const caughtFor = new Set<string>();
  const ahead = new Set<number>();
  const aheadFor = new Set<string>();
  for (const log of logs) {
    if (log.date !== day) continue;
    for (const p of catchUpPagesOf(log)) caught.add(p);
    for (const [credited, pages] of Object.entries(log.ahead ?? {})) {
      if (pages.length === 0) continue;
      if (credited < day) caughtFor.add(credited);
      if (credited > day) {
        aheadFor.add(credited);
        for (const p of pages) ahead.add(p);
      }
    }
  }
  return {
    caughtUp: caught.size,
    caughtUpFor: [...caughtFor].sort(),
    ahead: ahead.size,
    aheadFor: [...aheadFor].sort(),
    started: starts.get(day) ?? null,
  };
}

const isLate = (started: string) => {
  const hour = Number(started.slice(0, 2));
  return hour >= LATE_FROM_HOUR || hour < LATE_UNTIL_HOUR;
};

/** The usual day's pages this week: the average of the days that had a plan (at least 1). */
function typicalDay(week: readonly { planned: number }[]): number {
  const planned = week.map((w) => w.planned).filter((n) => n > 0);
  return planned.length === 0 ? 1 : Math.max(1, Math.round(planned.reduce((a, b) => a + b, 0) / planned.length));
}

/**
 * The patterns in the last days, each from the account's own facts. Catching up and revising ahead
 * look at this week (the latest such day); late nights at the last LATE_WINDOW_DAYS days with a known
 * start; steady at the streak. Nothing here is about page strength, so Smart Tracking doesn't change it.
 */
export function revoPatterns(input: {
  today: string;
  week: readonly ({ day: string; pages: number; planned: number; done: boolean } & RevoDaySignals)[];
  starts: ReadonlyMap<string, string>;
  streakDays: number;
  /** Keep daily amount on (carryOverMode 'shift', the default): missed pages don't go on top of a day's own. */
  keepDailyAmount: boolean;
}): RevoPattern[] {
  const { today, week } = input;
  const typical = typicalDay(week);
  const out: RevoPattern[] = [];

  // Catching up: a day that revised at least half a usual day's pages (3 at least) for earlier days.
  const catching = [...week].reverse().find((w) => w.caughtUpFor.length > 0 && w.caughtUp >= Math.max(3, Math.ceil(typical / 2)));
  if (catching) {
    out.push({ kind: 'catchingUp', day: catching.day, pages: catching.caughtUp, forDays: catching.caughtUpFor, keepDailyAmount: input.keepDailyAmount });
  }

  // Revising ahead: one day that covered several later days, and at least two days' worth of pages.
  const burst = [...week].reverse().find((w) => w.aheadFor.length >= AHEAD_MIN_DAYS && w.ahead >= 2 * typical);
  if (burst) {
    // The days it was credited to that have come, done, with nothing revised in their own sessions.
    const credited = new Set(burst.aheadFor);
    const quietDays = week.filter((w) => credited.has(w.day) && w.done && w.pages === 0).length;
    out.push({ kind: 'aheadBurst', day: burst.day, pages: burst.ahead, days: burst.aheadFor.length, quietDays });
  }

  // Late at night, often: at least 3 of the last days with a known start, and at least half of them.
  const from = shiftDay(today, -(LATE_WINDOW_DAYS - 1));
  const started = [...input.starts].filter(([day]) => day >= from && day <= today).map(([, at]) => at);
  const late = started.filter(isLate).length;
  if (late >= 3 && late * 2 >= started.length) out.push({ kind: 'lateNights', late, of: started.length });

  // Steady: a run of a week or more, with nothing caught up this week (each day done on its own day).
  if (input.streakDays >= STEADY_MIN_DAYS && week.every((w) => w.caughtUp === 0)) out.push({ kind: 'steady', days: input.streakDays });

  return out;
}

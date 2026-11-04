// Carrying yesterday's unrevised pages into today (lib/carryOver): which pages
// are leftovers, and what "Keep daily amount" ('shift') and "Add on top"
// ('add') do to today and the days after.

import fc from 'fast-check';
import {
  buildDefaultPlanDays,
  buildJuzCycleDays,
  getPagesForDay,
  getPagesScheduledForDate,
  scheduledDaysFrom,
} from '../../../src/lib/algorithm';
import { applyCarryOver, findLeftoverPages, hasCarriedOver } from '../../../src/lib/carryOver';
import { userWithNewSchedule } from '../../../src/lib/planChange';
import { rotateCustomPlanToToday } from '../../../src/lib/planBuilder';
import { createCustomPlanFromDraft } from '../../../src/lib/schedulePlans';
import type { RevisionLog, User, UserPage } from '../../../src/types';
import { addDays, dayOf } from '../harness/clock';
import {
  customPlan,
  dayAt,
  dayFromIndex,
  dayIndexArb,
  memorizedPages,
  planDaysArb,
  restoreZone,
  runs,
  session,
  useZone,
  userWith,
  zoneArb,
} from './fixtures';

afterEach(() => restoreZone());

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const POOL = range(1, 20);
const poolArb = fc.constantFrom(...POOL);
const subsetArb = (xs: readonly number[], max = xs.length) =>
  xs.length === 0 ? fc.constant([] as number[]) : fc.uniqueArray(fc.constantFrom(...xs), { maxLength: max });

// ---------------------------------------------------------------------------
// findLeftoverPages

const leftoverCaseArb = fc
  .record({
    today: dayIndexArb.map((i) => dayOf(dayFromIndex(i))),
    memorized: fc.uniqueArray(poolArb, { maxLength: 20 }),
    todaysPages: fc.uniqueArray(poolArb, { maxLength: 8 }),
    lookback: fc.integer({ min: 1, max: 3 }),
  })
  .chain((c) => {
    const dayArb = fc.integer({ min: -1, max: 4 }).map((back) => addDays(c.today, -back));
    const aheadDayArb = fc.integer({ min: -3, max: 2 }).map((d) => addDays(c.today, d));
    const logArb = fc
      .record({
        date: dayArb,
        assigned: fc.option(fc.uniqueArray(poolArb, { maxLength: 10 }), { nil: undefined, freq: 8 }),
        extraRevised: fc.uniqueArray(poolArb, { maxLength: 3 }),
        revisedPick: fc.array(fc.boolean(), { minLength: 10, maxLength: 10 }),
        ahead: fc.option(fc.dictionary(aheadDayArb, fc.uniqueArray(poolArb, { maxLength: 4 }), { maxKeys: 2 }), {
          nil: undefined,
        }),
      })
      .map(({ date, assigned, extraRevised, revisedPick, ahead }): RevisionLog => {
        const revised = [...new Set([...(assigned ?? []).filter((_, i) => revisedPick[i]), ...extraRevised])];
        return session(date, revised, { assignedPages: assigned, ...(ahead ? { ahead } : {}) });
      });
    return fc.array(logArb, { maxLength: 8 }).map((logs) => ({ ...c, logs }));
  });

/** The leftovers by the rule, written out from the documentation (not the code). */
function leftoversByRule(c: { today: string; memorized: number[]; todaysPages: number[]; lookback: number; logs: RevisionLog[] }) {
  const firstDay = addDays(c.today, -c.lookback);
  const revisedOn = (p: number, from: string) =>
    c.logs.some((l) => l.date >= from && l.date <= c.today && l.date >= firstDay && l.pagesRevised.includes(p));
  const credited = (p: number, day: string) =>
    c.logs.some((l) => (l.date === day && l.pagesRevised.includes(p)) || (l.ahead?.[day] ?? []).includes(p));
  const out: number[] = [];
  for (let back = c.lookback; back >= 1; back--) {
    const day = addDays(c.today, -back);
    const dayLogs = c.logs.filter((l) => l.date === day && (l.assignedPages?.length ?? 0) > 0);
    // Started: a session of that day (with its assignment) revised something.
    if (!dayLogs.some((l) => l.pagesRevised.length > 0)) continue;
    for (const l of dayLogs) {
      for (const p of l.assignedPages!) {
        if (revisedOn(p, day) || credited(p, day)) continue;
        if (c.todaysPages.includes(p) || !c.memorized.includes(p) || out.includes(p)) continue;
        out.push(p);
      }
    }
  }
  return out;
}

describe('[CARRY-1] [CARRY-4] leftover pages', () => {
  it('never returns today’s pages, a page not memorized, a page revised since its day, a duplicate or a page credited ahead to its day', () => {
    fc.assert(
      fc.property(leftoverCaseArb, (c) => {
        const out = findLeftoverPages(c.logs, c.today, c.todaysPages, new Set(c.memorized), c.lookback);
        expect(new Set(out).size).toBe(out.length);
        for (const p of out) {
          expect(c.todaysPages).not.toContain(p);
          expect(c.memorized).toContain(p);
          // Some earlier day of the lookback assigned it, was started, and it is still undone for that day.
          const from = (back: number) => addDays(c.today, -back);
          const days = range(1, c.lookback).map(from);
          const undoneOn = days.filter(
            (day) =>
              c.logs.some((l) => l.date === day && (l.assignedPages ?? []).includes(p)) &&
              c.logs.some((l) => l.date === day && (l.assignedPages?.length ?? 0) > 0 && l.pagesRevised.length > 0) &&
              !c.logs.some((l) => l.date >= day && l.date <= c.today && l.pagesRevised.includes(p)) &&
              !c.logs.some((l) => (l.ahead?.[day] ?? []).includes(p)),
          );
          expect(undoneOn.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: runs(500) },
    );
  });

  it('is exactly the documented rule, oldest day first, in session order', () => {
    fc.assert(
      fc.property(leftoverCaseArb, (c) => {
        expect(findLeftoverPages(c.logs, c.today, c.todaysPages, new Set(c.memorized), c.lookback)).toEqual(leftoversByRule(c));
      }),
      { numRuns: runs(500) },
    );
  });

  it('carries nothing from a day with no session (a missed day isn’t carried)', () => {
    fc.assert(
      fc.property(leftoverCaseArb, (c) => {
        // Every session of the lookback days revised nothing: nothing was started.
        const logs = c.logs.map((l) => (l.date < c.today ? { ...l, pagesRevised: [], ahead: undefined } : l));
        expect(findLeftoverPages(logs, c.today, c.todaysPages, new Set(c.memorized), c.lookback)).toEqual([]);
        // And with no sessions at all.
        expect(findLeftoverPages([], c.today, c.todaysPages, new Set(c.memorized), c.lookback)).toEqual([]);
      }),
      { numRuns: runs(300) },
    );
  });
});

// ---------------------------------------------------------------------------
// applyCarryOver

type Setup = { zone: string; user: User; mem: UserPage[]; memorized: number[]; today: Date };

// Schedules starting in early 2025, today later on: sliding window, custom
// plan (with off days) or juz mode, with or without an earlier shift.
const setupArb: fc.Arbitrary<Setup> = fc
  .record({
    zone: zoneArb,
    memorized: fc.oneof(
      fc.uniqueArray(fc.integer({ min: 1, max: 604 }), { minLength: 1, maxLength: 40 }),
      fc.tuple(fc.integer({ min: 1, max: 560 }), fc.integer({ min: 0, max: 44 })).map(([a, n]) => range(a, a + n)),
    ),
    start: fc.integer({ min: 0, max: 50 }),
    todayAfter: fc.integer({ min: 1, max: 900 }),
    shift: fc.oneof(fc.constant(0), fc.nat({ max: 200 })),
    capacity: fc.integer({ min: 1, max: 15 }),
    juzPerDay: fc.integer({ min: 1, max: 3 }),
    kind: fc.constantFrom('sliding', 'custom', 'juz'),
  })
  .chain((r) => planDaysArb(r.memorized).map((days) => ({ ...r, days })))
  .map((r) => {
    useZone(r.zone);
    const startDay = dayFromIndex(r.start);
    const fields: Partial<User> =
      r.kind === 'sliding'
        ? { dailyPageCapacity: r.capacity, scheduleAnchorDate: new Date(startDay.getTime() + 12 * 3_600_000).toISOString() }
        : r.kind === 'juz'
          ? { scheduleMode: 'juz', dailyJuzCount: r.juzPerDay, scheduleAnchorDate: startDay.toISOString() }
          : { customPlan: customPlan(r.days, dayOf(startDay)) };
    return {
      zone: r.zone,
      user: userWith({ ...fields, scheduleShiftPages: r.shift }),
      mem: memorizedPages(r.memorized),
      memorized: r.memorized,
      today: dayAt(startDay, r.todayAfter),
    };
  });

/** Yesterday's session, part done, and the leftovers Home would offer for it. */
function yesterdaysLeftovers(s: Setup, pick: boolean[]) {
  const yesterday = dayAt(s.today, -1);
  const assigned = getPagesForDay(s.user, yesterday, s.mem);
  const revised = assigned.filter((_, i) => pick[i % pick.length]);
  const log = session(dayOf(yesterday), revised, { assignedPages: assigned });
  const todays = getPagesForDay(s.user, s.today, s.mem);
  return { log, leftovers: findLeftoverPages([log], dayOf(s.today), todays, new Set(s.memorized)) };
}

const pickArb = fc.array(fc.boolean(), { minLength: 1, maxLength: 12 });

/** The first day after `from` (within a year) with scheduled pages. */
function nextDayWithPages(user: User, mem: UserPage[], from: Date): Date | null {
  for (let i = 1; i <= 366; i++) {
    const d = dayAt(from, i);
    if (getPagesScheduledForDate(user, d, mem).length > 0) return d;
  }
  return null;
}

describe('[CARRY-2] carry-over, Keep daily amount (shift)', () => {
  it('today is the leftovers, then the first (size − skip) of today’s own pages: max(scheduled, leftovers) pages', () => {
    fc.assert(
      fc.property(setupArb, pickArb, (s, pick) => {
        useZone(s.zone);
        const { leftovers } = yesterdaysLeftovers(s, pick);
        fc.pre(leftovers.length > 0);
        const scheduled = getPagesScheduledForDate(s.user, s.today, s.mem);
        const next = applyCarryOver(s.user, s.mem, leftovers, s.today);
        const skip = Math.min(leftovers.length, scheduled.length);
        expect(next.scheduleShiftPages).toBe((s.user.scheduleShiftPages ?? 0) + skip);
        expect(next.carryOver).toEqual({ day: dayOf(s.today), pages: leftovers, skip });
        const today = getPagesForDay(next, s.today, s.mem);
        expect(today).toEqual([...leftovers, ...scheduled.slice(0, scheduled.length - skip)]);
        expect(today.length).toBe(Math.max(scheduled.length, leftovers.length));
      }),
      { numRuns: runs(300) },
    );
  });

  it('keeps every later day’s size, and the next day with pages starts with today’s displaced end', () => {
    fc.assert(
      fc.property(setupArb, pickArb, (s, pick) => {
        useZone(s.zone);
        const { leftovers } = yesterdaysLeftovers(s, pick);
        fc.pre(leftovers.length > 0);
        const scheduled = getPagesScheduledForDate(s.user, s.today, s.mem);
        const next = applyCarryOver(s.user, s.mem, leftovers, s.today);
        const skip = Math.min(leftovers.length, scheduled.length);
        for (let i = 1; i <= 10; i++) {
          const d = dayAt(s.today, i);
          expect(getPagesForDay(next, d, s.mem).length).toBe(getPagesForDay(s.user, d, s.mem).length);
        }
        const after = nextDayWithPages(s.user, s.mem, s.today);
        if (after) {
          const old = getPagesForDay(s.user, after, s.mem);
          expect(getPagesForDay(next, after, s.mem)).toEqual([...scheduled.slice(scheduled.length - skip), ...old].slice(0, old.length));
        }
      }),
      { numRuns: runs(300) },
    );
  });

  it('happens at most once per revision day: applying it again (any leftovers) changes nothing', () => {
    fc.assert(
      fc.property(setupArb, pickArb, fc.uniqueArray(poolArb, { minLength: 1, maxLength: 5 }), fc.constantFrom<'shift' | 'add'>('shift', 'add'), (s, pick, more, mode) => {
        useZone(s.zone);
        const user = { ...s.user, carryOverMode: mode };
        const { leftovers } = yesterdaysLeftovers({ ...s, user }, pick);
        fc.pre(leftovers.length > 0);
        const once = applyCarryOver(user, s.mem, leftovers, s.today);
        expect(hasCarriedOver(once, dayOf(s.today))).toBe(true);
        expect(applyCarryOver(once, s.mem, leftovers, s.today)).toBe(once);
        expect(applyCarryOver(once, s.mem, more, s.today)).toBe(once);
        // With nothing to carry, nothing happens at all.
        expect(applyCarryOver(user, s.mem, [], s.today)).toBe(user);
      }),
      { numRuns: runs(300) },
    );
  });
});

describe('[CARRY-3] carry-over, Add on top (add)', () => {
  it('only today changes: today = leftovers, then today’s pages not among them; every other day as it was', () => {
    fc.assert(
      fc.property(setupArb, pickArb, (s, pick) => {
        useZone(s.zone);
        const user: User = { ...s.user, carryOverMode: 'add' };
        const { leftovers } = yesterdaysLeftovers({ ...s, user }, pick);
        fc.pre(leftovers.length > 0);
        const scheduled = getPagesForDay(user, s.today, s.mem);
        const next = applyCarryOver(user, s.mem, leftovers, s.today);
        expect(next.scheduleShiftPages).toBe(user.scheduleShiftPages);
        expect(getPagesForDay(next, s.today, s.mem)).toEqual([...leftovers, ...scheduled.filter((p) => !leftovers.includes(p))]);
        for (let i = -3; i <= 10; i++) {
          if (i === 0) continue;
          const d = dayAt(s.today, i);
          expect(getPagesForDay(next, d, s.mem)).toEqual(getPagesForDay(user, d, s.mem));
        }
      }),
      { numRuns: runs(300) },
    );
  });

  it('a carried page that is no longer memorized is not shown (either mode)', () => {
    fc.assert(
      fc.property(setupArb, pickArb, fc.nat(), fc.constantFrom<'shift' | 'add'>('shift', 'add'), (s, pick, which, mode) => {
        useZone(s.zone);
        const user: User = { ...s.user, carryOverMode: mode };
        const { leftovers } = yesterdaysLeftovers({ ...s, user }, pick);
        fc.pre(leftovers.length > 0);
        const next = applyCarryOver(user, s.mem, leftovers, s.today);
        const dropped = leftovers[which % leftovers.length];
        const mem = s.mem.filter((p) => p.pageNumber !== dropped);
        const today = getPagesForDay(next, s.today, mem);
        expect(today).not.toContain(dropped);
        expect(today.slice(0, leftovers.length - 1)).toEqual(leftovers.filter((p) => p !== dropped));
      }),
      { numRuns: runs(200) },
    );
  });
});

describe('[CARRY-5] carry-over and the plan editor', () => {
  /** Open the editor on today, change only the last day (if there are two or more), save. */
  function saveFromEditor(before: User, mem: UserPage[], today: Date, logs: RevisionLog[]) {
    const plan = before.customPlan;
    const started = plan && plan.cycleStartDate <= dayOf(today);
    const shown =
      plan && plan.days.length > 0
        ? (before.scheduleShiftPages ?? 0) > 0 && started
          ? scheduledDaysFrom(before, mem, today, plan.days.length)
          : rotateCustomPlanToToday(plan, today)
        : before.scheduleMode === 'juz' && before.dailyJuzCount > 0
          ? buildJuzCycleDays(before, mem, today)
          : buildDefaultPlanDays(before, mem, 'forward', today);
    const edited = shown.map((d, i) => (i === shown.length - 1 && i > 0 ? [...d].reverse() : d));
    const saved = userWithNewSchedule(
      before,
      { customPlan: createCustomPlanFromDraft(edited, 'forward', today) },
      { revisionDate: today, memorized: mem, logs, newPlan: false },
    );
    return { saved, unchangedDays: Math.max(1, shown.length - 1) };
  }

  // KNOWN BUG: after "Keep daily amount" carries scattered leftovers (yesterday
  // revised a later page but not an earlier one), opening the plan editor and
  // saving an edit to a later day adds yesterday's revised page back to today.
  // The editor shows today's scheduled day with the shift folded in, which
  // starts with yesterday's last `skip` pages; settleCarryOverForNewPlan sets
  // skip to 0, and userWithNewSchedule keeps that carry-over because today's
  // scheduled pages look unchanged. Today becomes leftovers + that whole day,
  // so the revised pages of yesterday's tail come back.
  // Minimal: custom plan [[1,2,3],[4,5,6],[7,8,9]] from 2026-10-15, today
  // 2026-10-17, yesterday [4,5,6] with 5 revised. Leftovers [4,6], today
  // [4,6,7]. Edit day 3 and save. Expected today [4,6,7]. Actual [4,6,5,7].
  it.failing('KNOWN BUG: saving an edit to a later day keeps today and the days before the edit as they were', () => {
    fc.assert(
      fc.property(setupArb, pickArb, (s, pick) => {
        useZone(s.zone);
        const { log, leftovers } = yesterdaysLeftovers(s, pick);
        fc.pre(leftovers.length > 0);
        const before = applyCarryOver(s.user, s.mem, leftovers, s.today);
        const { saved, unchangedDays } = saveFromEditor(before, s.mem, s.today, [log]);
        for (let i = 0; i < Math.min(unchangedDays, 10); i++) {
          const d = dayAt(s.today, i);
          expect(getPagesForDay(saved, d, s.mem)).toEqual(getPagesForDay(before, d, s.mem));
        }
      }),
      {
        numRuns: runs(300),
        endOnFailure: true,
        examples: [
          [
            {
              zone: 'UTC',
              user: userWith({ dailyPageCapacity: 3, customPlan: customPlan([[1, 2, 3], [4, 5, 6], [7, 8, 9]], '2026-10-15') }),
              mem: memorizedPages(range(1, 9)),
              memorized: range(1, 9),
              today: new Date(2026, 9, 17),
            },
            [false, true, false],
          ],
        ],
      },
    );
  });

  it.failing('KNOWN BUG example: scattered leftovers [4,6], save an edit to day 3: today gains page 5', () => {
    const user = userWith({ customPlan: customPlan([[1, 2, 3], [4, 5, 6], [7, 8, 9]], '2026-10-15') });
    const mem = memorizedPages(range(1, 9));
    const today = new Date(2026, 9, 17);
    const log = session('2026-10-16', [5], { assignedPages: [4, 5, 6] });
    const leftovers = findLeftoverPages([log], '2026-10-17', [7, 8, 9], new Set(range(1, 9)));
    expect(leftovers).toEqual([4, 6]);
    const before = applyCarryOver(user, mem, leftovers, today);
    expect(getPagesForDay(before, today, mem)).toEqual([4, 6, 7]);
    const saved = userWithNewSchedule(
      before,
      { customPlan: createCustomPlanFromDraft([[5, 6, 7], [8, 9, 1], [3, 2, 4]], 'forward', today) },
      { revisionDate: today, memorized: mem, logs: [log], newPlan: false },
    );
    expect(getPagesForDay(saved, today, mem)).toEqual([4, 6, 7]);
  });

  it('saving an edit to a later day keeps today when yesterday’s leftovers were its unrevised end (or none)', () => {
    fc.assert(
      fc.property(setupArb, fc.nat({ max: 12 }), (s, done) => {
        useZone(s.zone);
        // Yesterday revised its first `done` pages: the leftovers are its end, in order.
        const yesterday = dayAt(s.today, -1);
        const assigned = getPagesForDay(s.user, yesterday, s.mem);
        const log = session(dayOf(yesterday), assigned.slice(0, Math.max(1, done)), { assignedPages: assigned });
        const todays = getPagesForDay(s.user, s.today, s.mem);
        const leftovers = findLeftoverPages([log], dayOf(s.today), todays, new Set(s.memorized));
        const tail = assigned.slice(assigned.length - leftovers.length);
        fc.pre(leftovers.join() === tail.join());
        const before = applyCarryOver(s.user, s.mem, leftovers, s.today);
        const { saved, unchangedDays } = saveFromEditor(before, s.mem, s.today, [log]);
        for (let i = 0; i < Math.min(unchangedDays, 10); i++) {
          const d = dayAt(s.today, i);
          expect(getPagesForDay(saved, d, s.mem)).toEqual(getPagesForDay(before, d, s.mem));
        }
      }),
      { numRuns: runs(300) },
    );
  });
});

// The schedule (algorithm.getPagesScheduledForDate and the plan builders): the
// sliding window from the anchor, custom plans, juz mode, and the editor's view
// of them, for random memorized sets, capacities, anchors and zones.

import fc from 'fast-check';
import {
  buildAutoBalancePlanDays,
  buildDefaultPlanDays,
  calendarDaysBetween,
  getPagesForDay,
  getPagesScheduledForDate,
  juzKeyForPage,
  scheduleStartDay,
  scheduleStartingByToday,
  scheduledDaysFrom,
  shiftScheduleAnchor,
} from '../../../src/lib/algorithm';
import { applyCarryOver, findLeftoverPages } from '../../../src/lib/carryOver';
import {
  buildBalancedPlanFromStart,
  buildJuzPlanFromStart,
  rotateCustomPlanToToday,
} from '../../../src/lib/planBuilder';
import type { User } from '../../../src/types';
import { dayOf } from '../harness/clock';
import {
  ALL_ZONES,
  customPlan,
  dayAt,
  dayFromIndex,
  dayIndexArb,
  dstDays,
  instantArb,
  memorizedPages,
  memorizedSetArb,
  parseDay,
  planDaysArb,
  restoreZone,
  runs,
  session,
  timeOfDayArb,
  useZone,
  userWith,
  zoneArb,
} from './fixtures';

afterEach(() => restoreZone());

const DST_DAYS = new Map<string, string[]>();
beforeAll(() => {
  for (const zone of ALL_ZONES) {
    useZone(zone);
    DST_DAYS.set(zone, dstDays());
  }
  restoreZone();
});

const sortedUnique = (xs: readonly number[]) => [...new Set(xs)].sort((a, b) => a - b);
const isUnique = (xs: readonly number[]) => new Set(xs).size === xs.length;
const anchorDayOf = (user: User) => {
  const a = new Date(user.scheduleAnchorDate);
  return new Date(a.getFullYear(), a.getMonth(), a.getDate());
};
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** The cycle's flat sequence read `k` pages earlier: what a shift of k does to it. */
const rotateBack = (flat: readonly number[], k: number) =>
  flat.map((_, i) => flat[(((i - k) % flat.length) + flat.length) % flat.length]);

// Anchors in early 2025, so every later day of 2025–2027 is on the schedule.
const earlyAnchorArb = fc.integer({ min: Date.UTC(2025, 0, 1), max: Date.UTC(2025, 2, 1) });

const slidingArb = fc.record({
  zone: zoneArb,
  pages: memorizedSetArb,
  capacity: fc.integer({ min: 1, max: 700 }),
  anchor: instantArb,
  shift: fc.oneof(fc.constant(0), fc.nat({ max: 2000 })),
});
type Sliding = { zone: string; pages: number[]; capacity: number; anchor: number; shift: number };
const slidingUser = (s: Sliding): User =>
  userWith({
    dailyPageCapacity: s.capacity,
    scheduleAnchorDate: new Date(s.anchor).toISOString(),
    scheduleShiftPages: s.shift,
  });

/** A day d ≥ the anchor's day: often a DST day of the zone (or next to one). */
function dayOnSchedule(zone: string, pick: number, from: Date): Date {
  const dst = DST_DAYS.get(zone)!;
  const candidates = dst.map(parseDay).filter((d) => d >= from);
  if (candidates.length > 0 && pick % 3 !== 0) return dayAt(candidates[pick % candidates.length], (pick % 5) - 2);
  return dayAt(from, pick % 900);
}

describe('[SCHED-1] [SCHED-5] [DAY-6] sliding-window schedule', () => {
  it('gives each day min(capacity, total) pages, all memorized, none twice', () => {
    fc.assert(
      fc.property(slidingArb, fc.nat({ max: 1200 }), timeOfDayArb, (s, n, [h, m]) => {
        useZone(s.zone);
        const user = slidingUser(s);
        const mem = memorizedPages(s.pages);
        const date = dayAt(anchorDayOf(user), n, h, m);
        const pages = getPagesScheduledForDate(user, date, mem);
        expect(pages.length).toBe(Math.min(s.capacity, s.pages.length));
        expect(isUnique(pages)).toBe(true);
        const set = new Set(s.pages);
        expect(pages.every((p) => set.has(p))).toBe(true);
      }),
      { numRuns: runs(300) },
    );
  });

  it('covers every memorized page within ceil(total / perDay) consecutive days', () => {
    fc.assert(
      fc.property(slidingArb, fc.nat({ max: 1200 }), (s0, n) => {
        // Keep a pass to at most 80 days, so a run stays quick.
        const s = { ...s0, capacity: Math.max(s0.capacity, Math.ceil(s0.pages.length / 80)) };
        useZone(s.zone);
        const user = slidingUser(s);
        const mem = memorizedPages(s.pages);
        const perDay = Math.min(s.capacity, s.pages.length);
        const days = scheduledDaysFrom(user, mem, dayAt(anchorDayOf(user), n), Math.ceil(s.pages.length / perDay));
        expect(sortedUnique(days.flat())).toEqual(sortedUnique(s.pages));
      }),
      { numRuns: runs(200) },
    );
  });

  it('continues day to day: each day starts where the day before ended (wrapping), across DST changes, in every zone', () => {
    fc.assert(
      fc.property(
        zoneArb,
        memorizedSetArb,
        fc.integer({ min: 1, max: 700 }),
        earlyAnchorArb,
        fc.nat({ max: 2000 }),
        fc.nat(),
        timeOfDayArb,
        (zone, pages, capacity, anchor, shift, pick, [h, m]) => {
          useZone(zone);
          const user = slidingUser({ zone, pages, capacity, anchor, shift });
          const mem = memorizedPages(pages);
          const sorted = sortedUnique(pages);
          const total = sorted.length;
          const perDay = Math.min(capacity, total);
          const start = dayOnSchedule(zone, pick, anchorDayOf(user));
          let prevPos: number | null = null;
          for (let i = 0; i < 8; i++) {
            const day = getPagesScheduledForDate(user, dayAt(start, i, h, m), mem);
            const pos = sorted.indexOf(day[0]);
            // The day is a run of the memorized pages in order, wrapping.
            expect(day).toEqual(Array.from({ length: perDay }, (_, k) => sorted[(pos + k) % total]));
            if (prevPos !== null) expect(pos).toBe((prevPos + perDay) % total);
            prevPos = pos;
          }
        },
      ),
      { numRuns: runs(300) },
    );
  });

  it('gives no pages before the anchor’s day, and pages from its first minute', () => {
    fc.assert(
      fc.property(slidingArb, fc.integer({ min: 1, max: 800 }), timeOfDayArb, (s, k, [h, m]) => {
        useZone(s.zone);
        const user = slidingUser(s);
        const mem = memorizedPages(s.pages);
        const anchorDay = anchorDayOf(user);
        expect(getPagesScheduledForDate(user, dayAt(anchorDay, -k, h, m), mem)).toEqual([]);
        expect(getPagesScheduledForDate(user, dayAt(anchorDay, -1, 23, 59), mem)).toEqual([]);
        expect(getPagesScheduledForDate(user, anchorDay, mem).length).toBeGreaterThan(0);
      }),
      { numRuns: runs(300) },
    );
  });

  it('is what the plan editor shows: buildDefaultPlanDays(today) = the live days from today', () => {
    fc.assert(
      fc.property(slidingArb, fc.nat({ max: 1200 }), timeOfDayArb, (s, n, [h, m]) => {
        useZone(s.zone);
        const user = slidingUser(s);
        const mem = memorizedPages(s.pages);
        const today = dayAt(anchorDayOf(user), n, h, m);
        const shown = buildDefaultPlanDays(user, mem, 'forward', today);
        expect(scheduledDaysFrom(user, mem, today, shown.length)).toEqual(shown);
      }),
      { numRuns: runs(200) },
    );
  });
});

const customArb = fc
  .record({ zone: zoneArb, pages: memorizedSetArb, start: dayIndexArb, shift: fc.oneof(fc.constant(0), fc.nat({ max: 2000 })) })
  .chain((r) => planDaysArb(r.pages.slice(0, 60)).map((days) => ({ ...r, days })));
type Custom = { zone: string; pages: number[]; start: number; shift: number; days: number[][] };
const customUser = (c: Custom): User =>
  userWith({ customPlan: customPlan(c.days, dayOf(dayFromIndex(c.start))), scheduleShiftPages: c.shift });

/** A plan holding each page at most once (some days off). */
const distinctPlanArb = fc
  .record({
    pages: fc.uniqueArray(fc.integer({ min: 1, max: 604 }), { minLength: 1, maxLength: 60 }),
    cuts: fc.array(fc.nat({ max: 60 }), { maxLength: 12 }),
    start: dayIndexArb,
  })
  .map(({ pages, cuts, start }) => {
    const points = [...cuts.map((c) => c % (pages.length + 1)), pages.length].sort((a, b) => a - b);
    const days: number[][] = [];
    let from = 0;
    for (const to of points) {
      days.push(pages.slice(from, to));
      from = to;
    }
    return { days, start };
  });

describe('[SCHED-3] [SCHED-6] custom plan', () => {
  it('loops with period days.length from its start, and gives nothing before it', () => {
    fc.assert(
      fc.property(customArb, fc.nat({ max: 900 }), fc.integer({ min: 1, max: 400 }), timeOfDayArb, (c, j, k, [h, m]) => {
        useZone(c.zone);
        const user = customUser(c);
        const mem = memorizedPages(c.pages);
        const start = parseDay(user.customPlan!.cycleStartDate);
        const n = c.days.length;
        expect(getPagesScheduledForDate(user, dayAt(start, j + n, h, m), mem)).toEqual(
          getPagesScheduledForDate(user, dayAt(start, j), mem),
        );
        expect(getPagesScheduledForDate(user, dayAt(start, -k, h, m), mem)).toEqual([]);
      }),
      { numRuns: runs(300) },
    );
  });

  it('with no shift, day j is days[j mod n]', () => {
    fc.assert(
      fc.property(customArb, fc.nat({ max: 900 }), timeOfDayArb, (c, j, [h, m]) => {
        useZone(c.zone);
        const user = customUser({ ...c, shift: 0 });
        const start = parseDay(user.customPlan!.cycleStartDate);
        expect(getPagesScheduledForDate(user, dayAt(start, j, h, m), memorizedPages(c.pages))).toEqual(
          c.days[j % c.days.length],
        );
      }),
      { numRuns: runs(300) },
    );
  });

  it('with a shift of k keeps every day’s size, and one cycle reads the plan’s pages k earlier', () => {
    fc.assert(
      fc.property(customArb, fc.nat({ max: 50 }), (c, cycles) => {
        useZone(c.zone);
        const user = customUser(c);
        const mem = memorizedPages(c.pages);
        const n = c.days.length;
        // Any whole cycle from the start (cycles later) reads the same.
        const first = dayAt(parseDay(user.customPlan!.cycleStartDate), cycles * n);
        const cycle = scheduledDaysFrom(user, mem, first, n);
        expect(cycle.map((d) => d.length)).toEqual(c.days.map((d) => d.length));
        const flat = c.days.flat();
        expect(cycle.flat()).toEqual(flat.length ? rotateBack(flat, c.shift) : []);
      }),
      { numRuns: runs(300) },
    );
  });

  it('with a shift, never puts a page twice on one day when the plan holds each page once', () => {
    fc.assert(
      fc.property(distinctPlanArb, fc.nat({ max: 2000 }), fc.nat({ max: 400 }), zoneArb, ({ days, start }, shift, j, zone) => {
        useZone(zone);
        const user = userWith({ customPlan: customPlan(days, dayOf(dayFromIndex(start))), scheduleShiftPages: shift });
        const pages = getPagesScheduledForDate(user, dayAt(parseDay(user.customPlan!.cycleStartDate), j), memorizedPages(days.flat()));
        expect(isUnique(pages)).toBe(true);
      }),
      { numRuns: runs(300) },
    );
  });

  // KNOWN BUG: a carry-over shift ("Keep daily amount") reads each day as a
  // window over the plan's flat page sequence (algorithm.shiftedCycleDay).
  // When the plan has a page on two neighbouring days (a page shared by the
  // surah ending one day and the surah starting the next, or a page the user
  // put on both), a shifted window can cover both copies: that day holds the
  // page twice, and the next cycle shows it twice in the session.
  // Minimal: custom plan [[1,2],[2,3]] (no day repeats a page), shift 1. Day 1
  // of the cycle. Expected: no page twice. Actual: [2, 2].
  it.failing('KNOWN BUG: with a shift, never puts a page twice on one day (plans may repeat a page on different days)', () => {
    fc.assert(
      fc.property(customArb, fc.nat({ max: 900 }), (c, j) => {
        useZone(c.zone);
        const user = customUser(c);
        const pages = getPagesScheduledForDate(user, dayAt(parseDay(user.customPlan!.cycleStartDate), j), memorizedPages(c.pages));
        expect(isUnique(pages)).toBe(true);
      }),
      {
        numRuns: runs(300),
        endOnFailure: true,
        examples: [[{ zone: 'UTC', pages: [1, 2, 3], start: 0, shift: 1, days: [[1, 2], [2, 3]] }, 1]],
      },
    );
  });

  it.failing('KNOWN BUG example: one leftover carried with Keep daily amount; next cycle a day shows page 582 twice', () => {
    const plan = customPlan([[1, 2, 3], [580, 581, 582], [582, 583, 584]], '2026-10-15');
    const user = userWith({ customPlan: plan });
    const mem = memorizedPages([1, 2, 3, 580, 581, 582, 583, 584]);
    // Oct 16 = [580, 581, 582], only 580 revised; Oct 17 carries [581] (582 is on Oct 17 already).
    const oct17 = new Date(2026, 9, 17);
    const log = session('2026-10-16', [580], { assignedPages: [580, 581, 582] });
    const leftovers = findLeftoverPages([log], '2026-10-17', getPagesForDay(user, oct17, mem), new Set(mem.map((p) => p.pageNumber)));
    expect(leftovers).toEqual([581]);
    const carried = applyCarryOver(user, mem, leftovers, oct17);
    // Oct 20 is the same plan day as Oct 17, a cycle later.
    const oct20 = getPagesForDay(carried, new Date(2026, 9, 20), mem);
    expect(oct20).toEqual([...new Set(oct20)]);
  });

  it('opens in the editor on today’s day: rotateCustomPlanToToday = the live days from today', () => {
    fc.assert(
      fc.property(customArb, fc.nat({ max: 900 }), timeOfDayArb, (c, j, [h, m]) => {
        useZone(c.zone);
        const user = customUser({ ...c, shift: 0 });
        const today = dayAt(parseDay(user.customPlan!.cycleStartDate), j, h, m);
        const shown = rotateCustomPlanToToday(user.customPlan!, today);
        expect(scheduledDaysFrom(user, memorizedPages(c.pages), today, shown.length)).toEqual(shown);
      }),
      { numRuns: runs(300) },
    );
  });
});

describe('[SCHED-5] moving the schedule', () => {
  it('shiftScheduleAnchor(δ) moves every day’s pages δ days later (automatic and custom), DST or not', () => {
    fc.assert(
      fc.property(
        fc.oneof(slidingArb.map((s) => ({ s, c: null })), customArb.map((c) => ({ s: null, c }))),
        fc.integer({ min: -60, max: 60 }),
        fc.integer({ min: -30, max: 900 }),
        timeOfDayArb,
        ({ s, c }, delta, j, [h, m]) => {
          const zone = (s ?? c)!.zone;
          useZone(zone);
          const user = s ? slidingUser(s) : customUser(c!);
          const mem = memorizedPages((s ?? c)!.pages);
          const moved = shiftScheduleAnchor(user, delta);
          const day = dayAt(scheduleStartDay(user), j, h, m);
          expect(getPagesScheduledForDate(moved, dayAt(day, delta, h, m), mem)).toEqual(
            getPagesScheduledForDate(user, day, mem),
          );
          expect(calendarDaysBetween(scheduleStartDay(user), scheduleStartDay(moved))).toBe(delta);
        },
      ),
      { numRuns: runs(300) },
    );
  });

  it('scheduleStartingByToday starts a future schedule today, and leaves a started one alone', () => {
    fc.assert(
      fc.property(slidingArb, fc.integer({ min: -400, max: 400 }), timeOfDayArb, (s, n, [h, m]) => {
        useZone(s.zone);
        const user = slidingUser(s);
        const mem = memorizedPages(s.pages);
        const today = dayAt(anchorDayOf(user), n, h, m);
        const moved = scheduleStartingByToday(user, today);
        if (n >= 0) {
          expect(moved).toBeNull();
        } else {
          expect(moved).not.toBeNull();
          expect(calendarDaysBetween(scheduleStartDay(moved!), today)).toBe(0);
          expect(getPagesScheduledForDate(moved!, today, mem).length).toBeGreaterThan(0);
        }
      }),
      { numRuns: runs(300) },
    );
  });
});

describe('[SCHED-2] juz mode', () => {
  const juzArb = fc.record({
    zone: zoneArb,
    pages: memorizedSetArb,
    juzPerDay: fc.integer({ min: 1, max: 31 }),
    anchor: instantArb,
  });
  type Juz = { zone: string; pages: number[]; juzPerDay: number; anchor: number };
  const juzUser = (j: Juz, shift = 0): User =>
    userWith({
      scheduleMode: 'juz',
      dailyJuzCount: j.juzPerDay,
      scheduleAnchorDate: new Date(j.anchor).toISOString(),
      scheduleShiftPages: shift,
    });

  it('gives each day exactly the memorized pages of that day’s juz slot, and every juz comes round', () => {
    fc.assert(
      fc.property(juzArb, fc.nat({ max: 1000 }), timeOfDayArb, (j, n, [h, m]) => {
        useZone(j.zone);
        const user = juzUser(j);
        const mem = memorizedPages(j.pages);
        const juzList = sortedUnique(j.pages.map(juzKeyForPage));
        const L = juzList.length;
        const per = Math.max(1, Math.min(j.juzPerDay, L));
        const first = dayAt(anchorDayOf(user), n, h, m);
        const seen = new Map<number, number>();
        const cycleLength = L / gcd(L, per);
        for (let i = 0; i < cycleLength; i++) {
          const slot = Array.from({ length: per }, (_, t) => juzList[((n + i) * per + t) % L]);
          const pages = getPagesScheduledForDate(user, dayAt(first, i, h, m), mem);
          expect(isUnique(pages)).toBe(true);
          expect(pages.every((p) => slot.includes(juzKeyForPage(p)))).toBe(true);
          expect(sortedUnique(pages)).toEqual(sortedUnique(j.pages.filter((p) => slot.includes(juzKeyForPage(p)))));
          for (const juz of slot) seen.set(juz, (seen.get(juz) ?? 0) + 1);
        }
        // Over one cycle every juz holding memorized pages comes round, each equally often.
        expect([...seen.keys()].sort((a, b) => a - b)).toEqual(juzList);
        expect(new Set(seen.values()).size).toBe(1);
        expect(seen.get(juzList[0])).toBe(per / gcd(L, per));
      }),
      { numRuns: runs(80) },
    );
  });

  it('with a shift of k keeps every day’s size, and one cycle reads its pages k earlier', () => {
    fc.assert(
      fc.property(juzArb, fc.nat({ max: 3000 }), fc.nat({ max: 20 }), (j, shift, cycles) => {
        useZone(j.zone);
        const mem = memorizedPages(j.pages);
        const plain = juzUser(j);
        const shifted = juzUser(j, shift);
        const juzList = sortedUnique(j.pages.map(juzKeyForPage));
        const per = Math.max(1, Math.min(j.juzPerDay, juzList.length));
        const cycleLength = juzList.length / gcd(juzList.length, per);
        const first = dayAt(anchorDayOf(plain), cycles * cycleLength);
        const before = scheduledDaysFrom(plain, mem, first, cycleLength);
        const after = scheduledDaysFrom(shifted, mem, first, cycleLength);
        expect(after.map((d) => d.length)).toEqual(before.map((d) => d.length));
        expect(after.flat()).toEqual(rotateBack(before.flat(), shift));
        // A juz's pages come round once per turn of the juz list, so no shifted day repeats a page.
        expect(after.every(isUnique)).toBe(true);
      }),
      { numRuns: runs(40) },
    );
  });
});

describe('[SCHED-4] plan builders, forward and reverse', () => {
  it('balanced from a start page: both directions hold every memorized page once, in days of at most the quota', () => {
    fc.assert(
      fc.property(memorizedSetArb, fc.integer({ min: 1, max: 700 }), fc.option(fc.integer({ min: 1, max: 604 })), (pages, perDay, startPage) => {
        const forward = buildBalancedPlanFromStart(pages, { pagesPerDay: perDay, startPage, direction: 'forward' });
        const reverse = buildBalancedPlanFromStart(pages, { pagesPerDay: perDay, startPage, direction: 'reverse' });
        for (const plan of [forward, reverse]) {
          expect(isUnique(plan.flat())).toBe(true);
          expect(sortedUnique(plan.flat())).toEqual(sortedUnique(pages));
          expect(plan.every((d) => d.length >= 1 && d.length <= perDay)).toBe(true);
          const sizes = plan.map((d) => d.length);
          expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        }
        expect(reverse.length).toBe(forward.length);
      }),
      { numRuns: runs(300) },
    );
  });

  it('by juz: both directions hold the same pages, each once', () => {
    fc.assert(
      fc.property(memorizedSetArb, fc.integer({ min: 1, max: 30 }), fc.option(fc.integer({ min: 1, max: 604 })), (pages, juzPerDay, startPage) => {
        const mem = memorizedPages(pages);
        const forward = buildJuzPlanFromStart(mem, { juzPerDay, startPage, direction: 'forward' });
        const reverse = buildJuzPlanFromStart(mem, { juzPerDay, startPage, direction: 'reverse' });
        expect(isUnique(forward.flat())).toBe(true);
        expect(isUnique(reverse.flat())).toBe(true);
        expect(sortedUnique(forward.flat())).toEqual(sortedUnique(pages));
        expect(sortedUnique(reverse.flat())).toEqual(sortedUnique(pages));
        expect(reverse.length).toBe(forward.length);
      }),
      { numRuns: runs(300) },
    );
  });

  it('auto-balance and the default plan: both directions cover the same pages in the same number of days', () => {
    fc.assert(
      fc.property(slidingArb, fc.nat({ max: 600 }), (s, n) => {
        useZone(s.zone);
        const user = slidingUser({ ...s, shift: 0 });
        const mem = memorizedPages(s.pages);
        const today = dayAt(anchorDayOf(user), n);
        for (const build of [
          (dir: 'forward' | 'reverse') => buildAutoBalancePlanDays(user, mem, dir),
          (dir: 'forward' | 'reverse') => buildDefaultPlanDays(user, mem, dir, today),
        ]) {
          const forward = build('forward');
          const reverse = build('reverse');
          expect(sortedUnique(reverse.flat())).toEqual(sortedUnique(forward.flat()));
          expect(sortedUnique(forward.flat())).toEqual(sortedUnique(s.pages));
          expect(reverse.map((d) => d.length)).toEqual(forward.map((d) => d.length));
        }
      }),
      { numRuns: runs(200) },
    );
  });
});

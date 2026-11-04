// Revising ahead (lib/aheadCredit, lib/aheadPlan): sessions that do later days'
// pages, their `ahead` credit, merging and removing it, Keep going, and the days
// done ahead.

import fc from 'fast-check';
import { getPagesForDay } from '../../../src/lib/algorithm';
import {
  aheadCreditFor,
  aheadWithin,
  creditIndex,
  creditedOnDay,
  mergeAhead,
  removeAheadPages,
} from '../../../src/lib/aheadCredit';
import { daysDoneAhead, nextRevisionDayPlan, revisionDayAfter, revisionDayPlan } from '../../../src/lib/aheadPlan';
import { removeRevisedPages } from '../../../src/lib/revisionSession';
import type { RevisionLog, User, UserPage } from '../../../src/types';
import { addDays, dayOf } from '../harness/clock';
import {
  customPlan,
  dayFromIndex,
  memorizedPages,
  parseDay,
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
type Ahead = Record<string, number[]>;

// ---------------------------------------------------------------------------
// A schedule (small, so days repeat within a few weeks) and sessions on it.

type World = { zone: string; user: User; pages: UserPage[]; startDay: string };

const worldArb: fc.Arbitrary<World> = fc
  .record({
    zone: zoneArb,
    n: fc.integer({ min: 1, max: 30 }),
    capacity: fc.integer({ min: 1, max: 8 }),
    custom: fc.boolean(),
    start: fc.integer({ min: 0, max: 900 }),
    shift: fc.oneof(fc.constant(0), fc.nat({ max: 40 })),
  })
  .chain((r) => planDaysArb(range(1, r.n)).map((days) => ({ ...r, days })))
  .map((r) => {
    useZone(r.zone);
    const startDay = dayOf(dayFromIndex(r.start));
    const user = userWith(
      r.custom
        ? { customPlan: customPlan(r.days, startDay), scheduleShiftPages: r.shift }
        : {
            dailyPageCapacity: r.capacity,
            scheduleAnchorDate: new Date(parseDay(startDay).getTime() + 12 * 3_600_000).toISOString(),
            scheduleShiftPages: r.shift,
          },
    );
    return { zone: r.zone, user, pages: memorizedPages(range(1, r.n)), startDay };
  });

type Plan = { day: string; pages: number[] };

/** One session as ActiveRevisionScreen makes it: today, `keepGoing` more days, some pages revised. */
function makeSession(w: World, day: string, keepGoing: number, pick: boolean[], logs: RevisionLog[]) {
  const sections: Plan[] = [{ day, pages: getPagesForDay(w.user, parseDay(day), w.pages) }];
  for (let i = 0; i < keepGoing; i++) {
    const taken = new Set(sections.flatMap((s) => s.pages));
    const plan = nextRevisionDayPlan(w.user, w.pages, sections[sections.length - 1].day, taken, logs);
    if (!plan) break;
    sections.push(plan);
  }
  const sessionPages = sections.flatMap((s) => s.pages);
  const pageDays = new Map<number, string>();
  for (const s of sections) for (const p of s.pages) pageDays.set(p, s.day);
  // Revised pages are a set on the revision screen (completedPages).
  const revised = [...new Set(sessionPages.filter((_, i) => pick[i % pick.length]))];
  const ahead = aheadWithin(aheadCreditFor(pageDays, revised, day), revised);
  const log = session(day, revised, { assignedPages: sections[0].pages, ...(Object.keys(ahead).length ? { ahead } : {}) });
  return { log, sections };
}

const sessionSpecArb = fc.record({
  dayOffset: fc.integer({ min: 0, max: 40 }),
  keepGoing: fc.integer({ min: 0, max: 4 }),
  pick: fc.array(fc.boolean(), { minLength: 1, maxLength: 16 }),
});

/** A world and a run of sessions on it (days in any order, each made with the logs so far). */
const historyArb = fc.tuple(worldArb, fc.array(sessionSpecArb, { minLength: 1, maxLength: 6 })).map(([w, specs]) => {
  useZone(w.zone);
  const logs: RevisionLog[] = [];
  const made: { log: RevisionLog; sections: Plan[] }[] = [];
  for (const s of specs) {
    const m = makeSession(w, addDays(w.startDay, s.dayOffset), s.keepGoing, s.pick, logs);
    logs.push(m.log);
    made.push(m);
  }
  return { w, logs, made };
});

// ---------------------------------------------------------------------------

describe('[AHEAD-5] [AHEAD-2] a session’s ahead credit', () => {
  it('credits each revised page to exactly one day, and only pages the session revised', () => {
    fc.assert(
      fc.property(historyArb, ({ w, logs }) => {
        useZone(w.zone);
        for (const log of logs) {
          const aheadPages = Object.values(log.ahead ?? {}).flat();
          // No page under two days, none twice under one.
          expect(new Set(aheadPages).size).toBe(aheadPages.length);
          // Every credited page was revised in this session.
          expect(aheadPages.every((p) => log.pagesRevised.includes(p))).toBe(true);
          // The rest of pagesRevised counts for the session's own day: one day each.
          const own = log.pagesRevised.filter((p) => !aheadPages.includes(p));
          expect(own.length + aheadPages.length).toBe(log.pagesRevised.length);
        }
      }),
      { numRuns: runs(300) },
    );
  });

  it('credits only days after the session’s own day (and never with an empty list)', () => {
    fc.assert(
      fc.property(historyArb, ({ w, logs }) => {
        useZone(w.zone);
        for (const log of logs) {
          for (const [day, pages] of Object.entries(log.ahead ?? {})) {
            expect(day > log.date).toBe(true);
            expect(pages.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: runs(300) },
    );
  });

  it('credits a page to the day it was shown under in the session', () => {
    fc.assert(
      fc.property(historyArb, ({ w, made }) => {
        useZone(w.zone);
        for (const { log, sections } of made) {
          for (const [day, pages] of Object.entries(log.ahead ?? {})) {
            const section = sections.find((s) => s.day === day);
            expect(section).toBeDefined();
            expect(pages.every((p) => section!.pages.includes(p))).toBe(true);
          }
        }
      }),
      { numRuns: runs(200) },
    );
  });
});

// Arbitrary ahead maps too, beyond what sessions make.
const dayKeyArb = fc.integer({ min: 0, max: 6 }).map((d) => addDays('2026-03-28', d));
const aheadArb: fc.Arbitrary<Ahead> = fc.dictionary(dayKeyArb, fc.uniqueArray(fc.integer({ min: 1, max: 15 }), { minLength: 1, maxLength: 6 }), {
  maxKeys: 4,
});
const asSets = (a: Ahead) =>
  Object.fromEntries(
    Object.entries(a)
      .map(([d, ps]) => [d, [...new Set(ps)].sort((x, y) => x - y)] as const)
      .sort(([x], [y]) => (x < y ? -1 : 1)),
  );
const pairs = (a: Ahead) => new Set(Object.entries(a).flatMap(([d, ps]) => ps.map((p) => `${d}:${p}`)));

describe('[AHEAD-2] merging and removing ahead credit', () => {
  it('mergeAhead is idempotent (m ∪ m = m, a ∪ nothing = a)', () => {
    fc.assert(
      fc.property(aheadArb, aheadArb, (a, b) => {
        const m = mergeAhead(a, b);
        expect(mergeAhead(m, m)).toEqual(m);
        expect(mergeAhead(m, b)).toEqual(m);
        expect(mergeAhead(a, undefined)).toEqual(a);
        expect(mergeAhead(undefined, a)).toEqual(a);
      }),
      { numRuns: runs(300) },
    );
  });

  it('mergeAhead is commutative on the sets and associative', () => {
    fc.assert(
      fc.property(aheadArb, aheadArb, aheadArb, (a, b, c) => {
        expect(asSets(mergeAhead(a, b))).toEqual(asSets(mergeAhead(b, a)));
        expect(mergeAhead(mergeAhead(a, b), c)).toEqual(mergeAhead(a, mergeAhead(b, c)));
        expect(pairs(mergeAhead(a, b))).toEqual(new Set([...pairs(a), ...pairs(b)]));
      }),
      { numRuns: runs(300) },
    );
  });

  it('removeAheadPages(merge(a, b), P) removes all of P, keeps everything else, and drops days left empty', () => {
    fc.assert(
      fc.property(aheadArb, aheadArb, fc.uniqueArray(fc.integer({ min: 1, max: 15 }), { maxLength: 8 }), (a, b, P) => {
        const out = removeAheadPages(mergeAhead(a, b), P);
        const all = Object.values(out).flat();
        expect(all.some((p) => P.includes(p))).toBe(false);
        expect(Object.values(out).every((ps) => ps.length > 0)).toBe(true);
        const want = [...pairs(mergeAhead(a, b))].filter((k) => !P.includes(Number(k.split(':')[1])));
        expect(pairs(out)).toEqual(new Set(want));
      }),
      { numRuns: runs(300) },
    );
  });

  it('removeRevisedPages drops the pages from pagesRevised and from every ahead day, and keeps the rest in order', () => {
    fc.assert(
      fc.property(historyArb, fc.nat(), fc.array(fc.boolean(), { minLength: 1, maxLength: 16 }), ({ w, logs }, which, pick) => {
        useZone(w.zone);
        const log = logs[which % logs.length];
        const P = log.pagesRevised.filter((_, i) => pick[i % pick.length]);
        const out = removeRevisedPages(log, P);
        expect(out.pagesRevised).toEqual(log.pagesRevised.filter((p) => !P.includes(p)));
        expect(Object.values(out.ahead ?? {}).flat().some((p) => P.includes(p))).toBe(false);
        if (log.ahead) expect(out.ahead).toEqual(removeAheadPages(log.ahead, P));
        else expect('ahead' in out).toBe(false);
        // Credit stays within what the session revised.
        expect(Object.values(out.ahead ?? {}).flat().every((p) => out.pagesRevised.includes(p))).toBe(true);
        // Nothing else changes.
        expect({ ...out, pagesRevised: null, ahead: null }).toEqual({ ...log, pagesRevised: null, ahead: null });
      }),
      { numRuns: runs(300) },
    );
  });
});

// ---------------------------------------------------------------------------
// Keep going and the days done ahead.

/** nextRevisionDayPlan as its comment describes it, walking the days one by one. */
function nextPlanByRule(w: World, after: string, taken: ReadonlySet<number>, logs: RevisionLog[]): Plan | null {
  for (let delta = 1; delta <= 400; delta++) {
    const day = addDays(after, delta);
    const pages = getPagesForDay(w.user, parseDay(day), w.pages);
    if (pages.length === 0) continue; // an off day
    if (pages.some((p) => taken.has(p))) return null; // come round again
    // The pages not done yet (#198): a partly done day goes on from there; a day done ahead is passed over.
    const credited = creditedOnDay(logs, day);
    const left = pages.filter((p) => !credited.has(p));
    if (left.length === 0) continue;
    return { day, pages: left };
  }
  return null;
}

const keepGoingArb = fc.tuple(historyArb, fc.integer({ min: -5, max: 45 }), fc.uniqueArray(fc.integer({ min: 1, max: 30 }), { maxLength: 10 }));

describe('[AHEAD-3] [AHEAD-4] Keep going (nextRevisionDayPlan)', () => {
  it('is a later day, with that day’s pages not done yet (revisionDayPlan), in order, none of them taken', () => {
    fc.assert(
      fc.property(keepGoingArb, ([{ w, logs }, afterOffset, takenList]) => {
        useZone(w.zone);
        const after = addDays(w.startDay, afterOffset);
        const taken = new Set(takenList);
        const plan = nextRevisionDayPlan(w.user, w.pages, after, taken, logs);
        fc.pre(plan !== null);
        expect(plan!.day > after).toBe(true);
        expect(plan!.pages).toEqual(revisionDayPlan(w.user, w.pages, plan!.day, logs).pages);
        expect(plan!.pages.length).toBeGreaterThan(0);
        expect(plan!.pages.some((p) => taken.has(p))).toBe(false);
        const credited = creditIndex(logs).get(plan!.day) ?? new Set<number>();
        expect(plan!.pages.some((p) => credited.has(p))).toBe(false);
        // The rest of that day, in the day's order.
        const day = getPagesForDay(w.user, parseDay(plan!.day), w.pages);
        expect(plan!.pages).toEqual(day.filter((p) => !credited.has(p)));
      }),
      { numRuns: runs(300) },
    );
  });

  it('passes over only off days and days done ahead, and is null exactly when the next such day overlaps what is taken', () => {
    fc.assert(
      fc.property(keepGoingArb, ([{ w, logs }, afterOffset, takenList]) => {
        useZone(w.zone);
        const after = addDays(w.startDay, afterOffset);
        const taken = new Set(takenList);
        expect(nextRevisionDayPlan(w.user, w.pages, after, taken, logs)).toEqual(nextPlanByRule(w, after, taken, logs));
      }),
      { numRuns: runs(300) },
    );
  });

  it('followed from today to the end, never repeats a page, moves forward, and stops within one cycle', () => {
    fc.assert(
      fc.property(historyArb, fc.integer({ min: 0, max: 45 }), ({ w, logs }, todayOffset) => {
        useZone(w.zone);
        const today = addDays(w.startDay, todayOffset);
        const todays = getPagesForDay(w.user, parseDay(today), w.pages);
        const taken = new Set(todays);
        let last = today;
        let steps = 0;
        for (;;) {
          const plan = nextRevisionDayPlan(w.user, w.pages, last, taken, logs);
          if (!plan) break;
          expect(plan.day > last).toBe(true);
          // None of its pages was on an earlier day of the session.
          expect(plan.pages.some((p) => taken.has(p))).toBe(false);
          for (const p of plan.pages) taken.add(p);
          last = plan.day;
          steps++;
          // Every day of the chain holds new pages, so it ends before the pages run out.
          expect(steps).toBeLessThanOrEqual(w.pages.length);
        }
      }),
      { numRuns: runs(200) },
    );
  });

  it('the day after is the next calendar day (revisionDayAfter)', () => {
    fc.assert(
      fc.property(zoneArb, fc.integer({ min: 0, max: 1095 }), (zone, i) => {
        useZone(zone);
        const day = dayOf(dayFromIndex(i));
        expect(revisionDayAfter(day)).toBe(addDays(day, 1));
      }),
      { numRuns: runs(200) },
    );
  });
});

describe('[AHEAD-2] [SESS-2] days done ahead', () => {
  it('holds exactly the credited-ahead days whose scheduled pages were all credited', () => {
    fc.assert(
      fc.property(historyArb, ({ w, logs }) => {
        useZone(w.zone);
        const done = daysDoneAhead(w.user, w.pages, logs);
        const index = creditIndex(logs);
        const aheadDays = new Set(logs.flatMap((l) => Object.keys(l.ahead ?? {})));
        for (const day of done) {
          const pages = getPagesForDay(w.user, parseDay(day), w.pages);
          expect(pages.length).toBeGreaterThan(0);
          expect(pages.every((p) => index.get(day)?.has(p))).toBe(true);
        }
        for (const day of aheadDays) {
          const pages = getPagesForDay(w.user, parseDay(day), w.pages);
          const all = pages.length > 0 && pages.every((p) => index.get(day)?.has(p));
          expect(done.has(day)).toBe(all);
        }
        expect([...done].every((d) => aheadDays.has(d))).toBe(true);
      }),
      { numRuns: runs(300) },
    );
  });
});

// Activity's calendar marks (ACT-3) and Insights (ACT-4), from lib/activityInsights.

import fc from 'fast-check';
import { consistency, coverage, dayMarks, lastRevisedByPage, pace, PACE_MIN_ITEMS } from '../../../src/lib/activityInsights';
import { runs } from './fixtures';

const TODAY = '2026-11-10';
const dayArb = fc.integer({ min: 0, max: 60 }).map((n) => new Date(Date.parse('2026-10-01T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10));
const pagesArb = fc.uniqueArray(fc.integer({ min: 1, max: 604 }), { minLength: 0, maxLength: 20 });
const revisedArb = fc.record({ day: dayArb, countsFor: dayArb, pages: pagesArb, minutes: fc.option(fc.integer({ min: 0, max: 200 }), { nil: null }) });

describe('the calendar marks (ACT-3)', () => {
  it('[ACT-3] the ring is a share between 0 and 1 (none without assigned pages); memorized and read dots follow the items of that day', () => {
    fc.assert(
      fc.property(fc.array(revisedArb, { maxLength: 8 }), dayArb, fc.array(dayArb, { maxLength: 4 }), (revised, day, memDays) => {
        const memorized = memDays.map((d) => ({ day: d, pages: [1] }));
        const m = dayMarks(day, { revised, memorized, read: [], noteDays: new Set() });
        if (m.ring != null) expect(m.ring).toBeGreaterThanOrEqual(0);
        if (m.ring != null) expect(m.ring).toBeLessThanOrEqual(1);
        expect(m.memorized).toBe(memDays.includes(day));
        expect(m.read).toBe(false);
      }),
      { numRuns: runs(200) },
    );
  });
});

describe('the Insights (ACT-4)', () => {
  it('[ACT-4] coverage is a share, and a longer window never covers less', () => {
    fc.assert(
      fc.property(fc.array(revisedArb, { maxLength: 12 }), pagesArb, (revised, memo) => {
        const memorized = new Set(memo);
        const last = lastRevisedByPage(revised, TODAY);
        const c7 = coverage(memorized, last, TODAY, 7);
        const c30 = coverage(memorized, last, TODAY, 30);
        expect(c7).toBeGreaterThanOrEqual(0);
        expect(c30).toBeLessThanOrEqual(1);
        expect(c30).toBeGreaterThanOrEqual(c7);
      }),
      { numRuns: runs(200) },
    );
  });

  it('[ACT-4] consistency counts each day once, and the weekday counts add up to the days', () => {
    fc.assert(
      fc.property(fc.array(dayArb, { maxLength: 30 }), (days) => {
        const c = consistency(days.map((day) => ({ day })), TODAY, 30);
        expect(c.perWeekday.reduce((a, b) => a + b, 0)).toBe(c.days);
        expect(c.days).toBeLessThanOrEqual(30);
      }),
      { numRuns: runs(200) },
    );
  });

  it(`[ACT-4] pace is shown only from ${PACE_MIN_ITEMS} timed items`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: PACE_MIN_ITEMS + 5 }), (n) => {
        const items = Array.from({ length: n }, () => ({ day: TODAY, pages: [1], minutes: 5 }));
        expect(pace(items, TODAY, 30) === null).toBe(n < PACE_MIN_ITEMS);
      }),
      { numRuns: runs(100) },
    );
  });
});

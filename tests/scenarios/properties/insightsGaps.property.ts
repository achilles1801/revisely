// Insights' Gaps (ACT-28), from lib/insightsGaps: what holds for any history of revision days.

import fc from 'fast-check';
import { gapsView, LONG_GAP_DAYS, STRIP_MAX_DAYS } from '../../../src/lib/insightsGaps';
import { runs } from './fixtures';

const TODAY = '2026-11-15';
const T = Date.parse(`${TODAY}T00:00:00Z`) / 86_400_000;
const dayOf = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
const num = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;
// Up to 400 days back, a day with pages or without (an item whose pages were all skipped).
const itemArb = fc.record({ back: fc.integer({ min: 0, max: 400 }), pages: fc.boolean() }).map(({ back, pages }) => ({ day: dayOf(T - back), pages: pages ? [1] : [] }));
const windowArb = fc.constantFrom(7, 30, 90, 401);

describe('Gaps (ACT-28)', () => {
  it('[ACT-28] since the last revision is today minus the last day with a page revised; every gap is 2 days or more, the longest the longest', () => {
    fc.assert(
      fc.property(fc.array(itemArb, { maxLength: 40 }), windowArb, (items, window) => {
        const v = gapsView({ revised: items, today: TODAY, window });
        const days = [...new Set(items.filter((i) => i.pages.length > 0).map((i) => i.day))].sort();
        if (days.length === 0) {
          expect(v).toBeNull();
          return;
        }
        expect(v!.lastDay).toBe(days[days.length - 1]);
        expect(v!.sinceLast).toBe(T - num(days[days.length - 1]));
        for (const g of v!.gaps) {
          expect(g.days).toBeGreaterThanOrEqual(2);
          expect(g.long).toBe(g.days >= LONG_GAP_DAYS);
          expect(v!.longest!.days).toBeGreaterThanOrEqual(g.days);
        }
        expect(v!.longCount).toBe(v!.gaps.filter((g) => g.long).length);
        // The open gap is there exactly when two days or more have passed, and it is last.
        const open = v!.gaps.filter((g) => g.open);
        expect(open.length).toBe(v!.sinceLast >= 2 ? 1 : 0);
        if (open.length) expect(v!.gaps[v!.gaps.length - 1].open).toBe(true);
      }),
      { numRuns: runs(300) },
    );
  });

  it('[ACT-28] the strip ends today, draws at most half a year and marks exactly the revision days in it; the usual step is a step taken', () => {
    fc.assert(
      fc.property(fc.array(itemArb, { minLength: 1, maxLength: 40 }), windowArb, (items, window) => {
        const v = gapsView({ revised: items, today: TODAY, window });
        if (!v) return;
        const { days, revised } = v.strip;
        expect(days[days.length - 1]).toBe(TODAY);
        expect(days.length).toBeLessThanOrEqual(Math.min(window, STRIP_MAX_DAYS));
        const set = new Set(items.filter((i) => i.pages.length > 0).map((i) => i.day));
        days.forEach((d, i) => expect(revised[i]).toBe(set.has(d)));
        for (const p of v.strip.parts) {
          expect(p.from).toBeGreaterThanOrEqual(0);
          expect(p.to).toBeLessThan(days.length);
          expect(p.to).toBeGreaterThanOrEqual(p.from);
        }
        if (v.usual != null) {
          const sorted = [...set].sort().map(num);
          const steps = sorted.slice(1).map((d, i) => d - sorted[i]);
          expect(v.usual).toBeGreaterThanOrEqual(Math.min(...steps));
          expect(v.usual).toBeLessThanOrEqual(Math.max(...steps));
        }
      }),
      { numRuns: runs(300) },
    );
  });
});

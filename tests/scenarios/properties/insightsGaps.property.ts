// Insights' Gaps (ACT-28), from lib/insightsGaps, and Last revised (ACT-30), from lib/lastRevised: what holds for
// any history.

import fc from 'fast-check';
import { gapsView, LONG_GAP_DAYS, STRIP_MAX_DAYS } from '../../../src/lib/insightsGaps';
import { lastRevisedRows, type LastRevisedView } from '../../../src/lib/lastRevised';
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

describe('Last revised (ACT-30)', () => {
  it('[ACT-30] longest waiting first; a row is as recent as its least recently revised page; every memorized page is listed', () => {
    const lastArb = fc.dictionary(fc.integer({ min: 1, max: 604 }).map(String), fc.integer({ min: 0, max: 120 }));
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 604 }), { maxLength: 60 }), lastArb, fc.constantFrom('surah', 'juz', 'hizb', 'page') as fc.Arbitrary<LastRevisedView>, (memorized, ago, view) => {
        const rows = lastRevisedRows(view, {
          memorized,
          last: (p) => (ago[p] != null ? dayOf(T - ago[p]) : null),
          since: () => dayOf(T - 50),
          today: TODAY,
        });
        for (let i = 1; i < rows.length; i++) expect(rows[i - 1].oldest.wait).toBeGreaterThanOrEqual(rows[i].oldest.wait);
        for (const r of rows) for (const p of r.pages) expect(r.oldest.wait).toBeGreaterThanOrEqual(p.wait);
        const listed = new Set(rows.flatMap((r) => r.pages.map((p) => p.page)));
        expect(listed).toEqual(new Set(memorized));
        if (view === 'page') expect(rows.length).toBe(memorized.length);
      }),
      { numRuns: runs(200) },
    );
  });
});

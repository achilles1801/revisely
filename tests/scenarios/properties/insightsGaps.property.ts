// Insights' Gaps (ACT-28), from lib/insightsGaps, and Last revised (ACT-30), from lib/lastRevised: what holds for
// any history.

import fc from 'fast-check';
import { gapsNewestFirst, gapsView, MIN_GAP_DAYS, RED_FROM_DAYS } from '../../../src/lib/insightsGaps';
import { lastRevisedRows, matchesFilter, pageRecency, type LastRevisedFilter, type LastRevisedSort, type LastRevisedView, type PageRecency } from '../../../src/lib/lastRevised';
import { runs } from './fixtures';

const TODAY = '2026-11-15';
const T = Date.parse(`${TODAY}T00:00:00Z`) / 86_400_000;
const dayOf = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
const num = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;
// Up to 400 days back, a day with pages or without (an item whose pages were all skipped).
const itemArb = fc.record({ back: fc.integer({ min: 0, max: 400 }), pages: fc.boolean() }).map(({ back, pages }) => ({ day: dayOf(T - back), pages: pages ? [1] : [] }));
const windowArb = fc.constantFrom(7, 30, 90, 401);

describe('Gaps (ACT-28)', () => {
  it('[ACT-28] since the last revision is today minus the last day with a page revised; every gap is 2 days or more without one, the longest the longest', () => {
    fc.assert(
      fc.property(fc.array(itemArb, { maxLength: 40 }), windowArb, (items, window) => {
        const v = gapsView({ revised: items, today: TODAY, window });
        const set = new Set(items.filter((i) => i.pages.length > 0).map((i) => i.day));
        const days = [...set].sort();
        if (days.length === 0) {
          expect(v).toBeNull();
          return;
        }
        expect(v!.lastDay).toBe(days[days.length - 1]);
        expect(v!.sinceLast).toBe(T - num(days[days.length - 1]));
        for (const g of v!.gaps) {
          expect(g.days).toBeGreaterThanOrEqual(MIN_GAP_DAYS);
          expect(v!.longest!.days).toBeGreaterThanOrEqual(g.days);
          // A gap's days are exactly the days from its first to its last, none of them a revision day (the open one:
          // up to today, which it counts "so far").
          expect(num(g.last) - num(g.first) + 1).toBe(g.days);
          for (let d = num(g.first); d <= num(g.last); d++) expect(set.has(dayOf(d))).toBe(false);
          if (g.from) expect(num(g.first)).toBe(num(g.from) + 1);
          if (g.to) expect(num(g.last)).toBe(num(g.to) - 1);
          // It has a day in the range.
          expect(num(g.last)).toBeGreaterThanOrEqual(num(v!.rangeStart));
        }
        // The open gap is there exactly when two whole days have passed without a revision, and it is last.
        const open = v!.gaps.filter((g) => g.open);
        expect(open.length).toBe(v!.sinceLast >= RED_FROM_DAYS ? 1 : 0);
        if (open.length) expect(v!.gaps[v!.gaps.length - 1].open).toBe(true);
        // The list shows the open one first, then the latest first.
        const listed = gapsNewestFirst(v!.gaps);
        for (let i = 1; i < listed.length; i++) expect(listed[i].open).toBe(false);
        for (let i = 1; i < listed.length; i++) if (!listed[i - 1].open) expect(listed[i - 1].last > listed[i].last).toBe(true);
      }),
      { numRuns: runs(300) },
    );
  });

  it('[ACT-28] every run of 2 days or more without a revision between two revision days in the range is a gap; the usual step is a step taken', () => {
    fc.assert(
      fc.property(fc.array(itemArb, { minLength: 1, maxLength: 40 }), windowArb, (items, window) => {
        const v = gapsView({ revised: items, today: TODAY, window });
        if (!v) return;
        const sorted = [...new Set(items.filter((i) => i.pages.length > 0).map((i) => i.day))].sort().map(num);
        const expected = sorted
          .slice(1)
          .map((d, i) => ({ first: sorted[i] + 1, last: d - 1 }))
          .filter((g) => g.last - g.first + 1 >= MIN_GAP_DAYS && g.last >= num(v.rangeStart));
        expect(v.gaps.filter((g) => !g.open).map((g) => [num(g.first), num(g.last)])).toEqual(expected.map((g) => [g.first, g.last]));
        if (v.usual != null) {
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
  it('[ACT-30] longest waiting first, rows and the pages inside; a row is as recent as its least recently revised page; every memorized page is listed', () => {
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
        // Inside a row too, longest waiting first: the page that dates it is the first one shown.
        for (const r of rows) {
          expect(r.pages[0]).toBe(r.oldest);
          for (let i = 1; i < r.pages.length; i++) expect(r.pages[i - 1].wait).toBeGreaterThanOrEqual(r.pages[i].wait);
        }
        const listed = new Set(rows.flatMap((r) => r.pages.map((p) => p.page)));
        expect(listed).toEqual(new Set(memorized));
        if (view === 'page') expect(rows.length).toBe(memorized.length);
      }),
      { numRuns: runs(200) },
    );
  });

  it('[ACT-30] any sort and filter: rows and their pages in its order, each row dated by its oldest page shown and out of its total; exactly the memorized pages that pass are listed', () => {
    const lastArb = fc.dictionary(fc.integer({ min: 1, max: 604 }).map(String), fc.integer({ min: 0, max: 120 }));
    const views = fc.constantFrom('surah', 'juz', 'hizb', 'page') as fc.Arbitrary<LastRevisedView>;
    const sorts = fc.constantFrom('recent', 'waiting', 'mushaf') as fc.Arbitrary<LastRevisedSort>;
    const filters = fc.constantFrom('all', 'week', 'waiting', 'never') as fc.Arbitrary<LastRevisedFilter>;
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 604 }), { maxLength: 60 }), lastArb, fc.integer({ min: 0, max: 60 }), views, sorts, filters, (memorized, ago, memorizedAgo, view, sort, filter) => {
        const input = { memorized, last: (p: number) => (ago[p] != null ? dayOf(T - ago[p]) : null), since: () => dayOf(T - memorizedAgo), today: TODAY };
        const rows = lastRevisedRows(view, input, { sort, filter });
        const key = (p: PageRecency) => (sort === 'waiting' ? -p.wait : sort === 'recent' ? (p.state === 'dated' ? p.wait : Infinity) : 0);
        for (let i = 1; i < rows.length; i++) {
          const [a, b] = [rows[i - 1], rows[i]];
          expect(key(a.oldest) < key(b.oldest) || (key(a.oldest) === key(b.oldest) && a.number < b.number)).toBe(true);
        }
        const all = new Map(lastRevisedRows(view, input).map((r) => [r.number, r.pages.length]));
        for (const r of rows) {
          for (let i = 1; i < r.pages.length; i++) {
            const [a, b] = [r.pages[i - 1], r.pages[i]];
            expect(key(a) < key(b) || (key(a) === key(b) && a.page < b.page)).toBe(true);
          }
          expect(r.oldest.wait).toBe(Math.max(...r.pages.map((p) => p.wait)));
          expect(r.total).toBe(all.get(r.number));
        }
        const listed = new Set(rows.flatMap((r) => r.pages.map((p) => p.page)));
        expect(listed).toEqual(new Set(memorized.filter((p) => matchesFilter(pageRecency(p, input), filter))));
      }),
      { numRuns: runs(200) },
    );
  });
});

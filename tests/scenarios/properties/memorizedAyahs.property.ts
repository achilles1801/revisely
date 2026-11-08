// What is memorized, ayah by ayah (MEM-1 to MEM-3, lib/memorizedAyahs), and naming any ayahs
// (NAME-1, describeAyahs), over generated pages, ayahs and sittings, in both prints.

import fc from 'fast-check';
import { ayahsOfPages, ayahsOnPage } from '../../../src/lib/ayahKeys';
import {
  addAyahs,
  juzShares,
  memorizedAyahsOnPage,
  memorizedPageShare,
  pageShare,
  removeAyahs,
} from '../../../src/lib/memorizedAyahs';
import type { MushafEditionId } from '../../../src/lib/mushafEdition';
import { describeAyahs, describePagesToRevise, describePassage } from '../../../src/lib/passages';
import type { PageStatus, UserPage } from '../../../src/types';
import { getPagesScheduledForDate, generateDailyAssignment } from '../../../src/lib/algorithm';
import { ayahsToRevise, revisablePages } from '../../../src/lib/memorizedAyahs';
import { dayAt, memorizedPages, parseDay, runs, userWith } from './fixtures';

const NOW = '2026-11-03T13:40:00.000Z';
const editionArb = fc.constantFrom<MushafEditionId>('madani1405', 'madani1441');
const pageArb = fc.integer({ min: 1, max: 604 });

function page(pageNumber: number, status: PageStatus = 'not_memorized', verses?: number[]): UserPage {
  return { pageNumber, status, dateMemorized: null, weaknessRating: 4, lastRevisedDate: null, totalRevisionCount: 0, skipCount: 0, verses };
}

/** A page and a subset of its ayahs (by a mask over them), in a print. */
const subsetIn = (eds: fc.Arbitrary<MushafEditionId>) =>
  fc.tuple(pageArb, eds, fc.array(fc.boolean(), { minLength: 300, maxLength: 300 })).map(([n, ed, mask]) => {
    const all = ayahsOnPage(n, ed);
    return { n, ed, all, some: all.filter((_, i) => mask[i]) };
  });
const pageWithSubset = subsetIn(editionArb);
/** The same in the 1405 print, for checks across many pages at once. */
const pageWithSubset1405 = subsetIn(fc.constant<MushafEditionId>('madani1405'));

/** Splits a list into sittings: each ayah goes to sitting `parts[i] % k`, in a shuffled order. */
function sittings<T>(list: T[], parts: number[], k: number): T[][] {
  const out: T[][] = Array.from({ length: k }, () => []);
  list.forEach((x, i) => out[(parts[i % parts.length] ?? 0) % k].push(x));
  return out.map((s) => [...s].reverse());
}

describe('memorized ayahs (MEM-1 to MEM-3)', () => {
  it('[MEM-1] a page’s ayahs added over any number of sittings make it memorized; part of them leaves it partly memorized with exactly those', () => {
    fc.assert(
      fc.property(pageWithSubset, fc.array(fc.nat(), { minLength: 1, maxLength: 40 }), fc.integer({ min: 1, max: 5 }), ({ n, ed, all, some }, parts, k) => {
        let pages = [page(n)];
        for (const sitting of sittings(all, parts, k)) pages = addAyahs(pages, sitting, NOW, ed).pages;
        expect(pages[0]).toMatchObject({ status: 'memorized', verses: null, dateMemorized: NOW });

        let partly = [page(n)];
        for (const sitting of sittings(some, parts, k)) partly = addAyahs(partly, sitting, NOW, ed).pages;
        if (some.length === 0) expect(partly[0].status).toBe('not_memorized');
        else if (some.length === all.length) expect(partly[0].status).toBe('memorized');
        else {
          expect(partly[0].status).toBe('in_progress');
          expect(partly[0].verses).toEqual(some);
          expect(memorizedAyahsOnPage(partly[0], ed)).toEqual(some);
        }
      }),
      { numRuns: runs(300) },
    );
  });

  it('[MEM-1] ayahs added to a memorized page, or already memorized, change nothing', () => {
    fc.assert(
      fc.property(pageWithSubset, ({ n, ed, all, some }) => {
        const memorized = page(n, 'memorized');
        const r1 = addAyahs([memorized], all, NOW, ed);
        expect(r1.changed).toEqual([]);
        expect(r1.pages[0]).toBe(memorized);
        if (some.length > 0 && some.length < all.length) {
          const partly = page(n, 'in_progress', some);
          const r2 = addAyahs([partly], some, NOW, ed);
          expect(r2.changed).toEqual([]);
          expect(r2.pages[0]).toBe(partly);
        }
      }),
      { numRuns: runs(200) },
    );
  });

  it('[MEM-2] a page counts between 0 and 1, more with more ayahs, 1 exactly when all are memorized', () => {
    fc.assert(
      fc.property(pageWithSubset, fc.array(fc.boolean(), { minLength: 300, maxLength: 300 }), ({ n, ed, all, some }, mask) => {
        const fewer = some.filter((_, i) => mask[i]);
        const share = pageShare(page(n, 'in_progress', some), ed);
        const less = pageShare(page(n, 'in_progress', fewer), ed);
        expect(share).toBeGreaterThanOrEqual(0);
        expect(share).toBeLessThanOrEqual(1);
        expect(less).toBeLessThanOrEqual(share + 1e-12);
        expect(share === 1).toBe(some.length === all.length);
        expect(share === 0).toBe(some.length === 0);
      }),
      { numRuns: runs(300) },
    );
  });

  it('[MEM-2] the total is the whole pages plus each partly memorized page’s share, and the juz shares add up to it', () => {
    fc.assert(
      fc.property(fc.uniqueArray(pageWithSubset1405, { selector: (x) => x.n, maxLength: 30 }), fc.uniqueArray(pageArb, { maxLength: 40 }), (partial, whole) => {
        const wholeSet = new Set(whole);
        const pages = [
          ...whole.map((n) => page(n, 'memorized')),
          ...partial.filter((x) => !wholeSet.has(x.n)).map((x) => page(x.n, 'in_progress', x.some)),
        ];
        const total = memorizedPageShare(pages, 'madani1405');
        const partlyCount = pages.filter((p) => p.status === 'in_progress' && pageShare(p, 'madani1405') > 0).length;
        expect(total).toBeGreaterThanOrEqual(whole.length - 1e-9);
        expect(total).toBeLessThanOrEqual(whole.length + partlyCount + 1e-9);
        const juz = juzShares(pages, 'madani1405');
        const pagesPerJuz = [21, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 23];
        expect(juz.reduce((n, s, i) => n + s * pagesPerJuz[i], 0)).toBeCloseTo(total, 6);
      }),
      { numRuns: runs(150) },
    );
  });

  it('[MEM-3] taking off just the ayahs that were added puts every page back as it was', () => {
    fc.assert(
      fc.property(pageWithSubset, fc.array(fc.boolean(), { minLength: 300, maxLength: 300 }), ({ n, ed, all, some }, mask) => {
        const start = some.length === 0 ? page(n) : some.length === all.length ? page(n, 'memorized') : page(n, 'in_progress', some);
        const before = memorizedAyahsOnPage(start, ed);
        const adding = all.filter((k, i) => mask[i] && !before.includes(k));
        const added = addAyahs([start], adding, NOW, ed).pages;
        const back = removeAyahs(added, adding, ed).pages[0];
        expect(memorizedAyahsOnPage(back, ed)).toEqual(before);
        expect(back.status).toBe(start.status);
      }),
      { numRuns: runs(300) },
    );
  });

  it('[MEM-3] taking ayahs off a memorized page keeps the others; taking them all leaves it not memorized', () => {
    fc.assert(
      fc.property(pageWithSubset, ({ n, ed, all, some }) => {
        const after = removeAyahs([page(n, 'memorized')], some, ed).pages[0];
        const rest = all.filter((k) => !some.includes(k));
        expect(memorizedAyahsOnPage(after, ed)).toEqual(rest);
        expect(after.status).toBe(rest.length === 0 ? 'not_memorized' : rest.length === all.length ? 'memorized' : 'in_progress');
      }),
      { numRuns: runs(200) },
    );
  });
});

describe('partly memorized pages are revised (MEM-4)', () => {
  it('[MEM-4] over a cycle of the pages plan, every memorized and partly memorized page comes round once; others never', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(pageArb, { minLength: 1, maxLength: 40 }),
        fc.uniqueArray(pageWithSubset1405, { selector: (x) => x.n, maxLength: 12 }),
        fc.integer({ min: 1, max: 20 }),
        (whole, partial, perDay) => {
          const wholeSet = new Set(whole);
          const parts = partial.filter((x) => !wholeSet.has(x.n) && x.some.length > 0 && x.some.length < x.all.length);
          const pages: UserPage[] = [
            ...memorizedPages(whole),
            ...parts.map((x) => page(x.n, 'in_progress', x.some)),
            ...partial.filter((x) => !wholeSet.has(x.n) && x.some.length === 0).map((x) => page(x.n, 'in_progress', [])),
          ];
          const revised = revisablePages(pages, 'madani1405');
          const expected = [...whole, ...parts.map((x) => x.n)].sort((a, b) => a - b);
          expect(revised.map((p) => p.pageNumber).sort((a, b) => a - b)).toEqual(expected);
          const user = userWith({ dailyPageCapacity: perDay });
          const days = Math.ceil(expected.length / Math.min(perDay, expected.length));
          const seen: number[] = [];
          const start = parseDay('2026-03-02');
          for (let i = 0; i < days; i++) seen.push(...getPagesScheduledForDate(user, dayAt(start, i, 12), revised));
          // Each page once in a cycle (the last day may wrap round to the first pages).
          expect(new Set(seen)).toEqual(new Set(expected));
          // The day's assignment, from all the pages, holds only pages that are revised.
          const today = generateDailyAssignment(pages, [], user, dayAt(start, 0, 12)).pages;
          expect(today.every((n) => expected.includes(n))).toBe(true);
        },
      ),
      { numRuns: runs(150) },
    );
  });
});

describe('naming any ayahs (NAME-1)', () => {
  it('[NAME-1] whole pages and the ayahs they hold are named alike, in every form', () => {
    fc.assert(
      fc.property(fc.uniqueArray(pageArb, { minLength: 1, maxLength: 40 }), editionArb, fc.constantFrom('long', 'compact', 'short'), fc.integer({ min: 1, max: 5 }), (pages, edition, form, max) => {
        const opts = { form: form as 'long' | 'compact' | 'short', edition, max };
        expect(describeAyahs(ayahsOfPages(pages, edition), opts)).toBe(describePassage(pages, opts));
      }),
      { numRuns: runs(300) },
    );
  });

  it('[NAME-1] [MEM-4] the pages of a day are named as describePassage names them, a partly memorized page by its ayahs', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(pageArb, { minLength: 1, maxLength: 30 }),
        fc.uniqueArray(pageWithSubset1405, { selector: (x) => x.n, maxLength: 6 }),
        fc.constantFrom('long', 'compact', 'short'),
        fc.boolean(),
        (pages, partialPages, form, given) => {
          const opts = { form: form as 'long' | 'compact' | 'short', edition: 'madani1405' as const, order: given ? ('given' as const) : ('mushaf' as const), juz: given };
          expect(describePagesToRevise(pages, new Map(), opts)).toBe(describePassage(pages, opts));
          const partial = new Map(partialPages.filter((x) => x.some.length > 0).map((x) => [x.n, x.some]));
          const all = [...pages, ...partial.keys()];
          if (!given) {
            const sorted = [...new Set(all)].sort((a, b) => a - b);
            expect(describePagesToRevise(all, partial, opts)).toBe(describeAyahs(ayahsToRevise(sorted, partial, 'madani1405'), { ...opts, order: undefined } as never));
          }
        },
      ),
      { numRuns: runs(200) },
    );
  });
});

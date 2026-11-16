// Where the mushaf's page list starts (lib/pagerStart, MushafPager's initialScrollIndex): the page the reader or a
// session opens on, from its first frame, for any list of pages and any page asked for (READ-1). MushafPager.test
// checks the list itself draws that page first.

import fc from 'fast-check';
import { pagerStartIndex } from '../../../src/lib/pagerStart';
import { runs } from './fixtures';

/** A list of pages as screens hold them: ascending, no repeats (the reader's 1–604, a session's day, a stretch). */
const pagesArb = fc.uniqueArray(fc.integer({ min: 1, max: 604 }), { minLength: 1, maxLength: 60 }).map((p) => [...p].sort((a, b) => a - b));

describe('[READ-1] the mushaf opens on the page it was opened for', () => {
  it('a page the list holds: the list starts on it, never on another (and its first page starts it at 0)', () => {
    fc.assert(
      fc.property(pagesArb, fc.nat(), (pages, k) => {
        const page = pages[k % pages.length];
        const start = pagerStartIndex(pages, page);
        expect(pages[start ?? 0]).toBe(page);
      }),
      { numRuns: runs(300) },
    );
  });

  it('no page asked for, or one it doesn’t hold: it starts at its beginning', () => {
    fc.assert(
      fc.property(pagesArb, fc.integer({ min: 1, max: 604 }), (pages, page) => {
        fc.pre(!pages.includes(page));
        expect(pagerStartIndex(pages, page)).toBeUndefined();
        expect(pagerStartIndex(pages, undefined)).toBeUndefined();
        expect(pagerStartIndex(pages, null)).toBeUndefined();
      }),
      { numRuns: runs(300) },
    );
  });

  it('the reader (pages 1–604) opened at any page starts there: Al-Baqarah at page 2, An-Nas at 604', () => {
    const all = Array.from({ length: 604 }, (_, i) => i + 1);
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 604 }), (page) => {
        expect(pagerStartIndex(all, page)).toBe(page - 1);
      }),
      { numRuns: runs(200) },
    );
    expect(pagerStartIndex(all, 1)).toBeUndefined();
  });
});

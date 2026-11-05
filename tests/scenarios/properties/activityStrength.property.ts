// Strength of a revised page (ACT-8, lib/activityDayParts): 1–2 weak, 3 moderate, 4–5 strong.

import fc from 'fast-check';
import { strengthCounts, strengthOf } from '../../../src/lib/activityDayParts';
import { runs } from './fixtures';

describe('the strength of a page (ACT-8)', () => {
  it('[ACT-8] 1–2 weak, 3 moderate, 4–5 strong', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), (rating) => {
        const expected = rating <= 2 ? 'weak' : rating === 3 ? 'moderate' : 'strong';
        expect(strengthOf(rating)).toBe(expected);
      }),
      { numRuns: runs(50) },
    );
  });

  it('[ACT-8] the counts add up to the revised pages; an unrated page counts as strong', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 604 }), { maxLength: 20 }), (pages) => {
        const c = strengthCounts(pages, () => undefined);
        expect(c.weak + c.moderate + c.strong).toBe(pages.length);
        expect(c.strong).toBe(pages.length);
      }),
      { numRuns: runs(100) },
    );
  });
});

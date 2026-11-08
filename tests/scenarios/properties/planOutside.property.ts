// Memorized pages a custom plan doesn't hold, and adding them (MEM-6, lib/planBuilder).

import fc from 'fast-check';
import { addPagesToPlan, pagesOutsidePlan } from '../../../src/lib/planBuilder';
import { runs } from './fixtures';

const page = fc.integer({ min: 1, max: 604 });
const daysArb = fc.array(fc.uniqueArray(page, { maxLength: 12 }), { maxLength: 10 });

describe('pages outside a custom plan (MEM-6)', () => {
  it('[MEM-6] lists exactly the memorized pages no day holds; added either way, none is left and every day before is kept', () => {
    fc.assert(
      fc.property(daysArb, fc.uniqueArray(page, { maxLength: 40 }), fc.constantFrom<'tomorrow' | 'own'>('tomorrow', 'own'), (days, memorized, how) => {
        const outside = pagesOutsidePlan(days, memorized);
        const planned = new Set(days.flat());
        expect(outside).toEqual([...memorized].filter((p) => !planned.has(p)).sort((a, b) => a - b));
        const after = addPagesToPlan(days, outside, how);
        expect(pagesOutsidePlan(after, memorized)).toEqual([]);
        // Nothing else moves: every page of the plan before is still in it, and nothing new but these.
        expect(new Set(after.flat())).toEqual(new Set([...days.flat(), ...outside]));
        if (outside.length === 0) expect(after).toEqual(days);
        else if (how === 'own' || days.length === 0) {
          expect(after).toHaveLength(days.length + 1);
          expect(after[Math.min(1, days.length)]).toEqual(outside);
        } else {
          expect(after).toHaveLength(days.length);
          expect(after[0]).toEqual(days.length > 1 ? days[0] : [...days[0], ...outside.filter((p) => !days[0].includes(p))]);
        }
      }),
      { numRuns: runs(300) },
    );
  });
});

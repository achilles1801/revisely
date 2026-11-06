// Memorization items from the manager and the Memorized composer (ACT-10, lib/memorizationLog).

import fc from 'fast-check';
import { memorizationChangeSet, parsePageRange } from '../../../src/lib/memorizationLog';
import { runs } from './fixtures';

const statusArb = fc.constantFrom('memorized', 'not_memorized');

describe('memorization items (ACT-10)', () => {
  it('[ACT-10] the change set only names pages whose status really changed', () => {
    fc.assert(
      fc.property(fc.array(statusArb, { minLength: 1, maxLength: 20 }), fc.array(statusArb, { minLength: 1, maxLength: 20 }), (before, after) => {
        const pages = before.map((status, i) => ({ pageNumber: i + 1, status }));
        const pending = new Map<number, 'memorized' | 'not_memorized'>();
        after.forEach((s, i) => {
          if (i < pages.length) pending.set(i + 1, s);
        });
        const { marked, unmarked } = memorizationChangeSet(pages, pending);
        for (const p of marked) expect(before[p - 1]).toBe('not_memorized');
        for (const p of unmarked) expect(before[p - 1]).toBe('memorized');
        expect(marked.every((p) => pending.get(p) === 'memorized')).toBe(true);
      }),
      { numRuns: runs(200) },
    );
  });

  it('[ACT-10] a valid page range is its pages, in order, inclusive', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 604 }), fc.integer({ min: 1, max: 604 }), (a, b) => {
        const range = parsePageRange(String(a), String(b));
        if (a > b) {
          expect(range).toBeNull();
        } else {
          expect(range).toEqual(Array.from({ length: b - a + 1 }, (_, i) => a + i));
        }
      }),
      { numRuns: runs(200) },
    );
  });
});

// Activity's day as blocks (lib/activityDayView, C2): one Revised block per day,
// built from the day's revision items.

import fc from 'fast-check';
import { buildDayView } from '../../../src/lib/activityDayView';
import { runs } from './fixtures';

const DAY = '2026-11-03';
const pageArb = fc.integer({ min: 1, max: 604 });
const pagesArb = fc.uniqueArray(pageArb, { minLength: 0, maxLength: 20 });

describe('the Revised block of a day', () => {
  it('[ACT-2] one Revised block: its pages are the day’s own item, and each later-day credit is listed apart', () => {
    fc.assert(
      fc.property(pagesArb, pagesArb, fc.array(pagesArb, { maxLength: 3 }), (own, assigned, credits) => {
        const aheadDays = credits.map((_, i) => `2026-11-${String(4 + i).padStart(2, '0')}`);
        const revisions = [
          { id: DAY, day: DAY, countsFor: DAY, pages: own, skipped: [], assigned, minutes: null },
          ...credits.map((pages, i) => ({
            id: `${DAY}-ahead-${aheadDays[i]}`,
            day: DAY,
            countsFor: aheadDays[i],
            pages,
            skipped: [],
            assigned: [],
            minutes: null,
          })),
        ].filter((r) => r.countsFor !== DAY || r.pages.length > 0);
        const view = buildDayView(DAY, { revisions, memorized: [], reads: [], notes: [] }, new Set());
        const revised = view.blocks[0] as { kind: string; revised: number[]; credits: unknown[] };
        expect(view.blocks.map((b) => b.kind)).toEqual(['revised', 'memorized', 'read', 'notes']);
        expect(revised.kind).toBe('revised');
        expect(revised.revised).toEqual(own);
        expect(revised.credits).toHaveLength(credits.filter((c) => c.length > 0).length);
      }),
      { numRuns: runs(200) },
    );
  });
});

// Revo's greeting (REVO-20, REVO-35) on a day with nothing left to revise. On Majd's iPhone (Nov 8
// 2026) every one of today's 28 pages was revised, but the day wasn't marked done (#431), so today's
// next pages were empty and Revo opened on "You're 28 pages into today, and  is next.": a passage
// with no name. A day with nothing left reads as done; no greeting names an empty passage.
import fc from 'fast-check';
import { greetingState, revoChips, revoGreeting } from '../../../src/lib/revo/greeting';
import type { RevoContext } from '../../../src/lib/revo/types';
import { plainText } from '../../../src/lib/passages';
import { runs } from './fixtures';

const context = (today: Partial<RevoContext['today']>): RevoContext =>
  ({
    passages: {},
    pageNames: {},
    totals: {
      memorizedPages: 111,
      revisedWithin7Days: 90,
      revisedWithin30Days: 111,
      daysWithSession30: 20,
      streakDays: 4,
      sessions30: 20,
      weakPages: 0,
      moderatePages: 0,
      strongPages: 0,
      weakRevisedLast7Days: 0,
      pagesPerDay7: 20,
      pagesPerDay30: 18,
      plannedPerDay: 28,
    },
    today: { plannedPages: 28, revisedPages: 28, carriedPages: 0, doneEarlier: 0, otherPages: 0, minutes: 40, memorizedPages: 0, nextPages: [], weakNext: [], done: false, ...today },
    weakPages: [],
    week: [{ day: '2026-11-08', pages: 28, planned: 28, done: false }],
    streak: { days: 4, atRisk: null },
    localTime: '21:10',
  }) as RevoContext;

/** A name left out of a sentence: two spaces, or a gap before "is next" or after "starting at". */
const EMPTY_PASSAGE = /\s{2}|and\s+is next|starting at\s*[.,]|undefined|NaN/;

describe('a day with nothing left to revise (REVO-20, REVO-35)', () => {
  it('[REVO-20] every page revised but the day not marked done: Revo says today is done, never "and  is next"', () => {
    const c = context({});
    const said = plainText(revoGreeting('Majd', c));
    expect(said).not.toMatch(EMPTY_PASSAGE);
    expect(said).toBe('Assalamu alaikum, Majd. Today’s 28 pages are done. That’s a 4-day streak. Ask me anything about your revision.');
    expect(greetingState(c)).toBe('done');
    expect(revoChips(c)).toContain('What should I revise next?');
  });

  it('[REVO-35] whatever was revised and however often it opens: with no next pages, no greeting or chip names an empty passage', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 0, max: 5 }),
        fc.boolean(),
        fc.boolean(),
        (planned, revised, open, strength, withName) => {
          const c = context({ plannedPages: planned, revisedPages: Math.min(revised, planned) });
          // Nothing next means every page of today is done (Home counts them all), whatever was revised here.
          const extras = { strength, doneCount: planned };
          const said = plainText(revoGreeting(withName ? 'Majd' : null, c, open, extras));
          expect(said).not.toMatch(EMPTY_PASSAGE);
          expect(said).not.toContain('is next');
          for (const chip of revoChips(c, open, extras)) expect(plainText(chip)).not.toMatch(EMPTY_PASSAGE);
          expect(greetingState(c)).toBe('done');
        },
      ),
      { numRuns: runs(300) },
    );
  });
});

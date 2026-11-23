// Asking for a rating (lib/rateAsk, SESS-8): when finishing a day is the moment to ask.

import fc from 'fast-check';
import { ASK_EVERY_DAYS, MAX_ASKS, MIN_ACCOUNT_DAYS, MIN_STREAK, daysSince, shouldAskForRating } from '../../../src/lib/rateAsk';
import { runs } from './fixtures';

const streakArb = fc.integer({ min: 0, max: 400 });
const daysArb = fc.option(fc.integer({ min: 0, max: 2000 }), { nil: null });
const timesArb = fc.integer({ min: 0, max: 10 });

describe('asking for a rating', () => {
  it('[SESS-8] asks only with a streak of 7 days or more', () => {
    fc.assert(
      fc.property(streakArb, daysArb, daysArb, (streak, accountDays, daysSinceAsked) => {
        if (streak < MIN_STREAK) expect(shouldAskForRating({ streak, accountDays, daysSinceAsked, timesAsked: 0, stopped: false })).toBe(false);
      }),
      { numRuns: runs(300) },
    );
  });

  it('[SESS-8] never in an account\'s first week', () => {
    fc.assert(
      fc.property(streakArb, fc.integer({ min: 0, max: MIN_ACCOUNT_DAYS - 1 }), daysArb, (streak, accountDays, daysSinceAsked) => {
        expect(shouldAskForRating({ streak, accountDays, daysSinceAsked, timesAsked: 0, stopped: false })).toBe(false);
      }),
      { numRuns: runs(300) },
    );
  });

  it('[SESS-8] at most once every 120 days, and always once the wait is over', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_STREAK, max: 400 }),
        fc.option(fc.integer({ min: MIN_ACCOUNT_DAYS, max: 2000 }), { nil: null }),
        daysArb,
        (streak, accountDays, daysSinceAsked) => {
          const ask = shouldAskForRating({ streak, accountDays, daysSinceAsked, timesAsked: 0, stopped: false });
          expect(ask).toBe(daysSinceAsked == null || daysSinceAsked >= ASK_EVERY_DAYS);
        },
      ),
      { numRuns: runs(300) },
    );
  });

  it('[SESS-8] never more than 3 times ever, and never again once stopped', () => {
    fc.assert(
      fc.property(streakArb, daysArb, daysArb, timesArb, fc.boolean(), (streak, accountDays, daysSinceAsked, timesAsked, stopped) => {
        const ask = shouldAskForRating({ streak, accountDays, daysSinceAsked, timesAsked, stopped });
        if (stopped || timesAsked >= MAX_ASKS) expect(ask).toBe(false);
      }),
      { numRuns: runs(300) },
    );
  });

  it('[SESS-8] counts whole days, and an unreadable time as unknown', () => {
    fc.assert(
      fc.property(fc.integer({ min: Date.UTC(2026, 0, 1), max: Date.UTC(2030, 0, 1) }), fc.integer({ min: 0, max: 1000 }), (then, days) => {
        const now = then + days * 86_400_000 + 3_600_000;
        expect(daysSince(new Date(then).toISOString(), now)).toBe(days);
      }),
      { numRuns: runs(200) },
    );
    expect(daysSince('not a date', Date.now())).toBeNull();
    expect(daysSince(null, Date.now())).toBeNull();
  });
});

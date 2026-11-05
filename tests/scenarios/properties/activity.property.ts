// Activity's day for a memorized page (lib/activityDay): the calendar date in the
// user's own zone, and the zone a user's sessions were written in.

import fc from 'fast-check';
import { localDayAt, sessionOffsetMinutes } from '../../../src/lib/activityDay';
import { runs } from './fixtures';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const EPOCH_2020 = Date.UTC(2020, 0, 1);

/** Every quarter hour from UTC−12 to UTC+14. */
const offsetArb = fc.integer({ min: -48, max: 56 }).map((k) => k * 15);
const dayArb = fc.integer({ min: 0, max: 3650 }).map((n) => new Date(EPOCH_2020 + n * DAY_MS).toISOString().slice(0, 10));
const instantArb = fc.integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2030, 0, 1) });

describe('the day of a memorized page', () => {
  it('[ACT-1] changes at local midnight, with no Fajr shift', () => {
    fc.assert(
      fc.property(dayArb, offsetArb, (day, offset) => {
        const midnight = Date.parse(`${day}T00:00:00Z`) - offset * MINUTE_MS;
        const previous = new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
        expect(localDayAt(midnight, offset)).toBe(day);
        expect(localDayAt(midnight - 1, offset)).toBe(previous);
      }),
      { numRuns: runs(300) },
    );
  });

  it('[ACT-1] the zone of a user\'s sessions puts every one of them on its own date', () => {
    fc.assert(
      fc.property(offsetArb, fc.array(instantArb, { minLength: 1, maxLength: 20 }), (offset, instants) => {
        const sessions = instants.map((createdAt) => ({ createdAt, date: localDayAt(createdAt, offset) }));
        const chosen = sessionOffsetMinutes(sessions);
        expect(chosen).not.toBeNull();
        for (const s of sessions) expect(localDayAt(s.createdAt, chosen as number)).toBe(s.date);
      }),
      { numRuns: runs(200) },
    );
  });

  it('[ACT-1] with no sessions there is no zone to go by', () => {
    expect(sessionOffsetMinutes([])).toBeNull();
  });
});

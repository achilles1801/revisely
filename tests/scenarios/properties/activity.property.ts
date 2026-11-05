// Activity's day for a memorized page (lib/activityDay): the calendar date in the
// user's own zone, and the zone a user's sessions were written in.

import fc from 'fast-check';
import { activityDayAt, localDayAt, sessionOffsetMinutes } from '../../../src/lib/activityDay';
import { runs } from './fixtures';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const EPOCH_2020 = Date.UTC(2020, 0, 1);

/** Every quarter hour from UTC−12 to UTC+14. */
const offsetArb = fc.integer({ min: -48, max: 56 }).map((k) => k * 15);
const dayArb = fc.integer({ min: 0, max: 3650 }).map((n) => new Date(EPOCH_2020 + n * DAY_MS).toISOString().slice(0, 10));
const instantArb = fc.integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2030, 0, 1) });

describe('the day of a memorized page', () => {
  it('[ACT-1] changes at local midnight when the Fajr boundary is off', () => {
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

  it('[ACT-1] with the Fajr boundary on, the day turns at that day’s Fajr', () => {
    fc.assert(
      fc.property(dayArb, offsetArb, fc.integer({ min: 0, max: 1439 }), fc.integer({ min: 0, max: 1439 }), (day, offset, fajrMin, momentMin) => {
        const fajrOf = (d: string) => (d === day ? Date.parse(`${day}T00:00:00Z`) + fajrMin * MINUTE_MS - offset * MINUTE_MS : null);
        const moment = Date.parse(`${day}T00:00:00Z`) + momentMin * MINUTE_MS - offset * MINUTE_MS;
        const expected = moment < fajrOf(day)! ? localDayAt(moment - DAY_MS, offset) : localDayAt(moment, offset);
        expect(activityDayAt(moment, offset, fajrOf)).toBe(expected);
      }),
      { numRuns: runs(300) },
    );
  });

  it('[ACT-1] with no Fajr to go by (boundary off, or no location) the day is the calendar day', () => {
    const moment = Date.parse('2026-11-03T02:00:00Z');
    expect(activityDayAt(moment, 0, null)).toBe('2026-11-03');
    expect(activityDayAt(moment, 0, () => null)).toBe('2026-11-03');
  });

  it('[ACT-1] with no sessions there is no zone to go by', () => {
    expect(sessionOffsetMinutes([])).toBeNull();
  });
});

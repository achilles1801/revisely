// Whole calendar days between two dates (algorithm.calendarDaysBetween), which
// every schedule counts from: in every zone, across daylight-saving changes.

import fc from 'fast-check';
import { calendarDaysBetween } from '../../../src/lib/algorithm';
import { addDays, dayOf } from '../harness/clock';
import {
  ALL_ZONES,
  dayAt,
  dayFromIndex,
  dayIndexArb,
  dstDays,
  parseDay,
  restoreZone,
  runs,
  timeOfDayArb,
  useZone,
  zoneArb,
} from './fixtures';

afterEach(() => restoreZone());

const DST_DAYS = new Map<string, string[]>();
beforeAll(() => {
  for (const zone of ALL_ZONES) {
    useZone(zone);
    DST_DAYS.set(zone, dstDays());
  }
  restoreZone();
});

const nArb = fc.integer({ min: -800, max: 800 });

describe('[DAY-6] calendar days between two dates', () => {
  it('covers the DST zones the matrix means to (sanity: New York, London, Sydney, Chicago change twice a year)', () => {
    for (const zone of ['America/New_York', 'Europe/London', 'Australia/Sydney', 'America/Chicago']) {
      expect(DST_DAYS.get(zone)!.length).toBe(6);
    }
    expect(DST_DAYS.get('Asia/Riyadh')).toEqual([]);
  });

  it('is n from local midnight of day d to local midnight of day d+n, in every zone', () => {
    fc.assert(
      fc.property(zoneArb, dayIndexArb, nArb, (zone, i, n) => {
        useZone(zone);
        const a = dayFromIndex(i);
        expect(calendarDaysBetween(a, dayAt(a, n))).toBe(n);
      }),
      { numRuns: runs(500) },
    );
  });

  it('is n whatever the times of day (00:00, 00:30, 23:30, …), from and to DST days', () => {
    fc.assert(
      fc.property(
        zoneArb,
        fc.nat(),
        nArb,
        timeOfDayArb,
        timeOfDayArb,
        fc.boolean(),
        (zone, pick, n, [h1, m1], [h2, m2], fromDst) => {
          useZone(zone);
          const dst = DST_DAYS.get(zone)!;
          // A DST day when the zone has them, else any day.
          const base = dst.length > 0 ? parseDay(dst[pick % dst.length]) : dayFromIndex(pick % 1095);
          const [from, to] = fromDst ? [base, dayAt(base, n)] : [dayAt(base, -n), base];
          const a = new Date(from.getFullYear(), from.getMonth(), from.getDate(), h1, m1);
          const b = new Date(to.getFullYear(), to.getMonth(), to.getDate(), h2, m2);
          // A time in a spring-forward gap moves on an hour, on the same date.
          expect(dayOf(a)).toBe(dayOf(from));
          expect(dayOf(b)).toBe(dayOf(to));
          expect(calendarDaysBetween(a, b)).toBe(n);
        },
      ),
      { numRuns: runs(500) },
    );
  });

  it('agrees with the harness’s addDays, and adds up: (a→b) + (b→c) = (a→c)', () => {
    fc.assert(
      fc.property(zoneArb, dayIndexArb, nArb, nArb, timeOfDayArb, (zone, i, n, k, [h, m]) => {
        useZone(zone);
        const a = dayFromIndex(i, h, m);
        const b = parseDay(addDays(dayOf(a), n));
        const c = dayAt(b, k, 23, 30);
        expect(calendarDaysBetween(a, b)).toBe(n);
        expect(calendarDaysBetween(a, b) + calendarDaysBetween(b, c)).toBe(calendarDaysBetween(a, c));
        expect(calendarDaysBetween(b, a)).toBe(0 - n);
      }),
      { numRuns: runs(400) },
    );
  });

  it('counts dates, not 24 h: on a 23 h day midnight + 24 h is tomorrow 01:00, on a 25 h day today 23:00', () => {
    // The reason the scheduler counts dates, not milliseconds: across a DST
    // change, local midnight + 24 h is 23:00 or 01:00, and dividing elapsed
    // time by 24 h would repeat or skip a day.
    for (const zone of ['America/New_York', 'Europe/London', 'Australia/Sydney']) {
      useZone(zone);
      for (const day of DST_DAYS.get(zone)!) {
        const midnight = parseDay(day);
        const next = dayAt(midnight, 1);
        const hours = (next.getTime() - midnight.getTime()) / 3_600_000;
        expect([23, 25]).toContain(hours);
        expect(calendarDaysBetween(midnight, next)).toBe(1);
        expect(calendarDaysBetween(midnight, new Date(midnight.getTime() + 24 * 3_600_000))).toBe(hours === 23 ? 1 : 0);
      }
    }
  });
});

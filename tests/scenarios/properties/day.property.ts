// The revision day (lib/fajrBoundary): the calendar day, or with "Start day at
// fajr" the day that turns at Fajr, over zones × instants × places × methods.

import fc from 'fast-check';
import {
  DEFAULT_FAJR_METHOD,
  getFajrTimeFor,
  getNextRevisionDayStart,
  getRevisionDayForUser,
} from '../../../src/lib/fajrBoundary';
import { getPrayerPrefs } from '../../../src/lib/prayer/prefs';
import { dayTimes } from '../../../src/lib/prayer/times';
import type { User } from '../../../src/types';
import { DAY, HOUR, MINUTE, ZONES, addDays, dayOf } from '../harness/clock';
import {
  CITIES,
  City,
  coordsArb,
  coordsArbWithin,
  dayAt,
  dayFromIndex,
  dayIndexArb,
  instantArb,
  methodArb,
  restoreZone,
  runs,
  useZone,
  userWith,
  zoneArb,
} from './fixtures';

afterEach(() => restoreZone());

const SECOND = 1000;

type Coords = { latitude: number; longitude: number };

const boundaryUser = (coords: Coords | null, method: string, enabled = true): User =>
  userWith({ fajrBoundaryEnabled: enabled, locationCoords: coords, fajrCalculationMethod: method });

const rd = (user: User, t: number) => getRevisionDayForUser(user, new Date(t));

const anyUserArb = fc.record({
  enabled: fc.boolean(),
  coords: fc.option(coordsArb, { nil: null, freq: 6 }),
  method: methodArb,
});

// Places within 1.5° of a city, in that city's zone: a user at home.
const DATE_LINE: City[] = [CITIES.kiritimati, CITIES.bakerIsland, CITIES.suva];
const homeArb = (cities: City[]) =>
  fc
    .tuple(
      fc.constantFrom(...cities),
      fc.double({ min: -1.5, max: 1.5, noNaN: true }),
      fc.double({ min: -1.5, max: 1.5, noNaN: true }),
    )
    .map(([city, dLat, dLng]) => ({
      zone: city.zone as string,
      coords: { latitude: city.latitude + dLat, longitude: city.longitude + dLng },
    }));
const awayFromDateLine = Object.values(CITIES).filter((c) => !DATE_LINE.includes(c));

/**
 * The Fajr that happens during the local day of `date`, worked out
 * independently of the day the app hands adhan: adhan's days either side are
 * tried, and only a Fajr before its own sunrise counts (adhan returns a noon
 * "Fajr" on the days the sun's transit crosses 00:00 UTC).
 */
function fajrDuring(user: User, date: Date): Date | null {
  const day = dayOf(date);
  const prefs = getPrayerPrefs();
  for (const k of [-1, 0, 1]) {
    const t = dayTimes(user.locationCoords!, dayAt(date, k, 12), {
      method: user.fajrCalculationMethod || DEFAULT_FAJR_METHOD,
      highLatitude: prefs.highLatitude,
      madhab: prefs.madhab,
      adjustments: prefs.adjustments,
    });
    if (t.fajr && t.sunrise && t.fajr < t.sunrise && dayOf(t.fajr) === day) return t.fajr;
  }
  return null;
}

function checkStepsByOneDay(zone: string, t0: number, coords: Coords, method: string) {
  useZone(zone);
  const user = boundaryUser(coords, method);
  let prev = rd(user, t0);
  for (let t = t0 + 20 * MINUTE; t <= t0 + 3 * DAY; t += 20 * MINUTE) {
    const day = rd(user, t);
    expect([prev, addDays(prev, 1)]).toContain(day);
    prev = day;
  }
}

function checkTurnsAtNextStart(user: User, t: number) {
  const today = rd(user, t);
  const next = getNextRevisionDayStart(user, new Date(t)).getTime();
  expect(next).toBeGreaterThan(t);
  expect(next - t).toBeLessThanOrEqual(48 * HOUR);
  expect(rd(user, Math.max(t, next - SECOND))).toBe(today);
  expect(rd(user, next)).toBe(addDays(today, 1));
  expect(rd(user, next + SECOND)).toBe(addDays(today, 1));
}

/** At home, the revision day is yesterday until the Fajr that happens this local day, then today. */
function checkHomeTurnsAtFajr(zone: string, coords: Coords, i: number, method: string, frac: number) {
  useZone(zone);
  const user = boundaryUser(coords, method);
  const midnight = dayFromIndex(i);
  const nextMidnight = dayAt(midnight, 1);
  const fajr = fajrDuring(user, dayAt(midnight, 0, 12));
  fc.pre(fajr !== null && fajr.getTime() > midnight.getTime());
  const today = dayOf(midnight);
  const before = midnight.getTime() + Math.floor(frac * (fajr!.getTime() - midnight.getTime() - 1));
  const after = fajr!.getTime() + Math.floor(frac * (nextMidnight.getTime() - fajr!.getTime() - 1));
  expect(rd(user, before)).toBe(addDays(today, -1));
  expect(rd(user, after)).toBe(today);
}

const fracArb = fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true });

describe('[DAY-1] [DAY-2] [DAY-3] [DAY-6] [DAY-8] revision day', () => {
  it('is the calendar day when the boundary is off or there is no saved place', () => {
    fc.assert(
      fc.property(zoneArb, instantArb, anyUserArb, (zone, t, u) => {
        useZone(zone);
        fc.pre(!(u.enabled && u.coords !== null));
        const user = boundaryUser(u.coords, u.method, u.enabled);
        const now = new Date(t);
        expect(rd(user, t)).toBe(dayOf(now));
        // And it turns at the next local midnight.
        expect(getNextRevisionDayStart(user, now).getTime()).toBe(
          new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime(),
        );
      }),
      { numRuns: runs(300) },
    );
  });

  it('with the boundary on, is the calendar day or the day before, never anything else', () => {
    fc.assert(
      fc.property(zoneArb, instantArb, coordsArb, methodArb, (zone, t, coords, method) => {
        useZone(zone);
        const today = dayOf(new Date(t));
        expect([today, addDays(today, -1)]).toContain(rd(boundaryUser(coords, method), t));
      }),
      { numRuns: runs(400) },
    );
  });

  it('never goes backwards as time moves forward (random instants within three days)', () => {
    fc.assert(
      fc.property(
        zoneArb,
        instantArb,
        anyUserArb,
        fc.array(fc.integer({ min: 0, max: 3 * DAY }), { minLength: 2, maxLength: 25 }),
        (zone, t0, u, offsets) => {
          useZone(zone);
          const user = boundaryUser(u.coords, u.method, u.enabled);
          const days = [...offsets].sort((a, b) => a - b).map((o) => rd(user, t0 + o));
          for (let i = 1; i < days.length; i++) expect(days[i] >= days[i - 1]).toBe(true);
        },
      ),
      { numRuns: runs(200) },
    );
  });

  it('moves on by at most one day at a time, skipping none (20-minute steps over three days, |lng| ≤ 170°)', () => {
    fc.assert(
      fc.property(zoneArb, instantArb, coordsArbWithin(170), methodArb, (zone, t0, coords, method) => {
        checkStepsByOneDay(zone, t0, coords, method);
      }),
      { numRuns: runs(60) },
    );
  });

  // KNOWN BUG: near ±180° longitude, on the days the sun's transit there
  // crosses 00:00 UTC, adhan returns local noon (00:00 UTC) as that day's Fajr,
  // and the next date's Fajr comes the day before. With the device's zone
  // west of the place, a whole revision day is skipped (same cause as the
  // date-line bug below: dayTimes, lib/prayer/times).
  // Minimal: zone UTC, from 2025-02-04 00:00, boundary on, coords Baker Island
  // (0.19, -176.48), MuslimWorldLeague. getFajrTimeFor(2025-02-06) is
  // 2025-02-07 00:00 UTC, getFajrTimeFor(2025-02-07) is 2025-02-06 16:45 UTC.
  // Expected: ... 02-05, 02-06, 02-07. Actual: 2025-02-05 until 02-07 00:00,
  // then 2025-02-07: 2025-02-06 never happens.
  it.failing('KNOWN BUG: moves on by at most one day at a time, skipping none, for any saved place', () => {
    fc.assert(
      fc.property(zoneArb, instantArb, coordsArb, methodArb, (zone, t0, coords, method) => {
        checkStepsByOneDay(zone, t0, coords, method);
      }),
      { numRuns: runs(60), endOnFailure: true, examples: [[ZONES.utc, Date.UTC(2025, 1, 4), { latitude: 0.19, longitude: -176.48 }, 'MuslimWorldLeague']] },
    );
  });

  it.failing('KNOWN BUG example: a UTC phone with Baker Island saved never has 2025-02-06', () => {
    useZone(ZONES.utc);
    const user = boundaryUser({ latitude: 0.19, longitude: -176.48 }, 'MuslimWorldLeague');
    expect(rd(user, Date.UTC(2025, 1, 6, 23, 59))).toBe('2025-02-06');
  });

  it('between local midnight and that day’s Fajr it is yesterday; from Fajr to midnight, today', () => {
    fc.assert(
      fc.property(zoneArb, dayIndexArb, coordsArb, methodArb, fracArb, (zone, i, coords, method, frac) => {
        useZone(zone);
        const user = boundaryUser(coords, method);
        const midnight = dayFromIndex(i);
        const nextMidnight = dayAt(midnight, 1);
        const fajr = getFajrTimeFor(midnight, user);
        // Where that day's Fajr (as the app works it out) falls on that local day, after midnight.
        fc.pre(fajr !== null && dayOf(fajr) === dayOf(midnight) && fajr.getTime() > midnight.getTime());
        const f = fajr!.getTime();
        const today = dayOf(midnight);
        expect(rd(user, midnight.getTime() + Math.floor(frac * (f - midnight.getTime())))).toBe(addDays(today, -1));
        expect(rd(user, f - SECOND)).toBe(addDays(today, -1));
        expect(rd(user, f)).toBe(today);
        expect(rd(user, f + Math.floor(frac * (nextMidnight.getTime() - f)))).toBe(today);
      }),
      { numRuns: runs(300) },
    );
  });

  it('turns exactly at getNextRevisionDayStart, at home away from the date line (boundary on or off)', () => {
    fc.assert(
      fc.property(homeArb(awayFromDateLine), instantArb, methodArb, fc.boolean(), (home, t, method, enabled) => {
        useZone(home.zone);
        checkTurnsAtNextStart(boundaryUser(home.coords, method, enabled), t);
      }),
      { numRuns: runs(400) },
    );
  });

  // KNOWN BUG: getNextRevisionDayStart says the day turns at tomorrow's Fajr
  // whenever that Fajr is still ahead, even when it falls before midnight (the
  // saved place's Fajr comes in the phone's evening: a user back in New York
  // with Makkah still saved; or a Fajr that drifts across midnight). The
  // revision day doesn't turn there: getRevisionDayForUser only rolls back
  // before *today's* Fajr, so it turns at midnight. Near the date line (below)
  // the same check misses a day that turns at midnight instead of at Fajr.
  // Minimal: zone America/New_York, now 2026-01-15 12:00 local, boundary on,
  // coords Makkah (21.4225, 39.8262), method UmmAlQura.
  // Expected: the next start is 2026-01-16 00:00, where the day becomes 01-16.
  // Actual: 2026-01-15 ~20:40 local (Makkah's Fajr of Jan 16), where it is still
  // 2026-01-15. The widget snapshot then lists 01-15 twice, and
  // reminders/plan ends the day at 20:40.
  it.failing('KNOWN BUG: turns exactly at getNextRevisionDayStart for any saved place and zone', () => {
    fc.assert(
      fc.property(zoneArb, instantArb, anyUserArb, (zone, t, u) => {
        useZone(zone);
        checkTurnsAtNextStart(boundaryUser(u.coords, u.method, u.enabled), t);
      }),
      {
        numRuns: runs(400),
        endOnFailure: true,
        examples: [[ZONES.newYork, Date.UTC(2026, 0, 15, 17), { enabled: true, coords: CITIES.makkah, method: 'UmmAlQura' }]],
      },
    );
  });

  it.failing('KNOWN BUG example: New York phone with Makkah saved turns at midnight, not at Makkah’s Fajr', () => {
    useZone(ZONES.newYork);
    const user = boundaryUser({ latitude: 21.4225, longitude: 39.8262 }, 'UmmAlQura');
    const now = new Date(2026, 0, 15, 12, 0);
    expect(rd(user, now.getTime())).toBe('2026-01-15');
    const next = getNextRevisionDayStart(user, now);
    expect(rd(user, next.getTime())).toBe('2026-01-16');
    expect(next.getTime()).toBe(new Date(2026, 0, 16).getTime());
  });

  it('at home away from the date line, the day turns at the Fajr that happens that morning', () => {
    fc.assert(
      fc.property(homeArb(awayFromDateLine), dayIndexArb, methodArb, fracArb, (home, i, method, frac) => {
        checkHomeTurnsAtFajr(home.zone, home.coords, i, method, frac);
      }),
      { numRuns: runs(300) },
    );
  });

  // KNOWN BUG: near the date line, "today's Fajr" is another day's. dayTimes
  // (lib/prayer/times) hands adhan the phone's local date, and adhan reads it
  // as the UTC day holding the sun's transit at that place. Where local noon is
  // near or past 00:00 UTC that is the next local day: in Kiritimati (UTC+14),
  // Samoa and Tonga (UTC+13) every day, in Suva, Fiji (UTC+12, 178.4°E) from
  // 20 Sep to 12 Dec every year. getFajrTimeFor(today) is then tomorrow
  // morning's Fajr, so the revision day is yesterday all day. On the days the
  // transit crosses 00:00 UTC adhan's "Fajr" is local noon (Fiji ~3 days a year).
  // Minimal: zone Pacific/Fiji, 2026-10-20 12:00 local, boundary on, coords
  // Suva (-18.14, 178.44), MuslimWorldLeague.
  // Expected: 2026-10-20 (Fajr was 04:19 that morning). Actual: 2026-10-19
  // (getFajrTimeFor gives 2026-10-21 04:19).
  it.failing('KNOWN BUG: at home anywhere, including near the date line, the day turns at the Fajr that happens that morning', () => {
    fc.assert(
      fc.property(homeArb(Object.values(CITIES)), dayIndexArb, methodArb, fracArb, (home, i, method, frac) => {
        checkHomeTurnsAtFajr(home.zone, home.coords, i, method, frac);
      }),
      {
        numRuns: runs(300),
        endOnFailure: true,
        examples: [[{ zone: CITIES.suva.zone, coords: { latitude: -18.14, longitude: 178.44 } }, 657, 'MuslimWorldLeague', 0.5]],
      },
    );
  });

  it.failing('KNOWN BUG example: Suva, Fiji, at noon on 2026-10-20 is still the 19th', () => {
    useZone('Pacific/Fiji');
    const user = boundaryUser({ latitude: -18.14, longitude: 178.44 }, 'MuslimWorldLeague');
    expect(rd(user, new Date(2026, 9, 20, 12).getTime())).toBe('2026-10-20');
  });

  it.failing('KNOWN BUG example: Kiritimati at noon on 2026-01-15 is still the 14th', () => {
    useZone(ZONES.kiritimati);
    const user = boundaryUser({ latitude: 1.87, longitude: -157.43 }, 'MuslimWorldLeague');
    expect(rd(user, new Date(2026, 0, 15, 12).getTime())).toBe('2026-01-15');
  });
});

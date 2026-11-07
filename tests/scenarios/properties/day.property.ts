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

  // Was a known bug (fixed Nov 2026, dayTimes in lib/prayer/times): near ±180°
  // longitude, on the days the sun's transit crosses 00:00 UTC, adhan returned
  // local noon as that day's Fajr and a whole revision day was skipped. Example:
  // a UTC phone with Baker Island (0.19, -176.48) saved never had 2025-02-06.
  it('moves on by at most one day at a time, skipping none, for any saved place (20-minute steps over three days)', () => {
    fc.assert(
      fc.property(zoneArb, instantArb, coordsArb, methodArb, (zone, t0, coords, method) => {
        checkStepsByOneDay(zone, t0, coords, method);
      }),
      { numRuns: runs(60), examples: [[ZONES.utc, Date.UTC(2025, 1, 4), { latitude: 0.19, longitude: -176.48 }, 'MuslimWorldLeague']] },
    );
  });

  it('example: a UTC phone with Baker Island saved has 2025-02-06', () => {
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

  // Was a known bug (fixed Nov 2026): getNextRevisionDayStart named tomorrow's
  // Fajr whenever it was still ahead, even when the day doesn't turn there (a
  // saved place whose Fajr comes in the phone's evening: a New York phone with
  // Makkah saved turned at ~20:40, not midnight), so the widget listed a day
  // twice and reminders ended the day early.
  it('turns exactly at getNextRevisionDayStart for any saved place and zone (boundary on or off)', () => {
    fc.assert(
      fc.property(zoneArb, instantArb, anyUserArb, (zone, t, u) => {
        useZone(zone);
        checkTurnsAtNextStart(boundaryUser(u.coords, u.method, u.enabled), t);
      }),
      {
        numRuns: runs(400),
        examples: [[ZONES.newYork, Date.UTC(2026, 0, 15, 17), { enabled: true, coords: CITIES.makkah, method: 'UmmAlQura' }]],
      },
    );
  });

  it('turns exactly at getNextRevisionDayStart at home, near the date line too', () => {
    fc.assert(
      fc.property(homeArb(Object.values(CITIES)), instantArb, methodArb, fc.boolean(), (home, t, method, enabled) => {
        useZone(home.zone);
        checkTurnsAtNextStart(boundaryUser(home.coords, method, enabled), t);
      }),
      { numRuns: runs(400) },
    );
  });

  it('example: a New York phone with Makkah saved turns at midnight, not at Makkah’s Fajr', () => {
    useZone(ZONES.newYork);
    const user = boundaryUser({ latitude: 21.4225, longitude: 39.8262 }, 'UmmAlQura');
    const now = new Date(2026, 0, 15, 12, 0);
    expect(rd(user, now.getTime())).toBe('2026-01-15');
    const next = getNextRevisionDayStart(user, now);
    expect(rd(user, next.getTime())).toBe('2026-01-16');
    expect(next.getTime()).toBe(new Date(2026, 0, 16).getTime());
  });

  // Was a known bug (fixed Nov 2026, dayTimes): near the date line "today's
  // Fajr" was another day's. dayTimes handed adhan the phone's local date, which
  // adhan reads as the UTC day of the sun's transit at the place: in Kiritimati
  // (UTC+14), Samoa and Tonga every day, and in Suva, Fiji from 20 Sep to 12 Dec,
  // that is the next local day, so the revision day was yesterday all day.
  it('at home anywhere, near the date line too, the day turns at the Fajr that happens that morning', () => {
    fc.assert(
      fc.property(homeArb(Object.values(CITIES)), dayIndexArb, methodArb, fracArb, (home, i, method, frac) => {
        checkHomeTurnsAtFajr(home.zone, home.coords, i, method, frac);
      }),
      {
        numRuns: runs(300),
        examples: [[{ zone: CITIES.suva.zone, coords: { latitude: -18.14, longitude: 178.44 } }, 657, 'MuslimWorldLeague', 0.5]],
      },
    );
  });

  it('example: Suva, Fiji, at noon on 2026-10-20 is the 20th', () => {
    useZone('Pacific/Fiji');
    const user = boundaryUser({ latitude: -18.14, longitude: 178.44 }, 'MuslimWorldLeague');
    expect(rd(user, new Date(2026, 9, 20, 12).getTime())).toBe('2026-10-20');
  });

  it('example: Kiritimati at noon on 2026-01-15 is the 15th', () => {
    useZone(ZONES.kiritimati);
    const user = boundaryUser({ latitude: 1.87, longitude: -157.43 }, 'MuslimWorldLeague');
    expect(rd(user, new Date(2026, 0, 15, 12).getTime())).toBe('2026-01-15');
  });

  it('the Prayer sheet’s day: its Dhuhr falls on that local day, and Fajr comes before sunrise, at home anywhere', () => {
    fc.assert(
      fc.property(homeArb(Object.values(CITIES)), dayIndexArb, methodArb, (home, i, method) => {
        useZone(home.zone);
        const midnight = dayFromIndex(i);
        const prefs = getPrayerPrefs();
        const t = dayTimes(home.coords, midnight, { method, highLatitude: prefs.highLatitude, madhab: prefs.madhab, adjustments: prefs.adjustments });
        expect(t.day).toBe(dayOf(midnight));
        expect(t.dhuhr && dayOf(t.dhuhr)).toBe(dayOf(midnight));
        if (t.fajr && t.sunrise) expect(t.fajr.getTime()).toBeLessThan(t.sunrise.getTime());
      }),
      { numRuns: runs(300) },
    );
  });
});

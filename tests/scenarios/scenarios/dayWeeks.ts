// Shared by the day-*.scenario files. The revision day (BEHAVIOUR.md, DAY-*), through the app as a user meets it:
// Home's Today post, the session's pages, what is saved, and what Home says
// comes next. Expected pages are worked out here by hand from the plan, not
// with the app's own scheduling code.

import { addDays, dayOf, local, setNow, setZone, MINUTE, ZONES } from '../harness/clock';
import { CITIES, newAccount, pagesRange } from '../harness/account';
import { Home, homeStack } from '../harness/screens';
import { Phone, OpenApp } from '../harness/phone';
import { getFajrTimeFor } from '../../../src/lib/fajrBoundary';
import type { User } from '../../../src/types';

// 20 pages memorized, 5 a day: day 0 of the plan is pages 1–5, day 1 6–10, …,
// day 4 1–5 again.
export const MEMORIZED = pagesRange(1, 20);
export const PER_DAY = 5;
export function pagesOfPlanDay(index: number): number[] {
  const start = (index * PER_DAY) % MEMORIZED.length;
  return MEMORIZED.slice(start, start + PER_DAY);
}
function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/**
 * The Fajr that falls on a calendar day, for the account's location and method.
 * The app's own calculation (getFajrTimeFor, as the Prayer sheet) gives the
 * minutes; it is asked for the days around, and the one on `day` is taken,
 * so that the test doesn't rely on the app picking the right day (it once didn't,
 * near the date line).
 */
export function fajrOn(day: string, user: Pick<User, 'locationCoords' | 'fajrCalculationMethod'>): Date {
  for (const delta of [0, -1, 1]) {
    const fajr = getFajrTimeFor(local(addDays(day, delta)), user as User);
    // Before 10:00: a Fajr, not adhan's noon "Fajr" on the days the transit crosses 00:00 UTC.
    if (fajr && dayOf(fajr) === day && fajr.getHours() < 10) return fajr;
  }
  throw new Error(`no Fajr on ${day}`);
}

/** Home's "Starts at <surah>, p. N" for page N (and not N0, N1…). */
export function startsAt(page: number): RegExp {
  return new RegExp(`^Starts at .*p\\. ${page}(?!\\d)`);
}

/** "08:30" in the current zone, from a Date. */
function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Revises the day Home shows, the way a user does: Start, swipe through every page, Back. */
async function reviseToday(app: OpenApp, home: Home, expected: number[]) {
  const session = await home.startSession();
  expect(session.pages()).toEqual(expected);
  await session.swipeThrough(expected.length);
  await session.back();
  await home.ready();
}

interface Case {
  name: string;
  zone: string;
  city: { latitude: number; longitude: number };
  /** The day the plan is made, at 20:00 (after Fajr, before midnight): the plan's day 0. */
  start: string;
}

// Each zone's week spans its daylight-saving change where it has one.
export const CASES: Case[] = [
  { name: 'Chicago', zone: ZONES.chicago, city: CITIES.chicago, start: '2026-10-29' }, // CDT → CST on Nov 1
  { name: 'New York, spring forward', zone: ZONES.newYork, city: CITIES.newYork, start: '2026-03-05' }, // Mar 8
  { name: 'London', zone: ZONES.london, city: CITIES.london, start: '2026-10-22' }, // BST → GMT on Oct 25
  { name: 'Sydney', zone: ZONES.sydney, city: CITIES.sydney, start: '2026-10-01' }, // AEST → AEDT on Oct 4
  // Fixed Nov 2026 (was a known bug): near the date line the app took another
  // day's Fajr (lib/prayer/times dayTimes), so after Fajr it was still yesterday.
  { name: 'Kiritimati (UTC+14)', zone: ZONES.kiritimati, city: CITIES.kiritimati, start: '2026-11-02' },
  // The sun's transit at Suva crosses 00:00 UTC in Oct–Nov: adhan's set for the
  // phone's date was the next day's, and on some days its "Fajr" was at noon.
  { name: 'Suva, Fiji (UTC+12)', zone: ZONES.fiji, city: CITIES.suva, start: '2026-11-02' },
  { name: 'Baker Island (UTC−12)', zone: ZONES.bakerIsland, city: { latitude: 0.19, longitude: -176.48 }, start: '2026-11-02' },
  { name: 'Kathmandu (UTC+5:45)', zone: ZONES.kathmandu, city: CITIES.kathmandu, start: '2026-11-02' },
  { name: 'Reykjavik (64°N)', zone: ZONES.reykjavik, city: CITIES.reykjavik, start: '2026-11-02' },
  { name: 'Makkah', zone: ZONES.riyadh, city: CITIES.makkah, start: '2026-11-02' },
];

/** When, on each following calendar day, the user opens the app. */
type Moment = (day: string, fajr: Date) => Date;
const MOMENTS: { label: string; at: Moment; how: 'cold start' | 'from the background' }[] = [
  { label: '00:05, just after midnight', at: (d) => local(`${d} 00:05`), how: 'cold start' },
  { label: '00:30, after midnight before Fajr', at: (d) => local(`${d} 00:30`), how: 'from the background' },
  { label: 'two minutes before Fajr', at: (_d, f) => new Date(f.getTime() - 2 * MINUTE), how: 'cold start' },
  { label: 'two minutes after Fajr', at: (_d, f) => new Date(f.getTime() + 2 * MINUTE), how: 'from the background' },
  { label: 'noon', at: (d) => local(`${d} 12:00`), how: 'cold start' },
  { label: '23:55, just before midnight', at: (d) => local(`${d} 23:55`), how: 'from the background' },
];

/** A week of days opened at every time of day, for each case, Fajr boundary on and off. */
export function describeWeeks(names: string[]): void {
  const cases = CASES.filter((c) => names.includes(c.name));
  if (cases.length !== names.length) throw new Error(`unknown case in ${names.join(', ')}`);
  describe.each(cases)('$name', ({ zone, city, start }) => {
    describe.each([
      { fajr: true, rule: 'DAY-2' },
      { fajr: false, rule: 'DAY-1' },
    ])('Fajr boundary $fajr', ({ fajr, rule }) => {
      it(`[${rule}] [DAY-3] [DAY-5] [DAY-6] [SESS-2] a week opened at every time of day: today's pages, saved to the right day, tomorrow next`, async () => {
        setZone(zone);
        setNow(`${start} 20:00`);
        const phone = new Phone();
        const user: Partial<User> = {
          dailyPageCapacity: PER_DAY,
          fajrBoundaryEnabled: fajr,
          locationCoords: fajr ? city : null,
          fajrCalculationMethod: 'NorthAmerica',
        };
        let app = await newAccount(phone, { memorized: MEMORIZED, user });
        await app.close();
        app = await phone.open(homeStack);
        let home = new Home(app);

        for (let i = 0; i < MOMENTS.length; i++) {
          const calendarDay = addDays(start, i + 1);
          const fajrTime = fajrOn(calendarDay, { locationCoords: city, fajrCalculationMethod: 'NorthAmerica' });
          const moment = MOMENTS[i];
          const at = moment.at(calendarDay, fajrTime);
          // Fajr on: before that morning's Fajr, it is still the day before.
          const revisionDay = fajr && at.getTime() < fajrTime.getTime() ? addDays(calendarDay, -1) : calendarDay;
          const expected = pagesOfPlanDay(daysBetween(start, revisionDay));
          const where = `${calendarDay} ${hhmm(at)} (${moment.label}, ${moment.how}), revision day ${revisionDay}`;

          if (moment.how === 'cold start') {
            await app.close();
            setNow(at);
            app = await phone.open(homeStack);
            home = new Home(app);
          } else {
            await app.background();
            setNow(at);
            await app.foreground();
          }
          await app.untilLoaded();
          await home.ready();
          expect({ where, title: home.title() }).toEqual({ where, title: expect.stringMatching(startsAt(expected[0])) });

          await reviseToday(app, home, expected);
          await app.untilSynced();
          const log = app.app.logs.find((l) => l.date === revisionDay);
          expect({ where, saved: log?.pagesRevised }).toEqual({ where, saved: expected });

          // Done: Home offers the next revision day, which is the revision day + 1.
          const next = pagesOfPlanDay(daysBetween(start, addDays(revisionDay, 1)));
          expect({ where, ahead: home.ahead() }).toEqual({ where, ahead: expect.stringMatching(new RegExp(`^Tomorrow starts at .*p\\. ${next[0]}\\b`)) });
        }
        await app.close();
      });
    });
  });
}

// The revision day (BEHAVIOUR.md, DAY-*): a session across the change, and a
// plan made before Fajr. The weeks are in day-*.scenario.tsx (dayWeeks.ts).

import { local, setNow, setZone, MINUTE, ZONES } from '../harness/clock';
import { CITIES, newAccount } from '../harness/account';
import { Home, homeStack } from '../harness/screens';
import { Phone } from '../harness/phone';
import { fajrOn, MEMORIZED, pagesOfPlanDay, PER_DAY, startsAt } from './dayWeeks';

describe('a session open across the boundary', () => {
  it.each([
    { fajr: true, rule: 'DAY-2' },
    { fajr: false, rule: 'DAY-1' },
  ])('[DAY-4] [$rule] Fajr boundary $fajr: pages revised after the day changed still count for the day it opened on', async ({ fajr }) => {
    setZone(ZONES.chicago);
    const start = '2026-11-02';
    setNow(`${start} 20:00`);
    const phone = new Phone();
    let app = await newAccount(phone, {
      memorized: MEMORIZED,
      user: { dailyPageCapacity: PER_DAY, fajrBoundaryEnabled: fajr, locationCoords: fajr ? CITIES.chicago : null },
    });
    await app.close();
    const fajrTime = fajrOn('2026-11-04', { locationCoords: CITIES.chicago, fajrCalculationMethod: 'NorthAmerica' });
    // Opened just before the change: 3 minutes before Fajr, or 23:58.
    const change = fajr ? fajrTime : local('2026-11-04 00:00');
    const openDay = '2026-11-03';
    setNow(new Date(change.getTime() - 3 * MINUTE));
    app = await phone.open(homeStack);
    const home = new Home(app);
    await home.ready();
    const session = await home.startSession();
    expect(session.pages()).toEqual(pagesOfPlanDay(1));
    await session.swipeThrough(2);
    setNow(new Date(change.getTime() + 3 * MINUTE));
    await session.swipeThrough(3);
    await session.back();
    await app.untilSynced();
    expect(app.app.logs.map((l) => [l.date, l.pagesRevised])).toEqual([[openDay, pagesOfPlanDay(1)]]);

    // Home, now on the next day, has that day's pages to do.
    await app.background();
    await app.foreground();
    await home.ready();
    expect(home.title()).toMatch(startsAt(pagesOfPlanDay(2)[0]));
    expect(home.ahead()).toBeNull();
  });
});

describe('a plan made between midnight and Fajr', () => {
  it('[DAY-7] [DAY-2] starts on the revision day the user is in', async () => {
    setZone(ZONES.chicago);
    setNow('2026-11-04 00:30');
    const phone = new Phone();
    let app = await newAccount(phone, {
      memorized: MEMORIZED,
      user: { dailyPageCapacity: PER_DAY, fajrBoundaryEnabled: true, locationCoords: CITIES.chicago },
    });
    await app.close();
    app = await phone.open(homeStack);
    const home = new Home(app);
    await home.ready();
    // Still Nov 3 (before Fajr): the plan's first day, pages 1–5.
    expect(home.title()).toMatch(startsAt(1));
    const session = await home.startSession();
    expect(session.pages()).toEqual(pagesOfPlanDay(0));
    await session.swipeThrough(5);
    await session.back();
    await app.untilSynced();
    expect(app.app.logs.map((l) => l.date)).toEqual(['2026-11-03']);

    // After Fajr: Nov 4, the plan's second day.
    await app.close();
    setNow('2026-11-04 08:00');
    app = await phone.open(homeStack);
    const later = new Home(app);
    await later.ready();
    expect(later.title()).toMatch(startsAt(pagesOfPlanDay(1)[0]));
  });
});

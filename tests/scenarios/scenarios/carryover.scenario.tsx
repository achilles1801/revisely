// Carrying pages over (BEHAVIOUR.md, CARRY-*) and missed days (SCHED-5).

import { setNow, setZone, ZONES } from '../harness/clock';
import { CITIES, newAccount, pagesRange } from '../harness/account';
import { Home, homeStack } from '../harness/screens';
import { Phone, OpenApp } from '../harness/phone';
import type { User } from '../../../src/types';

// Plan from Monday Nov 2 2026, 5 a day over pages 1–20.
const MEMORIZED = pagesRange(1, 20);

async function account(user: Partial<User>): Promise<Phone> {
  setZone(ZONES.chicago);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: MEMORIZED, user: { dailyPageCapacity: 5, ...user } });
  await app.close();
  return phone;
}

async function openHome(phone: Phone, at: string): Promise<{ app: OpenApp; home: Home }> {
  setNow(at);
  const app = await phone.open(homeStack);
  const home = new Home(app);
  await home.ready();
  return { app, home };
}

/** Monday's session with only its first `n` pages revised. */
async function partMonday(phone: Phone, n: number, at = '2026-11-02 21:00') {
  const { app, home } = await openHome(phone, at);
  const session = await home.startSession();
  await session.swipeThrough(n);
  await session.back();
  await app.untilSynced();
  await app.close();
}

async function todaysSession(home: Home): Promise<number[]> {
  const session = await home.startSession();
  const pages = session.pages();
  await session.back();
  return pages;
}

describe.each([
  { mode: 'shift' as const, rule: 'CARRY-2', tuesday: [3, 4, 5, 6, 7], wednesday: [8, 9, 10, 11, 12] },
  { mode: 'add' as const, rule: 'CARRY-3', tuesday: [3, 4, 5, 6, 7, 8, 9, 10], wednesday: [11, 12, 13, 14, 15] },
])('carry-over mode $mode', ({ mode, rule, tuesday, wednesday }) => {
  it(`[CARRY-1] [${rule}] Monday left 3 pages: Tuesday offers them once; after adding, Tuesday and Wednesday are as the mode says`, async () => {
    const phone = await account({ carryOverMode: mode });
    await partMonday(phone, 2);

    let { app, home } = await openHome(phone, '2026-11-03 09:00');
    expect(home.carryOver()).toBe('Add 3 from yesterday');
    await home.tap('today-carry-over');
    await app.untilSynced();
    await app.until(() => home.carryOver() == null, 'the offer to go');
    expect(home.detail()).toMatch(/3 from yesterday first/);
    expect(await todaysSession(home)).toEqual(tuesday);
    await app.close();

    // Once a day: the next launch doesn't offer them again.
    ({ app, home } = await openHome(phone, '2026-11-03 12:00'));
    expect(home.carryOver()).toBeNull();
    expect(await todaysSession(home)).toEqual(tuesday);
    // Tuesday revised whole.
    const session = await home.startSession();
    await session.swipeThrough(tuesday.length);
    await session.back();
    await app.untilSynced();
    await app.close();

    ({ app, home } = await openHome(phone, '2026-11-04 09:00'));
    expect(home.carryOver()).toBeNull();
    expect(await todaysSession(home)).toEqual(wednesday);
    await app.close();
  });
});

it('[CARRY-1] [DAY-2] before Fajr, the leftovers are still "today’s", not yesterday’s', async () => {
  const phone = await account({ fajrBoundaryEnabled: true, locationCoords: CITIES.chicago });
  await partMonday(phone, 2);
  // Tuesday 00:30: still Monday (before Fajr). Nothing is offered; Monday's session goes on.
  let { app, home } = await openHome(phone, '2026-11-03 00:30');
  expect(home.carryOver()).toBeNull();
  expect(await todaysSession(home)).toEqual([1, 2, 3, 4, 5]);
  await app.close();
  // After Fajr: Tuesday, with Monday's three to add.
  ({ app, home } = await openHome(phone, '2026-11-03 07:00'));
  expect(home.carryOver()).toBe('Add 3 from yesterday');
  await app.close();
});

describe('missed days', () => {
  it('[CARRY-4] [SCHED-5] a day with no session carries nothing; the next day has its own pages', async () => {
    const phone = await account({});
    // Nothing on Monday. Tuesday: no offer, Tuesday's pages.
    const { app, home } = await openHome(phone, '2026-11-03 09:00');
    expect(home.carryOver()).toBeNull();
    expect(await todaysSession(home)).toEqual([6, 7, 8, 9, 10]);
    await app.close();
  });

  it('[SCHED-5] [SCHED-1] ten days away: that day’s pages, nothing piled up', async () => {
    const phone = await account({});
    await partMonday(phone, 5);
    // Thursday Nov 12 is day 10 of the plan: pages 11–15 (10 × 5 = 50, and 50 mod 20 = 10).
    const { app, home } = await openHome(phone, '2026-11-12 09:00');
    expect(home.carryOver()).toBeNull();
    expect(await todaysSession(home)).toEqual([11, 12, 13, 14, 15]);
    await app.close();
  });

  it('[CARRY-4] a day started and finished leaves nothing to carry', async () => {
    const phone = await account({});
    await partMonday(phone, 5);
    const { app, home } = await openHome(phone, '2026-11-03 09:00');
    expect(home.carryOver()).toBeNull();
    await app.close();
  });
});

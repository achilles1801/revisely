// Carrying pages over (BEHAVIOUR.md, CARRY-*) and missed days (SCHED-5).

import { setNow, setZone, ZONES } from '../harness/clock';
import { CITIES, newAccount, pagesRange, saveCustomPlan, saveEditedPlan } from '../harness/account';
import { Home, homeStack } from '../harness/screens';
import { Phone, OpenApp } from '../harness/phone';
import type { User } from '../../../src/types';

// Plan from Monday Nov 2 2026, 5 a day over pages 1–20.
const MEMORIZED = pagesRange(1, 20);

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

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
    expect(home.catchUp()).toBe('Left yesterday · Revise p. 3–5');
    expect(home.carryOver()).toBe('Add to today');
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
  expect(home.catchUp()).toBe('Left yesterday · Revise p. 3–5');
  expect(home.carryOver()).toBe('Add to today');
  await app.close();
});

describe('missed days', () => {
  // Nothing was started on Monday (1–5), so it is missed. Tuesday offers it; the
  // schedule does not move until the user taps.
  it.each([
    { mode: 'shift' as const, rule: 'CARRY-2', tuesday: [1, 2, 3, 4, 5], wednesday: [6, 7, 8, 9, 10], again: 'Missed yesterday · Revise p. 1–5' },
    { mode: 'add' as const, rule: 'CARRY-3', tuesday: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], wednesday: [11, 12, 13, 14, 15], again: 'Missed yesterday · Revise p. 1–10' },
  ])('[CARRY-4] [SCHED-5] [$rule] [CARRY-1] a missed day is offered, not added: nothing moves until the user adds it ($mode)', async ({ mode, tuesday, wednesday, again }) => {
    const phone = await account({ carryOverMode: mode });
    let { app, home } = await openHome(phone, '2026-11-03 09:00');
    expect(home.catchUp()).toBe('Missed yesterday · Revise p. 1–5');
    expect(home.carryOver()).toBe('Add to today');
    // Before the tap, Tuesday is still its own pages.
    expect(await todaysSession(home)).toEqual([6, 7, 8, 9, 10]);
    await home.tap('today-carry-over');
    await app.untilSynced();
    await app.until(() => home.carryOver() == null, 'the offer to go');
    expect(await todaysSession(home)).toEqual(tuesday);
    await app.close();

    // Once a day: the next launch doesn't offer it again today. Wednesday is its own pages, and
    // Tuesday's pages are still undone, so they are offered again (CARRY-4), not added.
    ({ app, home } = await openHome(phone, '2026-11-04 09:00'));
    expect(home.catchUp()).toBe(again);
    expect(home.carryOver()).toBe('Add to today');
    expect(await todaysSession(home)).toEqual(wednesday);
    await app.close();
  });

  it('[CARRY-1] [CARRY-4] three missed days are one line: Thursday holds them all, once added', async () => {
    const phone = await account({});
    // Monday, Tuesday and Wednesday all missed; Thursday’s own pages are 16–20.
    const { app, home } = await openHome(phone, '2026-11-05 09:00');
    expect(home.catchUp()).toBe('Missed 3 days · Revise p. 1–15');
    expect(await todaysSession(home)).toEqual([16, 17, 18, 19, 20]);
    await home.tap('today-carry-over');
    await app.untilSynced();
    await app.until(() => home.carryOver() == null, 'the offer to go');
    expect(await todaysSession(home)).toEqual(range(1, 15));
    await app.close();
  });

  it('[SCHED-5] [SCHED-1] [CARRY-4] ten days away: the last three days are offered, the day’s own pages stay', async () => {
    const phone = await account({});
    await partMonday(phone, 5);
    // Thursday Nov 12 is day 10 of the plan: pages 11–15 (10 × 5 = 50, and 50 mod 20 = 10).
    // Nov 9–11 had no session, so they are the last three days: 16–20, 1–5 and 6–10.
    const { app, home } = await openHome(phone, '2026-11-12 09:00');
    expect(home.catchUp()).toBe('Missed 3 days · Revise pp. 1–10, 16–20');
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

describe('the plan editor', () => {
  it('[CARRY-5] [CARRY-2] scattered leftovers, then an edit to a later day saved: today stays as it was, without the page revised yesterday', async () => {
    const phone = await account({});
    // A custom plan from Monday: Mon 1–3, Tue 4–6, Wed 7–9.
    let { app, home } = await openHome(phone, '2026-11-02 20:30');
    await saveCustomPlan(app, [[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    let session = await home.startSession();
    expect(session.pages()).toEqual([1, 2, 3]);
    await session.swipeThrough(3);
    await session.back();
    await app.untilSynced();
    await app.close();

    // Tuesday: page 5 only. Swiping on marks 4 and 5; back on 4, the check comes off.
    ({ app, home } = await openHome(phone, '2026-11-03 18:00'));
    session = await home.startSession();
    expect(session.pages()).toEqual([4, 5, 6]);
    await session.swipe();
    await session.swipe();
    await session.swipeBack();
    await session.swipeBack();
    await session.uncheck();
    await session.back();
    await app.untilSynced();
    expect(app.app.logs.find((l) => l.date === '2026-11-03')?.pagesRevised).toEqual([5]);
    await app.close();

    // Wednesday: 4 and 6 are added; today is 4, 6, then Wednesday's 7 (8 and 9 move on).
    ({ app, home } = await openHome(phone, '2026-11-04 09:00'));
    expect(home.carryOver()).not.toBeNull();
    await home.tap('today-carry-over');
    await app.untilSynced();
    await app.until(() => home.carryOver() == null, 'the offer to go');
    expect(await todaysSession(home)).toEqual([4, 6, 7]);

    // The plan editor: the last day reordered, saved. Today is untouched; 5 doesn't come back.
    await saveEditedPlan(app, (shown) => shown.map((d, i) => (i === shown.length - 1 ? [...d].reverse() : d)));
    expect(await todaysSession(home)).toEqual([4, 6, 7]);
    expect(home.detail()).toMatch(/2 from yesterday first/);
    await app.close();

    ({ app, home } = await openHome(phone, '2026-11-04 12:00'));
    expect(await todaysSession(home)).toEqual([4, 6, 7]);
    await app.close();
  });
});

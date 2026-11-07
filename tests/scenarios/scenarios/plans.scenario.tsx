// Plan types (BEHAVIOUR.md, SCHED-*): what each day holds, as the session opens it.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange, saveCustomPlan } from '../harness/account';
import { Home, homeStack } from '../harness/screens';
import { Phone } from '../harness/phone';
import { buildBalancedPlanFromStart } from '../../../src/lib/planBuilder';
import type { User } from '../../../src/types';

async function sessionPagesOn(phone: Phone, at: string): Promise<number[]> {
  setNow(at);
  const app = await phone.open(homeStack);
  const home = new Home(app);
  await home.ready();
  const session = await home.startSession();
  const pages = session.pages();
  await session.back();
  await app.close();
  return pages;
}

async function account(memorized: number[], user: Partial<User>): Promise<Phone> {
  setZone(ZONES.london);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const app = await newAccount(phone, { memorized, user });
  await app.close();
  return phone;
}

it('[SCHED-1] pages plan: 7 a day over 30 pages, wrapping round', async () => {
  const phone = await account(pagesRange(1, 30), { dailyPageCapacity: 7 });
  // Day 4 (Fri Nov 6): pages 29, 30, then 1–5.
  expect(await sessionPagesOn(phone, '2026-11-06 09:00')).toEqual([29, 30, 1, 2, 3, 4, 5]);
  // Fewer memorized than a day's amount: all of them, every day.
  const small = await account(pagesRange(100, 103), { dailyPageCapacity: 10 });
  expect(await sessionPagesOn(small, '2026-11-05 09:00')).toEqual([100, 101, 102, 103]);
});

it('[SCHED-2] juz plan: a juz a day, its memorized pages', async () => {
  // Juz 29 is pages 562–581, juz 30 582–604.
  const phone = await account(pagesRange(562, 604), { scheduleMode: 'juz', dailyJuzCount: 1 });
  expect(await sessionPagesOn(phone, '2026-11-02 21:00')).toEqual(pagesRange(562, 581));
  expect(await sessionPagesOn(phone, '2026-11-03 09:00')).toEqual(pagesRange(582, 604));
  expect(await sessionPagesOn(phone, '2026-11-04 09:00')).toEqual(pagesRange(562, 581));
});

it('[SCHED-3] custom plan: its days in order from the day it was saved, looping', async () => {
  const phone = await account(pagesRange(1, 6), { dailyPageCapacity: 5 });
  setNow('2026-11-03 10:00');
  const app = await phone.open();
  await app.untilLoaded();
  await saveCustomPlan(app, [[1, 2], [3, 4, 5], [6]]);
  await app.close();
  expect(await sessionPagesOn(phone, '2026-11-03 11:00')).toEqual([1, 2]);
  expect(await sessionPagesOn(phone, '2026-11-04 09:00')).toEqual([3, 4, 5]);
  expect(await sessionPagesOn(phone, '2026-11-05 09:00')).toEqual([6]);
  expect(await sessionPagesOn(phone, '2026-11-06 09:00')).toEqual([1, 2]);
});

it('[SCHED-4] reverse plan: from the end to the start, the same pages', async () => {
  const memorized = pagesRange(1, 20);
  const phone = await account(memorized, { dailyPageCapacity: 5 });
  setNow('2026-11-03 10:00');
  const app = await phone.open();
  await app.untilLoaded();
  const days = buildBalancedPlanFromStart(memorized, { pagesPerDay: 5, startPage: 20, direction: 'reverse' });
  await saveCustomPlan(app, days, 'reverse');
  await app.close();
  const seen: number[][] = [];
  for (const day of ['2026-11-03 11:00', '2026-11-04 09:00', '2026-11-05 09:00', '2026-11-06 09:00']) {
    seen.push(await sessionPagesOn(phone, day));
  }
  expect(seen[0]).toContain(20);
  expect(seen[3]).toContain(1);
  expect(seen.flat().sort((a, b) => a - b)).toEqual(memorized);
});

it('[SCHED-6] [CARRY-2] a page on two neighbouring days, with pages carried over: no day holds it twice', async () => {
  const phone = await account(pagesRange(1, 8), { dailyPageCapacity: 3 });
  // Page 3 ends Monday and starts Tuesday (a page two surahs share).
  setNow('2026-11-02 20:30');
  let app = await phone.open(homeStack);
  let home = new Home(app);
  await home.ready();
  await saveCustomPlan(app, [[1, 2, 3], [3, 4, 5], [6, 7, 8]]);
  // Monday: page 1 only.
  let session = await home.startSession();
  expect(session.pages()).toEqual([1, 2, 3]);
  await session.swipe();
  await session.back();
  await app.untilSynced();
  await app.close();

  // Tuesday: Monday's 2 is added (3 is Tuesday's own). Keep daily amount: 2, 3, 4; 5 moves on.
  setNow('2026-11-03 09:00');
  app = await phone.open(homeStack);
  home = new Home(app);
  await home.ready();
  expect(home.carryOver()).not.toBeNull();
  await home.tap('today-carry-over');
  await app.untilSynced();
  await app.until(() => home.carryOver() == null, 'the offer to go');
  session = await home.startSession();
  expect(session.pages()).toEqual([2, 3, 4]);
  await session.swipeThrough(3);
  await session.back();
  await app.untilSynced();
  await app.close();

  // The next cycle, shifted back a page. Friday's window covers both copies of
  // page 3 (it once showed 3, 3, 4): page 3 once, then 4 and 5.
  expect(await sessionPagesOn(phone, '2026-11-05 09:00')).toEqual([8, 1, 2]);
  expect(await sessionPagesOn(phone, '2026-11-06 09:00')).toEqual([3, 4, 5]);
  const saturday = await sessionPagesOn(phone, '2026-11-07 09:00');
  expect(new Set(saturday).size).toBe(saturday.length);
});

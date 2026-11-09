// A revision session (BEHAVIOUR.md, SESS-*): what marking and leaving save.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { Home, homeStack } from '../harness/screens';
import { Phone } from '../harness/phone';

async function home(): Promise<{ phone: Phone; home: Home; app: Awaited<ReturnType<Phone['open']>> }> {
  setZone(ZONES.kolkata);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const setup = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  await setup.close();
  setNow('2026-11-02 21:00');
  const app = await phone.open(homeStack);
  const h = new Home(app);
  await h.ready();
  return { phone, home: h, app };
}

it('[SESS-3] nothing marked: leaving saves nothing', async () => {
  const { app, home: h } = await home();
  const session = await h.startSession();
  await session.back();
  await app.idle(300);
  expect(app.app.logs).toEqual([]);
  expect(app.app.pendingChanges).toBe(0);
  await app.close();
});

it('[SESS-1] [SESS-3] two pages swiped, one checked then unchecked: the two are saved, the day goes on', async () => {
  const { phone, app, home: h } = await home();
  const session = await h.startSession();
  await session.swipeThrough(2);
  await session.check();
  await session.uncheck();
  await session.back();
  await app.untilSynced();
  expect(app.app.logs.map((l) => [l.date, l.pagesRevised])).toEqual([['2026-11-02', [1, 2]]]);
  expect(h.today()).not.toMatch(/Done/);
  await app.close();

  // Reopened: the session resumes; leaving again changes nothing.
  const again = await phone.open(homeStack);
  const h2 = new Home(again);
  await h2.ready();
  const resumed = await h2.startSession();
  expect(resumed.pages()).toEqual([1, 2, 3, 4, 5]);
  await resumed.back();
  await again.idle(300);
  expect(again.app.logs.map((l) => [l.date, l.pagesRevised])).toEqual([['2026-11-02', [1, 2]]]);
  await again.close();
});

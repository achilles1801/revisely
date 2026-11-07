// An account reset by the owner (BEHAVIOUR.md, RESET-1): functions/scripts/reset-account.js.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { resetAccount } from '../harness/admin';
import { Home, homeStack } from '../harness/screens';
import { Phone } from '../harness/phone';

it('[RESET-1] [SYNC-2] after a reset, every phone starts again as new, and a change made offline before it is dropped', async () => {
  setZone(ZONES.amman);
  setNow('2026-11-02 20:00');
  const a = new Phone('phone A');
  let app = await newAccount(a, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  // Monday revised.
  await app.close();
  app = await a.open(homeStack);
  let home = new Home(app);
  await home.ready();
  let session = await home.startSession();
  await session.swipeThrough(5);
  await session.back();
  await app.untilSynced();
  await app.close();

  // A second phone, holding its copy of the account.
  const b = new Phone('phone B');
  let other = await b.open();
  await other.signIn(a.email!);
  await other.close();

  // Tuesday on A, offline: a change the server hasn't seen.
  await a.goOffline();
  setNow('2026-11-03 09:00');
  app = await a.open(homeStack);
  home = new Home(app);
  await home.ready();
  session = await home.startSession();
  await session.swipeThrough(5);
  await session.back();
  expect(app.app.pendingChanges).toBeGreaterThan(0);
  await app.close();

  // The owner resets the account.
  const done = resetAccount(a.email!);
  expect(done).toMatchObject({ sessions: 1 });

  // A, back online: new, and Tuesday's session never reaches the server.
  await a.goOnline();
  app = await a.open();
  await app.until(() => app.app.user != null && !app.app.loading, 'the account to load');
  await app.until(() => !app.app.onboardingComplete && app.app.logs.length === 0, 'phone A to show the reset account');
  await app.untilSynced();
  expect(app.app.pages.filter((p) => p.status === 'memorized')).toHaveLength(0);
  await app.close();

  // B too.
  other = await b.open();
  await other.until(() => other.app.user != null && !other.app.loading, 'the account to load');
  await other.until(() => !other.app.onboardingComplete && other.app.logs.length === 0, 'phone B to show the reset account');
  await other.close();

  // And the server: a third phone signing in finds nothing from before.
  const c = new Phone('phone C');
  const third = await c.open();
  await third.signIn(a.email!);
  await third.idle(1000);
  expect(third.app.logs).toEqual([]);
  expect(third.app.onboardingComplete).toBe(false);
  await third.close();
});

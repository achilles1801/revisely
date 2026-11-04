// Offline, devices and accounts (BEHAVIOUR.md, SYNC-*).

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { Home, homeStack } from '../harness/screens';
import { newEmail, Phone, PASSWORD } from '../harness/phone';

const MEMORIZED = pagesRange(1, 20);

it('[SYNC-1] [SYNC-2] [SYNC-3] a session offline: kept on the phone, sent when back online, seen on another device', async () => {
  setZone(ZONES.amman);
  setNow('2026-11-02 20:00');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: MEMORIZED, user: { dailyPageCapacity: 5 } });
  await app.close();

  // Tuesday, no connection: a cold start shows the account from the phone's copy.
  await phone.goOffline();
  setNow('2026-11-03 09:00');
  app = await phone.open(homeStack);
  let home = new Home(app);
  await home.ready();
  const session = await home.startSession();
  expect(session.pages()).toEqual([6, 7, 8, 9, 10]);
  await session.swipeThrough(5);
  await session.back();
  expect(home.today()).toMatch(/Done/);
  expect(app.app.pendingChanges).toBeGreaterThan(0);
  await app.close();

  // Still offline, the app quit and opened again: still done.
  app = await phone.open(homeStack);
  home = new Home(app);
  await home.ready();
  expect(home.today()).toMatch(/Done/);

  // Back online: the change reaches the server.
  await phone.goOnline();
  await app.untilSynced();
  await app.close();

  // A second phone, signed in to the account.
  const other = new Phone('second phone');
  const second = await other.open(homeStack);
  await second.signIn(phone.email!);
  const otherHome = new Home(second);
  await otherHome.ready();
  expect(otherHome.today()).toMatch(/Done/);
  expect(second.app.logs.map((l) => [l.date, l.pagesRevised])).toEqual([['2026-11-03', [6, 7, 8, 9, 10]]]);
  await second.close();
});

it('[SYNC-1] [SYNC-3] two phones on different days: both days are kept', async () => {
  setZone(ZONES.london);
  setNow('2026-11-02 20:00');
  const a = new Phone('phone A');
  let app = await newAccount(a, { memorized: MEMORIZED, user: { dailyPageCapacity: 5 } });
  await app.close();
  const b = new Phone('phone B');
  let other = await b.open();
  await other.signIn(a.email!);
  await other.close();

  // Tuesday on A, offline.
  await a.goOffline();
  setNow('2026-11-03 09:00');
  app = await a.open(homeStack);
  let session = await new Home(app).startSession();
  await session.swipeThrough(5);
  await session.back();
  await app.close();

  // Wednesday on B, online.
  setNow('2026-11-04 09:00');
  other = await b.open(homeStack);
  const homeB = new Home(other);
  await homeB.ready();
  session = await homeB.startSession();
  expect(session.pages()).toEqual([11, 12, 13, 14, 15]);
  await session.swipeThrough(5);
  await session.back();
  await other.untilSynced();
  await other.close();

  // A comes back online: both days, on both phones.
  await a.goOnline();
  app = await a.open();
  await app.untilLoaded();
  await app.untilSynced();
  await app.until(() => app.app.logs.length === 2, 'both days on phone A');
  expect(app.app.logs.map((l) => l.date).sort()).toEqual(['2026-11-03', '2026-11-04']);
  await app.close();
  other = await b.open();
  await other.untilLoaded();
  await other.until(() => other.app.logs.length === 2, 'both days on phone B');
  await other.close();
});

it.failing('KNOWN BUG: [SYNC-4] a new account loads after sign-up without a relaunch', async () => {
  // AppContext ignores page snapshots from Firestore's cache. On sign-up the
  // pages are written by this phone (AuthContext.signUp → createUser) while the
  // pages listener is starting, so its only snapshot can be the local one
  // (fromCache: true). subscribeToPages doesn't ask for metadata changes
  // (includeMetadataChanges), so the server's confirmation never arrives as a
  // snapshot, and the app stays on "loading" until it is relaunched.
  setZone(ZONES.chicago);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const app = await phone.open();
  await app.act(() => app.auth.signUp(newEmail(), PASSWORD, 'New'));
  await app.until(() => !!app.app.user && app.app.pages.length === 604, 'the new account to load', 30_000);
  await app.close();
});

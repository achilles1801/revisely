// Offline, devices and accounts (BEHAVIOUR.md, SYNC-*).

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { Home, homeStack } from '../harness/screens';
import { newEmail, Phone, PASSWORD, type OpenApp } from '../harness/phone';
import { trackListeners, type ListenerTracker } from '../harness/listeners';
import { createAccountPartWay } from '../harness/admin';

const MEMORIZED = pagesRange(1, 20);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

// Was a known bug (fixed Nov 2026, firestoreService onQuerySnapshot): the
// pages written by sign-up (AuthContext.signUp → createUser) while the pages
// listener was starting gave it only a cached snapshot, the server's
// confirmation never came as a snapshot (no includeMetadataChanges), and the
// app, which ignores cached page snapshots, stayed on "loading" until it was
// relaunched. newAccount (harness/account.ts) checks the same in every scenario.
it('[SYNC-4] a new account loads after sign-up without a relaunch', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const app = await phone.open();
  await app.act(() => app.auth.signUp(newEmail(), PASSWORD, 'New'));
  await app.until(() => !!app.app.user && app.app.pages.length === 604 && !app.app.loading, 'the new account to load', 30_000);
  await app.close();
});

// Sign-up as on a phone: the app renders while it runs, so the account's listeners
// open as soon as Auth has the new user, while sign-up is still setting the name and
// writing the account. (Inside act, as `app.signUp` and `newAccount` run it, nothing
// renders until sign-up has ended, and the listeners open after it.)
function signUpAsOnAPhone(app: OpenApp, email: string, name: string): Promise<void> {
  return app.auth.signUp(email, PASSWORD, name);
}

// Was a known bug (Nov 2026): from Nov 10 the pages listener waited while sign-up
// wrote the 604 pages (no freeze), and the app showed the pages only once the server
// had acknowledged both batches and the listener had read them back. A new account
// stayed on "loading" for as long as that took: over a minute on a CI simulator, and
// 01-onboarding failed on it. The app now shows the pages it wrote at once.
it('[SYNC-4] a new account loads once sign-up has written its pages, before the server acknowledges them', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-15 20:00');
  const phone = new Phone();
  let listeners!: ListenerTracker;
  // The server gets the pages at once; its acknowledgements reach the phone only when let through.
  let letAcksThrough!: () => void;
  const acks = new Promise<void>((resolve) => {
    letAcksThrough = resolve;
  });
  let held = 0;
  const app = await phone.open((mods) => {
    listeners = trackListeners(mods);
    const fs = mods.require<Record<string, (...args: unknown[]) => { commit: () => Promise<void> }>>('firebase/firestore');
    const writeBatch = fs.writeBatch;
    jest.spyOn(fs, 'writeBatch').mockImplementation((...args: unknown[]) => {
      const batch = writeBatch(...args);
      const commit = batch.commit.bind(batch);
      batch.commit = () => {
        held++;
        return commit().then(() => acks);
      };
      return batch;
    });
    return null;
  });
  const signUp = signUpAsOnAPhone(app, newEmail(), 'New');
  await app.until(() => held >= 2, 'the pages to be written');
  await app.until(() => !!app.app.user && app.app.pages.length === 604 && !app.app.loading, 'the new account to load', 15_000);
  // Every page as a new account starts it, and the pages listener still waiting for the writes.
  expect(app.app.pages.every((p) => p.status === 'not_memorized')).toBe(true);
  expect(listeners.onAccount(app.uid)).not.toContain(`users/${app.uid}/pages`);

  // Acknowledged: the listener reads the server's pages, which are the same.
  letAcksThrough();
  await app.act(() => signUp);
  await app.until(() => listeners.onAccount(app.uid).includes(`users/${app.uid}/pages`), 'the pages listener to open again');
  await app.untilLoaded();
  expect(app.app.pages).toHaveLength(604);
  await app.close();
});

// Was a known bug (Nov 2026): on a phone the account's user listener heard "no user
// document" while sign-up was still setting the name, and created one too. Two
// creators: the rules refused one ("User user appeared while creating them" in the
// app's log), and when the listener's write won, the account had no name. Sign-up is
// now the one creator while it runs.
it('[SYNC-4] sign-up is the one creator of a new account, with the name typed', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-15 20:00');
  const phone = new Phone();
  const userDocWrites: string[] = [];
  let listeners!: ListenerTracker;
  const app = await phone.open((mods) => {
    listeners = trackListeners(mods);
    const fs = mods.require<Record<string, (...args: any[]) => Promise<void>>>('firebase/firestore');
    const setDoc = fs.setDoc;
    jest.spyOn(fs, 'setDoc').mockImplementation((ref: { path: string }, ...rest: unknown[]) => {
      if (/^users\/[^/]+$/.test(ref.path)) userDocWrites.push(ref.path);
      return setDoc(ref, ...rest);
    });
    // Setting the name takes a moment, as on a phone: the user listener is open and has
    // heard from the server before sign-up writes anything.
    const lib = mods.require<Record<string, (...args: any[]) => Promise<{ uid: string }>>>('src/lib/firebase');
    const fauth = mods.require<{ updateProfile: (user: unknown, profile: { displayName: string }) => Promise<void> }>('firebase/auth');
    const registerUser = lib.registerUser;
    jest.spyOn(lib, 'registerUser').mockImplementation(async (email: string, password: string, displayName?: string) => {
      const user = await registerUser(email, password);
      const deadline = performance.now() + 10_000;
      while (!listeners.onAccount(user.uid).includes(`users/${user.uid}`) && performance.now() < deadline) await sleep(20);
      await sleep(1_500);
      if (displayName) await fauth.updateProfile(user, { displayName });
      return user;
    });
    return null;
  });
  const signUp = signUpAsOnAPhone(app, newEmail(), 'Typed Name');
  await app.until(() => !!app.app.user && app.app.pages.length === 604 && !app.app.loading, 'the new account to load', 30_000);
  await app.act(() => signUp);
  const svc = app.mods.require<typeof import('../../../src/services/firestoreService')>('src/services/firestoreService');
  const onServer = await svc.getUserFromServer(app.uid);
  expect(onServer?.displayName).toBe('Typed Name');
  expect(userDocWrites).toEqual([`users/${app.uid}`]);
  await app.close();
});

// A new account's 604 page writes went through the live pages listener, each page
// three times (written, confirmed, sent back), and sign-up froze the phone for about
// 5 s on a fast Mac (Nov 10 2026). The listener now waits while the pages are
// written (firestoreService.initializeAllPages), then reads them once. Here the app
// writes them itself, as for an account the server holds with no pages: its pages
// listener is open, has heard there are none, and is what starts the writes.
it('[SYNC-4] a new account\'s pages are written while nothing listens to them, then load once', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-10 20:00');
  const email = newEmail();
  createAccountPartWay(email, PASSWORD, 0);
  const phone = new Phone();
  let listeners!: ListenerTracker;
  // The pages listeners open as each batch of writes is committed.
  const atCommit: string[][] = [];
  const app = await phone.open((mods) => {
    listeners = trackListeners(mods);
    const fs = mods.require<Record<string, (...args: unknown[]) => { commit: () => Promise<void> }>>('firebase/firestore');
    const writeBatch = fs.writeBatch;
    jest.spyOn(fs, 'writeBatch').mockImplementation((...args: unknown[]) => {
      const batch = writeBatch(...args);
      const commit = batch.commit.bind(batch);
      batch.commit = () => {
        atCommit.push(listeners.open().filter((p) => p.endsWith('/pages')));
        return commit();
      };
      return batch;
    });
    return null;
  });
  await app.act(() => app.auth.signIn(email, PASSWORD));
  await app.until(() => !!app.app.user && app.app.pages.length === 604 && !app.app.loading, 'the pages to load', 30_000);

  // The pages went in two batches (1–450, 451–604), with no pages listener open.
  expect(atCommit.length).toBeGreaterThanOrEqual(2);
  expect(atCommit).toEqual(atCommit.map(() => []));
  // Shown as written (before the server acknowledged them), then listening again.
  await app.until(() => listeners.onAccount(app.uid).includes(`users/${app.uid}/pages`), 'the pages listener to open again');
  await app.close();
});

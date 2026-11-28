// Online, signing in never flashes the offline screen (BEHAVIOUR.md SYNC-7; Majd, Nov 28 2026: "everyone i login for a
// split second i get the no wifi / disconnected "error" screen -- this shouldn't be appearing at all"). Every sign-in
// reads the user document once (AuthContext's getUser), so Firestore has it in memory and the account's listener first
// hears that copy, marked "from the cache", before the server answers. That was taken for "the server can't be reached",
// and with no copy of the account on the phone yet (a new phone, or after signing out) the app showed "Connect to the
// internet to set up" until the server's answer came. Each render is watched (OpenApp.seen), so a one-frame flash counts.

import { newAccount, pagesRange } from '../harness/account';
import { setNow, setZone, ZONES } from '../harness/clock';
import { Phone } from '../harness/phone';

it('[SYNC-7] online: signing in on a new phone, signing out and in again, and a cold start never show "Connect to the internet to set up" or "Offline"', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-28 09:00');
  const a = new Phone('phone A');
  const first = await newAccount(a, { memorized: pagesRange(582, 604), user: { dailyPageCapacity: 5 } });
  await first.close();

  // Another phone, nothing of the account on it: sign in.
  const b = new Phone('phone B');
  const app = await b.open();
  await app.signIn(a.email!);
  expect(app.app.user).toBeTruthy();
  expect(app.seen).toEqual({ connectionNeeded: false, offline: false });

  // Sign out (the copy on the phone goes) and in again in the same run: Firestore still remembers the account.
  await app.act(() => (app.auth.signOutUser as () => Promise<void>)());
  await app.until(() => !app.auth.firebaseUser && !app.app.user, 'signed out');
  await app.signIn(a.email!);
  expect(app.app.pages.filter((p) => p.status === 'memorized')).toHaveLength(23);
  expect(app.seen).toEqual({ connectionNeeded: false, offline: false });
  await app.close();

  // A cold start, still signed in, from the copy on the phone.
  const again = await b.open();
  await again.untilLoaded();
  await again.idle(500);
  expect(again.seen).toEqual({ connectionNeeded: false, offline: false });
  await again.close();
});

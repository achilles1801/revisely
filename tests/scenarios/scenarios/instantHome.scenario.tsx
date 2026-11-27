// Home's first frame on a cold start (BEHAVIOUR.md HOME-8; Majd, Nov 26 2026: "the Surah kahf card as well as my
// picture from my ring kind of lags a little bit before it actually loads ... Is there any way to make it instant"):
// what the phone already knows shows with Home, before the server has answered, and is refreshed quietly after. (The
// picture before Auth has checked the saved sign-in is pinned in src/lib/__tests__/photoOnPhone.test.ts: the emulator's
// Auth restores the account at once.)

import type { ReactElement } from 'react';
import { local, setNow, setZone, MINUTE, ZONES } from '../harness/clock';
import { CITIES, newAccount, pagesRange } from '../harness/account';
import { Home, homeStack } from '../harness/screens';
import { Phone, type Booted, type OpenApp } from '../harness/phone';

// 2026-11-20 is a Friday.
const FRI = '2026-11-20';
const KAHF = pagesRange(293, 304);

/** Home, with the Account page's new look (its picture on the Today post) switched on, as Revisely Dev has it. */
function homeWithPicture(mods: Booted): ReactElement {
  mods.require<typeof import('../../../src/lib/release/accountDesign')>('src/lib/release/accountDesign').setAccountDesignReleasedForTests(true);
  return homeStack(mods);
}

/** A reading the reader's timer saves (REC-2): Al-Kahf's pages, ended `at`. */
async function kahfRead(app: OpenApp, at: Date): Promise<void> {
  const { queueChange } = app.mods.require<{ queueChange: (op: unknown) => Promise<void> }>('src/lib/offline/queue');
  const endedAt = at.getTime();
  await app.act(async () => {
    await queueChange({
      kind: 'reading.add',
      id: 'kahf-friday',
      session: { date: FRI, startedAt: endedAt - 25 * MINUTE, endedAt, durationSeconds: 1500, mode: 'stopwatch', targetSeconds: null, pages: [], pagesVisited: KAHF },
    });
  });
  await app.untilSynced();
}

/** Milliseconds from now until `pred` holds (letting the app run): 0 when it already does; -1 after 15 s. */
async function msUntil(app: OpenApp, pred: () => boolean): Promise<number> {
  if (pred()) return 0;
  const started = performance.now();
  for (;;) {
    if (pred()) return Math.round(performance.now() - started);
    if (performance.now() - started > 15_000) return -1;
    await app.idle(10);
  }
}

it('[HOME-8] on a cold start Home’s first frame has the picture and Friday’s Al-Kahf card from the phone, before the server answers', async () => {
  setZone(ZONES.chicago);
  setNow(`${FRI} 08:00`);
  const phone = new Phone();
  const first = await newAccount(phone, {
    memorized: pagesRange(1, 20),
    user: { dailyPageCapacity: 5, fajrCalculationMethod: 'NorthAmerica', fajrBoundaryEnabled: true, locationCoords: CITIES.chicago },
  });
  // A photo on the sign-in profile, as Google's would be.
  const authMod = first.mods.require<typeof import('firebase/auth')>('firebase/auth');
  await first.act(async () => {
    await authMod.updateProfile(authMod.getAuth().currentUser!, { photoURL: 'https://example.com/picture.jpg' });
  });
  await first.close();

  // An ordinary start: Al-Kahf read this Friday morning, the picture shown.
  let app = await phone.open(homeWithPicture);
  let home = new Home(app);
  await home.ready();
  await kahfRead(app, local(`${FRI} 08:30`));
  await app.until(() => (home.kahf() ?? '').includes('Done'), 'the Al-Kahf card done');
  await app.until(() => app.screen.queryByTestId('today-picture-mark-photo') != null, 'the picture');
  await app.close();

  // Hours later, a cold start: Home opens on the account's copy.
  setNow(`${FRI} 11:00`);
  app = await phone.open(homeWithPicture);
  home = new Home(app);
  await home.ready();
  const picture = await msUntil(app, () => app.screen.queryByTestId('today-picture-mark-photo') != null);
  const kahf = await msUntil(app, () => (home.kahf() ?? '').includes('Done'));
  console.log(`[HOME-8] after Home's first frame: picture ${picture} ms, Al-Kahf card ${kahf} ms`); // i18n-ignore (a test's log)
  // With Home's first frame: nothing waited for the server.
  expect(picture).toBe(0);
  expect(kahf).toBe(0);

  // Once the server has answered, the same picture and card stay: nothing blanks or flashes.
  await app.untilSynced();
  await app.idle(1500);
  expect(app.screen.queryByTestId('today-picture-mark-photo')).not.toBeNull();
  expect(home.kahf() ?? '').toContain('Done');
});

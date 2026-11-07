// A tester resets their own data from Settings (BEHAVIOUR.md, RESET-2): the
// app's own lib/testerReset, calling the real resetMyData function in the
// functions emulator (harness/functions), with App Check and Storage.

import { withAuthRetry } from '../harness/authRetry';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, onboard, pagesRange } from '../harness/account';
import { markPreviewTester, watchFunction } from '../harness/admin';
import { Home, homeStack } from '../harness/screens';
import { Phone } from '../harness/phone';

type TesterReset = typeof import('../../../src/lib/testerReset');

it('[RESET-2] a tester resets their own data: onboarding again, signed in, nothing of before; not again within 10 minutes', async () => {
  setZone(ZONES.amman);
  setNow('2026-11-02 20:00');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  // The owner marks the account a tester (set-preview-tester.js) while the app is closed.
  await markPreviewTester(uid);

  // A day revised.
  app = await phone.open(homeStack);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const home = new Home(app);
  await home.ready();
  const session = await home.startSession();
  await session.swipeThrough(5);
  await session.back();
  await app.untilSynced();
  expect(app.app.logs.length).toBeGreaterThan(0);

  // Settings → Reset my data → RESET.
  const server = watchFunction('resetMyData');
  try {
    const { resetMyData } = app.mods.require<TesterReset>('src/lib/testerReset');
    let result: Awaited<ReturnType<TesterReset['resetMyData']>> | undefined;
    await app.act(async () => {
      result = await withAuthRetry(() => resetMyData());
    });
    expect(server.calls).toBe(1);
    expect(result).toMatchObject({ ok: true, pages: 604, deleted: { sessions: 1 } });
    expect(result!.backup.location).toMatch(new RegExp(`^backups/tester-resets/${uid}/`));

    // The same sign-in, and the account as new: onboarding next, no history.
    await app.until(() => !app.app.onboardingComplete && app.app.logs.length === 0, 'the phone to show the reset account');
    expect(app.uid).toBe(uid);
    expect(app.app.user?.previewTester).toBe(true);
    expect(app.app.pages.filter((p) => p.status === 'memorized')).toHaveLength(0);
    expect(app.app.pendingChanges).toBe(0);

    // A second reset straight away is refused, and changes nothing.
    await app.act(async () => {
      await expect(withAuthRetry(() => resetMyData())).rejects.toThrow(/less than 10 minutes/);
    });
    expect(server.calls).toBe(2);

    // Onboarding again works, and the new start stays after a relaunch.
    await onboard(app, { memorized: pagesRange(582, 604), user: { dailyPageCapacity: 4 } });
    await app.untilSynced();
    await app.close();
    app = await phone.open();
    await app.until(() => app.app.user != null && !app.app.loading, 'the account to load');
    expect(app.app.onboardingComplete).toBe(true);
    expect(app.app.logs).toHaveLength(0);
    expect(app.app.pages.filter((p) => p.status === 'memorized').map((p) => p.pageNumber)).toEqual(pagesRange(582, 604));
    await app.close();
  } finally {
    server.restore();
  }
});

it('[RESET-2] an account that is not a tester is refused, and keeps everything', async () => {
  setZone(ZONES.amman);
  setNow('2026-11-02 20:00');
  const phone = new Phone('phone');
  const app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const server = watchFunction('resetMyData');
  const memorizedCount = () => app.app.pages.filter((p) => p.status === 'memorized').length;
  try {
    // The memorized pages reach the phone after the account itself: wait for them first.
    await app.until(() => memorizedCount() === 20, 'the 20 memorized pages');
    const { resetMyData } = app.mods.require<TesterReset>('src/lib/testerReset');
    await app.act(async () => {
      await expect(withAuthRetry(() => resetMyData())).rejects.toThrow(/testers only/);
    });
    expect(server.calls).toBe(1);
    expect(app.app.onboardingComplete).toBe(true);
    expect(memorizedCount()).toBe(20);
    // Still there on the server too: a relaunch reads them back.
    await app.close();
    const again = await phone.open();
    await again.until(() => again.app.pages.filter((p) => p.status === 'memorized').length === 20, 'the 20 memorized pages after a relaunch');
    expect(again.app.onboardingComplete).toBe(true);
    await again.close();
  } finally {
    server.restore();
  }
});

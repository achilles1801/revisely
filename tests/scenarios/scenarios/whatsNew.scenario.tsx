// "What's new" after the update (BEHAVIOUR.md NEW-1 to NEW-4): the real RootNavigator deciding what
// opens, the real account (onboarding writes `whatsNewSeen`, Done marks it, the rules allow it), and
// the phone's own storage across launches. The November 2026 release is switched on; a launch here can
// switch it off for that launch (lib/whatsNew/due setWhatsNewLiveForTests), as it was before it shipped.
import type { ReactElement } from 'react';
import { CURRENT_RELEASE } from '../../../src/lib/help/whatsNew';
import { setNow, setZone, ZONES } from '../harness/clock';
import { markPreviewTester } from '../harness/admin';
import { newAccount, pagesRange } from '../harness/account';
import { deleteServerFields, getServerDoc, setServerDoc } from '../harness/serverDocs';
import { Booted, OpenApp, Phone } from '../harness/phone';

const RELEASE = '2026-11';

/** The app as it starts, with the release switched on (as it ships, since Nov 2026) or off (before). */
function launch(live: boolean) {
  return (mods: Booted): ReactElement => {
    mods.require<typeof import('../../../src/lib/whatsNew/due')>('src/lib/whatsNew/due').setWhatsNewLiveForTests(live);
    const { RootNavigator } = mods.require<any>('src/navigation/RootNavigator');
    return mods.React.createElement(RootNavigator);
  };
}

/** The walkthrough, as the user sees it. */
class WhatsNew {
  constructor(private readonly app: OpenApp) {}

  mode(): string | null {
    for (const m of ['required', 'forced', 'replay']) if (this.app.screen.queryByTestId(`whats-new-${m}`)) return m;
    return null;
  }

  title(): string {
    return this.app.screen.getByTestId('whats-new-title').props.children;
  }

  async next(): Promise<void> {
    // Revo's card plays first (at ordinary text sizes): Skip takes it to its end, where Later goes on.
    const skip = this.app.screen.queryByTestId('whats-new-moment-skip');
    if (skip) await this.app.act(async () => this.app.mods.rtl.fireEvent.press(skip));
    await this.app.act(async () => this.app.mods.rtl.fireEvent.press(this.app.screen.getByTestId('whats-new-next')));
  }

  /** Next to the last card, then Done. */
  async finish(): Promise<void> {
    while (this.app.screen.queryByTestId('whats-new-next')) await this.next();
    await this.app.act(async () => this.app.mods.rtl.fireEvent.press(this.app.screen.getByTestId('whats-new-done')));
  }
}

/**
 * An account set up on an app from before the release: no `whatsNewSeen` on its user document. An App
 * Store account (not a tester) unless said otherwise: the release makes every card's feature everyone's.
 */
async function accountFromBefore(phone: Phone, { tester = false } = {}): Promise<string> {
  const app = await newAccount(phone, { memorized: pagesRange(562, 604) });
  const uid = app.uid;
  expect((await getServerDoc(`users/${uid}`))?.whatsNewSeen).toBe(RELEASE);
  if (tester) await markPreviewTester(uid);
  await deleteServerFields(`users/${uid}`, ['whatsNewSeen']);
  await app.until(() => app.app.user?.whatsNewSeen === undefined && app.app.user?.previewTester === tester, 'the copy to lose the mark');
  await app.close();
  return uid;
}

/** Opens the app and waits until RootNavigator has decided: the walkthrough or the main screens. */
async function open(phone: Phone, live = true): Promise<OpenApp> {
  const app = await phone.open(launch(live));
  await app.untilLoaded();
  await app.until(() => app.screen.queryByTestId('whats-new-wait') == null, 'What’s new to decide');
  return app;
}

beforeEach(() => {
  setZone(ZONES.chicago);
  setNow('2026-11-09 18:00');
});

it('[NEW-1] an account set up before the release sees it once after the update; Done marks it on the account', async () => {
  const phone = new Phone('updated');
  const uid = await accountFromBefore(phone);

  // The release isn't switched on yet: Home, as before.
  let app = await open(phone, false);
  expect(new WhatsNew(app).mode()).toBeNull();
  await app.close();

  // The update with the release on: it opens before Home.
  app = await open(phone);
  const wn = new WhatsNew(app);
  expect(wn.mode()).toBe('required');
  expect(wn.title()).toBe('Your days, in Activity');
  await wn.finish();
  await app.until(() => wn.mode() === null, 'the main screens');
  await app.untilSynced();
  expect((await getServerDoc(`users/${uid}`))?.whatsNewSeen).toBe(RELEASE);
  await app.close();

  // Once: the next launch goes straight to Home.
  app = await open(phone);
  await app.settle(400);
  expect(new WhatsNew(app).mode()).toBeNull();
  await app.close();
});

it('[NEW-1] a card shows only when the account has what it describes: an App Store account has every one but Revo’s while Revo is for testers', async () => {
  const phone = new Phone('everyone');
  await accountFromBefore(phone);
  const app = await open(phone);
  const wn = new WhatsNew(app);
  // The Activity blocks, sittings, help and every translation are everyone's; Revo follows its own
  // switch (config/app.revo, unset here: testers).
  const shown = CURRENT_RELEASE.cards.filter((c) => c.needs !== 'revo').map((c) => c.title);
  expect(wn.mode()).toBe('required');
  const seen = [wn.title()];
  while (app.screen.queryByTestId('whats-new-next')) {
    await wn.next();
    seen.push(wn.title());
  }
  expect(seen).toEqual(shown);
  for (const row of ['help', 'translations', 'offline']) expect(app.screen.getByTestId(`whats-new-row-${row}`)).toBeTruthy();
  await wn.finish();
  await app.until(() => wn.mode() === null, 'the main screens');
  await app.close();
});

it('[NEW-1] an account set up on the release never sees it', async () => {
  const phone = new Phone('new');
  const app0 = await newAccount(phone, { memorized: pagesRange(582, 604) });
  expect((await getServerDoc(`users/${app0.uid}`))?.whatsNewSeen).toBe(RELEASE);
  await app0.close();
  const app = await open(phone);
  await app.settle(400);
  expect(new WhatsNew(app).mode()).toBeNull();
  await app.close();
});

it('[NEW-1] the kill switch stops it showing, with no update', async () => {
  const phone = new Phone('killed');
  await accountFromBefore(phone);
  await setServerDoc('config/app', { whatsNewOff: true });
  try {
    // The first launch reads the switch; the walkthrough isn't shown once it has.
    let app = await open(phone);
    await app.until(() => new WhatsNew(app).mode() === null, 'the switch to stop it');
    await app.close();
    app = await open(phone);
    await app.settle(400);
    expect(new WhatsNew(app).mode()).toBeNull();
    await app.close();
  } finally {
    await deleteServerFields('config/app', ['whatsNewOff']);
  }
});

it('[NEW-2] leaving part way reopens it on the card it was on', async () => {
  const phone = new Phone('resume');
  await accountFromBefore(phone);
  let app = await open(phone);
  let wn = new WhatsNew(app);
  await wn.next();
  await wn.next();
  expect(wn.title()).toBe('Memorize by the ayah');
  // No skip and no close.
  expect(app.screen.queryByTestId('whats-new-close')).toBeNull();
  await app.close();

  app = await open(phone);
  wn = new WhatsNew(app);
  expect(wn.mode()).toBe('required');
  expect(wn.title()).toBe('Memorize by the ayah');
  await wn.finish();
  await app.until(() => wn.mode() === null, 'the main screens');
  await app.close();
});

it('[NEW-3] Settings shows it again and changes nothing; a tester’s Show What’s new at launch runs it from the next launch, writing nothing to the account', async () => {
  const phone = new Phone('tester');
  const app0 = await newAccount(phone, { memorized: pagesRange(582, 604) });
  const uid = app0.uid;
  await markPreviewTester(uid);
  await app0.until(() => app0.app.user?.previewTester === true, 'the tester flag');
  await app0.close();

  // With the release switched off (as before it shipped): Home, and in Settings the testers' two rows.
  let app = await open(phone, false);
  expect(new WhatsNew(app).mode()).toBeNull();
  const { fireEvent } = app.mods.rtl;
  await app.until(() => app.screen.queryByTestId('open-settings') != null, 'Home');
  await app.act(async () => fireEvent.press(app.screen.getByTestId('open-settings')));
  await app.until(() => app.screen.queryByTestId('settings-whats-new') != null, 'Settings');

  // About → What's new: the cards again, with a ✕; nothing changes.
  await app.act(async () => fireEvent.press(app.screen.getByTestId('settings-whats-new')));
  const wn = new WhatsNew(app);
  await app.until(() => wn.mode() === 'replay', 'the replay');
  await wn.next();
  expect(wn.title()).toBe('Revised elsewhere?');
  await app.act(async () => fireEvent.press(app.screen.getByTestId('whats-new-close')));
  await app.until(() => wn.mode() === null, 'the replay to close');
  expect(phone.storage.get(`@revisely_whats_new:v1:${uid}`)).toBeUndefined();

  // Testing → Show What's new at launch: from the next launch, not this one.
  await app.act(async () => fireEvent(app.screen.getByTestId('settings-whats-new-launch'), 'valueChange', true));
  await app.settle(200);
  expect(wn.mode()).toBeNull();
  await app.close();

  app = await open(phone, false);
  const run = new WhatsNew(app);
  expect(run.mode()).toBe('forced');
  await run.finish();
  await app.until(() => run.mode() === null, 'the main screens');
  await app.close();
  // The account's mark is the one onboarding wrote.
  expect((await getServerDoc(`users/${uid}`))?.whatsNewSeen).toBe(RELEASE);

  // The switch went off with Done.
  app = await open(phone, false);
  await app.settle(400);
  expect(new WhatsNew(app).mode()).toBeNull();
  await app.close();
});

it('[NEW-4] while it shows, nothing else opens and no update restarts the app', async () => {
  const phone = new Phone('first');
  await accountFromBefore(phone);
  const app = await open(phone);
  expect(new WhatsNew(app).mode()).toBe('required');
  const busy = app.mods.require<typeof import('../../../src/lib/updates/busy')>('src/lib/updates/busy');
  expect(busy.busyReasons()).toContain('screen');
  // Home isn't up, so neither are the update and store sheets it holds, nor Revo's button; a widget's
  // link waits for the main screens.
  expect(app.screen.queryByTestId('home-v2')).toBeNull();
  expect(app.screen.queryByTestId('revo-button')).toBeNull();
  const state = app.mods.require<typeof import('../../../src/lib/whatsNew/state')>('src/lib/whatsNew/state');
  expect(state.isWhatsNewShowing()).toBe(true);
  await new WhatsNew(app).finish();
  await app.until(() => app.screen.queryByTestId('home-v2') != null, 'Home');
  expect(state.isWhatsNewShowing()).toBe(false);
  await app.close();
});

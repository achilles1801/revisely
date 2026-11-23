// A new account's pages while they are still arriving (BEHAVIOUR.md ONBOARD-1,
// ONBOARD-2). Sign-up writes the 604 pages in two batches (1–450, then 451–604,
// firestoreService.initializeAllPages); on a slow connection the phone can hold
// the first alone while the user marks a juz from the second, and a sign-up that
// stops between the two leaves the account with 1–450 only.
import { setNow, setZone, ZONES } from '../harness/clock';
import { pagesRange } from '../harness/account';
import {
  addPages,
  createAccountPartWay,
  markOnServer,
  memorizedOnServer,
  pageCountOnServer,
} from '../harness/admin';
import { Onboarding, onboardingFlow, onboardingStack } from '../harness/screens';
import { Phone } from '../harness/phone';

const newEmail = () => `onboard-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`;

it('[ONBOARD-1] a juz marked before its pages have arrived counts at once, and is saved once they land', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-03 12:00');
  const email = newEmail();
  // The server has the user document and the first batch, 1–450.
  createAccountPartWay(email, 'scenario-password', 450);

  const phone = new Phone('phone');
  const app = await phone.open(onboardingStack);
  // The app is still writing the second batch, as during its own sign-up, so it
  // doesn't create the missing pages itself (ONBOARD-2).
  const service = app.mods.require<Record<string, unknown>>('src/services/firestoreService');
  const stillWriting = jest.spyOn(service as { isInitializingPages: (uid: string) => boolean }, 'isInitializingPages');
  stillWriting.mockReturnValue(true);
  try {
    await app.act(() => app.auth.signIn(email, 'scenario-password'));
    await app.until(() => app.app.pages.length === 450, 'the first batch of pages');
    const screen = new Onboarding(app);

    // Juz 30 (582–604) is marked while its pages are still on their way.
    await screen.tapJuz(30);
    // Its cell shows it, and so does the line: Al-Fatihah (Part of it starts there) and the juz.
    expect(screen.summary()).toBe('Al-Fatihah and Juz 30 chosen');
    // Saving now would leave Juz 30 out, so Continue waits for its pages.
    expect(screen.continueEnabled()).toBe(false);

    // The second batch lands.
    addPages(email, 451, 604);
    await app.until(() => app.app.pages.length === 604, 'the second batch of pages');
    expect(screen.summary()).toBe('Al-Fatihah and Juz 30 chosen');
    expect(screen.continueEnabled()).toBe(true);

    await screen.continue();
    await app.untilSynced();
    expect(memorizedOnServer(email)).toEqual([1, ...pagesRange(582, 604)]);
  } finally {
    stillWriting.mockRestore();
    await app.close();
  }
});

it('[ONBOARD-2] an account a sign-up left with pages 1–450 gets the rest, and keeps what its pages hold', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-03 12:00');
  const email = newEmail();
  // The sign-up stopped after its first batch: pages 1–450, and none since.
  createAccountPartWay(email, 'scenario-password', 450);
  // A page it has already holds progress (it must not be replaced by a new one).
  markOnServer(email, 5);

  const phone = new Phone('phone');
  const app = await phone.open(onboardingStack);
  await app.act(() => app.auth.signIn(email, 'scenario-password'));
  await app.until(() => app.app.pages.length === 604, 'the missing pages to be created');
  expect(pageCountOnServer(email)).toBe(604);
  expect(memorizedOnServer(email)).toEqual([5]);
  expect(app.app.pages.find((p) => p.pageNumber === 604)?.status).toBe('not_memorized');
  await app.close();
});

it('[ONBOARD-3] one question a screen, from the welcome to Home’s data: Part of it, a juz, the amount, midnight, no reminder', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-03 12:00');
  const email = newEmail();
  createAccountPartWay(email, 'scenario-password', 604);

  const phone = new Phone('phone');
  const app = await phone.open(onboardingFlow);
  await app.act(() => app.auth.signIn(email, 'scenario-password'));
  await app.until(() => app.app.pages.length === 604, 'the pages');
  const flow = new Onboarding(app);

  await flow.press('welcome-begin');
  await flow.reach('journey-select');
  // One tap answers it: no Continue on this screen.
  await flow.press('journey-part');
  await flow.reach('juz-selection');
  await app.until(() => flow.summary() === 'Al-Fatihah chosen', 'Al-Fatihah to start chosen');
  await flow.tapJuz(30);
  await flow.press('juz-continue');
  await flow.reach('daily-amount');
  await flow.press('amount-more');
  await flow.press('amount-continue');
  await flow.reach('day-start');
  await flow.press('day-midnight');
  await flow.reach('reminder');
  await flow.press('reminder-off');

  await app.until(() => app.app.onboardingComplete, 'onboarding to complete');
  await app.untilSynced();
  expect(memorizedOnServer(email)).toEqual([1, ...pagesRange(582, 604)]);
  expect(app.app.user).toMatchObject({
    dailyPageCapacity: 11,
    scheduleMode: 'pages',
    notificationsEnabled: false,
    fajrBoundaryEnabled: false,
  });
  await app.close();
});

it('[ONBOARD-3] All of it saves every page and goes straight to the amount', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-03 12:00');
  const email = newEmail();
  createAccountPartWay(email, 'scenario-password', 604);

  const phone = new Phone('phone');
  const app = await phone.open(onboardingFlow);
  await app.act(() => app.auth.signIn(email, 'scenario-password'));
  await app.until(() => app.app.pages.length === 604, 'the pages');
  const flow = new Onboarding(app);

  await flow.press('welcome-begin');
  await flow.reach('journey-select');
  await flow.press('journey-all');
  await flow.reach('daily-amount');
  expect(app.screen.queryByTestId('juz-selection')).toBeNull();
  await app.untilSynced();
  expect(memorizedOnServer(email)).toHaveLength(604);
  await app.close();
});

it('[ONBOARD-4] a juz tapped twice is cleared, and only what is chosen is saved', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-03 12:00');
  const email = newEmail();
  createAccountPartWay(email, 'scenario-password', 604);

  const phone = new Phone('phone');
  const app = await phone.open(onboardingStack);
  await app.act(() => app.auth.signIn(email, 'scenario-password'));
  await app.until(() => app.app.pages.length === 604, 'the pages');
  const screen = new Onboarding(app);
  await app.until(() => screen.summary() === 'Al-Fatihah chosen', 'Al-Fatihah to start chosen');

  await screen.tapJuz(2);
  await screen.tapJuz(2);
  await screen.tapJuz(30);
  expect(screen.summary()).toBe('Al-Fatihah and Juz 30 chosen');
  await screen.continue();
  await app.untilSynced();
  expect(memorizedOnServer(email)).toEqual([1, ...pagesRange(582, 604)]);
  await app.close();
});

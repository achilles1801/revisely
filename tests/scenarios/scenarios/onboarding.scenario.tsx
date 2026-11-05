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
import { Onboarding, onboardingStack } from '../harness/screens';
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
    await screen.markJuz(pagesRange(582, 604));
    // Its check shows it, and so does the count: page 1 (in progress starts there) and 23 pages.
    expect(screen.summary()).toBe('24 of 604 pages memorized');
    // Saving now would leave Juz 30 out, so Continue waits for its pages.
    expect(screen.continueEnabled()).toBe(false);

    // The second batch lands.
    addPages(email, 451, 604);
    await app.until(() => app.app.pages.length === 604, 'the second batch of pages');
    expect(screen.summary()).toBe('24 of 604 pages memorized');
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

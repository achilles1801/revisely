// Onboarding's "Select memorized portions" while a new account's pages are still
// arriving (BEHAVIOUR.md ONBOARD-1). Sign-up writes the 604 pages in two batches
// (1–450, then 451–604); on a slow connection the phone can hold the first alone
// while the user marks a juz from the second.
import { setNow, setZone, ZONES } from '../harness/clock';
import { pagesRange } from '../harness/account';
import { addPages, createAccountPartWay, memorizedOnServer } from '../harness/admin';
import { Onboarding, onboardingStack } from '../harness/screens';
import { Phone } from '../harness/phone';

it('[ONBOARD-1] a juz marked before its pages have arrived counts at once, and is saved once they land', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-03 12:00');
  const email = `onboard-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`;
  // The server has the user document and the first batch, 1–450.
  createAccountPartWay(email, 'scenario-password', 450);

  const phone = new Phone('phone');
  const app = await phone.open(onboardingStack);
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
  await app.close();
});

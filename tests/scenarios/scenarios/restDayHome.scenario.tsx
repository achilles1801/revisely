// A rest day of the plan on Home (BEHAVIOUR.md HOME-9; Majd, Nov 27 2026, on a rest day of his plan: "telling me to
// mark memorized pages when i already have memorized pages marked?"). A day with no pages, with pages memorized, says
// it rests and offers the next revision day; "Mark memorized pages" is for an account with nothing memorized.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange, saveCustomPlan } from '../harness/account';
import { Home, homeStack } from '../harness/screens';
import { Phone } from '../harness/phone';

it('[HOME-9] on a rest day of the plan, Home says "Rest day" and where tomorrow starts, and "Revise ahead" opens it; never "Mark memorized pages"', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-27 11:58');
  const phone = new Phone();
  const first = await newAccount(phone, {
    memorized: pagesRange(1, 20),
    user: { dailyPageCapacity: 5 },
  });
  // Today is the plan's rest day; tomorrow has pages 1–5.
  await saveCustomPlan(first, [[], pagesRange(1, 5), pagesRange(6, 10), pagesRange(11, 20)]);
  await first.close();

  const app = await phone.open(homeStack);
  const home = new Home(app);
  await home.ready();
  await app.until(() => home.title() === 'Rest day', 'Home to show the rest day');
  expect(home.today()).not.toContain('Mark memorized pages');
  expect(home.today()).not.toContain('Nothing to revise yet');
  expect(home.detail()).toMatch(/^Tomorrow starts at /);
  expect(home.cta()).toBe('Revise ahead');
  // Said once: no quiet "Tomorrow starts at" line under the button as well.
  expect(home.ahead()).toBeNull();

  const session = await home.startSession();
  await session.ready();
  expect(session.pages()).toEqual(pagesRange(1, 5));
});

// A rest day of the plan on Home (BEHAVIOUR.md HOME-9; Majd, Nov 27 2026, on a rest day of his plan: "telling me to
// mark memorized pages when i already have memorized pages marked?"). A day with no pages, with pages memorized, says
// it rests and offers the next revision day; "Mark memorized pages" is for an account with nothing memorized.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange, saveCustomPlan } from '../harness/account';
import { Home, homeStack } from '../harness/screens';
import { Phone } from '../harness/phone';

it('[HOME-9] [USER-2] on a rest day of the plan, Home says "Rest day" and where tomorrow starts, and "Revise ahead" opens it; never "Mark memorized pages"', async () => {
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

  // The widget names the day as Home does (USER-2): it showed an empty title and "0 pages left".
  const { buildWidgetSnapshot } = app.mods.require<typeof import('../../../src/lib/widgets/snapshot')>('src/lib/widgets/snapshot');
  const { getQuranData } = app.mods.require<typeof import('../../../src/lib/quranData')>('src/lib/quranData');
  const a = app.app;
  const widget = buildWidgetSnapshot({
    signedIn: true,
    user: a.user,
    onboardingComplete: a.onboardingComplete,
    pages: a.pages,
    logs: a.logs,
    quranData: getQuranData(),
    accent: 'indigo',
    now: new Date(),
  });
  expect(widget.days[0]).toMatchObject({ day: '2026-11-27', title: 'Rest day', short: 'Rest day', total: 0, completed: false });
  expect(widget.days[0].where).toBe(home.detail());
  expect(widget.days[1]).toMatchObject({ day: '2026-11-28', total: 5 });

  const session = await home.startSession();
  await session.ready();
  expect(session.pages()).toEqual(pagesRange(1, 5));
});

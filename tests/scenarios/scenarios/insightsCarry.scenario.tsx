// REPORT (not a fix): Insights' "Revise these first tomorrow" (ActivityScreen.reviseTomorrow) and
// Revo's "Add to my plan" (RevoChat) save `carryOver: carryForTomorrow(tomorrow, …)`, which replaces
// today's carry-over. After Add to today, today's carried pages lose their source day: revising them
// credits today, not the day they were missed (SESS-7), so yesterday's grace can't be restored.
// Fails on develop on purpose; the fix belongs with the Activity/Revo owners (carryOver holds one day).

import { pagesRange } from '../harness/account';
import { Home } from '../harness/screens';
import { addDays, scenarioPhone } from '../harness/testScenario';

it('[SESS-7] [CARRY-2] Partly done today: Add to today, then "Revise these first tomorrow": today keeps its catch-up pages, credited to yesterday', async () => {
  const { app, D } = await scenarioPhone('partial-today');
  const home = new Home(app);
  await home.ready();
  await home.tap('today-carry-over');
  await app.until(() => home.catchUp() == null, 'the leftovers to be added');
  await app.untilSynced();
  // Insights → Weak spots → Revise these first tomorrow, as ActivityScreen saves it.
  const { carryForTomorrow } = app.mods.require<typeof import('../../../src/lib/weakSpotActions')>('src/lib/weakSpotActions');
  const user = app.app.user!;
  await app.act(() => app.app.saveUser({ ...user, carryOver: carryForTomorrow(addDays(D, 1), [600, 601], user.carryOver) }));
  await app.untilSynced();
  const session = await home.startSession();
  expect(session.pages()).toEqual([585, 586, 587, 588, 589]);
  await session.swipe();
  await session.swipe();
  await session.back();
  await app.untilSynced();
  const ahead = app.mods.require<typeof import('../../../src/lib/aheadCredit')>('src/lib/aheadCredit');
  expect([...ahead.creditedOnDay(app.app.logs, addDays(D, -1))].sort((a, b) => a - b)).toEqual(pagesRange(582, 586));
  await app.close();
});

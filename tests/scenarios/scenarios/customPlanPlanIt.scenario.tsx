// "Plan it" on a custom plan (ACT-24). Majd, Nov 8 2026: "i think it should be a temp change by default
// with the option to make it a perm change in that users custom plan". It opened tomorrow's day of the
// plan with only the juz's pages (saving replaced that day in every cycle). Now it puts them first
// tomorrow, as on the other plans, and leaves the plan alone; "Add to plan" under "First tomorrow" is the
// deliberate second step: tomorrow's day of the plan with the pages added to it, saved from the plan.

import { pagesRange } from '../harness/account';
import { addDays, scenarioPhone } from '../harness/testScenario';
import { activityStack } from '../harness/screens';
import type { OpenApp } from '../harness/phone';

async function tap(app: OpenApp, testID: string): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  await app.until(() => app.screen.queryByTestId(testID) != null, testID);
  const el = app.screen.getByTestId(testID);
  await app.act(async () => {
    fireEvent.press(el);
  });
  await app.idle(50);
}

it('[ACT-24] On a custom plan, Plan it puts the juz first tomorrow and leaves the plan as it is; “Add to plan” opens tomorrow’s day with the pages added', async () => {
  const { phone, app: home, D } = await scenarioPhone('custom-reverse');
  await home.close();
  const app = await phone.open(activityStack);
  await app.until(() => app.app.user?.customPlan != null, 'the account');
  // Juz 29 memorized and untouched for 40 days: Insights' untouched row.
  const juz29 = pagesRange(562, 581);
  const old = `${addDays(D, -40)}T10:00:00.000Z`;
  await app.act(() =>
    app.app.updatePages(
      app.app.pages.map((p) => (juz29.includes(p.pageNumber) ? { ...p, status: 'memorized', dateMemorized: addDays(D, -60), lastRevisedDate: old } : p)),
      juz29,
    ),
  );
  await app.untilSynced();
  const planBefore = JSON.parse(JSON.stringify(app.app.user!.customPlan));

  const nav = app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
  await app.act(async () => {
    nav.current.navigate('Activity');
  });
  await app.until(() => app.screen.queryByTestId('activity-blocks-views') != null, 'Activity');
  await tap(app, 'pill-insights');
  await tap(app, 'insights-plan-it');
  await app.until(() => app.app.user?.carryOver?.day === addDays(D, 1), 'Juz 29 to go first tomorrow');
  await app.untilSynced();

  // Temporary: first tomorrow, as on every plan; the plan itself is as it was, and no editor opened.
  expect(app.app.user!.carryOver).toMatchObject({ day: addDays(D, 1), pages: juz29, source: 'insights' });
  expect(app.app.user!.customPlan).toEqual(planBefore);
  expect(nav.current.getCurrentRoute()?.name).toBe('Activity');
  expect(app.screen.getByTestId('insights-plan-it-done')).toBeTruthy();

  // Permanent, only when chosen: tomorrow's day of the plan (PlanDayEdit, index 1) with Juz 29 added
  // after its own pages, and a line saying it is every cycle.
  await tap(app, 'insights-plan-it-add-to-plan');
  await app.until(() => nav.current.getCurrentRoute()?.name === 'PlanDayEdit', 'tomorrow’s day of the plan');
  const { params } = nav.current.getCurrentRoute();
  expect(params.dayIndex).toBe(1);
  expect(params.basePages.length).toBeGreaterThan(0);
  expect(params.initialPages).toEqual([...params.basePages, ...juz29]);
  expect(params.note).toMatch(/every cycle\.$/);
  // Still nothing saved: the plan changes only when the plan is saved.
  expect(app.app.user!.customPlan).toEqual(planBefore);
  await app.close();
});

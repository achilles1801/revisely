// Insights' "Revise these first tomorrow" (ActivityScreen.reviseTomorrow) and Revo's "Add to my plan"
// (RevoChat) put pages in front of tomorrow's session as its carry-over (lib/weakSpotActions). There
// was one carry-over: saving tomorrow's replaced today's, so after Add to today the catch-up pages
// lost their source day and counted for today (SESS-7), and yesterday's grace couldn't be restored.
// Now tomorrow's is held beside today's (carryOver.next), and Add to today keeps tomorrow's too.

import { pagesRange } from '../harness/account';
import { setNow } from '../harness/clock';
import { Home, homeStack } from '../harness/screens';
import { addDays, scenarioPhone } from '../harness/testScenario';
import type { OpenApp } from '../harness/phone';

type Weak = typeof import('../../../src/lib/weakSpotActions');
type AheadCredit = typeof import('../../../src/lib/aheadCredit');

/** Insights → Weak spots → Revise these first tomorrow, saved as ActivityScreen saves it. */
async function reviseFirstTomorrow(app: OpenApp, D: string, weak: number[]): Promise<void> {
  const { carryForTomorrow } = app.mods.require<Weak>('src/lib/weakSpotActions');
  const user = app.app.user!;
  await app.act(() => app.app.saveUser({ ...user, carryOver: carryForTomorrow(addDays(D, 1), weak, user.carryOver) }));
  await app.untilSynced();
}

function creditedTo(app: OpenApp, day: string): number[] {
  const ahead = app.mods.require<AheadCredit>('src/lib/aheadCredit');
  return [...ahead.creditedOnDay(app.app.logs, day)].sort((a, b) => a - b);
}

it('[SESS-7] [CARRY-2] Partly done today: Add to today, then "Revise these first tomorrow": today keeps its catch-up pages, credited to yesterday, and tomorrow starts with the weak pages', async () => {
  const { phone, app, D } = await scenarioPhone('partial-today');
  const home = new Home(app);
  await home.ready();
  await home.tap('today-carry-over');
  await app.until(() => home.catchUp() == null, 'the leftovers to be added');
  await app.untilSynced();
  await reviseFirstTomorrow(app, D, [600, 601]);

  const session = await home.startSession();
  expect(session.pages()).toEqual([585, 586, 587, 588, 589]);
  await session.swipe();
  await session.swipe();
  await session.back();
  await app.untilSynced();
  expect(creditedTo(app, addDays(D, -1))).toEqual(pagesRange(582, 586));
  expect(creditedTo(app, D)).toEqual([587, 588]);
  await home.untilStreak(5);
  await app.close();

  // Tomorrow: the weak pages first, labelled as Insights' (Juz 29–30, five a day, shifted by two).
  setNow('2026-11-06 12:00');
  const next = await phone.open(homeStack);
  const tomorrow = new Home(next);
  await tomorrow.ready();
  const s2 = await tomorrow.startSession();
  expect(s2.pages().slice(0, 2)).toEqual([600, 601]);
  expect(next.screen.queryByTestId('session-from-insights')).not.toBeNull();
  await s2.back();
  await next.close();
});

it('[CARRY-2] [CARRY-1] "Revise these first tomorrow" first, then Add to today: today takes the leftovers, and tomorrow keeps the weak pages', async () => {
  const { app, D } = await scenarioPhone('partial-today');
  const home = new Home(app);
  await home.ready();
  await reviseFirstTomorrow(app, D, [600, 601]);
  // The leftovers are still offered today.
  expect(home.catchUp()).toMatch(/^Left yesterday · Revise p\.\s585–586$/);
  await home.tap('today-carry-over');
  await app.until(() => home.catchUp() == null, 'the leftovers to be added');
  await app.untilSynced();
  const carry = app.app.user!.carryOver!;
  expect(carry.day).toBe(D);
  expect(carry.pages).toEqual([585, 586]);
  expect(carry.next).toEqual({ day: addDays(D, 1), pages: [600, 601], source: 'insights' });
  await app.close();
});

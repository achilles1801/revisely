// Majd's test pass (~/Documents/revisely-android/testing-checklist.md), scenarios 2, 4 and 5,
// on accounts loaded the way he loads them (Settings → Testing → Load test scenario, RESET-3):
// the leftovers Home offers, Add to today, catch-up credit (SESS-7) and the streak's grace
// (SESS-6), read off Home and driven through the session as a finger would.
//
// Every scenario is loaded on Thursday Nov 5 2026 at noon in Chicago (D = 2026-11-05), so its
// days are fixed and the expected pages below are worked out by hand from its plan
// (functions/src/testScenarios.ts).

import { pagesRange } from '../harness/account';
import { setNow } from '../harness/clock';
import { Home, homeStack } from '../harness/screens';
import { addDays, scenarioPhone } from '../harness/testScenario';
import type { OpenApp } from '../harness/phone';

type AheadCredit = typeof import('../../../src/lib/aheadCredit');

/** The pages credited to `day` (its own session's and those revised for it on other days). */
function creditedTo(app: OpenApp, day: string): number[] {
  const ahead = app.mods.require<AheadCredit>('src/lib/aheadCredit');
  return [...ahead.creditedOnDay(app.app.logs, day)].sort((a, b) => a - b);
}

async function addToToday(app: OpenApp, home: Home): Promise<void> {
  await home.tap('today-carry-over');
  await app.until(() => home.catchUp() == null, 'the leftovers to be added to today');
  await app.untilSynced();
}

// Partly done today: Juz 29–30 (pp. 562–604), five a day from D−5. D−5…D−2 done (562–581),
// D−1 left at 582–584 of 582–586, today 587–591 with 587 and 588 revised.
describe('4. Partly done today', () => {
  it('[CARRY-1] [SESS-1] Home offers yesterday’s two pages, and today’s session continues at its third page with the first two checked', async () => {
    const { app } = await scenarioPhone('partial-today');
    const home = new Home(app);
    await home.ready();
    expect(home.catchUp()).toMatch(/^Left yesterday · Revise p\.\s585–586$/);
    expect(home.title()).toMatch(/^Continue at .+, p\.\s589(?!\d)/);
    expect(home.today()).toContain('2 of 5');
    expect(home.cta()).toBe('Continue revision');

    const session = await home.startSession();
    expect(session.pages()).toEqual(pagesRange(587, 591));
    expect(session.current()).toBe(589);
    expect(await session.isChecked()).toBe(false);
    await session.swipeBack();
    expect(session.current()).toBe(588);
    expect(await session.isChecked()).toBe(true);
    await session.swipeBack();
    expect(session.current()).toBe(587);
    expect(await session.isChecked()).toBe(true);
    await session.back();
    await app.close();
  });

  it('[SESS-6] [CARRY-2] [SESS-7] the streak shows its grace; revising yesterday’s two pages brings it back at once, and today’s last page keeps their credit', async () => {
    const { app, D } = await scenarioPhone('partial-today');
    const home = new Home(app);
    await home.ready();
    // Yesterday was left at 3 of 5 after four days done: the four-day streak, dimmed, with a ring.
    await home.untilStreak(4, true);
    expect(home.streak().ring).toBe('60 percent revised');

    // Keep daily amount: the two leftovers come first, and today keeps its size.
    await addToToday(app, home);
    const session = await home.startSession();
    expect(session.pages()).toEqual([585, 586, 587, 588, 589]);
    expect(session.current()).toBe(585);
    await session.swipe();
    // The session saves itself every few seconds: 585 is saved before 586 is revised.
    await app.idle(6000);
    await app.untilSynced();
    await session.swipe();
    await session.back();
    await app.untilSynced();

    // They count for yesterday, not today (SESS-7): yesterday is whole, today is not done by them.
    expect(creditedTo(app, addDays(D, -1))).toEqual(pagesRange(582, 586));
    expect(creditedTo(app, D)).toEqual([587, 588]);
    expect(home.title()).toMatch(/^Continue at .+, p\.\s589(?!\d)/);
    // The streak is back at once: yesterday, and the four days before it.
    await home.untilStreak(5);

    // Today's last page: today is done, and counts too.
    const rest = await home.startSession();
    expect(rest.current()).toBe(589);
    await rest.swipe();
    expect(rest.endCard()).toMatch(/Revision complete/);
    await rest.back();
    await app.untilSynced();
    // Saving today's last page keeps the catch-up credit saved before it.
    expect(creditedTo(app, addDays(D, -1))).toEqual(pagesRange(582, 586));
    expect(home.title()).toBe('Done · 5 pages');
    expect(home.cta()).toBe('Review session');
    await app.close();
  });

  // Today's session was saved with its five pages (587–591) before Add to today; Keep daily amount
  // then moves 590 and 591 to tomorrow. They leave the session's assigned pages (the rules let the
  // list shrink), so today counts once its own pages are done. (Fixed Nov 2026: they stayed, Home
  // said Done, and the streak didn't count today.)
  it('[SESS-2] [CARRY-2] a session started before Add to today: finished, today counts toward the streak, with only its own pages assigned', async () => {
    const { app } = await scenarioPhone('partial-today');
    const home = new Home(app);
    await home.ready();
    await home.untilStreak(4, true);
    await addToToday(app, home);
    const session = await home.startSession();
    await session.swipeThrough(3);
    await session.back();
    await app.untilSynced();
    await home.untilStreak(5);
    const rest = await home.startSession();
    await rest.swipe();
    await rest.back();
    await app.untilSynced();
    expect(home.title()).toBe('Done · 5 pages');
    await home.untilStreak(6);
    const svc = app.mods.require<typeof import('../../../src/services/firestoreService')>('src/services/firestoreService');
    const onServer = await app.act(() => svc.getSession('2026-11-05', app.uid));
    expect(onServer?.assignedPages).toEqual([587, 588, 589]);
    await app.close();
  });

  it('[SESS-6] today’s own pages alone don’t bring the streak back; revising yesterday’s pages afterwards still does', async () => {
    const { app, D } = await scenarioPhone('partial-today');
    const home = new Home(app);
    await home.ready();
    await home.untilStreak(4, true);

    const session = await home.startSession();
    expect(session.current()).toBe(589);
    await session.swipeThrough(3);
    expect(session.endCard()).toMatch(/Revision complete/);
    await session.back();
    await app.untilSynced();
    expect(home.title()).toMatch(/^Done · 5 pages/);
    expect(creditedTo(app, D)).toEqual(pagesRange(587, 591));
    // Today is done, yesterday still missed: today's own pages don't bring the run back.
    await app.until(() => !home.streak().grace, 'the streak to take today in');
    expect(home.streak().days).toBeLessThan(5);

    // Yesterday's two pages are still offered until today ends (SESS-6), and revising them
    // restores the run: yesterday, the four days before it, and today.
    expect(home.catchUp()).toMatch(/^Left yesterday · Revise p\.\s585–586$/);
    await addToToday(app, home);
    const catchUp = await home.startSession();
    expect(catchUp.pages()).toEqual(expect.arrayContaining([585, 586]));
    while (catchUp.current() !== 585) await catchUp.swipeBack();
    await catchUp.swipe();
    await catchUp.swipe();
    await catchUp.back();
    await app.untilSynced();
    expect(creditedTo(app, addDays(D, -1))).toEqual(pagesRange(582, 586));
    await home.untilStreak(6);
    await app.close();
  });
});

// Missed days: Juz 30 (pp. 582–604), three a day from D−10; sessions D−10 to D−3, none since.
// D−2 is 583–585, D−1 586–588, today 589–591.
describe('5. Missed days', () => {
  it('[CARRY-1] [SCHED-5] [SESS-6] Home offers both missed days’ pages in one line; today keeps its own pages; two missed days break the streak', async () => {
    const { app } = await scenarioPhone('missed-days');
    const home = new Home(app);
    await home.ready();
    expect(home.catchUp()).toMatch(/^Missed 2 days · Revise p\.\s583–588$/);
    expect(home.title()).toMatch(/^Starts at .+, p\.\s589(?!\d)/);
    expect(home.detail()).toMatch(/^3\spages/);
    expect(home.cta()).toBe('Start revision');
    // No grace: two days missed in a row.
    await home.untilStreak(0);
    await app.idle(1000);
    expect(home.streak()).toEqual({ days: 0, grace: false, ring: null });
    await app.close();
  });

  it('[CARRY-4] [SESS-7] [SESS-6] Add to today: the missed pages become today’s, count for their own days, and don’t restore the streak', async () => {
    const { app, D } = await scenarioPhone('missed-days');
    const home = new Home(app);
    await home.ready();
    await addToToday(app, home);
    const session = await home.startSession();
    expect(session.pages().slice(0, 6)).toEqual(pagesRange(583, 588));
    await session.swipeThrough(6);
    await session.back();
    await app.untilSynced();
    expect(creditedTo(app, addDays(D, -2))).toEqual([583, 584, 585]);
    expect(creditedTo(app, addDays(D, -1))).toEqual([586, 587, 588]);
    expect(creditedTo(app, D)).toEqual([]);
    // Revising them late doesn't bring the streak back (two missed days broke it).
    await app.idle(1500);
    expect(home.streak()).toEqual({ days: 0, grace: false, ring: null });
    await app.close();
  });

  it('[CARRY-4] added and still not revised the next day: they are offered again', async () => {
    const { phone, app, D } = await scenarioPhone('missed-days');
    let home = new Home(app);
    await home.ready();
    await addToToday(app, home);
    await app.close();
    // Friday: the pages added to Thursday and still not revised are offered again.
    setNow('2026-11-06 12:00');
    const next = await phone.open(homeStack);
    home = new Home(next);
    await home.ready();
    expect(addDays(D, 1)).toBe('2026-11-06');
    expect(home.catchUp()).toMatch(/^Missed yesterday · Revise p\.\s583–588$/);
    await next.close();
  });
});

// Beginner: Juz 30, two a day from D−7: D−7 582–583, D−6 584–585, D−5 586–587 (missed),
// D−4 588–589, D−3 590–591 (590 only), D−2 592–593 (missed), D−1 594–595, today 596–597.
describe('2. Beginner', () => {
  it('[CARRY-1] [CARRY-2] [SESS-7] [SESS-6] Home offers D−3’s and D−2’s pages; added and revised, they count for those days and don’t join the run', async () => {
    const { app, D } = await scenarioPhone('beginner');
    const home = new Home(app);
    await home.ready();
    // Pages revised in the last three days (590, 594, 595) are never offered.
    expect(home.catchUp()).toMatch(/^Left 2 days · Revise p\.\s591–593$/);
    // D−1 was done: no grace, a one-day streak.
    await home.untilStreak(1);

    await addToToday(app, home);
    const session = await home.startSession();
    expect(session.pages().slice(0, 3)).toEqual([591, 592, 593]);
    await session.swipeThrough(3);
    await session.back();
    await app.untilSynced();
    expect(creditedTo(app, addDays(D, -3))).toEqual([590, 591]);
    expect(creditedTo(app, addDays(D, -2))).toEqual([592, 593]);
    expect(creditedTo(app, D)).toEqual([]);
    // D−2 is whole now, but done late: it doesn't join the run before it.
    await app.idle(1500);
    expect(home.streak()).toEqual({ days: 1, grace: false, ring: null });
    await app.close();
  });
});

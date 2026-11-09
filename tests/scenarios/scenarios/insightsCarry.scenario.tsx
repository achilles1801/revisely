// Insights' "Revise these first tomorrow" (ActivityScreen.reviseTomorrow) and Revo's "Add to my plan"
// (RevoChat) put pages in front of tomorrow's session as its carry-over (lib/weakSpotActions). There
// was one carry-over: saving tomorrow's replaced today's, so after Add to today the catch-up pages
// lost their source day and counted for today (SESS-7), and yesterday's grace couldn't be restored.
// Now tomorrow's is held beside today's (carryOver.next), and Add to today keeps tomorrow's too.

import { pagesRange } from '../harness/account';
import { setNow } from '../harness/clock';
import { Home, homeStack } from '../harness/screens';
import { catchUpWhat, plain } from '../harness/words';
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

it('[SESS-7] [CARRY-2] [ACT-24] Partly done today: Add to today, then "Revise these first tomorrow": today keeps its catch-up pages, credited to yesterday, and tomorrow starts with the weak pages', async () => {
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
  // Home names where they came from: Insights, not yesterday (ACT-24).
  expect(plain(tomorrow.detail() ?? '')).toMatch(/ 2 from Insights first$/);
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
  expect(plain(home.catchUp())).toBe(`Left yesterday · Revise ${catchUpWhat(pagesRange(585, 586))}`);
  await home.tap('today-carry-over');
  await app.until(() => home.catchUp() == null, 'the leftovers to be added');
  await app.untilSynced();
  const carry = app.app.user!.carryOver!;
  expect(carry.day).toBe(D);
  expect(carry.pages).toEqual([585, 586]);
  expect(carry.next).toEqual({ day: addDays(D, 1), pages: [600, 601], source: 'insights' });
  await app.close();
});

// The day the Insights pages are due, Home offered no catch-up: one carry per day, and the Insights
// pages counted as today's, so the leftovers of the days before couldn't be added (Nov 8 2026). They
// are offered as on any day, and Add to today puts them after the Insights pages, each credited to the
// day it was missed (SESS-7); the Insights pages stay labelled and stay extra (ACT-24).
it('[ACT-24] [CARRY-1] [SESS-7] The day the Insights pages are due, the leftovers before it are still offered; Add to today puts them after the Insights pages, each credited to its own day', async () => {
  const { phone, app, D } = await scenarioPhone('partial-today');
  const home = new Home(app);
  await home.ready();
  await reviseFirstTomorrow(app, D, [600, 601]);
  await app.close();

  // Tomorrow: two pages left from the day before yesterday (585–586) and three from yesterday (589–591).
  setNow('2026-11-06 12:00');
  const next = await phone.open(homeStack);
  const tomorrow = new Home(next);
  await tomorrow.ready();
  expect(plain(tomorrow.catchUp() ?? '')).toMatch(/ · Revise /);
  await tomorrow.tap('today-carry-over');
  await next.until(() => tomorrow.catchUp() == null, 'the leftovers to be added');
  await next.untilSynced();

  const carry = next.app.user!.carryOver!;
  const T = addDays(D, 1);
  expect(carry.day).toBe(T);
  expect(carry.pages).toEqual([600, 601, 585, 586, 589, 590, 591]);
  expect(carry.source).toBe('insights');
  // Only the leftovers have a day they were missed; the Insights pages have none.
  expect(carry.from).toEqual({ 585: addDays(D, -1), 586: addDays(D, -1), 589: D, 590: D, 591: D });
  expect(plain(tomorrow.detail() ?? '')).toMatch(/ 2 from Insights, 5 from yesterday first$/);

  const session = await tomorrow.startSession();
  expect(session.pages()).toEqual([600, 601, 585, 586, 589, 590, 591]);
  expect(next.screen.queryByTestId('session-from-insights')).not.toBeNull();
  await session.swipeThrough(7);
  await session.back();
  await next.untilSynced();
  expect(creditedTo(next, addDays(D, -1))).toEqual(pagesRange(582, 586));
  expect(creditedTo(next, D)).toEqual(pagesRange(587, 591));
  expect(creditedTo(next, T)).toEqual([600, 601]);
  await next.close();
});

// Majd's phone, Nov 8 2026 (01:14): "28 of 28", "Continue at Quraysh" and Continue revision, with every
// page revised. Every page tomorrow had of its own was also among the pages put first from Insights, so
// none counted as its own (lib/carryOver duePagesOf): the day could never be done, on Home or for the
// streak, and Home's "Continue at" fell back to the last page. They are tomorrow's own pages, first.
// The session also called them "the weak pages", whatever put them there (Plan it, Revise them tomorrow).
it('[ACT-24] [SESS-7] Tomorrow’s own pages among the pages put first from Insights still finish tomorrow; the session names the pages, not “the weak pages”', async () => {
  const { phone, app, D } = await scenarioPhone('partial-today');
  const home = new Home(app);
  await home.ready();
  type Algo = typeof import('../../../src/lib/algorithm');
  type Mem = typeof import('../../../src/lib/memorizedAyahs');
  const { getPagesForDay } = app.mods.require<Algo>('src/lib/algorithm');
  const { revisablePages } = app.mods.require<Mem>('src/lib/memorizedAyahs');
  const T = addDays(D, 1);
  const [y, m, d] = T.split('-').map(Number);
  const own = getPagesForDay(app.app.user!, new Date(y, m - 1, d), revisablePages(app.app.pages));
  expect(own.length).toBeGreaterThan(0);
  await reviseFirstTomorrow(app, D, [600, 601, ...own]);
  await app.close();

  setNow('2026-11-06 12:00');
  const next = await phone.open(homeStack);
  const tomorrow = new Home(next);
  await tomorrow.ready();
  const session = await tomorrow.startSession();
  expect(session.pages()).toEqual([600, 601, ...own]);
  const label = plain(next.screen.getByTestId('session-from-insights').props.children);
  expect(label).not.toMatch(/weak/);
  expect(label).toMatch(/^From Insights: /);
  await session.swipeThrough(own.length + 2);
  await session.back();
  await next.untilSynced();
  await next.until(() => /^Done · /.test(plain(tomorrow.title() ?? '')), 'Home to say tomorrow is done');
  expect(plain(tomorrow.cta() ?? '')).toBe('Review session');
  await next.close();
});

// Fajr on (Majd's report, Nov 8 2026: pages "for tomorrow" showing at 01:14). Before Fajr the revision
// day is still the day before, so "first tomorrow" tapped at 00:30 is for the day that starts at Fajr:
// not shown at 01:14, shown after Fajr. Activity places it from the same revision day Home reads.
it('[ACT-24] [DAY-2] With Fajr on, pages put first at 00:30 wait for the day that starts at Fajr: not at 01:14, first after Fajr', async () => {
  const { phone, app } = await scenarioPhone('fajr-edge', { at: '2026-11-06 00:30' });
  type Fajr = typeof import('../../../src/lib/fajrBoundary');
  const { getRevisionDayForUser } = app.mods.require<Fajr>('src/lib/fajrBoundary');
  const { putFirstTomorrow } = app.mods.require<Weak>('src/lib/weakSpotActions');
  const day = getRevisionDayForUser(app.app.user!);
  expect(day).toBe('2026-11-05');
  await app.act(async () => {
    await putFirstTomorrow({ user: app.app.user!, saveUser: app.app.saveUser, today: day, pages: [600, 601], name: 'Al-Masad', latest: () => app.app.user });
  });
  await app.untilSynced();
  expect(app.app.user!.carryOver).toMatchObject({ day: '2026-11-06', pages: [600, 601], source: 'insights' });
  await app.close();

  setNow('2026-11-06 01:14');
  const night = await phone.open(homeStack);
  const before = new Home(night);
  await before.ready();
  expect(plain(before.detail() ?? '')).not.toMatch(/from Insights/);
  await night.close();

  setNow('2026-11-06 07:00');
  const morning = await phone.open(homeStack);
  const after = new Home(morning);
  await after.ready();
  expect(plain(after.detail() ?? '')).toMatch(/ 2 from Insights first$/);
  await morning.close();
});

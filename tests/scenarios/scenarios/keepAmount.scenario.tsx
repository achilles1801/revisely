// Keep daily amount when the missed pages fill today (D1, Majd, Nov 7 2026: "if they have keep
// daily amount then we should honor that and let it be missed pages only, and if they wanna do
// today's pages then they can click revise ahead"). Today is the missed pages alone; revising them
// finishes today and counts it; today's own pages are tomorrow's, revised ahead.
//
// Plan from Monday Nov 2 2026, five a day over pages 1–20: Mon 1–5, Tue 6–10, Wed 11–15,
// Thu 16–20. Monday and Tuesday are done; Wednesday is missed entirely.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { Home, homeStack } from '../harness/screens';
import { Phone, OpenApp } from '../harness/phone';

type AheadCredit = typeof import('../../../src/lib/aheadCredit');

function creditedTo(app: OpenApp, day: string): number[] {
  const ahead = app.mods.require<AheadCredit>('src/lib/aheadCredit');
  return [...ahead.creditedOnDay(app.app.logs, day)].sort((a, b) => a - b);
}

async function openHome(phone: Phone, at: string): Promise<{ app: OpenApp; home: Home }> {
  setNow(at);
  const app = await phone.open(homeStack);
  const home = new Home(app);
  await home.ready();
  return { app, home };
}

async function reviseToday(phone: Phone, at: string): Promise<void> {
  const { app, home } = await openHome(phone, at);
  const session = await home.startSession();
  await session.swipeThrough();
  await session.back();
  await app.untilSynced();
  await app.close();
}

/** Monday and Tuesday done, Wednesday missed: Thursday morning. */
async function missedWednesday(): Promise<Phone> {
  setZone(ZONES.chicago);
  setNow('2026-11-02 08:00');
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  await app.close();
  await reviseToday(phone, '2026-11-02 20:00');
  await reviseToday(phone, '2026-11-03 20:00');
  return phone;
}

describe('Keep daily amount, the missed pages filling today', () => {
  it('[CARRY-2] [SESS-7] [SESS-6] [SESS-2] a missed day added to today: today is its pages alone; revised, yesterday is back and today is done', async () => {
    const phone = await missedWednesday();
    const { app, home } = await openHome(phone, '2026-11-05 09:00');
    expect(home.catchUp()).toBe('Missed yesterday · Revise p. 11–15');
    // Wednesday missed after two days done: the grace.
    await home.untilStreak(2, true);

    await home.tap('today-carry-over');
    await app.until(() => home.catchUp() == null, 'the missed pages to be added to today');
    await app.untilSynced();
    const session = await home.startSession();
    expect(session.pages()).toEqual(pagesRange(11, 15));
    await session.swipeThrough();
    expect(session.endCard()).toMatch(/Revision complete/);
    await session.back();
    await app.untilSynced();

    // Credited to Wednesday, not today (SESS-7); yet today is done, and it counts.
    expect(creditedTo(app, '2026-11-04')).toEqual(pagesRange(11, 15));
    expect(creditedTo(app, '2026-11-05')).toEqual([]);
    expect(home.title()).toBe('Done · 5 pages');
    expect(home.cta()).toBe('Review session');
    // Monday, Tuesday, Wednesday (back in its grace window) and today.
    await home.untilStreak(4);
    // Today's own pages (16–20) are tomorrow's, offered ahead.
    expect(home.ahead()).toMatch(/^Tomorrow starts at .+, p\.\s16(?!\d)/);
    await app.close();
  });

  it('[AHEAD-1] [AHEAD-2] today’s own pages, revised from Home’s “Tomorrow starts at”, count for tomorrow', async () => {
    const phone = await missedWednesday();
    const { app, home } = await openHome(phone, '2026-11-05 09:00');
    await home.tap('today-carry-over');
    await app.until(() => home.catchUp() == null, 'the missed pages to be added to today');
    await app.untilSynced();
    const session = await home.startSession();
    await session.swipeThrough();
    await session.back();
    await app.untilSynced();

    const ahead = await home.openAhead();
    expect(ahead.pages()).toEqual(pagesRange(16, 20));
    expect(ahead.canSwipeBack()).toBe(false);
    await ahead.swipeThrough();
    await ahead.back();
    await app.untilSynced();
    expect(creditedTo(app, '2026-11-06')).toEqual(pagesRange(16, 20));
    expect(home.title()).toBe('Done · 10 pages');
    await app.close();

    // Friday: its pages were revised ahead, so Friday is done already (AHEAD-2).
    const friday = await openHome(phone, '2026-11-06 09:00');
    expect(friday.home.title()).toBe('Done · 5 pages');
    expect(friday.home.catchUp()).toBeNull();
    await friday.app.close();
  });
});

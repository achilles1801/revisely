// The real Home for one account of each kind of user (tests/scenarios/USER-MATRIX.md; BEHAVIOUR.md USER-1). The
// property test (properties/userMatrix.property.ts) checks Home's words over thousands of generated accounts; these
// open the app itself, against the emulators, for the kinds of user it is easiest to forget: nothing memorized, a single
// ayah, all 604 pages on the juz plan, a plan saved in another time zone, and someone back after weeks away; and the
// session Home's button opens for each, holding the pages Home names (USER-2).
//
// Majd, Nov 27 2026, after HOME-9: "can we have a session sweep through all different possible scenarios that could
// arise from every type of user so we can make sure we take into account every single case and edge case so bugs like
// this never come again".

import { setNow, setZone, ZONES } from '../harness/clock';
import { changeUser, newAccount, pagesRange } from '../harness/account';
import { setServerDoc } from '../harness/serverDocs';
import { Home, homeStack } from '../harness/screens';
import { Phone, type OpenApp } from '../harness/phone';

/** Home's words with its no-break spaces and hyphens as plain ones. */
const plain = (s: string | null) => (s ?? '').split(' ').join(' ').split('‑').join('-');

/** What every Home keeps, whoever the account is (USER-1): no empty line, no missing number, nothing unfilled. */
function expectWhole(home: Home): void {
  const today = home.today();
  expect(today).not.toMatch(/NaN|undefined|\bnull\b|Infinity|\[object|\{\{/);
  expect(plain(home.title()).trim()).not.toBe('');
  expect(plain(home.memorized()).trim()).not.toBe('');
}

async function openHome(phone: Phone): Promise<{ app: OpenApp; home: Home }> {
  const app = await phone.open(homeStack);
  const home = new Home(app);
  await home.ready();
  return { app, home };
}

describe('Home for every kind of user (USER-MATRIX.md)', () => {
  it('[USER-1] nothing memorized: the new account’s words, its one button, and 0%', async () => {
    setZone(ZONES.london);
    setNow('2026-11-03 09:00');
    const phone = new Phone();
    const setup = await newAccount(phone, { memorized: [] });
    await setup.close();

    const { app, home } = await openHome(phone);
    await app.until(() => home.title() === 'Nothing to revise yet', 'the new account’s words');
    expect(home.cta()).toBe('Mark memorized pages');
    expect(home.memorized()).toMatch(/^0% of the Quran memorized/);
    expectWhole(home);
    await app.close();
  });

  it('[USER-1] [MEM-4] a single ayah memorized: today starts at it, and the memorized line says 0.1%, never 0%', async () => {
    setZone(ZONES.london);
    setNow('2026-11-03 09:00');
    const phone = new Phone();
    const setup = await newAccount(phone, { memorized: [] });
    const uid = setup.uid;
    await setup.close();
    // Al-Fatihah's first ayah alone, as a phone saving ayahs writes it (MEM-1).
    await setServerDoc(`users/${uid}/pages/1`, { status: 'learning', verses: [1001] });

    const { app, home } = await openHome(phone);
    await app.until(() => plain(home.title()).startsWith('Starts at Al-Fatihah'), 'today to start at Al-Fatihah');
    expect(home.cta()).toBe('Start revision');
    // A seventh of a page is 0.02% of the Qur'an: it read "0% of the Quran memorized" (USER-1).
    expect(home.memorized()).toMatch(/^0\.1% of the Quran memorized/);
    expect(home.today()).not.toContain('Mark memorized pages');
    expectWhole(home);
    // The session holds that one page, and finishes on the end card; Home then says Done.
    const session = await home.startSession();
    expect(session.pages()).toEqual([1]);
    await session.swipeThrough(1);
    expect(session.endCard()).toMatch(/Revision complete/);
    expect(session.endCard()).not.toMatch(/NaN|undefined|\{\{/);
    await session.back();
    await app.untilSynced();
    await app.until(() => (home.title() ?? '').startsWith('Done · 1 page'), 'Home to say Done');
    await app.close();
  });

  it('[USER-1] [SCHED-2] all 604 pages on the juz plan: Juz 1 today, 100% memorized', async () => {
    setZone(ZONES.riyadh);
    setNow('2026-11-03 09:00');
    const phone = new Phone();
    const setup = await newAccount(phone, { memorized: pagesRange(1, 604), user: { scheduleMode: 'juz', dailyJuzCount: 1 } });
    await setup.close();

    const { app, home } = await openHome(phone);
    await app.until(() => plain(home.title()).startsWith('Starts at Al-Fatihah'), 'today to start at Al-Fatihah');
    expect(plain(home.detail())).toMatch(/Juz 1\b/);
    expect(home.cta()).toBe('Start revision');
    expect(home.memorized()).toMatch(/^100% of the Quran memorized/);
    expectWhole(home);
    // The session holds Juz 1, pages 1–21 in order, from its first.
    const session = await home.startSession();
    expect(session.pages()).toEqual(pagesRange(1, 21));
    expect(session.current()).toBe(1);
    await app.close();
  });

  it('[USER-1] [DAY-8] a plan saved in Riyadh, then the phone in Chicago where it is still the day before: Home starts it today', async () => {
    // Saved just after midnight on Tuesday in Riyadh: its first day (pages 1–5) is Tuesday.
    setZone(ZONES.riyadh);
    setNow('2026-11-03 01:00');
    const phone = new Phone();
    const setup = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
    await changeUser(setup, {
      customPlan: { days: [pagesRange(1, 5), pagesRange(6, 10), [], pagesRange(11, 20)], cycleStartDate: '2026-11-03', direction: 'forward' },
    });
    await setup.untilSynced();
    await setup.close();

    // Four hours later, in Chicago, it is Monday evening: a day before the plan starts. Home moves the plan's start to
    // today rather than show a day with nothing (or the new account's words, HOME-9).
    setZone(ZONES.chicago);
    setNow('2026-11-02 20:00');
    const { app, home } = await openHome(phone);
    await app.until(() => plain(home.title()).startsWith('Starts at Al-Fatihah'), 'today to start at the plan’s first day');
    expect(home.cta()).toBe('Start revision');
    expect(home.today()).not.toContain('Mark memorized pages');
    await app.until(() => app.app.user?.customPlan?.cycleStartDate === '2026-11-02', 'the plan to start today');
    expectWhole(home);
    // The session holds the plan's first day, as Home names it.
    const session = await home.startSession();
    expect(session.pages()).toEqual(pagesRange(1, 5));
    await app.close();
  });

  it('[USER-1] [SCHED-5] [CARRY-1] back after three weeks away: today’s own pages, the last three days offered, no streak', async () => {
    // 5 pages a day of pages 1–20 from Sunday Nov 1: a 4-day cycle (1–5, 6–10, 11–15, 16–20).
    setZone(ZONES.chicago);
    setNow('2026-11-01 09:00');
    const phone = new Phone();
    const first = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
    await first.close();
    let { app, home } = await openHome(phone);
    const session = await home.startSession();
    await session.swipeThrough(5);
    await session.back();
    await app.untilSynced();
    await app.close();

    // Wednesday Nov 25, nothing since: day 24 of the cycle, 24 mod 4 = 0, so pages 1–5 again (SCHED-5: the days
    // missed don't pile up). Nov 22–24 had 6–10, 11–15 and 16–20, all missed.
    setNow('2026-11-25 10:00');
    ({ app, home } = await openHome(phone));
    await app.until(() => plain(home.title()).startsWith('Starts at Al-Fatihah'), 'today’s own pages');
    expect(home.cta()).toBe('Start revision');
    await app.until(() => home.catchUp() != null, 'the catch-up line');
    expect(plain(home.catchUp())).toMatch(/^Missed 3 days · /);
    await home.untilStreak(0);
    expectWhole(home);
    // The session holds today's own pages alone (the missed ones wait for "Add to today"), from the first.
    const today = await home.startSession();
    expect(today.pages()).toEqual(pagesRange(1, 5));
    expect(today.current()).toBe(1);
    await app.close();
  });
});

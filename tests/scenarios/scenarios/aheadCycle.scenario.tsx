// Revising ahead past the cycle's end restarts the cycle (AHEAD-3; Majd, Nov 9 2026: "my next revise
// ahead would just be restarting the cycle"). Keep going and Home's line go on into the next cycle; a day
// that repeats pages the session holds starts a new round, its pages unchecked, credited to that day.
// Every plan: pages a day, juz a day, a custom plan with an off day, Plan it, a plan changed mid-cycle,
// Jump to, carried pages (Keep daily amount), and cycles shorter than a week.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange, saveCustomPlan } from '../harness/account';
import { ActivityDayView, activityStack, flatText, Home, homeStack } from '../harness/screens';
import { markPreviewTester } from '../harness/admin';
import { aheadAt, plain } from '../harness/words';
import { Phone, OpenApp } from '../harness/phone';
import type { User } from '../../../src/types';

type Weak = typeof import('../../../src/lib/weakSpotActions');

// Every plan starts on Monday 2 Nov 2026.
const MON = '2026-11-02';
const day = (n: number): string => {
  const d = new Date(2026, 10, 2 + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function account(memorized: number[], user: Partial<User>): Promise<Phone> {
  setZone(ZONES.chicago);
  setNow(`${MON} 20:00`);
  const phone = new Phone();
  const app = await newAccount(phone, { memorized, user });
  await app.close();
  return phone;
}

async function openHome(phone: Phone, at: string): Promise<{ app: OpenApp; home: Home }> {
  setNow(at);
  const app = await phone.open(homeStack);
  const home = new Home(app);
  await home.ready();
  return { app, home };
}

/** The pages credited to each later day by the sessions of `sessionDay`. */
function aheadOf(app: OpenApp, sessionDay: string): Record<string, number[]> {
  const log = app.app.logs.find((l) => l.date === sessionDay);
  const out: Record<string, number[]> = {};
  for (const [d, pages] of Object.entries(log?.ahead ?? {})) out[d] = [...pages].sort((a, b) => a - b);
  return out;
}

function ownOf(app: OpenApp, sessionDay: string): number[] {
  return [...(app.app.logs.find((l) => l.date === sessionDay)?.pagesRevised ?? [])].sort((a, b) => a - b);
}

/** The end card's line about the next day ("Next cycle · Al-Fatihah to … · 5 pages", "Next: Thu · …"). */
function nextLine(app: OpenApp): string {
  const text = plain(flatText(app.screen.root));
  const m = text.match(/(Next cycle|Next: [^·]+) · [^·]+ · \d+ pages?/);
  return m ? m[0] : '';
}

// Pages a day over 35 pages: a seven-day cycle, Mon 1–5 … Sun 31–35.
const WEEK = pagesRange(1, 35);
const dayPages = (n: number) => pagesRange(1 + 5 * (n % 7), 5 + 5 * (n % 7));

describe('a seven-day cycle, all revised ahead in one day', () => {
  it('[AHEAD-3] [AHEAD-2] [AHEAD-4] Keep going after Sunday restarts the cycle: Monday’s pages again, unchecked, credited to next Monday; Monday stays done', async () => {
    const phone = await account(WEEK, { dailyPageCapacity: 5 });
    const { app, home } = await openHome(phone, `${MON} 21:00`);
    const session = await home.startSession();
    for (let n = 0; n < 7; n++) {
      expect(session.pages()).toEqual(dayPages(n));
      await session.swipeThrough(5);
      if (n < 6) await session.keepGoing();
    }
    // Sunday was the cycle's last day: the next begins on the plan's first page.
    expect(session.hasKeepGoing()).toBe(true);
    expect(nextLine(app)).toMatch(/^Next cycle · .+ · 5 pages$/);
    await session.keepGoing();
    expect(session.pages()).toEqual(dayPages(0));
    expect(session.canSwipeBack()).toBe(false);
    expect(await session.isChecked()).toBe(false);
    await session.swipeThrough(5);
    // On through the next cycle; a day a week or more away carries its date.
    expect(nextLine(app)).toMatch(/^Next: Tue 10 Nov · .+ · 5 pages$/);
    await session.back();
    await app.untilSynced();

    // Monday's own pages stay revised; each later day holds its own pages, next Monday too.
    expect(ownOf(app, MON)).toEqual(WEEK);
    const ahead = aheadOf(app, MON);
    for (let n = 1; n <= 7; n++) expect(ahead[day(n)]).toEqual(dayPages(n));
    // One revision counts for one day: no page is credited twice within a cycle.
    const firstCycle = [...ownOf(app, MON).filter((p) => dayPages(0).includes(p)), ...[1, 2, 3, 4, 5, 6].flatMap((n) => ahead[day(n)])];
    expect(new Set(firstCycle).size).toBe(firstCycle.length);

    expect(plain(home.title())).toMatch(/^Done/);
    expect(plain(home.ahead())).toMatch(aheadAt('Tue 10 Nov', 6));
    await app.close();

    // Next Monday comes round done ahead.
    const later = await openHome(phone, `${day(7)} 21:00`);
    expect(plain(later.home.title())).toMatch(/^Done/);
    await later.app.close();
  });

  it('[AHEAD-3] [AHEAD-1] Home’s line after the whole cycle: "Next cycle starts at …" opens Monday’s pages alone, unchecked', async () => {
    const phone = await account(WEEK, { dailyPageCapacity: 5 });
    const { app, home } = await openHome(phone, `${MON} 21:00`);
    const session = await home.startSession();
    for (let n = 0; n < 7; n++) {
      await session.swipeThrough(5);
      if (n < 6) await session.keepGoing();
    }
    await session.back();
    await app.untilSynced();
    expect(plain(home.ahead())).toMatch(aheadAt('Next cycle', 1));

    const round = await home.openAhead();
    expect(round.pages()).toEqual(dayPages(0));
    expect(round.canSwipeBack()).toBe(false);
    expect(await round.isChecked()).toBe(false);
    await round.swipeThrough(2);
    await round.back();
    await app.untilSynced();
    expect(aheadOf(app, MON)[day(7)]).toEqual([1, 2]);
    // Today's own revision of them is untouched, and today is still done.
    expect(ownOf(app, MON)).toEqual(WEEK);
    expect(plain(home.title())).toMatch(/^Done/);
    // Next Monday goes on from its first page not done, still a new round.
    expect(plain(home.ahead())).toMatch(aheadAt('Mon 9 Nov', 3));
    const again = await home.openAhead();
    expect(again.pages()).toEqual([3, 4, 5]);
    expect(await again.isChecked()).toBe(false);
    await again.back();
    await app.close();
  });
});

describe('every plan goes on into the next cycle', () => {
  it('[AHEAD-3] juz a day, a three-day cycle: after Juz 30, the next cycle starts again at Juz 28', async () => {
    const phone = await account(pagesRange(542, 604), { scheduleMode: 'juz', dailyJuzCount: 1, dailyPageCapacity: 20 });
    const { app, home } = await openHome(phone, `${MON} 21:00`);
    const session = await home.startSession();
    expect(session.pages()).toEqual(pagesRange(542, 561));
    await session.swipeThrough(20);
    await session.keepGoing();
    expect(session.pages()).toEqual(pagesRange(562, 581));
    await session.swipeThrough(20);
    await session.keepGoing();
    expect(session.pages()).toEqual(pagesRange(582, 604));
    await session.swipeThrough(23);
    expect(nextLine(app)).toMatch(/^Next cycle · .+ · 20 pages$/);
    await session.keepGoing();
    expect(session.pages()).toEqual(pagesRange(542, 561));
    expect(await session.isChecked()).toBe(false);
    await session.swipeThrough(20);
    await session.back();
    await app.untilSynced();
    expect(aheadOf(app, MON)[day(3)]).toEqual(pagesRange(542, 561));
    expect(plain(home.ahead())).toMatch(aheadAt('Fri', 562));
    await app.close();
  });

  it('[AHEAD-3] [AHEAD-4] a custom plan with an off day: Keep going passes over it and goes on into the next cycle', async () => {
    const phone = await account(pagesRange(1, 15), { dailyPageCapacity: 5 });
    let { app, home } = await openHome(phone, `${MON} 20:30`);
    // Mon 1–5, Tue off, Wed 6–10, Thu 11–15; Fri begins again.
    await saveCustomPlan(app, [pagesRange(1, 5), [], pagesRange(6, 10), pagesRange(11, 15)]);
    await app.close();
    ({ app, home } = await openHome(phone, `${MON} 21:00`));
    const session = await home.startSession();
    await session.swipeThrough(5);
    await session.keepGoing();
    expect(session.pages()).toEqual(pagesRange(6, 10));
    await session.swipeThrough(5);
    await session.keepGoing();
    expect(session.pages()).toEqual(pagesRange(11, 15));
    await session.swipeThrough(5);
    expect(nextLine(app)).toMatch(/^Next cycle · .+ · 5 pages$/);
    await session.keepGoing();
    expect(session.pages()).toEqual(pagesRange(1, 5));
    expect(await session.isChecked()).toBe(false);
    await session.swipeThrough(5);
    await session.back();
    await app.untilSynced();
    expect(aheadOf(app, MON)).toEqual({ [day(2)]: pagesRange(6, 10), [day(3)]: pagesRange(11, 15), [day(4)]: pagesRange(1, 5) });
    await app.close();
  });

  it('[AHEAD-3] [ACT-24] Plan it put two of Thursday’s pages first tomorrow: Thursday then repeats them, so it starts a new round, and Friday begins the next cycle', async () => {
    // Pages a day over 20 pages: Mon 1–5, Tue 6–10, Wed 11–15, Thu 16–20.
    const phone = await account(pagesRange(1, 20), { dailyPageCapacity: 5 });
    const { app, home } = await openHome(phone, `${MON} 21:00`);
    const { carryForTomorrow } = app.mods.require<Weak>('src/lib/weakSpotActions');
    const user = app.app.user!;
    await app.act(() => app.app.saveUser({ ...user, carryOver: carryForTomorrow(day(1), [16, 17], user.carryOver) }));
    await app.untilSynced();

    const session = await home.startSession();
    await session.swipeThrough(5);
    await session.keepGoing();
    expect(session.pages()).toEqual([16, 17, ...pagesRange(6, 10)]);
    await session.swipeThrough(7);
    await session.keepGoing();
    await session.swipeThrough(5);
    // Thursday holds 16 and 17 again: revised for Tuesday in this session, so a new round.
    await session.keepGoing();
    expect(session.pages()).toEqual(pagesRange(16, 20));
    expect(await session.isChecked()).toBe(false);
    await session.swipeThrough(5);
    expect(nextLine(app)).toMatch(/^Next cycle · .+ · 5 pages$/);
    await session.keepGoing();
    expect(session.pages()).toEqual(pagesRange(1, 5));
    await session.swipeThrough(5);
    await session.back();
    await app.untilSynced();
    const ahead = aheadOf(app, MON);
    expect(ahead[day(1)]).toEqual([6, 7, 8, 9, 10, 16, 17]);
    expect(ahead[day(3)]).toEqual(pagesRange(16, 20));
    expect(ahead[day(4)]).toEqual(pagesRange(1, 5));
    await app.close();
  });

  it('[AHEAD-3] [SCHED-3] a plan changed mid-cycle: the new cycle comes round and restarts; the credit from before the change stays', async () => {
    const phone = await account(pagesRange(1, 20), { dailyPageCapacity: 5 });
    const { app, home } = await openHome(phone, `${MON} 21:00`);
    // Monday, and Tuesday ahead, on the old plan (5 a day).
    let session = await home.startSession();
    await session.swipeThrough(5);
    await session.keepGoing();
    await session.swipeThrough(5);
    await session.back();
    await app.untilSynced();
    // A new plan from today: two days of ten.
    await saveCustomPlan(app, [pagesRange(1, 10), pagesRange(11, 20)]);
    expect(plain(home.title())).toMatch(/^Done/);
    session = await home.openAhead();
    expect(session.pages()).toEqual(pagesRange(11, 20));
    await session.swipeThrough(10);
    // Wednesday is today's pages again: a new round.
    await session.keepGoing();
    expect(session.pages()).toEqual(pagesRange(1, 10));
    expect(await session.isChecked()).toBe(false);
    await session.swipeThrough(10);
    await session.back();
    await app.untilSynced();
    const ahead = aheadOf(app, MON);
    expect(ahead[day(1)]).toEqual(pagesRange(6, 20));
    expect(ahead[day(2)]).toEqual(pagesRange(1, 10));
    await app.close();
  });

  it('[AHEAD-3] [JUMP-1] after Jump to Juz 29, the cycle comes round at today’s pages, named by its weekday (the plan’s first page is mid-day)', async () => {
    // Pages a day, 21 a day over Juz 28–30 (63 pages): a three-day cycle.
    const phone = await account(pagesRange(542, 604), { dailyPageCapacity: 21 });
    const { app, home } = await openHome(phone, `${MON} 21:00`);
    await home.jumpTo('jump-juz-29');
    const session = await home.startSession();
    expect(session.pages()[0]).toBe(562);
    const today = session.pages();
    await session.swipeThrough(today.length);
    await session.keepGoing();
    await session.swipeThrough(session.pages().length);
    await session.keepGoing();
    await session.swipeThrough(session.pages().length);
    expect(nextLine(app)).toMatch(/^Next: Thu · .+ · 21 pages$/);
    await session.keepGoing();
    expect(session.pages()).toEqual(today);
    expect(await session.isChecked()).toBe(false);
    await session.back();
    await app.close();
  });

  it('[AHEAD-3] [CARRY-2] Keep daily amount carried yesterday’s two pages into today: the shifted cycle comes round at today’s pages, a new round', async () => {
    // Pages a day over 20 pages: Mon 1–5, Tue 6–10, Wed 11–15, Thu 16–20.
    const phone = await account(pagesRange(1, 20), { dailyPageCapacity: 5 });
    let { app, home } = await openHome(phone, `${MON} 21:00`);
    let session = await home.startSession();
    await session.swipeThrough(3);
    await session.back();
    await app.untilSynced();
    await app.close();
    // Tuesday: Monday's 4 and 5 come first, and the plan slides back by two.
    ({ app, home } = await openHome(phone, `${day(1)} 21:00`));
    await home.tap('today-carry-over');
    await app.until(() => home.catchUp() == null, 'the leftovers to be added');
    await app.untilSynced();
    session = await home.startSession();
    const today = session.pages();
    expect(today).toEqual([4, 5, 6, 7, 8]);
    await session.swipeThrough(5);
    for (const expected of [pagesRange(9, 13), pagesRange(14, 18), [19, 20, 1, 2, 3]]) {
      await session.keepGoing();
      expect(session.pages()).toEqual(expected);
      await session.swipeThrough(5);
    }
    // Saturday repeats today's pages.
    await session.keepGoing();
    expect(session.pages()).toEqual(today);
    expect(await session.isChecked()).toBe(false);
    await session.swipeThrough(5);
    await session.back();
    await app.untilSynced();
    expect(aheadOf(app, day(1))[day(5)]).toEqual(today);
    await app.close();
  });
});

// Majd, Nov 9 2026: "make sure … we're taking into account activity/insights to reflect it like its still
// counting those pages for that day". The schedule credits the next cycle's day (AHEAD-2); everywhere
// recency shows, they are revised on the day they were (AHEAD-6, DAY-9).
describe('Activity and Insights after revising into the next cycle', () => {
  async function tap(app: OpenApp, testID: string): Promise<void> {
    const { fireEvent } = app.mods.rtl;
    await app.until(() => app.screen.queryByTestId(testID) != null, testID);
    const el = app.screen.getByTestId(testID);
    await app.act(async () => {
      fireEvent.press(el);
    });
    await app.idle(50);
  }
  const label = (app: OpenApp, testID: string) => app.screen.getByTestId(testID).props.accessibilityLabel as string;

  it('[AHEAD-3] [AHEAD-6] [DAY-9] [ACT-26] the whole week and next Monday revised on Monday: Monday’s day shows its own pages done and each credit, and Coverage counts every page this week', async () => {
    setZone(ZONES.chicago);
    setNow(`${MON} 20:00`);
    const phone = new Phone();
    const first = await newAccount(phone, { memorized: WEEK, user: { dailyPageCapacity: 5 } });
    const uid = first.uid;
    await first.close();
    await markPreviewTester(uid);

    const { app: h, home } = await openHome(phone, `${MON} 21:00`);
    const session = await home.startSession();
    for (let n = 0; n < 7; n++) {
      await session.swipeThrough(5);
      await session.keepGoing();
    }
    // Next Monday, a new round: Monday's own pages again.
    expect(session.pages()).toEqual(dayPages(0));
    await session.swipeThrough(5);
    await session.back();
    await h.untilSynced();
    await h.close();

    const app = await phone.open(activityStack);
    await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
    // Monday's day: its own five, done (not taken away because they were revised again for next Monday),
    // and a credit line for every later day, next Monday's named by its date.
    const dayView = new ActivityDayView(app);
    await dayView.open(MON);
    await app.until(() => app.screen.queryAllByLabelText(/^Revised, /).length > 0, 'the Revised block');
    expect(app.screen.queryAllByLabelText('Revised, 5 of 5').length).toBeGreaterThan(0);
    await app.until(() => app.screen.queryAllByTestId('activity-credit').length === 7, 'a credit line for each later day');
    const credits = app.screen.getAllByTestId('activity-credit').map((el) => plain(flatText(el)));
    expect(credits).toContainEqual(expect.stringMatching(/^Ahead for Tuesday 3 November: /));
    expect(credits).toContainEqual(expect.stringMatching(/^Ahead for Sunday 8 November: /));
    expect(credits).toContainEqual(expect.stringMatching(/^Ahead for Monday 9 November: /));

    const nav = app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
    await app.act(async () => {
      nav.current.navigate('Activity');
    });
    await app.until(() => app.screen.queryByTestId('activity-blocks-views') != null, 'Activity');
    // The calendar shades Monday as revised, all of its own pages.
    await app.until(() => /revised 100 percent/.test(label(app, `calendar-day-${MON}`)), 'Monday shaded as revised');

    await tap(app, 'pill-insights');
    // Every page covered: the figure is plain text (nothing left uncovered to open), once the revisions load.
    const coverage = () => {
      const el = app.screen.queryByTestId('insights-coverage-figure');
      return el ? plain(flatText(el)) : '';
    };
    await app.until(() => /memorized pages/.test(coverage()), 'Coverage');
    expect(coverage()).toMatch(/^100%\s*35 of 35 memorized pages in 30 days$/);
    // Monday counts as a day revised.
    expect(label(app, 'insights-consistency-figure')).toMatch(/^1 of /);
    await tap(app, 'pill-page');
    for (const page of [1, 5, 20, 35]) expect(label(app, `coverage-page-${page}`)).toMatch(new RegExp(`, page ${page}, revised this week$`));
    await tap(app, 'coverage-page-row-1');
    await app.until(() => app.screen.queryByTestId('juz-sheet-headline') != null, 'the juz sheet');
    expect(app.screen.getByTestId('juz-sheet-headline').props.children).toBe('Last revised today');
    await app.close();
  });
});

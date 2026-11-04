// Revising ahead (BEHAVIOUR.md, AHEAD-*), with the reproduction scenarios of
// PR #197 (S1: "Tomorrow starts at" before Fajr; the Tuesday/Thursday report).

import { setNow, setZone, ZONES } from '../harness/clock';
import { CITIES, newAccount, pagesRange } from '../harness/account';
import { flatText, Home, homeStack } from '../harness/screens';
import { Phone, OpenApp } from '../harness/phone';
import type { User } from '../../../src/types';

const MEMORIZED = pagesRange(1, 20);
// The plan starts on Monday Nov 2 2026: Mon 1–5, Tue 6–10, Wed 11–15, Thu 16–20, Fri 1–5.
const MON = pagesRange(1, 5);
const TUE = pagesRange(6, 10);
const WED = pagesRange(11, 15);
const THU = pagesRange(16, 20);

async function account(user: Partial<User> = {}): Promise<{ phone: Phone; app: OpenApp }> {
  setZone(ZONES.chicago);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: MEMORIZED, user: { dailyPageCapacity: 5, ...user } });
  await app.close();
  return { phone, app };
}

async function openHome(phone: Phone, at: string): Promise<{ app: OpenApp; home: Home }> {
  setNow(at);
  const app = await phone.open(homeStack);
  const home = new Home(app);
  await home.ready();
  return { app, home };
}

function credit(app: OpenApp) {
  return app.app.logs
    .map((l) => ({ day: l.date, revised: [...l.pagesRevised].sort((a, b) => a - b), ahead: l.ahead ?? {} }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

describe('done for the day', () => {
  it('[AHEAD-1] [DAY-3] Home offers tomorrow; tapping it opens on its first page, after today’s', async () => {
    const { phone } = await account();
    const { app, home } = await openHome(phone, '2026-11-02 21:00');
    expect(home.ahead()).toBeNull();
    const session = await home.startSession();
    await session.swipeThrough(5);
    await session.back();
    expect(home.ahead()).toMatch(/^Tomorrow starts at .*p\. 6(?!\d)/);

    const ahead = await home.openAhead();
    expect(ahead.pages()).toEqual([...MON, ...TUE]);
    expect(ahead.current()).toBe(6);
    await app.close();
  });

  it('[AHEAD-1] [DAY-2] [DAY-3] S1 (PR #197): before Fajr, tomorrow is the day after the revision day', async () => {
    const { phone } = await account({ fajrBoundaryEnabled: true, locationCoords: CITIES.chicago });
    // Tuesday 00:30: still Monday until Fajr.
    const { app, home } = await openHome(phone, '2026-11-03 00:30');
    expect(home.title()).toMatch(/p\. 1(?!\d)/);
    const session = await home.startSession();
    expect(session.pages()).toEqual(MON);
    await session.swipeThrough(5);
    await session.back();
    // Tomorrow is Tuesday (Monday + 1), not Wednesday (the calendar's tomorrow).
    expect(home.ahead()).toMatch(/^Tomorrow starts at .*p\. 6(?!\d)/);
    const ahead = await home.openAhead();
    expect(ahead.pages()).toEqual([...MON, ...TUE]);
    await app.close();
  });
});

describe('revised ahead', () => {
  it('[AHEAD-2] [AHEAD-5] [AHEAD-1] [SESS-1] [SESS-4] pages revised ahead count for their own day, which then needs only the rest', async () => {
    const { phone } = await account();
    let { app, home } = await openHome(phone, '2026-11-02 21:00');
    const session = await home.startSession();
    await session.swipeThrough(5);
    await session.keepGoing();
    // Two of Tuesday's pages, by the check, then Back.
    await session.check();
    await session.swipe();
    await session.check();
    await session.back();
    await app.untilSynced();
    expect(credit(app)).toEqual([{ day: '2026-11-02', revised: [...MON, 6, 7], ahead: { '2026-11-03': [6, 7] } }]);
    // Done · 7 (Monday's five and the two ahead), and tomorrow goes on from its first page not done.
    expect(home.title()).toMatch(/^Done · 7 pages/);
    expect(home.ahead()).toMatch(/^Tomorrow starts at .*p\. 8(?!\d)/);
    const rest = await home.openAhead();
    expect(rest.pages()).toEqual([...MON, 8, 9, 10]);
    expect(rest.current()).toBe(8);
    await rest.back();
    await app.close();

    // Tuesday: the day isn't done; the session holds its five pages, two already checked.
    ({ app, home } = await openHome(phone, '2026-11-03 18:00'));
    expect(home.ahead()).toBeNull();
    const tue = await home.startSession();
    expect(tue.pages()).toEqual(TUE);
    // Revising the three left finishes it.
    await tue.swipeThrough(5);
    await tue.back();
    await app.untilSynced();
    expect(home.ahead()).toMatch(/^Tomorrow starts at .*p\. 11(?!\d)/);
    const tuesday = credit(app).find((c) => c.day === '2026-11-03');
    expect(tuesday?.revised).toEqual(expect.arrayContaining([8, 9, 10]));
    await app.close();
  });

  it('[AHEAD-5] Keep going, then Back without revising: no credit for that day', async () => {
    const { phone } = await account();
    const { app, home } = await openHome(phone, '2026-11-02 21:00');
    const session = await home.startSession();
    await session.swipeThrough(5);
    await session.keepGoing();
    await session.back();
    await app.untilSynced();
    expect(credit(app)).toEqual([{ day: '2026-11-02', revised: MON, ahead: {} }]);
    expect(home.ahead()).toMatch(/^Tomorrow starts at .*p\. 6(?!\d)/);
    await app.close();
  });
});

describe('Keep going', () => {
  it('[AHEAD-3] [AHEAD-2] [SESS-2] twice: two later days done in one session, each credited to its own day', async () => {
    const { phone } = await account();
    let { app, home } = await openHome(phone, '2026-11-02 21:00');
    const session = await home.startSession();
    await session.swipeThrough(5);
    await session.keepGoing();
    expect(session.pages()).toEqual([...MON, ...TUE]);
    await session.swipeThrough(5);
    await session.keepGoing();
    expect(session.pages()).toEqual([...MON, ...TUE, ...WED]);
    await session.swipeThrough(5);
    await session.back();
    await app.untilSynced();
    expect(credit(app)).toEqual([
      { day: '2026-11-02', revised: [...MON, ...TUE, ...WED], ahead: { '2026-11-03': TUE, '2026-11-04': WED } },
    ]);
    await app.close();

    // Tuesday: done already (ahead).
    ({ app, home } = await openHome(phone, '2026-11-03 09:00'));
    expect(home.today()).toMatch(/Done/);
    await app.close();
  });

  it('[AHEAD-3] stops at the end of the cycle', async () => {
    const { phone } = await account();
    const { app, home } = await openHome(phone, '2026-11-02 21:00');
    const session = await home.startSession();
    for (const day of [MON, TUE, WED]) {
      await session.swipeThrough(day.length);
      await session.keepGoing();
    }
    await session.swipeThrough(5);
    // Mon–Thu is the whole cycle: Friday is Monday's pages again.
    expect(session.hasKeepGoing()).toBe(false);
    await session.back();
    await app.close();
  });

  it('[AHEAD-4] [DAY-2] the Tuesday/Thursday report (PR #197): Wednesday done ahead before Fajr, so Home offers Thursday', async () => {
    // Decision pending (keep passing over a day done ahead, or show it): this
    // pins what the app does now. Change it here first if the rule changes.
    const { phone } = await account({ fajrBoundaryEnabled: true, locationCoords: CITIES.chicago });
    // Monday done on Monday.
    let { app, home } = await openHome(phone, '2026-11-02 21:00');
    let session = await home.startSession();
    await session.swipeThrough(5);
    await session.back();
    await app.close();
    // Wednesday 00:30, before Fajr: still Tuesday. Tuesday, then Keep going through Wednesday.
    ({ app, home } = await openHome(phone, '2026-11-04 00:30'));
    session = await home.startSession();
    expect(session.pages()).toEqual(TUE);
    await session.swipeThrough(5);
    await session.keepGoing();
    expect(session.pages()).toEqual([...TUE, ...WED]);
    await session.swipeThrough(5);
    await session.back();
    await app.untilSynced();
    // Tomorrow (Wednesday) is done, so the line names Thursday.
    expect(home.ahead()).toMatch(/^Thu starts at .*p\. 16(?!\d)/);
    const opened = await home.openAhead();
    expect(opened.pages()).toEqual([...TUE, ...THU]);
    await app.close();
  });
});

describe('a day done only ahead', () => {
  // Monday's keep going revised Tuesday's pages ahead, so Tuesday is done with no
  // session of its own. Its review must open on those pages (Majd, Nov 4).
  it('[AHEAD-2] [SESS-2] [SESS-4] Review session on a day done ahead opens with its done pages, and saving them makes its session', async () => {
    const { phone } = await account();
    let { app, home } = await openHome(phone, '2026-11-02 21:00');
    const session = await home.startSession();
    await session.swipeThrough(5);
    await session.keepGoing();
    await session.swipeThrough(5);
    await session.back();
    await app.untilSynced();
    expect(credit(app).map((c) => c.day)).toEqual(['2026-11-02']);
    await app.close();

    ({ app, home } = await openHome(phone, '2026-11-03 09:00'));
    expect(home.title()).toMatch(/^Done · 5 pages/);
    expect(home.carryOver()).toBeNull();
    const { fireEvent } = app.mods.rtl;
    await app.act(async () => {
      fireEvent.press(app.screen.getByTestId('today-cta'));
    });
    // The review opens, on Tuesday's first page.
    expect(app.screen.queryByTestId('edit-session')).not.toBeNull();
    expect(flatText(app.screen.getByTestId('edit-session-page'))).toBe(String(TUE[0]));
    // Close and save: Tuesday gets its own session with the five pages done.
    await app.act(async () => {
      fireEvent.press(app.screen.getByLabelText('Close and save'));
    });
    await app.untilSynced();
    expect(credit(app).find((c) => c.day === '2026-11-03')?.revised).toEqual(TUE);
    await app.close();
  });
});

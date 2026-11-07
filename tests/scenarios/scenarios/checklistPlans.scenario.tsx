// Majd's test pass (~/Documents/revisely-android/testing-checklist.md), scenarios 1, 3, 6, 7
// and 8, on accounts loaded the way he loads them (Settings → Testing → Load test scenario,
// RESET-3): today's lines on Home, the session, the streak, revise ahead, the Fajr edge and a
// custom reverse plan, read off the screens and driven as a finger would.
//
// Every scenario is loaded on Thursday Nov 5 2026 at noon in Chicago (D = 2026-11-05), so the
// expected pages below are worked out by hand from each plan (functions/src/testScenarios.ts).

import { pagesRange, saveEditedPlan } from '../harness/account';
import { setNow } from '../harness/clock';
import { DailyLog, Home, Manager, homeStack } from '../harness/screens';
import { place, plain, startsAt } from '../harness/words';
import { addDays, scenarioPhone } from '../harness/testScenario';
import type { OpenApp } from '../harness/phone';

type Service = typeof import('../../../src/services/firestoreService');
type Builder = typeof import('../../../src/lib/planBuilder');
type Fajr = typeof import('../../../src/lib/fajrBoundary');

async function memorizedItems(app: OpenApp, from: string, to: string) {
  const svc = app.mods.require<Service>('src/services/firestoreService');
  const items = await app.act(() => svc.getActivityItemsBetween(from, to, app.uid));
  return items.memorized.map((m) => ({ day: m.day, pages: [...m.pages].sort((a, b) => a - b) }));
}

// New account: Juz 30 (pp. 582–604), five a day from today, nothing revised.
describe('1. New account', () => {
  it('[SCHED-1] [SESS-1] [SESS-2] [NAME-1] today is pp. 582–586, named by its surahs; the session opens on 582, and five swipes end on the card with Home Done', async () => {
    const { app } = await scenarioPhone('new');
    const home = new Home(app);
    await home.ready();
    expect(plain(home.title())).toBe(`Starts at ${place(582)}`);
    expect(plain(home.title())).toBe('Starts at An-Naba');
    expect(home.detail()).toMatch(/^5\spages · /);
    // NAME-1: surahs and juz, never page numbers (amounts are fine).
    const noPageNumbers = /\bpp?\.\s?\d|\bPages?\s\d/;
    expect(home.today()).not.toMatch(noPageNumbers);
    expect(home.catchUp()).toBeNull();
    expect(home.cta()).toBe('Start revision');
    await home.untilStreak(0);

    const session = await home.startSession();
    expect(session.pages()).toEqual(pagesRange(582, 586));
    expect(session.current()).toBe(582);
    await session.swipeThrough(5);
    expect(plain(session.endCard())).toBe("Revision complete An-Naba to At-Takwir 5 pages revised today");
    await session.back();
    await app.untilSynced();
    expect(home.title()).toBe('Done · 5 pages');
    expect(home.cta()).toBe('Review session');
    await home.untilStreak(1);
    // The session just saved, in the recent list: by its surahs.
    await app.until(() => home.recent().length === 1, 'the session in the recent list');
    expect(plain(home.recent()[0])).toMatch(/Revised 5 pages.*An-Naba to At-Takwir/);
    expect(home.recent()[0]).not.toMatch(noPageNumbers);
    await app.close();
  });

  it('[RESET-3] loading a scenario deletes this phone’s own recordings too', async () => {
    type Recordings = typeof import('../../../src/lib/recordings');
    const { app } = await scenarioPhone('new', {
      before: async (before) => {
        const rec = before.mods.require<Recordings>('src/lib/recordings');
        const fs = jest.requireActual<typeof import('fs')>('fs');
        const path = jest.requireActual<typeof import('path')>('path');
        const temp = path.join(before.phone.folder, 'Caches', 'take.m4a');
        fs.writeFileSync(temp, Buffer.alloc(2048, 1));
        const kept = await before.act(() =>
          rec.appendSegment(null, `file://${temp}`, { kind: 'revision', day: '2026-11-05', segmentMs: 8000, pageMarks: [{ atMs: 0, page: 582 }] }),
        );
        expect(kept.kept).toBe(true);
        expect(await before.act(() => rec.listRecordings())).toHaveLength(1);
      },
    });
    const rec = app.mods.require<Recordings>('src/lib/recordings');
    expect(await app.act(() => rec.listRecordings())).toEqual([]);
    await app.close();
  });

  it('[ACT-10] Memorized pages: two pages ask with Today first and log today; six ask with Before first and log nothing; unmarking takes a page out', async () => {
    const { app, D } = await scenarioPhone('new');
    await new Home(app).ready();
    const manager = new Manager(app);
    await manager.open();
    expect(await memorizedItems(app, D, D)).toEqual([{ day: D, pages: pagesRange(582, 604) }]);

    // Two pages: Today comes first, and logs them in today's Memorized item.
    expect(await manager.save({ 562: 'memorized', 563: 'memorized' }, 'Today')).toEqual(['Today', "Before (don't log)", 'Cancel']);
    await app.until(() => app.app.pages.filter((p) => p.status === 'memorized').length === 25, 'the two pages to be memorized');
    expect(await memorizedItems(app, D, D)).toEqual([{ day: D, pages: [562, 563, ...pagesRange(582, 604)] }]);

    // Six pages: Before comes first, and logs nothing.
    const six = Object.fromEntries(pagesRange(570, 575).map((p) => [p, 'memorized' as const]));
    expect(await manager.save(six, "Before (don't log)")).toEqual(["Before (don't log)", 'Today', 'Cancel']);
    await app.until(() => app.app.pages.filter((p) => p.status === 'memorized').length === 31, 'the six pages to be memorized');
    expect(await memorizedItems(app, D, D)).toEqual([{ day: D, pages: [562, 563, ...pagesRange(582, 604)] }]);

    // Unmarking a page logged today takes it out of the item; nothing is asked.
    expect(await manager.save({ 563: 'not_memorized' }, 'Today')).toBeNull();
    await app.until(() => app.app.pages.find((p) => p.pageNumber === 563)?.status !== 'memorized', 'page 563 to be unmarked');
    expect(await memorizedItems(app, D, D)).toEqual([{ day: D, pages: [562, ...pagesRange(582, 604)] }]);
    await app.close();
  });
});

// Hafiz: all 604 pages, one juz a day from D−60 (day 60 of a 30-day cycle is Juz 1 again).
// Missed: D−55, D−41, D−33, D−20, D−9; D−12 half done.
describe('3. Hafiz', () => {
  it('[SCHED-2] [SESS-5] [SESS-2] today is Juz 1 (pp. 1–21); recent sessions read "Juz N"; the streak is 8 days, 9 once today is done', async () => {
    const { app } = await scenarioPhone('hafiz');
    const home = new Home(app);
    await home.ready();
    expect(plain(home.title())).toBe('Starts at Al-Fatihah');
    expect(home.detail()).toMatch(/^21\spages · .*Juz\s1$/);
    // D−1, D−2, D−3: Juz 30, 29, 28, named by the juz, not their surahs.
    const rows = home.recent();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(/Juz 30/);
    expect(rows[1]).toMatch(/Juz 29/);
    expect(rows[2]).toMatch(/Juz 28/);
    expect(rows[0]).not.toMatch(/An.Naba/);
    // D−9 was missed: D−1 back to D−8.
    await home.untilStreak(8);

    const session = await home.startSession();
    expect(session.pages()).toEqual(pagesRange(1, 21));
    await session.swipeThrough(21);
    await session.back();
    await app.untilSynced();
    expect(home.title()).toBe('Done · 21 pages');
    await home.untilStreak(9);
    await app.close();
  });
});

// Revised ahead: Juz 30, three a day from D−3. Today 591–593 done, and 594–595 of tomorrow's
// 594–596 revised ahead. The day after is 597–599.
describe('6. Revised ahead', () => {
  it('[SESS-4] [AHEAD-1] Done · 5 pages; the review holds today’s three then the two ahead; Tomorrow starts at page 596', async () => {
    const { app } = await scenarioPhone('revise-ahead');
    const home = new Home(app);
    await home.ready();
    expect(home.title()).toBe('Done · 5 pages');
    expect(plain(home.ahead())).toBe(`Tomorrow starts at ${place(596)}`);
    expect(await home.openReview()).toEqual([591, 592, 593, 594, 595]);
    await app.close();
  });

  it('[AHEAD-1] [AHEAD-3] [AHEAD-4] tomorrow’s last page, alone; done, Keep going holds the day after alone, and Home passes over tomorrow', async () => {
    const { app } = await scenarioPhone('revise-ahead');
    const home = new Home(app);
    await home.ready();
    const ahead = await home.openAhead();
    expect(ahead.pages()).toEqual([596]);
    expect(ahead.current()).toBe(596);
    expect(ahead.canSwipeBack()).toBe(false);
    await ahead.swipe();
    expect(ahead.endCard()).toMatch(/Revision complete .+ 1 page revised /);
    await ahead.keepGoing();
    expect(ahead.pages()).toEqual([597, 598, 599]);
    expect(ahead.canSwipeBack()).toBe(false);
    await ahead.back();
    await app.untilSynced();
    // Tomorrow is done ahead: the line goes on to Saturday.
    expect(home.title()).toBe('Done · 6 pages');
    expect(plain(home.ahead())).toBe(`Sat starts at ${place(597)}`);
    await app.close();
  });
});

// Fajr edge: the Fajr boundary on, Juz 30, three a day from D−4. D−2's session opened at 00:30
// on the calendar day after, D−1's ten minutes before today's Fajr; a note at 00:40 on D−2.
describe('7. Fajr edge', () => {
  it('[DAY-2] [SESS-2] [LOG-3] the sessions after midnight count on time: four days, five once today is done; D−2’s note shows 12:40 am alone', async () => {
    const { app, D } = await scenarioPhone('fajr-edge');
    const home = new Home(app);
    await home.ready();
    expect(app.mods.require<Fajr>('src/lib/fajrBoundary').getRevisionDayForUser(app.app.user)).toBe(D);
    await home.untilStreak(4);

    const log = new DailyLog(app);
    await log.open(addDays(D, -2));
    await app.until(() => log.rows().length > 0, 'D−2’s note');
    expect(log.rows()).toEqual([{ kind: 'Note', text: 'Revised after midnight, before Fajr.', time: expect.stringMatching(/^12:40\sam$/) }]);
    await log.back();

    const session = await home.startSession();
    expect(session.pages()).toEqual([594, 595, 596]);
    await session.swipeThrough(3);
    await session.back();
    await app.untilSynced();
    expect(home.title()).toBe('Done · 3 pages');
    await home.untilStreak(5);
    await app.close();
  });

  it('[ACT-1] [DAY-2] a page marked memorized with Today between midnight and Fajr is filed under the revision day it is still in', async () => {
    const { phone, app, D } = await scenarioPhone('fajr-edge');
    await app.close();
    // Friday 00:30: still Thursday until Fajr.
    setNow('2026-11-06 00:30');
    const next = await phone.open(homeStack);
    await new Home(next).ready();
    expect(next.mods.require<Fajr>('src/lib/fajrBoundary').getRevisionDayForUser(next.app.user)).toBe(D);
    const manager = new Manager(next);
    await manager.open();
    await manager.save({ 581: 'memorized' }, 'Today');
    await next.until(() => next.app.pages.find((p) => p.pageNumber === 581)?.status === 'memorized', 'page 581 to be memorized');
    const items = await memorizedItems(next, D, addDays(D, 1));
    expect(items.filter((m) => m.pages.includes(581))).toEqual([{ day: D, pages: [581] }]);
    await next.close();
  });
});

// Custom reverse plan: Juz 30 backwards, four a day, saved on D−2: 604–601, 601–598, 598–595,
// 595–592, 592–589, 589–586, 586–583, 583–582.
describe('8. Custom reverse plan', () => {
  it('[SCHED-3] [SCHED-4] [SCHED-6] today is 598–595, held once each; the editor shows the days from today; tomorrow is 595–592', async () => {
    const { phone, app } = await scenarioPhone('custom-reverse');
    const home = new Home(app);
    await home.ready();
    expect(plain(home.title())).toBe(`Starts at ${place(598)}`);
    expect(home.detail()).toMatch(/^4\spages/);
    const session = await home.startSession();
    expect(session.pages()).toEqual([598, 597, 596, 595]);
    await session.back();

    // The plan editor opens on today's day, in the plan's (reverse) order.
    const builder = app.mods.require<Builder>('src/lib/planBuilder');
    const fajr = app.mods.require<Fajr>('src/lib/fajrBoundary');
    const shown = builder.rotateCustomPlanToToday(app.app.user!.customPlan!, fajr.getRevisionDateForUser(app.app.user));
    expect(shown).toEqual([
      [598, 597, 596, 595],
      [595, 594, 593, 592],
      [592, 591, 590, 589],
      [589, 588, 587, 586],
      [586, 585, 584, 583],
      [583, 582],
      [604, 603, 602, 601],
      [601, 600, 599, 598],
    ]);
    await app.close();

    setNow('2026-11-06 12:00');
    const next = await phone.open(homeStack);
    const tomorrow = new Home(next);
    await tomorrow.ready();
    expect(plain(tomorrow.title())).toBe(`Starts at ${place(595)}`);
    const s2 = await tomorrow.startSession();
    expect(s2.pages()).toEqual([595, 594, 593, 592]);
    await s2.back();
    await next.close();
  });

  it('[CARRY-5] saving an edit to a later day keeps today as it was', async () => {
    const { app } = await scenarioPhone('custom-reverse');
    const home = new Home(app);
    await home.ready();
    await saveEditedPlan(app, (shown) => {
      expect(shown[0]).toEqual([598, 597, 596, 595]);
      shown[2] = [592, 591, 590];
      return shown;
    });
    await app.until(() => startsAt(598).test(plain(home.title()) ?? ''), 'Home to show today');
    const session = await home.startSession();
    expect(session.pages()).toEqual([598, 597, 596, 595]);
    await session.back();
    await app.close();
  });
});

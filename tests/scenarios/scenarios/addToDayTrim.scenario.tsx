// The day's + as Majd trimmed it (Nov 7 2026, "yes trim it"; ACT-5, ACT-15, ACT-17): today and
// yesterday offer Revised elsewhere, Memorized and Note (no Read, no "From your session"); an older
// day only a note; pages logged as revised elsewhere count on Home and for the streak, as the catch-up
// rule counts a day restored in its grace window (#357).

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { ActivityDayView, Home, homeStack } from '../harness/screens';
import { OpenApp, Phone } from '../harness/phone';
import { AddToDay, goBack } from '../harness/addToDay';

// The plan starts on Monday Nov 2 2026, 5 pages a day from 1–20 memorized: Mon 1–5, Tue 6–10, Wed 11–15.
const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';

async function account(): Promise<Phone> {
  setZone(ZONES.london);
  setNow('2026-11-02 08:00');
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  return phone;
}

async function openAt(phone: Phone, at: string): Promise<{ app: OpenApp; home: Home }> {
  setNow(at);
  const app = await phone.open(homeStack);
  const home = new Home(app);
  await home.ready();
  return { app, home };
}

describe('the trimmed + (ACT-5, ACT-17)', () => {
  it('[ACT-5] today’s + lists Revised elsewhere, Memorized and Note; no Read, no “From your session”', async () => {
    const { app } = await openAt(await account(), `${TUESDAY} 21:00`);
    await new ActivityDayView(app).open(TUESDAY);
    await new AddToDay(app).open();
    expect(app.screen.getByText('Add to today')).toBeTruthy();
    for (const row of ['revised', 'memorized', 'note']) expect(app.screen.queryByTestId(`sheet-action-${row}`)).not.toBeNull();
    expect(app.screen.queryByTestId('sheet-action-read')).toBeNull();
    expect(app.screen.queryByTestId('add-from-session')).toBeNull();
    await app.close();
  });

  it('[ACT-17] a day before yesterday: the + opens a note at once, and the note shows on that day', async () => {
    const { app } = await openAt(await account(), '2026-11-04 21:00');
    await new ActivityDayView(app).open(MONDAY);
    const add = new AddToDay(app);
    await add.press('day-add');
    await app.until(() => app.screen.queryByTestId('add-note-sheet') != null, 'the Note sheet');
    expect(app.screen.queryByTestId('activity-add-menu')).toBeNull();
    await add.type('add-note-text', 'Looked back at Monday');
    await add.add('note');
    await app.until(() => app.screen.queryByTestId('activity-block-notes') != null, 'the Notes block', 10_000);
    await app.close();
  });
});

describe('pages revised elsewhere count on Home and for the streak (ACT-15)', () => {
  it('[ACT-15] [ACT-17] yesterday missed, its pages logged as revised elsewhere: a 1-day streak, and Home no longer offers them', async () => {
    const { app, home } = await openAt(await account(), `${TUESDAY} 21:00`);
    await home.untilStreak(0);
    expect(home.catchUp()).toMatch(/^Missed yesterday/);

    await new ActivityDayView(app).open(MONDAY);
    const add = new AddToDay(app);
    await add.open();
    expect(app.screen.getByText('Add to yesterday')).toBeTruthy();
    await add.choose('revised');
    await app.idle(400);
    expect(add.offered()).toEqual([1, 2, 3, 4, 5]);
    await add.add('revised');
    await app.untilSynced();
    await goBack(app);

    // Monday's pages credited to it within its grace window: done on time, and nothing left over.
    await home.untilStreak(1);
    await app.until(() => home.catchUp() == null, 'the catch-up offer to go');
    await app.close();
  });

  it('[ACT-15] today’s session revised 6 and 7; 8–10 logged as revised elsewhere: Home says today is done', async () => {
    const { app, home } = await openAt(await account(), `${TUESDAY} 21:00`);
    const session = await home.startSession();
    await session.check();
    await session.swipe();
    await session.check();
    await session.back();
    await app.untilSynced();
    expect(home.title()).not.toMatch(/Done/);

    await new ActivityDayView(app).open(TUESDAY);
    const add = new AddToDay(app);
    await add.open();
    await add.choose('revised');
    await app.idle(400);
    expect(add.offered()).toEqual([8, 9, 10]);
    await add.add('revised');
    await app.untilSynced();
    await goBack(app);
    await app.until(() => /Done/.test(home.title() ?? ''), 'Home to say today is done');
    await app.close();
  });

  it('[ACT-15] offline: today’s pages logged as revised elsewhere make Home say done at once', async () => {
    const phone = await account();
    const { app, home } = await openAt(phone, `${TUESDAY} 21:00`);
    await home.untilStreak(0);
    await new ActivityDayView(app).open(TUESDAY);
    await phone.goOffline();
    await new AddToDay(app).revisedElsewhere();
    await goBack(app);
    await app.until(() => /Done/.test(home.title() ?? ''), 'Home to say today is done, offline');
    await phone.goOnline();
    await app.untilSynced();
    await app.close();
  });
});

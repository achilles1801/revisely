// Home, the widget and the reminders agree about a day (BEHAVIOUR.md USER-2). Found by the user-matrix sweep
// (tests/scenarios/USER-MATRIX.md, Nov 27 2026): the reminders counted a day done only by the pages its own sessions
// revised, and the widget ignored pages logged by hand. A day revised ahead the evening before, or logged by hand in
// Activity, read "Done" on Home while "Good morning, today is …" was still coming, and the widget showed it not done;
// and with ayahs of a page memorized (MEM-4), Activity's Revised elsewhere offered other pages for today than Home's.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { allowNotifications, pendingNotifications, type Scheduled } from '../harness/notifications';
import { ActivityDayView, Home, Review, homeStack } from '../harness/screens';
import { AddToDay } from '../harness/addToDay';
import { setServerDoc } from '../harness/serverDocs';
import { Phone, type OpenApp } from '../harness/phone';

// 5 pages a day of pages 1–20 from Monday Nov 2 2026: Monday 1–5, Tuesday 6–10, Wednesday 11–15.
const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';
const WEDNESDAY = '2026-11-04';
const PREFIX = 'revision-reminder-';

/** The revision reminders still to come for `day`, by kind ('morning', 'midday', 'evening', 'congrat', 'away'). */
const remindersFor = (day: string): string[] =>
  pendingNotifications()
    .filter((n: Scheduled) => n.identifier.startsWith(`${PREFIX}${day}-`))
    .map((n) => n.identifier.slice(`${PREFIX}${day}-`.length));

async function account(): Promise<Phone> {
  setZone(ZONES.london);
  setNow(`${MONDAY} 08:00`);
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5, notificationsEnabled: true } });
  await app.untilSynced();
  await app.close();
  return phone;
}

/** The app with the reminders' sync mounted, as App.tsx mounts it; waits until `pred` holds after the plan settles. */
async function openReminders(phone: Phone, pred: () => boolean, what: string): Promise<void> {
  const app = await phone.open((mods) => {
    const { RevisionRemindersSync } = mods.require<{ RevisionRemindersSync: () => null }>('src/components/RevisionRemindersSync');
    return mods.React.createElement(RevisionRemindersSync);
  });
  await app.untilLoaded();
  await app.until(pred, what);
  // The account's history arrives after the account: the plan is made again, the same.
  await app.idle(900);
  await app.until(pred, `${what}, after the history arrived`);
  await app.close();
}

/** The widget's days, built as WidgetSync builds them (the Activity items with the phone's sessions over them). */
async function widgetDays(app: OpenApp, day: string) {
  const { buildWidgetSnapshot } = app.mods.require<typeof import('../../../src/lib/widgets/snapshot')>('src/lib/widgets/snapshot');
  const { getQuranData } = app.mods.require<typeof import('../../../src/lib/quranData')>('src/lib/quranData');
  const { loadActivityHistory, withPhoneSessions } = app.mods.require<typeof import('../../../src/lib/activityHistory')>('src/lib/activityHistory');
  const items = await app.act(() => loadActivityHistory(day));
  const a = app.app;
  return buildWidgetSnapshot({
    signedIn: true,
    user: a.user,
    onboardingComplete: a.onboardingComplete,
    pages: a.pages,
    logs: a.logs,
    quranData: getQuranData(),
    accent: 'indigo',
    now: new Date(),
    history: withPhoneSessions(items, a.logs, Date.now()),
  }).days;
}

describe('Home, the widget and the reminders agree about a day (USER-2)', () => {
  it('[USER-2] [AHEAD-2] Tuesday revised ahead on Monday evening: Home says Done, the widget too, and no reminder asks for Tuesday', async () => {
    allowNotifications();
    const phone = await account();
    // Monday evening: Monday's pages, then Tuesday's ahead, as the session saves them (Keep going, AHEAD-1).
    setNow(`${MONDAY} 21:00`);
    const monday = await phone.open(homeStack);
    await monday.act(() =>
      monday.app.addLog({
        date: MONDAY,
        assignedPages: pagesRange(1, 5),
        pagesRevised: pagesRange(1, 5),
        pagesSkipped: [],
        weaknessUpdates: [],
        durationMinutes: 12,
        ahead: { [TUESDAY]: pagesRange(6, 10) },
      }),
    );
    await monday.untilSynced();
    // Monday is done (its congratulation alone), and Tuesday was revised ahead: none of Tuesday's reminders asks for it.
    await monday.close();
    await openReminders(phone, () => remindersFor(WEDNESDAY).length === 0 && remindersFor(MONDAY).join() === 'congrat', 'Monday’s congratulation');
    expect(remindersFor(TUESDAY)).toEqual([]);

    // Tuesday morning.
    setNow(`${TUESDAY} 07:00`);
    const app = await phone.open(homeStack);
    const home = new Home(app);
    await home.ready();
    await app.until(() => (home.title() ?? '').startsWith('Done · 5 pages'), 'Home to say Tuesday is done');
    const days = await widgetDays(app, TUESDAY);
    expect(days[0]).toMatchObject({ day: TUESDAY, completed: true, total: 5, done: 5 });
    await app.close();
    // Today's reminders: the quiet congratulation alone. Wednesday's three as usual.
    await openReminders(phone, () => remindersFor(WEDNESDAY).length === 3, 'Wednesday’s reminders');
    expect(remindersFor(TUESDAY)).toEqual(['congrat']);
  });

  it('[USER-2] [ACT-15] Tuesday’s pages logged by hand in Activity: Home says Done, the widget too, and no reminder asks for Tuesday', async () => {
    allowNotifications();
    const phone = await account();
    setNow(`${TUESDAY} 07:00`);
    const app = await phone.open(homeStack);
    const home = new Home(app);
    await home.ready();
    await app.until(() => (home.title() ?? '').startsWith('Starts at'), 'Tuesday’s pages');
    // Activity → Tuesday → + → Revised elsewhere: pages 6–10, as the day's + queues them (lib/manualRevision).
    const { queueChange } = app.mods.require<typeof import('../../../src/lib/offline/queue')>('src/lib/offline/queue');
    const { manualRevisionItem } = app.mods.require<typeof import('../../../src/lib/manualRevision')>('src/lib/manualRevision');
    await app.act(async () => {
      await queueChange({ kind: 'revision.add', item: manualRevisionItem({ uid: app.uid, day: TUESDAY, now: Date.now(), pages: pagesRange(6, 10), minutes: null }) });
    });
    await app.untilSynced();
    await app.close();

    const again = await phone.open(homeStack);
    const back = new Home(again);
    await back.ready();
    await again.until(() => (back.title() ?? '').startsWith('Done · 5 pages'), 'Home to say Tuesday is done');
    const days = await widgetDays(again, TUESDAY);
    expect(days[0]).toMatchObject({ day: TUESDAY, completed: true, total: 5, done: 5 });
    await again.close();
    await openReminders(phone, () => remindersFor(WEDNESDAY).length === 3, 'Wednesday’s reminders');
    expect(remindersFor(TUESDAY)).toEqual(['congrat']);
  });

  it('[USER-2] [MEM-4] ayahs of Al-Fatihah and whole pages memorized: Activity’s Revised elsewhere offers today’s pages as Home has them', async () => {
    setZone(ZONES.london);
    setNow('2026-11-03 09:00');
    const phone = new Phone();
    const setup = await newAccount(phone, { memorized: pagesRange(2, 20), user: { dailyPageCapacity: 5 } });
    const uid = setup.uid;
    await setup.close();
    // Al-Fatihah's first three ayahs (page 1, in part), as a phone saving ayahs writes them (MEM-1).
    await setServerDoc(`users/${uid}/pages/1`, { status: 'learning', verses: [1001, 1002, 1003] });

    // Pages 1–20 revised in turn, 5 a day from today: today is pages 1–5, Al-Fatihah first.
    const app = await phone.open(homeStack);
    const home = new Home(app);
    await home.ready();
    await app.until(() => (home.title() ?? '').replace(/\u2011/g, '-').startsWith('Starts at Al-Fatihah'), 'today to start at Al-Fatihah');
    // Activity → today → + → Revised elsewhere: the same five pages, Al-Fatihah's among them. It offered 2–6, a plan
    // without the partly memorized page (USER-2).
    await new ActivityDayView(app).open('2026-11-03');
    const add = new AddToDay(app);
    await add.open();
    await add.choose('revised');
    await app.idle(400);
    expect(add.offered()).toEqual(pagesRange(1, 5));
    await app.close();
  });

  // The session and its review read only the phone's sessions, not the pages logged by hand that Home counts (ACT-15):
  // Continue opened on the first page, nothing checked, and Review session opened empty (the user-matrix sweep, Nov 27
  // 2026). They count them now; whether one can be unchecked there is lib/handLogged's HAND_LOGGED_UNCHECK.
  async function loggedByHand(pages: number[]): Promise<{ app: OpenApp; home: Home }> {
    const phone = await account();
    setNow(`${TUESDAY} 07:00`);
    const setup = await phone.open(homeStack);
    const { queueChange } = setup.mods.require<typeof import('../../../src/lib/offline/queue')>('src/lib/offline/queue');
    const { manualRevisionItem } = setup.mods.require<typeof import('../../../src/lib/manualRevision')>('src/lib/manualRevision');
    await setup.act(async () => {
      await queueChange({ kind: 'revision.add', item: manualRevisionItem({ uid: setup.uid, day: TUESDAY, now: Date.now(), pages, minutes: null }) });
    });
    await setup.untilSynced();
    await setup.close();
    const app = await phone.open(homeStack);
    const home = new Home(app);
    await home.ready();
    return { app, home };
  }

  it('[SESS-9] [USER-2] 3 of Tuesday’s 5 pages logged by hand: Continue opens where Home says, the 4th page, with them checked and kept checked', async () => {
    const { app, home } = await loggedByHand([6, 7, 8]);
    await app.until(() => /3 of 5/.test(home.today()), 'Home to count the pages logged by hand');
    const session = await home.startSession();
    try {
      // Home says "Continue at …" page 9: the session opens there (it opened on page 6, nothing checked).
      expect(session.current()).toBe(9);
      await session.goTo(6);
      expect(await session.isChecked()).toBe(true);
      // Logged by hand, it stays checked here (HAND_LOGGED_UNCHECK 'locked'): it comes off in Activity.
      await session.uncheck();
      expect(await session.isChecked()).toBe(true);
      await session.back();
      await app.untilSynced();
      // The session took none of them into its own record (ACT-14).
      expect(app.app.logs.filter((l) => l.date === TUESDAY).flatMap((l) => l.pagesRevised)).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('[SESS-4] [USER-2] all of Tuesday logged by hand: Review session holds the 5 pages Home counts as Done, all checked', async () => {
    const { app, home } = await loggedByHand(pagesRange(6, 10));
    await app.until(() => (home.title() ?? '').startsWith('Done · 5 pages'), 'Home to say Tuesday is done');
    try {
      // It opened with no pages.
      expect(await home.openReview()).toEqual(pagesRange(6, 10));
      const review = new Review(app);
      expect(Object.values(await review.checks()).every(Boolean)).toBe(true);
      // Logged by hand, a page stays checked here (HAND_LOGGED_UNCHECK 'locked').
      const { fireEvent } = app.mods.rtl;
      await app.act(async () => {
        fireEvent.press(app.screen.getByLabelText('Unmark current page'));
      });
      await app.idle(50);
      expect(review.isChecked()).toBe(true);
    } finally {
      await app.close();
    }
  });
});

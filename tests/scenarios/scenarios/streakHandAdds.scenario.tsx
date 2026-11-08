// Revised pages added by hand (Activity's +) count for the streak like any credit (SESS-6, ACT-15):
// a day is done when every page scheduled for it is credited to it. On Nov 7 2026 a hand-added
// item stood in for the day's own item, and its empty assignment read as "nothing scheduled", which
// never counts; and Home read the items again only when the number of sessions changed.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { ActivityDayView, Home, homeStack } from '../harness/screens';
import { OpenApp, Phone } from '../harness/phone';

// The plan starts on Monday Nov 2 2026, 5 pages a day from 1–20 memorized: Mon 1–5, Tue 6–10.
const TODAY = '2026-11-03';
const MONDAY = '2026-11-02';

async function account(): Promise<Phone> {
  setZone(ZONES.london);
  setNow('2026-11-02 08:00');
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  // An App Store account, not a tester: this is everyone's since the November 2026 release.
  return phone;
}

/** Pages added to `day` by hand, as the day's + → Revised queues them (lib/manualRevision). */
async function addByHand(app: OpenApp, day: string, pages: number[]): Promise<void> {
  const { queueChange } = app.mods.require<typeof import('../../../src/lib/offline/queue')>('src/lib/offline/queue');
  const { manualRevisionItem } = app.mods.require<typeof import('../../../src/lib/manualRevision')>('src/lib/manualRevision');
  await app.act(async () => {
    await queueChange({ kind: 'revision.add', item: manualRevisionItem({ uid: app.uid, day, now: Date.now(), pages, minutes: null }) });
  });
}

async function back(app: OpenApp): Promise<void> {
  const nav = app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
  await app.act(async () => {
    nav.current.goBack();
  });
  await app.idle(100);
}

describe('pages added by hand count for the streak (ACT-15)', () => {
  it('[ACT-15] [SESS-6] Monday missed, its pages added by hand on Tuesday evening: back on Home, a 1-day streak', async () => {
    const phone = await account();
    setNow(`${TODAY} 21:00`);
    const app = await phone.open(homeStack);
    const home = new Home(app);
    await home.ready();
    await home.untilStreak(0);

    // Activity → Monday → + → Revised 1–5 (Monday's pages), then back to Home.
    await new ActivityDayView(app).open(MONDAY);
    await addByHand(app, MONDAY, pagesRange(1, 5));
    await app.untilSynced();
    await back(app);
    // Credited within Monday's grace window (to the end of Tuesday): Monday counts, and the streak
    // is alive through yesterday.
    await home.untilStreak(1);
    await app.close();
  });

  it('[ACT-15] Monday done in its session; a page added to it by hand later leaves it done', async () => {
    const phone = await account();
    setNow(`${MONDAY} 20:00`);
    let app = await phone.open(homeStack);
    let home = new Home(app);
    await home.ready();
    const session = await home.startSession();
    await session.swipeThrough(session.pages().length);
    await app.untilSynced();
    await app.close();

    setNow(`${TODAY} 21:00`);
    app = await phone.open(homeStack);
    home = new Home(app);
    await home.ready();
    await home.untilStreak(1);
    await new ActivityDayView(app).open(MONDAY);
    await addByHand(app, MONDAY, [3]);
    await app.untilSynced();
    await back(app);
    await app.idle(1000);
    await home.untilStreak(1);
    await app.close();
  });
});

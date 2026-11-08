// Activity's "Add to <day>" (ACT-13): what the day's + adds shows on the day the moment its sheet
// closes, without leaving the screen, offline too. On Nov 7 2026 every add saved but the day showed
// nothing until it was opened again (Majd: "i don't think most of those things even work"). These run
// the real Day screen, its sheets and the outbox against the emulators.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { ActivityDayView, Home, homeStack } from '../harness/screens';
import { OpenApp, Phone } from '../harness/phone';
import { AddToDay, goBack } from '../harness/addToDay';

// The plan starts on Monday Nov 2 2026, 5 pages a day from 1–20 memorized: Mon 1–5, Tue 6–10.
const TODAY = '2026-11-03';

async function account(): Promise<Phone> {
  setZone(ZONES.london);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  // Activity's blocks and the + are for preview testers (activityBlocksEnabled).
  await markPreviewTester(uid);
  return phone;
}

/** Today's Activity day, opened from Home, with nothing on it yet. */
async function openToday(phone: Phone): Promise<OpenApp> {
  setNow(`${TODAY} 21:00`);
  const app = await phone.open(homeStack);
  await new Home(app).ready();
  await new ActivityDayView(app).open(TODAY);
  await app.idle(300);
  return app;
}

const shown = (app: OpenApp, testID: string) => app.screen.queryByTestId(testID) != null;

describe('Add to the day (ACT-13)', () => {
  it('[ACT-13] pages added as Revised show in the day’s Revised block as soon as the sheet closes', async () => {
    const app = await openToday(await account());
    expect(shown(app, 'activity-block-revised')).toBe(false);
    await new AddToDay(app).revisedElsewhere([6, 7]);
    await app.until(() => shown(app, 'activity-block-revised'), 'the Revised block', 10_000);
    await app.close();
  });

  it('[ACT-13] pages added as Memorized show in the day’s Memorized block as soon as the sheet closes', async () => {
    const app = await openToday(await account());
    expect(shown(app, 'activity-block-memorized')).toBe(false);
    await new AddToDay(app).memorized(21, 22);
    await app.until(() => shown(app, 'activity-block-memorized'), 'the Memorized block', 10_000);
    await app.close();
  });

  it('[ACT-13] a note added from the + shows in the day’s Notes block as soon as the sheet closes', async () => {
    const app = await openToday(await account());
    expect(shown(app, 'activity-block-notes')).toBe(false);
    await new AddToDay(app).note('Slipped at the turn of the page');
    await app.until(() => shown(app, 'activity-block-notes'), 'the Notes block', 10_000);
    await app.close();
  });

  it('[ACT-13] [SYNC-1] offline, each add shows at once; back online, the server has them and the day still shows them', async () => {
    const phone = await account();
    const app = await openToday(phone);
    await phone.goOffline();
    const add = new AddToDay(app);
    await add.revisedElsewhere([6, 7]);
    await app.until(() => shown(app, 'activity-block-revised'), 'the Revised block, offline', 10_000);
    await add.memorized(21, 22);
    await app.until(() => shown(app, 'activity-block-memorized'), 'the Memorized block, offline', 10_000);
    await add.note('Written offline');
    await app.until(() => shown(app, 'activity-block-notes'), 'the Notes block, offline', 10_000);

    await phone.goOnline();
    await app.untilSynced();
    // Opened again, from what the server holds now.
    await goBack(app);
    await new ActivityDayView(app).open(TODAY);
    await app.until(
      () => shown(app, 'activity-block-revised') && shown(app, 'activity-block-memorized') && shown(app, 'activity-block-notes'),
      'the three blocks from the server',
      15_000,
    );
    await app.close();
  });
});

// Memorization end to end (ACT-10, Majd's report on 01a1ad23): marks in the manager reach
// Activity; the Memorized composer marks its range; deleting a Memorized entry un-marks it.
// Each flow has its own account: a day's memorization item is one per day.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { ActivityDayView, DailyLog, Home, homeStack, Manager } from '../harness/screens';
import { Phone } from '../harness/phone';
import type { UserPage } from '../../../src/types';

const TODAY = '2026-11-03';

async function account(): Promise<Phone> {
  setZone(ZONES.london);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  // The owner marks the account a tester while the app is closed (the rules keep clients from it).
  markPreviewTester(uid);
  return phone;
}

const statusOf = (pages: UserPage[], range: number[]) =>
  range.every((n) => pages.find((p) => p.pageNumber === n)?.status === 'memorized');

describe('memorization in the manager, the composer and Activity (ACT-10)', () => {
  it('[ACT-10] a juz marked in the manager with Today shows as a Memorized entry in Activity', async () => {
    const phone = await account();
    setNow(`${TODAY} 21:00`);
    const app = await phone.open(homeStack);
    await new Home(app).ready();
    const manager = new Manager(app);
    await manager.open();
    await manager.markJuzToday(2); // Juz 2 is pages 22–41; 20 of them are new.
    await app.until(() => statusOf(app.app.pages, pagesRange(22, 41)), 'juz 2 to be memorized');
    await app.untilSynced();
    const day = new ActivityDayView(app);
    await day.open(TODAY);
    await day.waitMemorized();
    expect(day.memorizedBlockShown()).toBe(true);
    await app.close();
  });

  it('[ACT-10] a page range typed in the Memorized composer marks those pages, and Activity shows them', async () => {
    const phone = await account();
    setNow(`${TODAY} 21:00`);
    const app = await phone.open(homeStack);
    await new Home(app).ready();
    const log = new DailyLog(app);
    await log.open();
    const { fireEvent } = app.mods.rtl;
    fireEvent.changeText(app.screen.getByTestId('memorize-from'), '21');
    fireEvent.changeText(app.screen.getByTestId('memorize-to'), '25');
    fireEvent.press(app.screen.getByTestId('journal-send'));
    await app.until(() => statusOf(app.app.pages, pagesRange(21, 25)), 'pages 21–25 to be memorized');
    await app.untilSynced();
    const day = new ActivityDayView(app);
    await day.open(TODAY);
    await day.waitMemorized();
    expect(day.memorizedBlockShown()).toBe(true);
    await app.close();
  });

  it('[ACT-10] deleting a Memorized entry in Activity un-marks its pages', async () => {
    const phone = await account();
    setNow(`${TODAY} 21:00`);
    const app = await phone.open(homeStack);
    await new Home(app).ready();
    const log = new DailyLog(app);
    await log.open();
    const { fireEvent } = app.mods.rtl;
    fireEvent.changeText(app.screen.getByTestId('memorize-from'), '21');
    fireEvent.changeText(app.screen.getByTestId('memorize-to'), '25');
    fireEvent.press(app.screen.getByTestId('journal-send'));
    await app.until(() => statusOf(app.app.pages, pagesRange(21, 25)), 'pages 21–25 to be memorized');
    await app.untilSynced();
    const day = new ActivityDayView(app);
    await day.open(TODAY);
    await day.deleteMemorized();
    await app.until(() => !statusOf(app.app.pages, pagesRange(21, 25)), 'pages 21–25 to be un-marked');
    await app.untilSynced();
    expect(app.app.pages.filter((p) => p.pageNumber >= 21 && p.pageNumber <= 25).every((p) => p.status !== 'memorized')).toBe(true);
    await app.close();
  });
});

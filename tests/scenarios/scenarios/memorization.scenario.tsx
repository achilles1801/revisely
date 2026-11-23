// Memorization end to end (ACT-10, Majd's report on 01a1ad23): marks in the manager reach
// Activity; the Memorized composer marks its range; deleting a Memorized entry un-marks it.
// Each flow has its own account: a day's memorization item is one per day.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { ActivityDayView, Home, homeStack, Manager } from '../harness/screens';
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
  // An App Store account, not a tester: this is everyone's since the November 2026 release.
  return phone;
}

const statusOf = (pages: UserPage[], range: number[]) =>
  range.every((n) => pages.find((p) => p.pageNumber === n)?.status === 'memorized');

describe('memorization in the manager and Activity (ACT-10)', () => {
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

  it('[ACT-10] deleting a Memorized entry in Activity un-marks its pages', async () => {
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
    await day.deleteMemorized();
    await app.until(() => !statusOf(app.app.pages, pagesRange(22, 41)), 'juz 2 to be un-marked');
    await app.untilSynced();
    expect(app.app.pages.filter((p) => p.pageNumber >= 22 && p.pageNumber <= 41).every((p) => p.status !== 'memorized')).toBe(true);
    await app.close();
  });
});

// What the day's + adds stays on the day once the server has it, even when a read of the day comes
// back without it (ACT-13). On the Android emulator a Memorized add showed at once and then vanished
// as it reached the server: a read from before the server had it landed after (Nov 7 2026). Here the
// day's reads are held at the answer from before the add, as that late read was.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { ActivityDayView, flatText, Home, homeStack } from '../harness/screens';
import { OpenApp, Phone } from '../harness/phone';
import { AddToDay } from '../harness/addToDay';

const TODAY = '2026-11-03';

type Service = { getActivityItemsForDay: (day: string, uid?: string) => Promise<unknown> };

async function openToday(): Promise<OpenApp> {
  setZone(ZONES.london);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const first = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = first.uid;
  await first.untilSynced();
  await first.close();
  // An App Store account, not a tester: this is everyone's since the November 2026 release.
  setNow(`${TODAY} 21:00`);
  const app = await phone.open(homeStack);
  await new Home(app).ready();
  await new ActivityDayView(app).open(TODAY);
  await app.idle(300);
  return app;
}

/** From now on the day's reads give what the server had before: a late answer, every time. */
async function holdReadsAtNow(app: OpenApp): Promise<() => void> {
  const service = app.mods.require<Service>('src/services/firestoreService');
  const real = service.getActivityItemsForDay;
  const before = await real(TODAY);
  service.getActivityItemsForDay = async () => before;
  return () => {
    service.getActivityItemsForDay = real;
  };
}

it('[ACT-13] a Memorized add the server has taken stays on the day when a read comes back without it', async () => {
  const app = await openToday();
  const release = await holdReadsAtNow(app);
  await new AddToDay(app).memorized(21, 22);
  await app.until(() => app.screen.queryByTestId('activity-block-memorized') != null, 'the Memorized block');
  await app.untilSynced();
  await app.idle(500);
  const block = app.screen.queryByTestId('activity-block-memorized');
  expect(block && flatText(block)).toMatch(/2 pages/);
  release();
  await app.close();
});

it('[ACT-13] a Revised add the server has taken stays on the day when a read comes back without it', async () => {
  const app = await openToday();
  const release = await holdReadsAtNow(app);
  const add = new AddToDay(app);
  await add.revisedElsewhere([6, 7]);
  await app.until(() => app.screen.queryByTestId('activity-block-revised') != null, 'the Revised block');
  await app.untilSynced();
  await app.idle(500);
  expect(app.screen.queryByTestId('activity-block-revised')).not.toBeNull();
  release();
  await app.close();
});

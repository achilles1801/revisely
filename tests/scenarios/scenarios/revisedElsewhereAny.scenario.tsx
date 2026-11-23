// Revised elsewhere, independent of the schedule (ACT-5, ACT-15; Majd, Nov 23 2026: "yes revised elsewhere should still
// count as revised days but i think it should be independent of the schedule and what a user needs to revise that day").
// Any memorized pages can be logged. Extra ones never move the schedule or "N of 20"; a scheduled one ticks off.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { ActivityDayView, Home, homeStack } from '../harness/screens';
import { OpenApp, Phone } from '../harness/phone';
import { AddToDay, goBack } from '../harness/addToDay';

// 5 pages a day from 1–20 memorized: Mon 1–5, Tue 6–10.
const TUESDAY = '2026-11-03';

async function open(): Promise<{ app: OpenApp; home: Home; add: AddToDay }> {
  setZone(ZONES.london);
  setNow('2026-11-02 08:00');
  const phone = new Phone();
  const first = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  await first.untilSynced();
  await first.close();
  setNow(`${TUESDAY} 21:00`);
  const app = await phone.open(homeStack);
  const home = new Home(app);
  await home.ready();
  await new ActivityDayView(app).open(TUESDAY);
  return { app, home, add: new AddToDay(app) };
}

/** The + → Revised elsewhere, today's pages unticked but `keep`, and From–To as other pages, then Add. */
async function log(app: OpenApp, add: AddToDay, from: number, to: number, keep: number[] = []): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  await add.open();
  await add.choose('revised');
  await app.idle(400);
  for (const p of add.offered()) {
    if (keep.includes(p)) continue;
    await app.act(async () => {
      fireEvent.press(app.screen.getByTestId(`add-revised-page-${p}`));
    });
  }
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('add-revised-add-other'));
  });
  const { PageRangeFields } = app.mods.require<typeof import('../../../src/components/activity/PageRangeFields')>('src/components/activity/PageRangeFields');
  await app.act(async () => {
    app.screen.UNSAFE_getByType(PageRangeFields).props.onFrom(from);
  });
  await app.act(async () => {
    app.screen.UNSAFE_getByType(PageRangeFields).props.onTo(to);
  });
  await add.add('revised');
  await app.untilSynced();
  await app.idle(400);
}

async function loggedPages(app: OpenApp): Promise<number[]> {
  const svc = app.mods.require<typeof import('../../../src/services/firestoreService')>('src/services/firestoreService');
  const items = await app.act(() => svc.getActivityItemsForDay(TUESDAY));
  return items.revisions.filter((r) => r.countsFor === TUESDAY).flatMap((r) => r.pages).sort((a, b) => a - b);
}

describe('Revised elsewhere, independent of the schedule', () => {
  it('[ACT-5] [ACT-15] any memorized pages can be logged, and pages off the schedule never move it or count toward it', async () => {
    const { app, home, add } = await open();
    await goBack(app);
    const before = { today: home.today(), title: home.title(), detail: home.detail() };
    await new ActivityDayView(app).open(TUESDAY);

    await log(app, add, 15, 16);
    expect(await loggedPages(app)).toEqual([15, 16]);

    // The day still asks for all its own pages.
    await add.open();
    await add.choose('revised');
    await app.idle(400);
    expect(add.offered()).toEqual([6, 7, 8, 9, 10]);
    await app.close();
    expect(before.title).not.toMatch(/Done/);

    // Home, from a fresh launch: the same day, the same pages, nothing counted toward them.
    const again = await app.phone.open(homeStack);
    const homeAgain = new Home(again);
    await homeAgain.ready();
    await again.idle(400);
    expect({ today: homeAgain.today(), title: homeAgain.title(), detail: homeAgain.detail() }).toEqual(before);
    await again.close();
  });

  it('[ACT-15] a page on the day’s schedule logged through other pages ticks off and is not asked for again', async () => {
    const { app, add } = await open();
    await log(app, add, 6, 7);
    expect(await loggedPages(app)).toEqual([6, 7]);
    await add.open();
    await add.choose('revised');
    await app.idle(400);
    expect(add.offered()).toEqual([8, 9, 10]);
    await app.close();
  });
});

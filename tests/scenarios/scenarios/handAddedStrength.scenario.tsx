// The strength chosen for pages added by hand (Activity's + → Revised → "How did it go?") stays, and
// those pages count as revised that day (ACT-16). On Nov 7 2026 the next launch's self-heal re-derived
// every page from the sessions alone and reset them: Weak became Strong, "last revised" never moved.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { ActivityDayView, Home, homeStack } from '../harness/screens';
import { OpenApp, Phone } from '../harness/phone';
import { getServerDoc } from '../harness/serverDocs';

// The plan starts on Monday Nov 2 2026, 5 pages a day from 1–20 memorized: Mon 1–5, Tue 6–10.
const TODAY = '2026-11-03';

async function press(app: OpenApp, testID: string): Promise<void> {
  await app.until(() => app.screen.queryByTestId(testID) != null, testID);
  await app.act(async () => {
    app.mods.rtl.fireEvent.press(app.screen.getByTestId(testID));
  });
}

async function type(app: OpenApp, testID: string, text: string): Promise<void> {
  await app.act(async () => {
    app.mods.rtl.fireEvent.changeText(app.screen.getByTestId(testID), text);
  });
}

it('[ACT-16] pages 9–10 added by hand as Weak are still weak after a cold start, and revised that day', async () => {
  setZone(ZONES.london);
  setNow('2026-11-02 08:00');
  const phone = new Phone();
  const first = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = first.uid;
  await first.untilSynced();
  await first.close();
  await markPreviewTester(uid);

  // Monday's session, so the next launch has sessions to re-derive the pages from.
  setNow('2026-11-02 20:00');
  let app = await phone.open(homeStack);
  let home = new Home(app);
  await home.ready();
  const session = await home.startSession();
  await session.swipeThrough(session.pages().length);
  await app.untilSynced();
  await app.close();

  // Tuesday: Activity → today → + → Revised 9–10, Weak → Add.
  setNow(`${TODAY} 21:00`);
  app = await phone.open(homeStack);
  home = new Home(app);
  await home.ready();
  await new ActivityDayView(app).open(TODAY);
  await press(app, 'day-add');
  await press(app, 'sheet-action-revised');
  await app.until(() => app.screen.queryByTestId('add-revised-sheet') != null, 'the Revised sheet');
  await type(app, 'add-revised-from', '9');
  await type(app, 'add-revised-to', '10');
  await press(app, 'add-revised-strength-weak');
  await press(app, 'add-revised-add');
  await app.until(() => app.screen.queryByTestId('add-revised-sheet') == null, 'the sheet to close');
  await app.untilSynced();
  expect((await getServerDoc(`users/${uid}/pages/9`))?.weaknessRating).toBe(2);
  await app.close();

  // A cold start: the self-heal runs once the server's pages and sessions are in.
  setNow(`${TODAY} 21:30`);
  app = await phone.open(homeStack);
  await new Home(app).ready();
  // The self-heal reads the server first, then saves what changed: wait for page 9's revision day.
  let page9 = await getServerDoc(`users/${uid}/pages/9`);
  for (let i = 0; i < 60 && !String(page9?.lastRevisedAt).startsWith('2026-11-03'); i++) {
    await app.idle(250);
    page9 = await getServerDoc(`users/${uid}/pages/9`);
  }
  await app.untilSynced();
  page9 = await getServerDoc(`users/${uid}/pages/9`);
  expect(page9?.weaknessRating).toBe(2);
  expect(String(page9?.lastRevisedAt)).toMatch(/^2026-11-03/);
  // Monday's pages keep what their session gave them.
  expect(String((await getServerDoc(`users/${uid}/pages/1`))?.lastRevisedAt)).toMatch(/^2026-11-02/);
  await app.close();
});

// Activity shows a change as soon as the server has it, and pull to refresh reads everything again (ACT-27).
// Majd, Nov 9 2026: "i keep revising ahead and i dont see the percentage or x of y memorized pages … get
// updated at all … i just closed the app and reopened and it updated but shouldnt this update whenever a user
// scrolls down to refresh the page". Overview and Insights read their items when the screen gained focus, and
// never when the outbox sent a change later; their pull to refresh reloaded readings and notes, not the items.

import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { setNow, setZone, ZONES } from '../harness/clock';
import { Home, activityStack, homeStack } from '../harness/screens';
import { setServerDoc } from '../harness/serverDocs';
import { Phone, type OpenApp } from '../harness/phone';

async function tap(app: OpenApp, testID: string): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  await app.until(() => app.screen.queryByTestId(testID) != null, testID);
  const el = app.screen.getByTestId(testID);
  await app.act(async () => {
    fireEvent.press(el);
  });
  await app.idle(50);
}
const figure = (app: OpenApp) => app.screen.queryByTestId('insights-coverage-figure')?.props.accessibilityLabel as string | undefined;

it('[ACT-27] [AHEAD-6] Insights shows a revise-ahead saved while it is open, and pull to refresh reads what the server has', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  // Juz 30, five pages a day: 587–591 on the 3rd, 592–596 on the 4th.
  const first = await newAccount(phone, { memorized: pagesRange(582, 604), user: { dailyPageCapacity: 5 } });
  const uid = first.uid;
  await first.close();
  await markPreviewTester(uid);

  setNow('2026-11-03 09:00');
  const h = await phone.open(homeStack);
  const home = new Home(h);
  await home.ready();
  const session = await home.startSession();
  await session.swipeThrough(5);
  await session.back();
  await h.untilSynced();
  await h.close();

  const app = await phone.open(activityStack);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const nav = app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
  await app.act(async () => {
    nav.current.navigate('Activity');
  });
  await app.until(() => app.screen.queryByTestId('activity-blocks-views') != null, 'Activity');
  await tap(app, 'pill-insights');
  await app.until(() => figure(app) === '22% 5 of 23 memorized pages in 30 days', 'today’s five pages in Coverage');

  // Keep going, saved as the session saves it, while Insights stays on screen (no focus, no remount).
  await app.act(() =>
    app.app.addLog({
      date: '2026-11-03',
      assignedPages: pagesRange(587, 591),
      pagesRevised: pagesRange(592, 596),
      pagesSkipped: [],
      weaknessUpdates: [],
      durationMinutes: 4,
      ahead: { '2026-11-04': pagesRange(592, 596) },
    }),
  );
  await app.untilSynced();
  await app.until(() => figure(app) === '43% 10 of 23 memorized pages in 30 days', 'the five ahead in Coverage, with Insights still open');

  // Something the phone didn't send itself (another phone's revision): only a pull reads it.
  await setServerDoc(`users/${uid}/revisions/2026-11-03-ahead-2026-11-05`, {
    id: '2026-11-03-ahead-2026-11-05',
    uid,
    day: '2026-11-03',
    countsFor: '2026-11-05',
    occurredAt: Date.parse('2026-11-03T16:00:00Z'),
    source: 'session',
    pages: pagesRange(597, 601),
    skipped: [],
    assigned: [],
    minutes: null,
    recordings: [],
  });
  const scroll = app.screen.getByTestId('activity-v2');
  await app.act(async () => {
    await scroll.props.refreshControl.props.onRefresh();
  });
  await app.until(() => figure(app) === '65% 15 of 23 memorized pages in 30 days', 'the pull to read the server’s new item');
  // The spinner has ended, on a ground that lets Home's glow through (as Home's).
  expect(app.screen.getByTestId('activity-v2').props.refreshControl.props.refreshing).toBe(false);
  await app.close();
});

// Pages revised ahead are revised that day (AHEAD-6). Majd, Nov 9 2026, testing the release: "when i
// revise ahead, does that show up in coverage because i don't see it?" Coverage read each revision item by
// the day it is credited to, and skipped a credit for a later day: pages revised ahead with Keep going were
// missing from Coverage's figure and its views until their own day came.

import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { setNow, setZone, ZONES } from '../harness/clock';
import { Home, activityStack, homeStack } from '../harness/screens';
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
const label = (app: OpenApp, testID: string) => app.screen.getByTestId(testID).props.accessibilityLabel as string;

it('[AHEAD-6] [ACT-26] today’s pages and the next day’s revised ahead: Coverage counts both, and the Page view shows them this week', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  // Juz 30 (582–604), five pages a day: 582–586 on the 2nd, 587–591 on the 3rd, 592–596 on the 4th.
  const first = await newAccount(phone, { memorized: pagesRange(582, 604), user: { dailyPageCapacity: 5 } });
  const uid = first.uid;
  await first.close();
  await markPreviewTester(uid);

  setNow('2026-11-03 09:00');
  const h = await phone.open(homeStack);
  const home = new Home(h);
  await home.ready();
  const session = await home.startSession();
  expect(session.pages()).toEqual(pagesRange(587, 591));
  await session.swipeThrough(5);
  // Keep going: tomorrow's five, revised today.
  await session.keepGoing();
  expect(session.pages()).toEqual(pagesRange(592, 596));
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
  await app.until(() => app.screen.queryByTestId('insights-coverage-figure') != null, 'Coverage');
  // Ten pages revised today: the five of today and the five ahead.
  expect(label(app, 'insights-coverage-figure')).toBe('43% 10 of 23 memorized pages in 30 days');
  expect(label(app, 'juz-tile-30')).toBe('Juz 30, 10 of 23 pages revised, the rest not revised yet');
  await tap(app, 'pill-page');
  expect(label(app, 'coverage-page-594')).toMatch(/, page 594, revised this week$/);
  expect(label(app, 'coverage-page-589')).toMatch(/, page 589, revised this week$/);
  expect(label(app, 'coverage-page-597')).toMatch(/, page 597, not revised yet$/);
  // The juz sheet counts today once, for both.
  await tap(app, 'coverage-page-row-30');
  await app.until(() => app.screen.queryByTestId('juz-sheet-headline') != null, 'the juz sheet');
  expect(app.screen.getByTestId('juz-sheet-headline').props.children).toBe('Last revised today');
  await app.close();
});

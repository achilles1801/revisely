// Coverage on a new account (ACT-25). Majd, Nov 8 2026: a new account with only Juz 30 memorized and five
// of its pages revised showed Juz 30 in red ("30+ days") on Coverage, a day after it began: a page never
// revised counted as over 30 days. Now a page never revised counts from when it was memorized (or the
// account's first day): "not revised yet", neutral, for 30 days, and only then 30+ days.

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

/** Activity → Insights, on Coverage: what VoiceOver reads for a juz's tile. */
async function openCoverage(app: OpenApp): Promise<(juz: number) => string> {
  const nav = app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
  // Activity's Insights are for testers while they are built (ACT-3).
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  await app.act(async () => {
    nav.current.navigate('Activity');
  });
  await app.until(() => app.screen.queryByTestId('activity-blocks-views') != null, 'Activity');
  await tap(app, 'pill-insights');
  await app.until(() => app.screen.queryByTestId('juz-tile-30') != null, 'Coverage');
  return (juz) => app.screen.getByTestId(`juz-tile-${juz}`).props.accessibilityLabel as string;
}

it('[ACT-25] [ACT-4] A new account’s juz, five pages revised and the rest never: “not revised yet”, not 30+ days; thirty days on, it is', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const first = await newAccount(phone, { memorized: pagesRange(582, 604), user: { dailyPageCapacity: 5 } });
  const uid = first.uid;
  await first.close();
  await markPreviewTester(uid);

  // The next morning, the day's five pages revised.
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
  const tile = await openCoverage(app);
  expect(tile(30)).toBe('Juz 30, 5 of 23 pages revised, the rest not revised yet');
  expect(tile(30)).not.toMatch(/never revised|days ago/);
  // Neutral, not the red of 30+ days: nothing is "untouched the longest", and the legend says what it is.
  expect(app.screen.queryByTestId('insights-untouched')).toBeNull();
  expect(app.screen.getByText('Not revised yet')).toBeTruthy();
  expect(app.screen.queryByText('30+ days')).toBeTruthy();
  await app.close();

  // A month on, with nothing revised since: those pages have gone 30 days on record, and so has the rest.
  setNow('2026-12-04 09:00');
  const later = await phone.open(activityStack);
  const tileLater = await openCoverage(later);
  expect(tileLater(30)).toBe('Juz 30, never revised');
  expect(later.screen.getByTestId('insights-untouched')).toBeTruthy();
  expect(later.screen.queryByText('Not revised yet')).toBeNull();
  await later.close();
});

// Coverage's views (ACT-26; Majd, Nov 8 2026: "for coverage shouldn't we allow for different views, not
// just juz?", then on the mocks: Surah filterable by juz, "fill is nicer than the bar", "having both
// surah and page is fine"). On a real account against the emulators: the view and the juz the user hid
// are kept on the phone across a restart, and a page's cell opens the reader there.

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

const nav = (app: OpenApp) => app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
const label = (app: OpenApp, testID: string) => app.screen.getByTestId(testID).props.accessibilityLabel as string;
const expanded = (app: OpenApp, testID: string) => app.screen.getByTestId(testID).props.accessibilityState?.expanded as boolean;

/** Activity → Insights (tester-only while built, ACT-3), on Coverage. */
async function openInsights(app: OpenApp): Promise<void> {
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  await app.act(async () => {
    nav(app).current.navigate('Activity');
  });
  await app.until(() => app.screen.queryByTestId('activity-blocks-views') != null, 'Activity');
  await tap(app, 'pill-insights');
  await app.until(() => app.screen.queryByTestId('coverage-views') != null, 'Coverage');
}

it('[ACT-26] Coverage by Juz, Surah and Page: the view and the juz hidden are kept across a restart; a page opens the reader', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  // Juz 29 and 30 memorized, five pages a day from Juz 29.
  const first = await newAccount(phone, { memorized: pagesRange(562, 604), user: { dailyPageCapacity: 5 } });
  const uid = first.uid;
  await first.close();
  await markPreviewTester(uid);

  setNow('2026-11-03 09:00');
  const h = await phone.open(homeStack);
  const home = new Home(h);
  await home.ready();
  const session = await home.startSession();
  // The plan began yesterday at 562: today is 567–571 (Al-Haqqah's end to Nuh).
  expect(session.pages()).toEqual(pagesRange(567, 571));
  await session.swipeThrough(5);
  await session.back();
  await h.untilSynced();
  await h.close();

  const app = await phone.open(activityStack);
  await openInsights(app);
  // Juz: the tiles fill by share; what isn't revised yet is never 30+ days (ACT-25).
  expect(app.screen.getByTestId('coverage-juz')).toBeTruthy();
  expect(label(app, 'juz-tile-29')).toBe('Juz 29, 5 of 20 pages revised, the rest not revised yet');
  expect(label(app, 'juz-tile-30')).toBe('Juz 30, not revised yet');

  // Surah: both juz have pages not revised yet, so both are open. Al-Ma'arij lies inside today's pages.
  const maarij = app.mods.require<typeof import('../../../src/lib/quranData')>('src/lib/quranData').getSurah(70)!;
  expect(maarij.startPage >= 567 && maarij.endPage <= 571).toBe(true);
  await tap(app, 'pill-surah');
  expect(expanded(app, 'coverage-juz-29')).toBe(true);
  expect(expanded(app, 'coverage-juz-30')).toBe(true);
  expect(label(app, 'coverage-surah-29-70')).toBe("Al-Ma'arij, revised this week");
  expect(label(app, 'coverage-surah-29-67')).toBe('Al-Mulk, not revised yet');
  expect(label(app, 'coverage-surah-30-114')).toBe('An-Nas, not revised yet');
  // Hide Juz 30: its surahs go, its header stays.
  await tap(app, 'coverage-juz-30');
  expect(expanded(app, 'coverage-juz-30')).toBe(false);
  expect(app.screen.queryByTestId('coverage-surah-30-114')).toBeNull();
  await app.close();

  // Next launch: still Surah, Juz 30 still hidden, Juz 29 open.
  const again = await phone.open(activityStack);
  await openInsights(again);
  await again.until(() => again.screen.queryByTestId('coverage-surahs') != null, 'the Surah view, as left');
  expect(expanded(again, 'coverage-juz-30')).toBe(false);
  expect(expanded(again, 'coverage-juz-29')).toBe(true);

  // Page: a cell per page; a cell opens the reader at that page.
  await tap(again, 'pill-page');
  expect(label(again, 'coverage-page-567')).toMatch(/, page 567, revised this week$/);
  expect(label(again, 'coverage-page-562')).toMatch(/, page 562, not revised yet$/);
  expect(label(again, 'coverage-page-604')).toBe('Al-Ikhlas to An-Nas, page 604, not revised yet');
  await tap(again, 'coverage-page-600');
  await again.until(() => nav(again).current.getCurrentRoute()?.name === 'QuranReader', 'the reader');
  expect(nav(again).current.getCurrentRoute()?.params).toMatchObject({ pageNumber: 600 });
  await again.close();
});

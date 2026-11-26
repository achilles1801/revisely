// One Activity tab (ACT-35, Revisely Dev; Majd's version A, Nov 25 2026): the real Activity screen and a section's own page,
// against the emulators. No Overview | Insights switch; the calendar and the day first, the sections as rows under them; a row
// opens its section on a page of its own, and the range chosen there is the list's when Back comes to it.

import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { setNow, setZone, ZONES } from '../harness/clock';
import { Home, activityStack, flatText, homeStack } from '../harness/screens';
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
const shows = (app: OpenApp, testID: string) => app.screen.queryByTestId(testID) != null;
const text = (app: OpenApp, testID: string) => {
  const el = app.screen.queryByTestId(testID);
  return el ? flatText(el).replace(/\u00a0/g, ' ') : null;
};

it('[ACT-35] Activity is one tab: this week and the day, then the sections as rows; a row opens its own page, whose range is the list’s; Month opens the calendar', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  // Juz 30, five pages a day.
  const first = await newAccount(phone, { memorized: pagesRange(582, 604), user: { dailyPageCapacity: 5 } });
  const uid = first.uid;
  await first.close();
  await markPreviewTester(uid);

  // Today's five pages revised.
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
  // Revisely Dev's: the one tab, and the day as one entry (ACT-34).
  app.mods.require<{ setActivityOneTabForTests: (on: boolean) => void }>('src/lib/release/activityOneTab').setActivityOneTabForTests(true);
  app.mods.require<{ setJournalDesignReleasedForTests: (on: boolean) => void }>('src/lib/release/journalDesign').setJournalDesignReleasedForTests(true);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const nav = app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
  await app.act(async () => {
    nav.current.navigate('Activity');
  });
  await app.until(() => shows(app, 'activity-blocks-views'), 'Activity');

  // This week and the picked day first (Majd's T1, C2); no month, no Overview | Insights switch.
  expect(shows(app, 'calendar-strip')).toBe(true);
  expect(shows(app, 'calendar-month')).toBe(false);
  await app.until(() => /^5 of 5\b|revised/.test(text(app, 'preview-ring-figure') ?? ''), 'today’s ring on the day');
  expect(text(app, 'preview-ring-figure')).toBe('5 of 5 revised');
  expect(text(app, 'calendar-week-line')).toMatch(/^1 of \d days? revised/);
  expect(shows(app, 'activity-views')).toBe(false);
  expect(shows(app, 'pill-insights')).toBe(false);

  // Under them, "Your revision" and the sections as rows: Coverage says today's five of 23.
  await app.until(() => shows(app, 'insights-row-coverage-figure'), 'Coverage’s row');
  expect(text(app, 'activity-sections-list')).toMatch(/^Your revision/);
  await app.until(() => /^22%/.test(text(app, 'insights-row-coverage-figure') ?? ''), 'Coverage’s figure, 22%');
  expect(shows(app, 'insights-row-consistency')).toBe(true);
  expect(shows(app, 'insights-coverage')).toBe(false);
  expect(shows(app, 'activity-edit-sections')).toBe(true);

  // A row opens the section on its own page, drawn in full.
  await tap(app, 'insights-row-coverage');
  await app.until(() => shows(app, 'activity-section'), 'Coverage’s page');
  await app.until(() => shows(app, 'insights-coverage-figure'), 'Coverage drawn in full');
  expect(app.screen.getByTestId('insights-coverage-figure').props.accessibilityLabel).toBe('22% 5 of 23 memorized pages in 30 days');
  expect(shows(app, 'juz-tile-30')).toBe(true);

  // Its range is the list's: 7 days here, and the list says 7 days once Back comes to it.
  await tap(app, 'section-range');
  await tap(app, 'sheet-action-range-7');
  await app.act(async () => {
    const { Modal } = app.mods.require<any>('react-native');
    app.screen.UNSAFE_getAllByType(Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
  });
  await app.until(() => /7 days/.test(text(app, 'section-range') ?? ''), 'the page’s chip on 7 days');
  await app.act(async () => {
    nav.current.goBack();
  });
  await app.until(() => shows(app, 'activity-sections-list') && !shows(app, 'activity-section'), 'back on Activity');
  expect(text(app, 'insights-range')).toMatch(/7 days/);

  // "Month ›" opens the full calendar on its own page, today's day there too.
  await tap(app, 'calendar-month-link');
  await app.until(() => shows(app, 'activity-month') && shows(app, 'calendar-month'), 'the month page');
  expect(text(app, 'calendar-month-title')).toBe('November 2026');
  expect(text(app, 'preview-ring-figure')).toBe('5 of 5 revised');
  await app.close();
});

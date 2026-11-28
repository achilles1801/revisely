// Memorized pages off Home, in Settings under Revision, edited Settings-style; Activity's Memorization section opens them and
// charts them by month or by day (BEHAVIOUR.md MEM-9, MEM-10; Revisely Dev; Majd, Nov 27 2026: "not on home page but
// available in settings under its own thing (but id put it under the revision tab not above it)").

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { Home, flatText } from '../harness/screens';
import { Phone, type Booted, type OpenApp, ramadanIntroSeen, revoMomentSeen } from '../harness/phone';

jest.mock('../../../src/lib/release/memorizedInSettings', () => ({
  ...jest.requireActual('../../../src/lib/release/memorizedInSettings'),
  memorizedInSettingsEnabled: () => true,
}));

const MONDAY = '2026-11-02';

/** Home with the real Settings, Memorized pages and Activity's section page behind it, as Revisely Dev. */
function devStack(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  req<{ default: { expoConfig: { extra: Record<string, unknown> } } }>('expo-constants').default.expoConfig.extra.variant = 'dev';
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const nav = req<{ navigation: { current: unknown } }>('./navRef');
  const { ReadingTimerProvider } = req<any>('src/context/ReadingTimerContext');
  const Stack = createNativeStackNavigator();
  const h = React.createElement;
  const Elsewhere = () => null;
  return h(
    ReadingTimerProvider,
    null,
    h(
      NavigationContainer,
      { ref: (r: unknown) => (nav.navigation.current = r) },
      h(
        Stack.Navigator,
        { screenOptions: { headerShown: false, animation: 'none' } },
        h(Stack.Screen, { name: 'Dashboard', component: req<any>('src/screens/main/DashboardScreen').default }),
        h(Stack.Screen, { name: 'Settings', component: req<any>('src/screens/main/SettingsScreen').default }),
        h(Stack.Screen, { name: 'Memorization', component: req<any>('src/screens/main/MemorizationScreen').default }),
        h(Stack.Screen, { name: 'ActivitySection', component: req<any>('src/screens/activity/ActivitySectionScreen').default }),
        ...['ActiveRevision', 'Activity', 'ActivityDay', 'PlanEdit', 'PlanDayEdit', 'ActivityAll', 'Insights', 'QuranReader', 'LastRevised', 'ActivityMonth'].map(
          (name) => h(Stack.Screen, { key: name, name, component: Elsewhere }),
        ),
      ),
    ),
  );
}

const has = (app: OpenApp, testID: string) => app.screen.queryByTestId(testID) != null;
const text = (app: OpenApp, testID: string) => {
  const el = app.screen.queryByTestId(testID);
  return el ? flatText(el).replace(/ /g, ' ') : null;
};

async function tap(app: OpenApp, testID: string): Promise<void> {
  await app.until(() => app.screen.queryByTestId(testID) != null, testID);
  await app.act(async () => {
    app.mods.rtl.fireEvent.press(app.screen.getByTestId(testID));
  });
  await app.idle(50);
}

async function go(app: OpenApp, how: (nav: any) => void): Promise<void> {
  const { navigation } = app.mods.require<{ navigation: { current: any } }>('./navRef');
  await app.act(async () => {
    how(navigation.current);
  });
  await app.idle(50);
}

/** "When did you memorize these?" answered with `answer` (the alert's buttons in order are returned). */
function answerWhen(app: OpenApp, answer: string): { asked: string[] | null } {
  const { Alert } = app.mods.require<typeof import('react-native')>('react-native');
  const seen: { asked: string[] | null } = { asked: null };
  (Alert as { alert: unknown }).alert = (title: string, _m?: string, buttons?: { text?: string; onPress?: () => void }[]) => {
    if (title !== 'When did you memorize these?') return;
    seen.asked = (buttons ?? []).map((b) => b.text ?? '');
    buttons?.find((b) => b.text === answer)?.onPress?.();
  };
  return seen;
}

/** The testIDs on screen, in order. */
function order(app: OpenApp, re: RegExp): string[] {
  return app.screen.UNSAFE_root.findAll((n: { props: Record<string, unknown> }) => typeof n.props.testID === 'string' && re.test(n.props.testID as string))
    .map((n: { props: Record<string, unknown> }) => n.props.testID as string)
    .filter((id: string, i: number, all: string[]) => all.indexOf(id) === i);
}

async function account(): Promise<Phone> {
  setZone(ZONES.chicago);
  setNow(`${MONDAY} 08:00`);
  const phone = new Phone();
  // Juz 29 and 30 (43 pages), five pages a day.
  const app = await newAccount(phone, { memorized: pagesRange(562, 604), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  revoMomentSeen(phone, uid);
  ramadanIntroSeen(phone);
  return phone;
}

it('[MEM-9] Memorized pages are off Home; Settings has them under Revision, edited Settings-style with Save only after a change', async () => {
  const phone = await account();
  setNow(`${MONDAY} 09:00`);
  const app = await phone.open(devStack);
  const home = new Home(app);
  await home.ready();

  // Home: no memorized line, no juz dots.
  expect(has(app, 'today-memorized')).toBe(false);
  expect(has(app, 'today-dots')).toBe(false);

  // Settings: Memorized pages right under Revision, with its count; the Revision page no longer lists it.
  await go(app, (n) => n.navigate('Settings'));
  await app.until(() => has(app, 'settings-memorized-pages'), 'the Memorized pages row');
  const rows = order(app, /^settings-(page-[a-z]+|memorized-pages)$/);
  expect(rows.indexOf('settings-memorized-pages')).toBe(rows.indexOf('settings-page-revision') + 1);
  expect(app.screen.getByTestId('settings-memorized-pages').props.accessibilityLabel).toBe('Memorized pages, 43 pages');
  await tap(app, 'settings-page-revision');
  await app.until(() => app.screen.queryByText('Smart Tracking') != null, 'the Revision page');
  expect(app.screen.queryByText('Memorized pages')).toBeNull();
  await go(app, (n) => n.goBack());

  // Memorized pages: ready to edit (no ✎), how much is memorized, a row per juz; no bar until something changes.
  await tap(app, 'settings-memorized-pages');
  await app.until(() => has(app, 'memorized-pages'), 'Memorized pages');
  expect(text(app, 'memorized-count')).toBe('43 pages');
  expect(text(app, 'memorized-share')).toBe('7.1% of the Quran');
  expect(has(app, 'memorization-edit')).toBe(false);
  expect(has(app, 'memorized-save')).toBe(false);
  expect(text(app, 'memorized-juz-30-value')).toBe('All');
  expect(text(app, 'memorized-juz-29-value')).toBe('All');
  expect(has(app, 'memorized-juz-28-value')).toBe(false);

  // Juz 28 on its own page: Whole juz off; At-Tahrim's circle marks its two pages, each named by its place in the surah.
  await tap(app, 'memorized-juz-28-open');
  await app.until(() => has(app, 'memorized-group-juz-28'), 'Juz 28');
  expect(app.screen.getByTestId('memorized-whole').props.value).toBe(false);
  expect(text(app, 'memorized-page-66-560')).toBe('1');
  expect(text(app, 'memorized-page-66-561')).toBe('2');
  await tap(app, 'memorized-in-juz-surah-66-check');
  await app.until(() => has(app, 'memorized-save'), 'the Save bar');
  expect(text(app, 'memorized-save')).toBe('Save 2 changes');
  expect(text(app, 'memorized-in-juz-surah-66-value')).toBe('All');

  // Back returns to the list, the change kept.
  await tap(app, 'back');
  await app.until(() => has(app, 'memorized-list'), 'the list');
  expect(text(app, 'memorized-juz-28-value')).toBe('2 of 20');
  expect(text(app, 'memorized-count')).toBe('45 pages');

  // Save asks when they were memorized; Today saves them and logs them.
  const when = answerWhen(app, 'Today');
  await tap(app, 'memorized-save');
  await app.until(() => !has(app, 'memorized-save'), 'the save to finish');
  await app.untilSynced();
  expect(when.asked).toEqual(['Today', "Before (don't log)", 'Cancel']);
  const memorized = new Set(app.app.pages.filter((p: { status: string }) => p.status === 'memorized').map((p: { pageNumber: number }) => p.pageNumber));
  expect([memorized.has(560), memorized.has(561), memorized.size]).toEqual([true, true, 45]);
  await app.close();
});

it('[MEM-10] [MEM-12] Activity’s Memorization opens the memorized pages; its chart starts at the first month or day memorized, by month or by day, opening on Day under two months, in an axis of slots', async () => {
  const phone = await account();
  // Two pages memorized on Monday, one on Thursday (Today), so the days run from Monday, the months from November.
  for (const [at, page] of [[`${MONDAY} 09:00`, 561], ['2026-11-05 09:00', 560]] as const) {
    setNow(at);
    const app = await phone.open(devStack);
    await new Home(app).ready();
    await go(app, (n) => n.navigate('Memorization'));
    await app.until(() => has(app, 'memorized-pages'), 'Memorized pages');
    await tap(app, 'memorized-juz-28-open');
    await tap(app, `memorized-page-66-${page}`);
    answerWhen(app, 'Today');
    await tap(app, 'memorized-save');
    await app.until(() => !has(app, 'memorized-save'), 'the save to finish');
    await app.untilSynced();
    await app.close();
  }

  setNow('2026-11-05 10:00');
  const app = await phone.open(devStack);
  await new Home(app).ready();
  await go(app, (n) => n.navigate('ActivitySection', { section: 'memorization' }));
  // Under two months of memorizing, it opens on Day (MEM-12).
  await app.until(() => has(app, 'insights-memorization') && has(app, 'insights-memorization-bars-day'), 'Memorization, by day');
  expect(has(app, 'insights-edit-memorized')).toBe(true);

  // By month: November alone, no empty months before it, in an axis of six slots (MEM-12).
  await tap(app, 'insights-memorization-month');
  await app.until(() => has(app, 'insights-memorization-bars-month'), 'the months');
  expect(order(app, /^insights-memorization-bar-/)).toEqual(['insights-memorization-bar-2026-11']);
  // Six month slots at least (MEM-12): the one month at the right, five empty before it (TapChart's `-slot-empty`).
  expect(app.screen.queryAllByTestId('insights-memorization-bars-month-slot-empty').length).toBe(5);

  // By day: from Monday, the first day memorized, to today.
  await tap(app, 'insights-memorization-day');
  await app.until(() => has(app, 'insights-memorization-bars-day'), 'the days');
  expect(order(app, /^insights-memorization-bar-/)).toEqual(
    ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((d) => `insights-memorization-bar-${d}`),
  );
  // A day's bar: the figure is that day, and what was memorized then is listed.
  await tap(app, 'insights-memorization-bar-2026-11-02');
  await app.until(() => has(app, 'insights-memorization-items'), 'the day picked');
  expect(text(app, 'insights-memorization-figure')).toMatch(/^1\s*page on 2 November/);
  expect(has(app, 'insights-memorization-item-2026-11-02')).toBe(true);

  // Edit memorized pages opens them.
  await tap(app, 'insights-edit-memorized');
  await app.until(() => has(app, 'memorized-pages'), 'Memorized pages from Activity');
  await app.close();
});

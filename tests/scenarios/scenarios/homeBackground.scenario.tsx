// Home's background in Revisely Dev (BEHAVIOUR.md HOME-6, HOME-7; Majd, Nov 26 2026: "build a, b, and c and just have them
// as appearance options in settings but make C the default"). Glow carries the top's glow down to the tab bar, Two glows
// adds one rising from it, Glow and an ayah (the default) adds today's ayah at the foot of Home. The hairline under the
// Today post only when a post follows it.

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { Home } from '../harness/screens';
import { plain } from '../harness/words';
import { Phone, type Booted, type OpenApp, ramadanIntroSeen, revoMomentSeen } from '../harness/phone';

jest.mock('../../../src/lib/release/homeV3', () => ({
  ...jest.requireActual('../../../src/lib/release/homeV3'),
  homeV3Enabled: () => true,
  useHomeV3: () => true,
}));

// 2026-11-19 is a Thursday, 11-20 the Friday (Al-Kahf's card on Home).
const THURSDAY = '2026-11-19';
const FRIDAY = '2026-11-20';
const KEY = '@revisely_home_background:v1';
const HIDDEN = { includeHiddenElements: true };

/** Home with the real Settings behind it, as Revisely Dev. */
function devHome(mods: Booted): ReactElement {
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
        ...['ActiveRevision', 'Activity', 'ActivityDay', 'PlanEdit', 'PlanDayEdit', 'Memorization', 'ActivityAll', 'Insights', 'QuranReader'].map(
          (name) => h(Stack.Screen, { key: name, name, component: Elsewhere }),
        ),
      ),
    ),
  );
}

async function account(): Promise<Phone> {
  setZone(ZONES.london);
  setNow(`${THURSDAY} 08:00`);
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: pagesRange(542, 604), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  revoMomentSeen(phone, uid);
  ramadanIntroSeen(phone);
  return phone;
}

async function openHome(phone: Phone, at: string): Promise<{ app: OpenApp; home: Home }> {
  setNow(at);
  const app = await phone.open(devHome);
  const home = new Home(app);
  await home.ready();
  return { app, home };
}

const has = (app: OpenApp, testID: string) => app.screen.queryByTestId(testID, HIDDEN) != null;
const text = (app: OpenApp, testID: string) => {
  const c = app.screen.getByTestId(testID).props.children;
  return plain(Array.isArray(c) ? c.join('') : String(c));
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

/** Settings → Appearance → Home background → a choice, then back to Home. */
async function choose(app: OpenApp, home: Home, label: string, choice: string): Promise<void> {
  await go(app, (n) => n.navigate('Settings', { page: 'appearance' }));
  await app.until(() => app.screen.queryByTestId('settings-home-background') != null, 'the Home background row');
  await tap(app, 'settings-home-background');
  await app.until(() => app.screen.queryByTestId('sheet-action-glows') != null, 'the three backgrounds');
  await tap(app, `sheet-action-${choice}`);
  await app.until(() => app.screen.queryByTestId('home-background-sheet') == null || !app.screen.getByTestId('home-background-sheet').props.visible, 'the sheet to close');
  const row = () => app.mods.rtl.within(app.screen.getByTestId('settings-home-background'));
  await app.until(() => row().queryByText(label) != null, `the row to read ${label}`);
  await go(app, (n) => n.goBack());
  await home.ready();
}

describe('Home’s background (Revisely Dev)', () => {
  it('[HOME-6] [HOME-7] Glow and an ayah by default: the wash to the tab bar, today’s ayah under the posts, and no line under Today', async () => {
    const phone = await account();
    const { app } = await openHome(phone, `${THURSDAY} 10:00`);
    const { ayahForDay } = app.mods.require<typeof import('../../../src/lib/homeAyah')>('src/lib/homeAyah');
    const { surahNameIn } = app.mods.require<typeof import('../../../src/lib/passages')>('src/lib/passages');

    await app.until(() => has(app, 'home-ayah'), 'today’s ayah');
    expect(phone.storage.has(KEY)).toBe(false);
    expect(has(app, 'home-ground-tail')).toBe(true);
    expect(has(app, 'home-ground-floor')).toBe(false);
    expect(has(app, 'today-post-separator')).toBe(false);

    // Today's, in the mushaf's script, then where it is ("Al-Qamar 54:17").
    const thursday = ayahForDay(THURSDAY);
    expect(text(app, 'home-ayah-arabic')).toBe(thursday.arabic);
    expect(text(app, 'home-ayah-reference')).toBe(`${surahNameIn(thursday.sura)} ${thursday.sura}:${thursday.ayah}`);
    // After the posts in Home's scroll: it never sits over them.
    const order = app.mods.rtl
      .within(app.screen.getByTestId('home-v2'))
      .queryAllByTestId(/^(today-post|home-ayah)$/)
      .map((el) => el.props.testID);
    expect(order).toEqual(['today-post', 'home-ayah']);
    // With the Ramadan theme (on in Revisely Dev) the light falls the whole way down, past the glow's 340 or 360pt.
    expect(app.screen.getByTestId('ramadan-sky', HIDDEN).props.style.find((s: { height?: number }) => s?.height)?.height).toBeGreaterThan(400);
    await app.close();

    // Friday: the next ayah all day, and Al-Kahf's card under Today brings its line back.
    const friday = await openHome(phone, `${FRIDAY} 09:00`);
    await friday.app.until(() => has(friday.app, 'home-ayah') && friday.home.kahf() != null, 'Friday’s Home');
    const next = ayahForDay(FRIDAY);
    expect(next).not.toEqual(thursday);
    expect(text(friday.app, 'home-ayah-arabic')).toBe(next.arabic);
    expect(has(friday.app, 'today-post-separator')).toBe(true);
    await friday.app.close();
  });

  it('[HOME-6] Settings → Appearance → Home background: Two glows rises from the tab bar, Glow has no ayah, kept on this phone', async () => {
    const phone = await account();
    let { app, home } = await openHome(phone, `${THURSDAY} 10:00`);
    await app.until(() => has(app, 'home-ayah'), 'the default');

    await choose(app, home, 'Two glows', 'glows');
    await app.until(() => has(app, 'home-ground-floor'), 'the glow rising from the tab bar');
    expect(has(app, 'home-ground-tail')).toBe(true);
    expect(has(app, 'home-ayah')).toBe(false);
    await app.close();
    // Kept on this phone (its storage, as the app left it).
    expect(phone.storage.get(KEY)).toBe('glows');

    // Kept: the next launch has it before anything is chosen.
    ({ app, home } = await openHome(phone, `${THURSDAY} 12:00`));
    await app.until(() => has(app, 'home-ground-floor'), 'Two glows again');

    await choose(app, home, 'Glow', 'glow');
    await app.until(() => !has(app, 'home-ground-floor'), 'one glow');
    expect(has(app, 'home-ground-tail')).toBe(true);
    expect(has(app, 'home-ayah')).toBe(false);
    expect(has(app, 'today-post-separator')).toBe(false);
    await app.close();
  });
});

it('[HOME-7] today’s ayah is one quiet line, with no translation; a tap opens its page with the ayah highlighted', async () => {
  const phone = await account();
  const { app } = await openHome(phone, `${THURSDAY} 10:00`);
  const { ayahForDay } = app.mods.require<typeof import('../../../src/lib/homeAyah')>('src/lib/homeAyah');
  const { surahNameIn } = app.mods.require<typeof import('../../../src/lib/passages')>('src/lib/passages');
  const { pageOfVerse } = app.mods.require<typeof import('../../../src/lib/verses')>('src/lib/verses');
  await app.until(() => has(app, 'home-ayah'), 'today’s ayah');
  const { sura, ayah } = ayahForDay(THURSDAY);
  // Two pieces only: the Arabic and where it is (Majd, Nov 27 2026: "one quiet line"); the English is gone from Home.
  expect(text(app, 'home-ayah-reference')).toBe(`${surahNameIn(sura)} ${sura}:${ayah}`);
  expect(has(app, 'home-ayah-translation')).toBe(false);
  expect(app.screen.getByTestId('home-ayah').props.accessibilityLabel).toBe(`Today’s ayah, ${surahNameIn(sura)} ${sura}:${ayah}`);

  await app.act(async () => {
    app.mods.rtl.fireEvent.press(app.screen.getByTestId('home-ayah'));
  });
  const nav = app.mods.require<{ navigation: { current: any } }>('./navRef').navigation.current;
  await app.until(() => nav.getCurrentRoute()?.name === 'QuranReader', 'its page in the reader');
  expect(nav.getCurrentRoute().params).toEqual({ pageNumber: pageOfVerse({ sura, ayah }), highlight: { sura, ayah } });
  await app.close();
});

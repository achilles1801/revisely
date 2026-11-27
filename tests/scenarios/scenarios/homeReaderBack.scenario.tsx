// A page opened from Home comes back to Home (BEHAVIOUR.md HOME-7, KAHF-2; Majd, Nov 26 2026: "clicking on the verse of
// the day on the homepage takes me to the page which is correct, but then when I swipe out of the page, it should
// actually take me back to the homepage, not to the third tab"). Today's ayah and Al-Kahf's "Read" open the reader over
// Home, in Home's tab, and back (the button, or the swipe: the stack's own back) lands on Home. Before, both opened the
// Read tab's reader over its surah list, so back left the user on the Read tab. The app's real tabs (MainNavigator).

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp, ramadanIntroSeen, revoMomentSeen } from '../harness/phone';

jest.mock('../../../src/lib/release/homeV3', () => ({
  ...jest.requireActual('../../../src/lib/release/homeV3'),
  homeV3Enabled: () => true,
  useHomeV3: () => true,
}));

// 2026-11-20 is a Friday: Home has today's ayah (Glow and an ayah, the default) and Al-Kahf's card.
const FRIDAY = '2026-11-20';

/** The app's tabs as MainNavigator mounts them, as Revisely Dev. */
function devTabs(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  req<{ default: { expoConfig: { extra: Record<string, unknown> } } }>('expo-constants').default.expoConfig.extra.variant = 'dev';
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { MainNavigator } = req<any>('src/navigation/MainNavigator');
  const nav = req<{ navigation: { current: unknown } }>('./navRef');
  const { navigationRef } = req<any>('src/navigation/navigationRef');
  const ref = (r: unknown) => {
    nav.navigation.current = r;
    navigationRef.current = r;
  };
  return React.createElement(NavigationContainer, { ref }, React.createElement(MainNavigator));
}

type Route = { name: string; params?: Record<string, unknown>; state?: { index?: number; routes: Route[] } };
type Nav = { goBack: () => void; getCurrentRoute: () => Route | undefined; getRootState: () => { index: number; routes: Route[] } };
const navOf = (app: OpenApp) => app.mods.require<{ navigation: { current: Nav } }>('./navRef').navigation.current;

/** Which tab shows and which screen is on top. */
function where(app: OpenApp): { tab: string; screen: string | undefined } {
  const root = navOf(app).getRootState();
  return { tab: root.routes[root.index].name, screen: navOf(app).getCurrentRoute()?.name };
}

/** The Read tab's own stack: what it holds (its surah list alone, or not opened yet). */
function readTab(app: OpenApp): string[] {
  const read = navOf(app).getRootState().routes.find((r) => r.name === 'Read');
  return read?.state?.routes.map((r) => r.name) ?? [];
}

async function press(app: OpenApp, testID: string): Promise<void> {
  await app.until(() => app.screen.queryByTestId(testID) != null, testID);
  await app.act(async () => {
    app.mods.rtl.fireEvent.press(app.screen.getByTestId(testID));
  });
  await app.idle(50);
}

async function back(app: OpenApp): Promise<void> {
  await app.act(async () => {
    navOf(app).goBack();
  });
  await app.idle(50);
}

async function account(): Promise<Phone> {
  setZone(ZONES.london);
  setNow(`${FRIDAY} 08:00`);
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: pagesRange(542, 604), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  revoMomentSeen(phone, uid);
  ramadanIntroSeen(phone);
  return phone;
}

it('[HOME-7] [KAHF-2] today’s ayah and Al-Kahf’s Read open the reader over Home, and back comes back to Home', async () => {
  const phone = await account();
  setNow(`${FRIDAY} 08:00`);
  const app = await phone.open(devTabs);
  const home = new Home(app);
  await home.ready();
  await app.until(() => app.screen.queryByTestId('home-ayah') != null && home.kahf() != null, 'Friday’s Home, its ayah and Al-Kahf');
  expect(where(app)).toEqual({ tab: 'Home', screen: 'Dashboard' });

  const { ayahForDay } = app.mods.require<typeof import('../../../src/lib/homeAyah')>('src/lib/homeAyah');
  const { pageOfVerse } = app.mods.require<typeof import('../../../src/lib/verses')>('src/lib/verses');
  const ayahPage = pageOfVerse(ayahForDay(FRIDAY));

  // Today's ayah: its page, in the reader over Home.
  await press(app, 'home-ayah');
  await app.until(() => where(app).screen === 'QuranReader', 'the reader');
  expect(where(app)).toEqual({ tab: 'Home', screen: 'QuranReader' });
  expect(navOf(app).getCurrentRoute()?.params).toMatchObject({ pageNumber: ayahPage });
  // The reader's Back button (a tap on the page shows the controls): Home again, and the Read tab untouched.
  await press(app, 'reader-background');
  await press(app, 'reader-back');
  await app.until(() => where(app).screen === 'Dashboard', 'Home after Back');
  expect(where(app)).toEqual({ tab: 'Home', screen: 'Dashboard' });
  expect(readTab(app)).not.toContain('QuranReader');

  // The swipe back is the stack's own back: Home again.
  await press(app, 'home-ayah');
  await app.until(() => where(app).screen === 'QuranReader', 'the reader again');
  await back(app);
  await app.until(() => where(app).screen === 'Dashboard', 'Home after the swipe back');
  expect(where(app)).toEqual({ tab: 'Home', screen: 'Dashboard' });

  // Al-Kahf's Read: its first page, over Home, and back to Home.
  const { kahfPages } = app.mods.require<typeof import('../../../src/lib/kahf')>('src/lib/kahf');
  await press(app, 'kahf-read');
  await app.until(() => where(app).screen === 'QuranReader', 'Al-Kahf in the reader');
  expect(where(app)).toEqual({ tab: 'Home', screen: 'QuranReader' });
  expect(navOf(app).getCurrentRoute()?.params).toMatchObject({ pageNumber: kahfPages()[0] });
  await back(app);
  await app.until(() => where(app).screen === 'Dashboard', 'Home after Al-Kahf');
  expect(where(app)).toEqual({ tab: 'Home', screen: 'Dashboard' });
  expect(readTab(app)).not.toContain('QuranReader');
  await app.close();
});

// Coming back to Home shows it exactly as it was (BEHAVIOUR.md TAB-3; Majd, Nov 26 2026: "whenever I click revise ahead
// and it takes me to the page and then swipe back, you can see that the formatting of the verse of the day gets thrown
// off ... this should never happen in any possible scenario"). Home stays mounted under every pushed screen; the room it
// leaves at the bottom for the tab bar, the mini player and Revo's button must not change while something covers it, or
// its content (today's ayah at its foot) moves as the swipe reveals it and jumps when the swipe ends. Before, Home lost
// Revo's room under every screen without Revo's button (a session, the reader, Settings). The app's real tabs.

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp, ramadanIntroSeen, revoMomentSeen } from '../harness/phone';

const HIDDEN = { includeHiddenElements: true };

/** The app's tabs as MainNavigator mounts them (with Revo). */
function mainTabs(mods: Booted): ReactElement {
  const { React, require: req } = mods;
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

type Nav = { navigate: (name: string, params?: object) => void; goBack: () => void; getCurrentRoute: () => { name: string } | undefined };
const navOf = (app: OpenApp) => app.mods.require<{ navigation: { current: Nav } }>('./navRef').navigation.current;
const screen = (app: OpenApp) => navOf(app).getCurrentRoute()?.name;

/** The room Home leaves at the bottom of its content, read while Home is in front or covered. */
function homeRoom(app: OpenApp): number {
  const style = app.screen.getByTestId('home-v2', HIDDEN).props.contentContainerStyle as { paddingBottom: number };
  return style.paddingBottom;
}

async function go(app: OpenApp, how: (nav: Nav) => void, to: string): Promise<void> {
  await app.act(async () => {
    how(navOf(app));
  });
  await app.until(() => screen(app) === to, to);
  await app.idle(50);
}

it('[TAB-3] Home keeps its room for the tab bar and Revo’s button under a session, the reader and Settings, and is as it was coming back', async () => {
  setZone(ZONES.london);
  setNow('2026-11-24 19:00');
  const phone = new Phone();
  let app = await newAccount(phone, { memorized: pagesRange(542, 604), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  revoMomentSeen(phone, uid);
  ramadanIntroSeen(phone);

  app = await phone.open(mainTabs);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  await new Home(app).ready();
  // Home in front: the tab bar and Revo's button, and the room for them.
  await app.until(() => app.screen.queryByTestId('revo-button') != null && app.screen.queryByTestId('tab-bar-v2') != null, 'Revo’s button and the tab bar on Home');
  const room = homeRoom(app);

  for (const [to, how] of [
    // Today's session (Start revision, Revise ahead): no tab bar, no Revo.
    ['ActiveRevision', (n: Nav) => n.navigate('Home', { screen: 'ActiveRevision' })],
    // The reader over Home (today's ayah, Al-Kahf): no tab bar, no Revo.
    ['QuranReader', (n: Nav) => n.navigate('Home', { screen: 'QuranReader', params: { pageNumber: 542 } })],
    // Settings: the tab bar, no Revo.
    ['Settings', (n: Nav) => n.navigate('Home', { screen: 'Settings' })],
  ] as const) {
    await go(app, how, to);
    expect(app.screen.queryByTestId('revo-button')).toBeNull();
    // Covered, Home keeps its room: nothing in it moves as it shows again.
    expect({ under: to, room: homeRoom(app) }).toEqual({ under: to, room });

    await go(app, (n) => n.goBack(), 'Dashboard');
    // As it was: the same room, the tab bar and Revo's button.
    expect({ after: to, room: homeRoom(app) }).toEqual({ after: to, room });
    expect(app.screen.queryByTestId('tab-bar-v2')).not.toBeNull();
    await app.until(() => app.screen.queryByTestId('revo-button') != null, `Revo’s button after ${to}`);
  }
  await app.close();
});

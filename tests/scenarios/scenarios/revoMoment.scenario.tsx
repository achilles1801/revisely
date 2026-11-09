// Revo's moment beyond What's new (BEHAVIOUR.md REVO-39): the first open of Revo while it's off plays it,
// then the opt-in, never skipped; once seen on this phone it doesn't play on an open again; Settings →
// Revo AI → What Revo can do plays it any time. Testers only for now: the owner marks the account while
// the app is closed. The real RevoHost and Settings, against the emulators.
//
// Scenarios run Reanimated's jest mock, where an animation ends as it starts: the moment is over as soon
// as it opens (its frames, Skip and buttons are RevoMoment.test's). So these follow what it leaves: the
// mark on the phone, the opt-in after it, and Settings' end.

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { getServerDoc, setServerDoc } from '../harness/serverDocs';
import { Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp } from '../harness/phone';

/** Home and the real Settings, with Revo as MainNavigator mounts it. */
function homeAndSettings(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const Dashboard = req<any>('src/screens/main/DashboardScreen').default;
  const Settings = req<any>('src/screens/main/SettingsScreen').default;
  const nav = req<{ navigation: { current: unknown } }>('./navRef');
  const { ReadingTimerProvider } = req<any>('src/context/ReadingTimerContext');
  const { RevoHost } = req<any>('src/components/revo/RevoHost');
  const { navigationRef } = req<any>('src/navigation/navigationRef');
  const Stack = createNativeStackNavigator();
  const h = React.createElement;
  const Elsewhere = () => null;
  const ref = (r: unknown) => {
    nav.navigation.current = r;
    navigationRef.current = r;
  };
  return h(
    ReadingTimerProvider,
    null,
    h(
      NavigationContainer,
      { ref },
      h(
        Stack.Navigator,
        { screenOptions: { headerShown: false, animation: 'none' } },
        h(Stack.Screen, { name: 'Dashboard', component: Dashboard }),
        h(Stack.Screen, { name: 'Settings', component: Settings }),
        ...['ActiveRevision', 'PlanEdit', 'PlanDayEdit', 'Memorization', 'Activity', 'ActivityDay', 'ActivityAll', 'Insights', 'QuranReader', 'JournalEntry', 'PagesByStrength', 'ListenBack'].map(
          (name) => h(Stack.Screen, { key: name, name, component: Elsewhere }),
        ),
      ),
    ),
    h(RevoHost),
  );
}

const SEEN = (uid: string) => `@revisely_revo_moment_seen:v1:${uid}`;
const stored = async (app: OpenApp, key: string): Promise<string | null> => {
  const mod = app.mods.require<any>('@react-native-async-storage/async-storage');
  return (mod.default ?? mod).getItem(key);
};

const tap = async (app: OpenApp, testID: string) => {
  await app.until(() => app.screen.queryByTestId(testID) != null, `${testID} to show`);
  await app.act(async () => {
    app.mods.rtl.fireEvent.press(app.screen.getByTestId(testID));
  });
};

/** A tester's new account, Revo off, the app open on Home. */
async function tester(phone: Phone): Promise<{ app: OpenApp; uid: string }> {
  setZone(ZONES.amman);
  setNow('2026-11-06 10:00');
  let app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  app = await phone.open(homeAndSettings);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  await new Home(app).ready();
  return { app, uid };
}

it('[REVO-39] [REVO-21] the first open while Revo is off plays its moment, marking it seen, then the opt-in, sending nothing; after that every open goes straight to the opt-in, after a relaunch too', async () => {
  const phone = new Phone('phone');
  const first = await tester(phone);
  let app = first.app;
  const uid = first.uid;

  expect(await stored(app, SEEN(uid))).toBeNull();
  await tap(app, 'revo-button');
  // The moment plays (here it ends at once), marking it seen; then the opt-in, whole, naming who answers
  // (Apple 5.1.2(i)), with nothing sent.
  await app.until(() => app.screen.queryByTestId('revo-optin') != null, 'the opt-in after the moment');
  expect(await stored(app, SEEN(uid))).toBe('1');
  expect(app.screen.queryByTestId('revo-intro')).toBeNull();
  expect(app.screen.getByText('Answered by Claude, from Anthropic')).toBeTruthy();
  expect((await getServerDoc(`coachSettings/${uid}`))?.revoOn ?? false).toBe(false);
  await tap(app, 'revo-not-now');

  // Seen: the next open is the opt-in at once.
  await tap(app, 'revo-button');
  await app.until(() => app.screen.queryByTestId('revo-optin') != null, 'the opt-in');
  expect(app.screen.queryByTestId('revo-intro')).toBeNull();
  await tap(app, 'revo-not-now');

  // And after a relaunch (kept on the phone, per account).
  await app.close();
  app = await phone.open(homeAndSettings);
  await new Home(app).ready();
  await tap(app, 'revo-button');
  await app.until(() => app.screen.queryByTestId('revo-optin') != null, 'the opt-in after a relaunch');
  expect(app.screen.queryByTestId('revo-intro')).toBeNull();
  await tap(app, 'revo-turn-on');
  await app.until(() => app.screen.queryByTestId('revo-greeting') != null, 'the greeting');
  expect(await getServerDoc(`coachSettings/${uid}`)).toMatchObject({ revoOn: true });
});

it('[REVO-39] Settings → Revo AI → What Revo can do plays it any time: Turn on Revo and Later while Revo is off, Done once it’s on; and Revo’s first open then skips it', async () => {
  const phone = new Phone('phone');
  const { app, uid } = await tester(phone);

  await tap(app, 'open-settings');
  expect(await stored(app, SEEN(uid))).toBeNull();
  await tap(app, 'settings-revo-moment');
  await app.until(() => app.screen.queryByTestId('settings-revo-moment-screen') != null, 'the moment from Settings');
  // Revo off: it ends on Turn on Revo and Later; Later closes it and turns nothing on.
  await app.until(() => app.screen.queryByTestId('revo-moment-later') != null, 'Later');
  expect(await stored(app, SEEN(uid))).toBe('1');
  expect(app.screen.getByTestId('whats-new-revo-turn-on')).toBeTruthy();
  expect(app.screen.queryByTestId('revo-moment-done')).toBeNull();
  await tap(app, 'revo-moment-later');
  await app.until(() => app.screen.queryByTestId('settings-revo-moment-screen') == null, 'the moment to close');
  expect((await getServerDoc(`coachSettings/${uid}`))?.revoOn ?? false).toBe(false);

  // Seen from Settings: Revo's first open is the opt-in at once.
  await app.act(async () => {
    (app.mods.require<any>('src/lib/revo/open') as { openRevo: (r?: object) => void }).openRevo({ view: 'optin' });
  });
  await app.until(() => app.screen.queryByTestId('revo-optin') != null, 'the opt-in');
  expect(app.screen.queryByTestId('revo-intro')).toBeNull();
  await tap(app, 'revo-not-now');

  // Revo on (as the opt-in would leave it): the moment from Settings ends on Done alone.
  await setServerDoc(`coachSettings/${uid}`, { revoOn: true });
  await app.until(() => app.screen.queryByTestId('settings-revo-moment') != null, 'Settings');
  await tap(app, 'settings-revo-moment');
  await app.until(() => app.screen.queryByTestId('revo-moment-done') != null, 'Done');
  expect(app.screen.queryByTestId('whats-new-revo-turn-on')).toBeNull();
  expect(app.screen.queryByTestId('revo-moment-later')).toBeNull();
  await tap(app, 'revo-moment-done');
  await app.until(() => app.screen.queryByTestId('settings-revo-moment-screen') == null, 'the moment to close');
});

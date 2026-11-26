// Edit schedule from Settings, and Revo's button on it (BEHAVIOUR.md SET-1 and REVO-25; Majd, Nov 25 2026: "as for the
// edit schedule i guess the most intuitive is to just put it in settings and yes the revo there is nice"). The real
// Settings, Edit schedule, Home and Revo's host, against the emulators.

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { setServerDoc } from '../harness/serverDocs';
import { Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp } from '../harness/phone';

function stack(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const Dashboard = req<any>('src/screens/main/DashboardScreen').default;
  const Settings = req<any>('src/screens/main/SettingsScreen').default;
  const PlanEdit = req<any>('src/screens/main/PlanEditScreen').default;
  const { ReadingTimerProvider } = req<any>('src/context/ReadingTimerContext');
  const { RevoHost } = req<any>('src/components/revo/RevoHost');
  // Edit schedule's sheets render into this, as in App.tsx.
  const { BottomSheetModalProvider } = req<any>('@gorhom/bottom-sheet');
  const { navigationRef } = req<any>('src/navigation/navigationRef');
  const nav = req<{ navigation: { current: unknown } }>('./navRef');
  const Stack = createNativeStackNavigator();
  const h = React.createElement;
  const Elsewhere = () => null;
  const ref = (r: unknown) => {
    nav.navigation.current = r;
    navigationRef.current = r;
  };
  return h(
    BottomSheetModalProvider,
    null,
    h(
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
          h(Stack.Screen, { name: 'PlanEdit', component: PlanEdit }),
          ...['ActiveRevision', 'PlanDayEdit', 'Memorization', 'Activity', 'ActivityAll', 'ActivityDay', 'Insights'].map((name) =>
            h(Stack.Screen, { key: name, name, component: Elsewhere }),
          ),
        ),
      ),
      h(RevoHost),
    ),
  );
}

const tap = async (app: OpenApp, testID: string) => {
  await app.until(() => app.screen.queryByTestId(testID) != null, `${testID} to show`);
  await app.act(async () => {
    app.mods.rtl.fireEvent.press(app.screen.getByTestId(testID));
  });
};

/** How far above the screen's bottom edge Revo's button sits: the `bottom` of the view that places it. */
function buttonBottom(app: OpenApp): number {
  const { StyleSheet } = app.mods.require<any>('react-native');
  let node: any = app.screen.getByTestId('revo-button');
  while (node) {
    const bottom = StyleSheet.flatten(node.props?.style)?.bottom;
    if (typeof bottom === 'number') return bottom;
    node = node.parent;
  }
  throw new Error('no bottom on the button or its parents');
}

it('[SET-1] [REVO-25] Settings → Revision opens with Schedule, in Edit schedule’s words; it opens Edit schedule, which has Revo’s button just above the bottom edge', async () => {
  setZone(ZONES.amman);
  setNow('2026-11-25 10:00');
  const phone = new Phone('phone');
  // 110 pages, 10 a day: every page comes round every 11 days.
  let app = await newAccount(phone, { memorized: pagesRange(1, 110), user: { dailyPageCapacity: 10 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  await setServerDoc(`coachSettings/${uid}`, { revoOn: true });

  app = await phone.open(stack);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const home = new Home(app);
  await home.ready();
  await app.until(() => app.screen.queryByTestId('revo-button') != null, 'Revo’s button on Home');
  const onHome = buttonBottom(app);
  const nav = app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;

  // Settings' first level: Revision says how much a day.
  await app.act(async () => {
    nav.current.navigate('Settings');
  });
  await app.until(() => app.screen.queryByTestId('settings-page-revision') != null, 'Settings');
  expect(app.screen.getByTestId('settings-page-revision').props.accessibilityLabel).toBe('Revision, 10 pages a day');
  // No Revo in Settings.
  expect(app.screen.queryByTestId('revo-button')).toBeNull();

  // Revision's first row is the schedule, as Edit schedule's header says it.
  await app.act(async () => {
    nav.current.navigate('Settings', { page: 'revision' });
  });
  await app.until(() => app.screen.queryByTestId('settings-schedule') != null, 'Settings → Revision');
  expect(app.screen.getByTestId('settings-schedule').props.accessibilityLabel).toBe('Schedule, 10 pages a day');
  expect(app.screen.getByText('Every page comes round every 11 days')).toBeTruthy();

  // It opens Edit schedule, with the same two lines and Revo's button.
  await tap(app, 'settings-schedule');
  await app.until(() => app.screen.queryByTestId('plan-edit') != null, 'Edit schedule');
  expect(app.screen.getAllByText('10 pages a day').length).toBeGreaterThan(0);
  expect(app.screen.getAllByText('Every page comes round every 11 days').length).toBeGreaterThan(0);
  await app.until(() => app.screen.queryByTestId('revo-button') != null, 'Revo’s button on Edit schedule');
  // No tab bar there: the button sits 14 above the bottom edge, lower than on Home by the tab bar's own height.
  const onEditor = buttonBottom(app);
  expect(onEditor).toBeLessThan(onHome);
  expect(onHome - onEditor).toBe(52);

  // Its tap opens Revo over the editor.
  await tap(app, 'revo-button');
  await app.until(() => app.screen.queryByTestId('revo-greeting') != null, 'Revo’s greeting');
  expect(app.screen.queryByTestId('plan-edit')).not.toBeNull();
  await app.close();
});

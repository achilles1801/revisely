// Settings → About → Licences (BEHAVIOUR.md SET-5): the recitation model's licence, the Quran Muaalem License, in full
// and with no network. Revisely Dev's until on-device Recite ships (lib/release/modelLicense).
import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { flatText, Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp } from '../harness/phone';

jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => mockDev.on }));
const mockDev = { on: true };
afterEach(() => {
  mockDev.on = true;
});

/** Home with the real Settings behind it. */
function homeAndSettings(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const Dashboard = req<any>('src/screens/main/DashboardScreen').default;
  const Settings = req<any>('src/screens/main/SettingsScreen').default;
  const nav = req<{ navigation: { current: unknown } }>('./navRef');
  const { ReadingTimerProvider } = req<any>('src/context/ReadingTimerContext');
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
        ...['ActiveRevision', 'Activity', 'ActivityDay', 'PlanEdit', 'PlanDayEdit', 'Memorization', 'ActivityAll', 'Insights', 'QuranReader', 'JournalEntry', 'PagesByStrength', 'ListenBack'].map(
          (name) => h(Stack.Screen, { key: name, name, component: Elsewhere }),
        ),
      ),
    ),
  );
}

async function press(app: OpenApp, testID: string): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  const el = app.screen.getByTestId(testID);
  await app.act(async () => {
    fireEvent.press(el);
  });
  await app.idle(50);
}

async function openAbout(): Promise<{ phone: Phone; app: OpenApp }> {
  setZone(ZONES.london);
  setNow('2026-11-23 19:00');
  const phone = new Phone();
  const setup = await newAccount(phone, { memorized: pagesRange(582, 604) });
  await setup.untilSynced();
  await setup.close();
  const app = await phone.open(homeAndSettings);
  await new Home(app).ready();
  await press(app, 'open-settings');
  await app.until(() => app.screen.queryByTestId('settings-page-about') != null, 'Settings');
  await press(app, 'settings-page-about');
  await app.until(() => app.screen.queryByText('Terms of Service') != null, 'About');
  return { phone, app };
}

it('[SET-5] Revisely Dev: About → Licences opens the Quran Muaalem License in full, with no network', async () => {
  const { phone, app } = await openAbout();
  try {
    await phone.goOffline();
    expect(app.screen.getByTestId('settings-licences')).toBeTruthy();
    await press(app, 'settings-licences');
    await app.until(() => app.screen.queryByTestId('settings-licences-text') != null, 'the licence');
    const text = flatText(app.screen.getByTestId('settings-licences-text'));
    expect(text).toContain('QURAN MUAALEM LICENSE (QML)');
    expect(text).toContain('Every distribution of the Work or Derivative Works must reproduce this License in full, including Appendix A.');
    expect(text).toContain('هذا المعلّم القرآني نموذج ذكاء اصطناعي قد يخطئ');
    expect(text).toContain('END OF TERMS AND CONDITIONS');
    expect(text).toContain('SPDX identifier for this License: LicenseRef-QML-1.0');
  } finally {
    await app.close();
  }
});

it('[SET-5] the store app has no Licences row until on-device Recite ships', async () => {
  mockDev.on = false;
  const { app } = await openAbout();
  try {
    expect(app.screen.queryByTestId('settings-licences')).toBeNull();
    expect(app.screen.queryByText('Licences')).toBeNull();
  } finally {
    await app.close();
  }
});

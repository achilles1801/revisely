// Web links (BEHAVIOUR.md LINK-1): Settings' Privacy Policy and Terms of Service, and Revo's "How your data is used",
// open in the app's own browser. On a phone that can hand no link to a browser, as App Review's iPhone couldn't
// (1.0.4, Nov 18 2026: Linking.openURL rejected "Unable to open URL", and both taps did nothing), each shows its address
// with Copy instead. Contact support does the same with the email address.

import type { ReactElement } from 'react';
import { advance, setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp, revoMomentSeen } from '../harness/phone';

/**
 * The in-app browser (expo-web-browser: SFSafariViewController, Custom Tabs). It opens what it's given, or, on a phone
 * that can't, refuses as the native module does.
 */
type InAppBrowser = { opened: string[]; refuses: boolean };
const inAppBrowser = (): InAppBrowser => (globalThis as unknown as { __scenarioBrowser: InAppBrowser }).__scenarioBrowser;
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: async (url: string) => {
    const browser = (globalThis as unknown as { __scenarioBrowser: { opened: string[]; refuses: boolean } }).__scenarioBrowser;
    if (browser.refuses) throw Object.assign(new Error('No matching browser activity found'), { code: 'ERR_WEB_BROWSER' });
    browser.opened.push(url);
    return { type: 'opened' };
  },
}));

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

/** A tester's account (Revo is theirs), Revo off and its moment seen, the app open on Home. */
async function tester(phone: Phone): Promise<OpenApp> {
  setZone(ZONES.amman);
  setNow('2026-11-18 06:20');
  let app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  revoMomentSeen(phone, uid);
  app = await phone.open(homeAndSettings);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  await new Home(app).ready();
  return app;
}

const tap = async (app: OpenApp, testID: string) => {
  await app.until(() => app.screen.queryByTestId(testID) != null, `${testID} to show`);
  await app.act(async () => {
    app.mods.rtl.fireEvent.press(app.screen.getByTestId(testID));
  });
};

/** A tap on a link or a row by its words, a moment after the last tap (the clock stands still otherwise). */
const tapText = async (app: OpenApp, text: string) => {
  advance(2_000);
  await app.until(() => app.screen.queryByText(text) != null, `“${text}” to show`);
  await app.act(async () => {
    app.mods.rtl.fireEvent.press(app.screen.getByText(text));
  });
  await app.idle(20);
};

type Alerted = { title: string; body: string; buttons: { text: string; onPress?: () => void }[] };

it('[LINK-1] Privacy Policy, Terms of Service and Revo’s “How your data is used” open in the app’s own browser; on a phone that can hand no link to a browser (App Review’s iPhone) each shows its address with Copy, and so does Contact support’s email', async () => {
  (globalThis as unknown as { __scenarioBrowser: InAppBrowser }).__scenarioBrowser = { opened: [], refuses: false };
  const phone = new Phone('phone');
  const app = await tester(phone);
  const RN = app.mods.require<typeof import('react-native')>('react-native');
  const alerts: Alerted[] = [];
  jest.spyOn(RN.Alert, 'alert').mockImplementation((title, body, buttons) => {
    alerts.push({ title, body: body ?? '', buttons: (buttons ?? []) as Alerted['buttons'] });
  });
  const clipboard = app.mods.require<typeof import('../../../src/lib/clipboard')>('src/lib/clipboard');
  const copied: string[] = [];
  jest.spyOn(clipboard, 'copyText').mockImplementation((text) => {
    copied.push(text);
  });
  const openURL = RN.Linking.openURL as jest.Mock;
  openURL.mockReset();
  openURL.mockResolvedValue(true);

  // A phone that opens links: each page in the app's own browser, never handed to the phone's.
  await tap(app, 'open-settings');
  await tapText(app, 'Privacy Policy');
  await app.until(() => inAppBrowser().opened.length === 1, 'the privacy policy in the app’s browser');
  await tapText(app, 'Terms of Service');
  await app.until(() => inAppBrowser().opened.length === 2, 'the terms in the app’s browser');
  expect(inAppBrowser().opened).toEqual(['https://revisely.app/privacy/', 'https://revisely.app/terms/']);
  expect(openURL).not.toHaveBeenCalled();
  expect(alerts).toEqual([]);

  // App Review's iPhone: neither the in-app browser nor the phone's takes a link.
  inAppBrowser().refuses = true;
  openURL.mockImplementation(async (url: string) => {
    throw new Error(`Unable to open URL: ${url}`);
  });
  await tapText(app, 'Privacy Policy');
  await app.until(() => alerts.length === 1, 'the privacy policy’s address');
  expect(openURL).toHaveBeenCalledWith('https://revisely.app/privacy/');
  expect(alerts[0].title).toBe('Couldn’t open the page');
  expect(alerts[0].body).toContain('https://revisely.app/privacy/');
  expect(alerts[0].buttons.map((b) => b.text)).toEqual(['Copy', 'OK']);
  alerts[0].buttons[0].onPress?.();
  expect(copied).toEqual(['https://revisely.app/privacy/']);

  // Contact support: no email app takes it either, so its address shows to copy.
  await tapText(app, 'Contact support');
  await app.until(() => alerts.length === 2, 'the support address');
  expect(alerts[1].title).toBe('Couldn’t open an email app');
  expect(alerts[1].body).toContain('support@revisely.app');
  alerts[1].buttons[0].onPress?.();
  expect(copied).toEqual(['https://revisely.app/privacy/', 'support@revisely.app']);

  // Revo's opt-in: "How your data is used" (what App Review tapped first) shows its address too.
  await app.act(async () => {
    (app.mods.require<any>('src/lib/revo/open') as { openRevo: (r?: object) => void }).openRevo({ view: 'optin' });
  });
  await app.until(() => app.screen.queryByTestId('revo-optin') != null, 'Revo’s opt-in');
  await tapText(app, 'How your data is used');
  await app.until(() => alerts.length === 3, 'the Revo privacy page’s address');
  expect(alerts[2].body).toContain('https://revisely.app/privacy/#revo');
  alerts[2].buttons[0].onPress?.();
  expect(copied[2]).toBe('https://revisely.app/privacy/#revo');

  // The phone opens links again: the same link goes to the app's own browser.
  inAppBrowser().refuses = false;
  await tapText(app, 'How your data is used');
  await app.until(() => inAppBrowser().opened.length === 3, 'Revo’s privacy page in the app’s browser');
  expect(inAppBrowser().opened[2]).toBe('https://revisely.app/privacy/#revo');
  expect(alerts).toHaveLength(3);
  await app.close();
});

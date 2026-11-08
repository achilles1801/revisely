// The help buttons (BEHAVIOUR.md HELP-1, HELP-2): a ? on Home's Today post opens "How Home works"; hiding
// the buttons takes them away for good on this phone, with Undo, until Settings → Support brings them back.
// Testers only for now: the owner marks the account (set-preview-tester.js) while the app is closed.

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { flatText, Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp } from '../harness/phone';

/** Home, with the real Settings screen behind its gear (Home's stack holds both). */
function homeAndSettings(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const Dashboard = req<any>('src/screens/main/DashboardScreen').default;
  const Settings = req<any>('src/screens/main/SettingsScreen').default;
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
      { ref: nav.navigation },
      h(
        Stack.Navigator,
        { screenOptions: { headerShown: false, animation: 'none' } },
        h(Stack.Screen, { name: 'Dashboard', component: Dashboard }),
        h(Stack.Screen, { name: 'Settings', component: Settings }),
        ...['ActiveRevision', 'PlanEdit', 'PlanDayEdit', 'Memorization', 'Activity', 'ActivityAll', 'ActivityDay', 'Insights'].map(
          (name) => h(Stack.Screen, { key: name, name, component: Elsewhere }),
        ),
      ),
    ),
  );
}

async function account(tester: boolean): Promise<Phone> {
  setZone(ZONES.london);
  setNow('2026-11-03 19:00');
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: pagesRange(542, 604), user: { dailyPageCapacity: 20 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  if (tester) await markPreviewTester(uid);
  return phone;
}

async function openHome(phone: Phone, tester: boolean): Promise<{ app: OpenApp; home: Home }> {
  const app = await phone.open(homeAndSettings);
  if (tester) await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const home = new Home(app);
  await home.ready();
  return { app, home };
}

const helpButton = (app: OpenApp) => app.screen.queryByTestId('help-button-home');

async function press(app: OpenApp, testID: string): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  const el = app.screen.getByTestId(testID);
  await app.act(async () => {
    fireEvent.press(el);
  });
  await app.idle(50);
}

describe('the help on Home', () => {
  it('[HELP-1] a tester’s ? on the Today post opens How Home works: four short topics, Ask Revo, Hide help buttons and Done', async () => {
    const phone = await account(true);
    const { app } = await openHome(phone, true);
    await app.until(() => helpButton(app) != null, 'the ? on the Today post');

    await press(app, 'help-button-home');
    await app.until(() => app.screen.queryByTestId('help-sheet-home') != null, 'How Home works');
    expect(app.screen.queryByText('How Home works')).not.toBeNull();
    const topics = app.screen.queryAllByTestId(/^help-topic-/).map((t) => t.props.testID);
    expect(topics).toEqual(['help-topic-home.today', 'help-topic-home.missed', 'help-topic-home.streak', 'help-topic-home.memorized']);
    const text = flatText(app.screen.getByTestId('help-sheet-home'));
    // The labels it names are the ones Home shows; no page numbers (NAME-1).
    expect(text).toContain('Jump to…');
    expect(text).toContain('Edit schedule');
    expect(text).toContain('Add to today');
    expect(text).not.toMatch(/\bp{1,2}\.\s?\d|\bpages? \d/);
    // A tester has Revo, so Ask Revo is offered; and the way to hide the buttons.
    expect(app.screen.queryByTestId('help-ask-revo')).not.toBeNull();
    expect(app.screen.queryByTestId('help-hide')).not.toBeNull();

    // Done closes it and the ? stays.
    await press(app, 'help-done');
    await app.until(() => app.screen.queryByTestId('help-sheet-home') == null, 'the sheet to close');
    expect(helpButton(app)).not.toBeNull();
    await app.close();
  });

  it('[HELP-1] an account that isn’t a tester has no ?', async () => {
    const phone = await account(false);
    const { app } = await openHome(phone, false);
    await app.idle(300);
    expect(helpButton(app)).toBeNull();
    await app.close();
  });

  it('[HELP-2] Hide help buttons takes every ? away, with Undo; hidden they stay hidden at the next launch, until Settings → Support → Help buttons', async () => {
    const phone = await account(true);
    let { app } = await openHome(phone, true);
    await app.until(() => helpButton(app) != null, 'the ? on the Today post');

    // Hidden from Home's sheet: gone at once, and Home says how to bring them back, with Undo.
    await press(app, 'help-button-home');
    await press(app, 'help-hide');
    await app.until(() => helpButton(app) == null, 'the ? to go');
    expect(flatText(app.screen.getByTestId('undo-toast-bar'))).toContain('Help buttons hidden. Settings → Support brings them back.');
    await press(app, 'undo-toast-action');
    await app.until(() => helpButton(app) != null, 'Undo to bring the ? back');

    // Hidden again, and the app closed and opened: still hidden.
    await press(app, 'help-button-home');
    await press(app, 'help-hide');
    await app.until(() => helpButton(app) == null, 'the ? to go');
    await app.close();
    ({ app } = await openHome(phone, true));
    await app.idle(300);
    expect(helpButton(app)).toBeNull();

    // Settings → Support → Help buttons: off, and turned on it brings them back.
    await press(app, 'open-settings');
    await app.until(() => app.screen.queryByTestId('settings-help-buttons') != null, 'the Help buttons switch');
    const { fireEvent } = app.mods.rtl;
    expect(app.screen.getByTestId('settings-help-buttons').props.value).toBe(false);
    await app.act(async () => {
      fireEvent(app.screen.getByTestId('settings-help-buttons'), 'valueChange', true);
    });
    await app.until(() => app.screen.getByTestId('settings-help-buttons').props.value === true, 'the switch to turn on');
    const { navigation } = app.mods.require<{ navigation: { current: { goBack: () => void } } }>('./navRef');
    await app.act(async () => {
      navigation.current.goBack();
    });
    await app.until(() => helpButton(app) != null, 'the ? back on Home');
    await app.close();
  });
});

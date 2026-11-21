// The Ramadan theme (BEHAVIOUR.md THEME-1, Revisely Dev): Settings → Appearance → Ramadan theme, off until turned on and
// kept on the phone, dresses Home (falling light, lanterns, a crescent) and never a session's page. The store app has no
// switch and shows nothing, whatever the phone has stored.

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp, revoMomentSeen } from '../harness/phone';

const DECORATIONS = ['ramadan-sky', 'ramadan-lanterns', 'ramadan-crescent'];
/** The decorations are hidden from VoiceOver, so queries must look at hidden elements too. */
const HIDDEN = { includeHiddenElements: true };

/** Home, with the real Settings and session behind it, in the store app or Revisely Dev. */
function homeStack(dev: boolean) {
  return (mods: Booted): ReactElement => {
    const { React, require: req } = mods;
    if (dev) req<{ default: { expoConfig: { extra: Record<string, unknown> } } }>('expo-constants').default.expoConfig.extra.variant = 'dev';
    const { NavigationContainer } = req<any>('@react-navigation/native');
    const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
    const Dashboard = req<any>('src/screens/main/DashboardScreen').default;
    const Settings = req<any>('src/screens/main/SettingsScreen').default;
    const Session = req<any>('src/screens/revision/ActiveRevisionScreen').default;
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
          h(Stack.Screen, { name: 'Dashboard', component: Dashboard }),
          h(Stack.Screen, { name: 'Settings', component: Settings }),
          h(Stack.Screen, { name: 'ActiveRevision', component: Session }),
          ...['Activity', 'ActivityDay', 'PlanEdit', 'PlanDayEdit', 'Memorization', 'ActivityAll', 'Insights', 'QuranReader', 'JournalEntry', 'PagesByStrength', 'ListenBack'].map(
            (name) => h(Stack.Screen, { key: name, name, component: Elsewhere }),
          ),
        ),
      ),
    );
  };
}

async function account(): Promise<Phone> {
  setZone(ZONES.london);
  setNow('2026-11-21 19:00');
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: pagesRange(542, 604), user: { dailyPageCapacity: 20 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  revoMomentSeen(phone, uid);
  return phone;
}

async function openHome(phone: Phone, dev: boolean): Promise<{ app: OpenApp; home: Home }> {
  const app = await phone.open(homeStack(dev));
  const home = new Home(app);
  await home.ready();
  return { app, home };
}

const shown = (app: OpenApp) => DECORATIONS.filter((id) => app.screen.queryByTestId(id, HIDDEN) != null);

async function navigate(app: OpenApp, how: (nav: { navigate: (name: string) => void; goBack: () => void }) => void): Promise<void> {
  const { navigation } = app.mods.require<{ navigation: { current: any } }>('./navRef');
  await app.act(async () => {
    how(navigation.current);
  });
  await app.idle(50);
}

describe('the Ramadan theme', () => {
  it('[THEME-1] in Revisely Dev it is off until Settings → Appearance turns it on; then Home has its falling light, lanterns and crescent, kept on the phone, and a session’s page none of it', async () => {
    const phone = await account();
    let { app, home } = await openHome(phone, true);
    // Off by default: nothing drawn, nothing stored.
    await app.idle(300);
    expect(shown(app)).toEqual([]);
    expect(phone.storage.has('@revisely_ramadan_theme:v1')).toBe(false);

    // Settings → Appearance → Ramadan theme.
    await navigate(app, (n) => n.navigate('Settings'));
    await app.until(() => app.screen.queryByTestId('settings-ramadan-theme') != null, 'the Ramadan theme switch');
    expect(app.screen.getByTestId('settings-ramadan-theme').props.value).toBe(false);
    const { fireEvent } = app.mods.rtl;
    await app.act(async () => {
      fireEvent(app.screen.getByTestId('settings-ramadan-theme'), 'valueChange', true);
    });
    await app.until(() => app.screen.getByTestId('settings-ramadan-theme').props.value === true, 'the switch to turn on');
    await navigate(app, (n) => n.goBack());
    await app.until(() => shown(app).length === DECORATIONS.length, 'Home’s decorations');
    // Decorations only: none of it is a control or read by VoiceOver.
    for (const id of DECORATIONS) {
      const el = app.screen.getByTestId(id, HIDDEN);
      expect(el.props.pointerEvents).toBe('none');
      expect(el.props.accessibilityElementsHidden).toBe(true);
    }

    // A revision session's page: none of it. (Home stays mounted under it in the stack, so the tree still holds Home's
    // three and nothing more.)
    const ramadanIds = () => app.screen.queryAllByTestId(/^ramadan-/, HIDDEN).map((el) => el.props.testID);
    expect(ramadanIds().sort()).toEqual([...DECORATIONS].sort());
    await home.startSession();
    await app.idle(200);
    expect(app.screen.queryByTestId('session-page', HIDDEN)).not.toBeNull();
    expect(ramadanIds().sort()).toEqual([...DECORATIONS].sort());
    await app.close();

    // Kept on the phone: the next launch has it.
    ({ app, home } = await openHome(phone, true));
    await app.until(() => shown(app).length === DECORATIONS.length, 'the decorations after a relaunch');
    await app.close();
  });

  it('[THEME-1] the store app has no switch and shows nothing, even with it stored on', async () => {
    const phone = await account();
    phone.storage.set('@revisely_ramadan_theme:v1', '1');
    const { app } = await openHome(phone, false);
    await app.idle(300);
    expect(shown(app)).toEqual([]);
    await navigate(app, (n) => n.navigate('Settings'));
    await app.until(() => app.screen.queryByTestId('accent-row') != null, 'Settings');
    expect(app.screen.queryByTestId('settings-ramadan-theme')).toBeNull();
    await app.close();
  });
});

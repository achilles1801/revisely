// The Ramadan theme (BEHAVIOUR.md THEME-1 to THEME-4, Revisely Dev): On until Settings → Appearance → Ramadan theme
// chooses Auto or Off (Majd, Nov 22 2026: "yes ramadan theme as default for dev too"), the choice kept on the phone. It
// dresses Home (falling light, lanterns, a crescent), Settings' title and every sheet, and never a session's page or a
// sheet over it. Auto follows the dates config/app can correct. The store app has no row and shows nothing, whatever
// the phone has stored.

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { deleteServerFields, setServerDoc } from '../harness/serverDocs';
import { newAccount, pagesRange } from '../harness/account';
import { Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp, ramadanIntroSeen, revoMomentSeen } from '../harness/phone';

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
          ...['Activity', 'ActivityDay', 'PlanEdit', 'PlanDayEdit', 'Memorization', 'ActivityAll', 'Insights', 'QuranReader', 'PagesByStrength', 'ListenBack'].map(
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
  ramadanIntroSeen(phone);
  return phone;
}

/** A Revisely Dev phone on day 12 of Ramadan (Settings → Testing → Ramadan dates), five pages a day. */
async function ramadanDay12(): Promise<{ phone: Phone; uid: string }> {
  setZone(ZONES.london);
  setNow('2026-11-21 19:00');
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: pagesRange(542, 604), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  revoMomentSeen(phone, uid);
  ramadanIntroSeen(phone);
  phone.storage.set('@revisely_ramadan_test:v1', 'day12');
  return { phone, uid };
}

async function openHome(phone: Phone, dev: boolean): Promise<{ app: OpenApp; home: Home }> {
  const app = await phone.open(homeStack(dev));
  const home = new Home(app);
  await home.ready();
  return { app, home };
}

const shown = (app: OpenApp) => DECORATIONS.filter((id) => app.screen.queryByTestId(id, HIDDEN) != null);
const sheetLights = (app: OpenApp) => app.screen.queryAllByTestId('ramadan-sheet-lights', HIDDEN).length;

async function tap(app: OpenApp, testID: string): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId(testID));
  });
  await app.idle(50);
}

async function navigate(app: OpenApp, how: (nav: { navigate: (name: string) => void; goBack: () => void }) => void): Promise<void> {
  const { navigation } = app.mods.require<{ navigation: { current: any } }>('./navRef');
  await app.act(async () => {
    how(navigation.current);
  });
  await app.idle(50);
}

describe('the Ramadan theme', () => {
  it('[THEME-1] in Revisely Dev it is On until Settings → Appearance turns it off: Home has its falling light, lanterns and crescent, a session’s page none of it, and Off is kept on the phone', async () => {
    const phone = await account();
    let { app, home } = await openHome(phone, true);
    // On by default: drawn with nothing stored (no choice made on this phone).
    await app.until(() => shown(app).length === DECORATIONS.length, 'Home’s decorations');
    expect(phone.storage.has('@revisely_ramadan_theme:v1')).toBe(false);
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

    // Settings → Appearance → Ramadan theme, shown On: Off, and Home has none of it.
    ({ app, home } = await openHome(phone, true));
    await navigate(app, (n) => (n.navigate as (name: string, params?: object) => void)('Settings', { page: 'appearance' }));
    await app.until(() => app.screen.queryByTestId('settings-ramadan-theme') != null, 'the Ramadan theme row');
    expect(app.screen.getByTestId('settings-ramadan-on').props.accessibilityLabel).toBe('On, selected');
    await tap(app, 'settings-ramadan-off');
    await app.until(() => app.screen.getByTestId('settings-ramadan-off').props.accessibilityLabel === 'Off, selected', 'Off');
    await navigate(app, (n) => n.goBack());
    await app.until(() => shown(app).length === 0, 'Home without the decorations');
    await app.close();
    expect(phone.storage.get('@revisely_ramadan_theme:v1')).toBe('off');

    // Kept on the phone: the next launch stays off.
    ({ app, home } = await openHome(phone, true));
    await app.idle(300);
    expect(shown(app)).toEqual([]);
    await app.close();
  });

  it('[THEME-2] Auto shows it from two weeks before Ramadan through Eid’s third day, on the dates config/app can correct', async () => {
    const phone = await account(); // 21 November 2026: 79 days before the expected 1 Ramadan (8 February 2027)
    phone.storage.set('@revisely_ramadan_theme:v1', 'auto');
    try {
      let { app } = await openHome(phone, true);
      await app.idle(300);
      expect(shown(app)).toEqual([]);
      // Settings says when.
      await navigate(app, (n) => (n.navigate as (name: string, params?: object) => void)('Settings', { page: 'appearance' }));
      await app.until(() => app.screen.queryByText('On from 25 January to 11 March') != null, 'Auto’s span under the row');
      expect(app.screen.getByTestId('settings-ramadan-auto').props.accessibilityLabel).toBe('Auto, selected');
      await app.close();

      // Two weeks before 1 Ramadan: dressed.
      setNow('2027-01-25 10:00');
      ({ app } = await openHome(phone, true));
      await app.until(() => shown(app).length === DECORATIONS.length, 'Home’s decorations from 25 January');
      await app.close();

      // The moon is sighted a day later: config/app moves the month, the phone takes it and keeps it, and 25 January is
      // now a day early.
      await setServerDoc('config/app', { ramadan: { start: '2027-02-09', eid: '2027-03-10' } });
      ({ app } = await openHome(phone, true));
      await app.until(() => shown(app).length === 0, 'the corrected dates to leave 25 January plain');
      await app.close();
      expect(JSON.parse(phone.storage.get('@revisely_ramadan_dates:v1') ?? 'null')).toEqual({ start: '2027-02-09', eid: '2027-03-10' });

      // Eid's third day on the corrected dates (12 March): still dressed; the day after, plain again.
      setNow('2027-03-12 10:00');
      ({ app } = await openHome(phone, true));
      await app.until(() => shown(app).length === DECORATIONS.length, 'Eid’s third day');
      await app.close();
      setNow('2027-03-13 10:00');
      ({ app } = await openHome(phone, true));
      await app.idle(300);
      expect(shown(app)).toEqual([]);
      await app.close();
    } finally {
      await deleteServerFields('config/app', ['ramadan']);
    }
  });

  it('[THEME-3] [THEME-4] while it shows, Settings has a crescent by its title and “· Ramadan” on Appearance, and a sheet has string lights, but not one over a session', async () => {
    const phone = await account();
    let { app, home } = await openHome(phone, true);
    await app.until(() => shown(app).length === DECORATIONS.length, 'Home’s decorations');

    // A sheet on Home (its help): string lights along the top edge, a decoration like the rest.
    expect(sheetLights(app)).toBe(0);
    await tap(app, 'help-button-home');
    await app.until(() => sheetLights(app) === 1, 'the help sheet’s string lights');
    const lights = app.screen.getByTestId('ramadan-sheet-lights', HIDDEN);
    expect(lights.props.pointerEvents).toBe('none');
    expect(lights.props.accessibilityElementsHidden).toBe(true);
    await app.close();

    // A session's sheet (its Pages): none.
    ({ app, home } = await openHome(phone, true));
    const session = await home.startSession();
    await session.openPages();
    await app.idle(100);
    expect(sheetLights(app)).toBe(0);
    await app.close();

    // Settings' first level: a crescent by the title (Home's is still mounted underneath), and the Appearance row ends
    // with Ramadan.
    ({ app, home } = await openHome(phone, true));
    expect(app.screen.queryAllByTestId('ramadan-crescent', HIDDEN)).toHaveLength(1);
    await navigate(app, (n) => n.navigate('Settings'));
    await app.until(() => app.screen.queryByTestId('settings-page-appearance') != null, 'Settings');
    await app.until(() => app.screen.queryAllByTestId('ramadan-crescent', HIDDEN).length === 2, 'the crescent by Settings’ title');
    expect(app.screen.getByText(/^(Light|Dark|System) · (Indigo|Crimson|Jade) · Ramadan$/)).toBeTruthy();
    await app.close();

    // Off: neither.
    phone.storage.set('@revisely_ramadan_theme:v1', 'off');
    ({ app, home } = await openHome(phone, true));
    await navigate(app, (n) => n.navigate('Settings'));
    await app.until(() => app.screen.queryByTestId('settings-page-appearance') != null, 'Settings');
    await app.idle(100);
    expect(app.screen.queryAllByTestId('ramadan-crescent', HIDDEN)).toHaveLength(0);
    expect(app.screen.queryByText(/· Ramadan$/)).toBeNull();
    await app.close();
  });

  it('[THEME-7] the theme’s one card shows the first time it does on this phone, then never again', async () => {
    const phone = await account();
    phone.storage.delete('@revisely_ramadan_intro:v1');
    let { app } = await openHome(phone, true);
    await app.until(() => app.screen.queryByTestId('ramadan-intro-done') != null, 'the Ramadan theme’s card');
    expect(app.screen.getByText('Ramadan theme')).toBeTruthy();
    expect(app.screen.getByText(/Turn it off any time in Settings → Appearance/)).toBeTruthy();
    await tap(app, 'ramadan-intro-done');
    await app.until(() => app.screen.queryByTestId('ramadan-intro-done') == null, 'the card to close');
    await app.close();
    expect(phone.storage.get('@revisely_ramadan_intro:v1')).toBe('1');
    ({ app } = await openHome(phone, true));
    await app.idle(300);
    expect(app.screen.queryByTestId('ramadan-intro-done')).toBeNull();
    await app.close();
  });

  it('[THEME-7] the end card in Ramadan: gold light and lanterns for the confetti, the day of the month, and the khatmah card once', async () => {
    const { phone, uid } = await ramadanDay12();
    // Everything else read since 1 Ramadan (10 November, on these test dates): with today's five pages, all 604.
    const pages = Array.from({ length: 604 }, (_, i) => i + 1);
    await setServerDoc(`users/${uid}/readingSessions/ramadan-read`, {
      date: '2026-11-15',
      startedAt: Date.parse('2026-11-15T20:00:00Z'),
      endedAt: Date.parse('2026-11-15T21:00:00Z'),
      durationSeconds: 3600,
      mode: 'stopwatch',
      targetSeconds: null,
      pages,
      pagesVisited: [],
    });
    let { app, home } = await openHome(phone, true);
    let session = await home.startSession();
    await session.swipeThrough();
    await app.until(() => session.endCard().includes('Day 12 of Ramadan'), 'the end card’s day of Ramadan');
    expect(app.screen.queryByTestId('ramadan-end-card', HIDDEN)).not.toBeNull();
    expect(app.screen.queryByTestId('confetti', HIDDEN)).toBeNull();
    await app.until(() => app.screen.queryByTestId('session-end-khatmah') != null, 'the khatmah card');
    expect(session.endCard()).toContain('You’ve been through the whole Qur’an this Ramadan');
    await session.back();
    await app.close();
    // Kept as shown for this Ramadan (its 1 Ramadan, on these test dates).
    expect(phone.storage.get('@revisely_ramadan_khatmah:v1')).toBe('2026-11-10');

    // Another session's end the same day (revising ahead): the day of Ramadan again, the khatmah card not.
    ({ app, home } = await openHome(phone, true));
    session = await home.openAhead();
    await session.swipeThrough();
    await app.until(() => session.endCard().includes('Day 12 of Ramadan'), 'the end card’s day of Ramadan');
    await app.idle(300);
    expect(app.screen.queryByTestId('session-end-khatmah')).toBeNull();
    await session.back();
    await app.close();

    // Off: the confetti as ever, no day of Ramadan.
    phone.storage.set('@revisely_ramadan_theme:v1', 'off');
    setNow('2026-11-23 19:00');
    ({ app, home } = await openHome(phone, true));
    session = await home.startSession();
    await session.swipeThrough();
    await app.until(() => session.endCard().includes('Revision complete'), 'the end card');
    expect(app.screen.queryByTestId('ramadan-end-card', HIDDEN)).toBeNull();
    expect(app.screen.queryByTestId('confetti', HIDDEN)).not.toBeNull();
    expect(session.endCard()).not.toContain('Ramadan');
    await app.close();
  });

  it('[THEME-1] the store app has no switch and shows nothing, even with it stored on', async () => {
    const phone = await account();
    phone.storage.set('@revisely_ramadan_theme:v1', '1');
    const { app } = await openHome(phone, false);
    await app.idle(300);
    expect(shown(app)).toEqual([]);
    await navigate(app, (n) => (n.navigate as (name: string, params?: object) => void)('Settings', { page: 'appearance' }));
    await app.until(() => app.screen.queryByTestId('accent-row') != null, 'Settings');
    expect(app.screen.queryByTestId('settings-ramadan-theme')).toBeNull();
    await app.close();
  });
});

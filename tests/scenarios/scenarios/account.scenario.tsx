// The Account page's new look (BEHAVIOUR.md ACCOUNT-4 to ACCOUNT-7; Majd approved the boards on Nov 26 2026), with the
// switch on as Revisely Dev has it (lib/release/accountDesign): Home's picture (the first letter here) opens Account; the
// figures count every page revised and the longest streak; badges climb with pages revised; a new badge is shown once,
// on the session's end card or, when the session is left before it, on Account.

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { flatText, Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp } from '../harness/phone';

/** Home with the real Settings and session behind it, the Account page's new look switched on. */
function homeAndSettings(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  req<typeof import('../../../src/lib/release/accountDesign')>('src/lib/release/accountDesign').setAccountDesignReleasedForTests(true);
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
        ...['PlanEdit', 'PlanDayEdit', 'Memorization', 'ActivityAll', 'Activity', 'ActivityDay', 'Insights', 'QuranReader', 'ListenBack'].map(
          (name) => h(Stack.Screen, { key: name, name, component: Elsewhere }),
        ),
      ),
    ),
  );
}

const text = (app: OpenApp, testID: string): string => {
  const el = app.screen.queryByTestId(testID);
  return el ? flatText(el) : '';
};

async function press(app: OpenApp, testID: string): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  const el = app.screen.getByTestId(testID);
  await app.act(async () => {
    fireEvent.press(el);
  });
  await app.idle(100);
}

async function goBack(app: OpenApp): Promise<void> {
  const nav = app.mods.require<{ navigation: { current: { goBack: () => void } | null } }>('./navRef');
  await app.act(async () => nav.navigation.current?.goBack());
  await app.idle(100);
}

async function openHome(): Promise<{ phone: Phone; app: OpenApp; home: Home }> {
  setZone(ZONES.london);
  setNow('2026-11-03 19:00');
  const phone = new Phone();
  const first = await newAccount(phone, { memorized: pagesRange(542, 604), user: { dailyPageCapacity: 20 } });
  await first.untilSynced();
  await first.close();
  const app = await phone.open(homeAndSettings);
  const home = new Home(app);
  await home.ready();
  return { phone, app, home };
}

it('[ACCOUNT-4] [ACCOUNT-5] [ACCOUNT-6] [ACCOUNT-7] a 20-page session wins Bronze I on its end card, once; Home\'s picture then wears it and opens Account, with every page counted and the next badge', async () => {
  const { phone, app, home } = await openHome();

  // A new account: the first letter of its name, no badge yet.
  await app.until(() => app.screen.queryByTestId('today-picture-mark-initial') != null, 'the picture on Home');
  expect(text(app, 'today-picture-mark-initial')).toBe('S');
  expect(app.screen.queryByTestId('today-picture-mark-badge')).toBeNull();

  // Today's 20 pages, the last onto the end card: past 10 pages, Bronze I, shown on the end card.
  const session = await home.startSession();
  await session.ready();
  await session.swipeThrough();
  await app.until(() => app.screen.queryByTestId('session-end-badge') != null, 'the new badge on the end card');
  expect(text(app, 'session-end-badge')).toContain('New badge · Bronze I');
  expect(text(app, 'session-end-badge')).toContain('10 pages revised');
  await session.back();
  await home.ready();

  // Home's picture wears the badge; a tap opens Account.
  await app.until(() => app.screen.queryByTestId('today-picture-mark-badge') != null, 'the badge on Home’s picture');
  await press(app, 'today-picture');
  await app.until(() => app.screen.queryByTestId('account-header') != null, 'Account to open');
  await app.until(() => text(app, 'account-pages-revised').startsWith('20'), 'pages revised to load');
  expect(text(app, 'account-pages-revised')).toBe('20 pages revised');
  await app.until(() => text(app, 'account-longest-streak').startsWith('1 day'), 'the longest streak');
  // Shown once: the end card had it, so Account doesn't again, and points at the next badge.
  expect(text(app, 'account-bar-caption')).toBe('30 more for Bronze II');
  expect(app.screen.queryByTestId('account-name-badge')).not.toBeNull();
  // No email under the name.
  expect(text(app, 'account-header')).not.toContain(phone.email!);

  // Badges: every badge, the one won with its day, the next with how many pages are left.
  await press(app, 'account-milestones');
  await app.until(() => app.screen.queryByTestId('badges-sheet') != null, 'the Badges sheet');
  expect(text(app, 'badge-10-status')).toBe('Nov 3, 2026');
  expect(text(app, 'badge-50-status')).toBe('30 to go');
  expect(text(app, 'badge-100000-status')).toBe('99,980 to go');
});

it('[ACCOUNT-6] a badge won in a session left before its end card shows on Account the next time it opens, once', async () => {
  const { app, home } = await openHome();

  // 12 of today's 20 pages, then back to Home: Bronze I is won, the end card never seen.
  const session = await home.startSession();
  await session.ready();
  await session.swipeThrough(12);
  await session.back();
  await home.ready();

  await press(app, 'today-picture');
  await app.until(() => text(app, 'account-pages-revised').startsWith('12'), 'Account with 12 pages revised');
  await app.until(() => text(app, 'account-bar-caption') === 'New badge · Bronze I', 'the badge moment on Account');

  // Once: the next time Account opens, the bar points at the next badge.
  await goBack(app);
  await home.ready();
  await press(app, 'today-picture');
  await app.until(() => text(app, 'account-pages-revised').startsWith('12'), 'Account again');
  expect(text(app, 'account-bar-caption')).toBe('38 more for Bronze II');
});

it('[ACCOUNT-8] the sign-in photo is the picture on Home and Account; Remove photo, from a tap on it, goes back to the first letter everywhere', async () => {
  setZone(ZONES.london);
  setNow('2026-11-03 19:00');
  const phone = new Phone();
  const first = await newAccount(phone, { memorized: pagesRange(542, 604), user: { dailyPageCapacity: 20 } });
  await first.untilSynced();
  // A photo on the sign-in profile, as Google's would be.
  const authMod = first.mods.require<typeof import('firebase/auth')>('firebase/auth');
  await first.act(async () => {
    await authMod.updateProfile(authMod.getAuth().currentUser!, { photoURL: 'https://example.com/picture.jpg' });
  });
  await first.close();

  const app = await phone.open(homeAndSettings);
  const home = new Home(app);
  await home.ready();
  await app.until(() => app.screen.queryByTestId('today-picture-mark-photo') != null, 'the photo on Home');

  await press(app, 'today-picture');
  await app.until(() => app.screen.queryByTestId('account-picture-photo') != null, 'the photo on Account');
  // This phone has no photo picker and the account no Google photo: Picture offers Remove photo alone.
  await press(app, 'account-picture-button');
  await app.until(() => app.screen.queryByTestId('sheet-action-remove') != null, 'the Picture menu');
  expect(app.screen.queryByTestId('sheet-action-choose')).toBeNull();
  expect(app.screen.queryByTestId('sheet-action-google')).toBeNull();
  await press(app, 'sheet-action-remove');
  await app.until(() => app.screen.queryByTestId('account-picture-initial') != null, 'the first letter on Account', 15_000);
  const live = app.mods.require<typeof import('firebase/auth')>('firebase/auth');
  expect(live.getAuth().currentUser?.photoURL || null).toBeNull();

  await goBack(app);
  await home.ready();
  await app.until(() => app.screen.queryByTestId('today-picture-mark-initial') != null, 'the first letter on Home');
});

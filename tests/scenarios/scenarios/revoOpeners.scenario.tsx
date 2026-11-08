// Revo's first line follows where it was opened (REVO-38), on the real screens: a day in Activity
// (that day goes with the question), Activity's Overview, then Home. Revo's real backend serves the
// question (the functions emulator; only the model answers from a recording).

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester, watchFunction } from '../harness/admin';
import { setServerDoc } from '../harness/serverDocs';
import { ActivityDayView, flatText, Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp } from '../harness/phone';
import { plainText } from '../../../src/lib/passages';

/** Home, the session, Activity and a day in a stack, with Revo mounted as MainNavigator mounts it. */
function stack(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const Dashboard = req<any>('src/screens/main/DashboardScreen').default;
  const Session = req<any>('src/screens/revision/ActiveRevisionScreen').default;
  const Activity = req<any>('src/screens/activity/ActivityScreen').default;
  const ActivityDay = req<any>('src/screens/activity/ActivityDayScreen').default;
  const { ReadingTimerProvider } = req<any>('src/context/ReadingTimerContext');
  const { RevoHost } = req<any>('src/components/revo/RevoHost');
  const { navigationRef } = req<any>('src/navigation/navigationRef');
  const nav = req<{ navigation: { current: unknown } }>('./navRef');
  const Stack = createNativeStackNavigator();
  const h = React.createElement;
  const Elsewhere = () => null;
  // The app's own ref (Revo reads the route from it) and the harness's (its screens use it).
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
        h(Stack.Screen, { name: 'ActiveRevision', component: Session }),
        h(Stack.Screen, { name: 'Activity', component: Activity }),
        h(Stack.Screen, { name: 'ActivityDay', component: ActivityDay }),
        ...['Settings', 'PlanEdit', 'PlanDayEdit', 'ActivityAll', 'JournalEntry', 'Memorization', 'Insights', 'QuranReader', 'PagesByStrength', 'ListenBack'].map(
          (name) => h(Stack.Screen, { key: name, name, component: Elsewhere }),
        ),
      ),
    ),
    h(RevoHost),
  );
}

const tap = async (app: OpenApp, testID: string) => {
  await app.until(() => app.screen.queryByTestId(testID) != null, `${testID} to show`);
  await app.act(async () => {
    app.mods.rtl.fireEvent.press(app.screen.getByTestId(testID));
  });
};

it('[REVO-38] [REVO-25] Revo opened from a past day says what that day held and takes the day with the question; from the Overview, the month; from Home, today', async () => {
  setZone(ZONES.london);
  setNow('2026-11-02 10:00');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  await setServerDoc(`coachSettings/${uid}`, { revoOn: true });

  // Monday: today's five pages, revised in the session.
  app = await phone.open(stack);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  let home = new Home(app);
  await home.ready();
  const session = await home.startSession();
  await session.swipeThrough(session.pages().length);
  await session.back();
  await app.untilSynced();
  await app.close();

  // Tuesday.
  setNow('2026-11-03 10:00');
  const asks = watchFunction('revoAsk');
  try {
    app = await phone.open(stack);
    await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
    home = new Home(app);
    await home.ready();
    const nav = app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
    const greeting = async (where: string) => {
      await tap(app, 'revo-button');
      await app.until(() => app.screen.queryByTestId('revo-greeting') != null, `the greeting (${where})`);
      return plainText(String(app.screen.getByTestId('revo-greeting').props.children));
    };
    const closeRevo = async () => {
      await app.act(async () => {
        app.mods.rtl.fireEvent(app.screen.getByTestId('revo-sheet-handle'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
      });
      await app.until(() => app.screen.queryByTestId('revo-button') != null, 'the button back');
    };

    // Yesterday's day in Activity: what it held, by surah, then today's next part.
    await new ActivityDayView(app).open('2026-11-02');
    const day = await greeting('yesterday');
    expect(day).toMatch(/^Salaam\b.*\. Yesterday you revised all 5 pages, Al-Fatihah to Al-Baqarah \d+[^.]*\. Today, [^.]+ is next\.$/);
    expect(day).not.toMatch(/\bpages? \d|\bp\. ?\d/);
    expect(app.screen.queryByTestId('revo-chip-How did yesterday go?')).not.toBeNull();
    // The day goes with the question, as + would attach it; × could take it away.
    await app.until(() => app.screen.queryAllByTestId('revo-context-chip').length === 1, 'the day attached');
    expect(flatText(app.screen.getByTestId('revo-context-chip'))).toMatch(/\bYesterday · /);
    expect(app.screen.queryByTestId('revo-context-remove')).not.toBeNull();
    await app.act(async () => {
      app.mods.rtl.fireEvent.changeText(app.screen.getByTestId('revo-input'), 'How did that go?');
    });
    await tap(app, 'revo-send');
    await app.until(() => asks.sent.length === 1, 'the question to reach revoAsk');
    expect(asks.sent[0]).toMatchObject({ day: '2026-11-03', attach: { kind: 'revisionDay', day: '2026-11-02' } });
    await app.until(() => app.screen.queryAllByTestId('revo-answer').length > 0, 'the answer');
    await closeRevo();

    // Activity's Overview: the month so far (Monday out of three days), then today's next part.
    await app.act(async () => {
      nav.current.navigate('Activity');
    });
    await app.until(() => app.screen.queryByTestId('activity-v2') != null, 'Activity');
    const month = await greeting('the Overview');
    expect(month).toMatch(/^Salaam\b.*\. This month you’ve revised on 1 of 3 days, 5 pages in all\. Today, [^.]+ is next\.$/);
    expect(app.screen.queryAllByTestId('revo-context-chip')).toHaveLength(0);
    await closeRevo();

    // Home: today's line, as before.
    await app.act(async () => {
      nav.current.navigate('Dashboard');
    });
    await home.ready();
    expect(await greeting('Home')).toMatch(/^Salaam\b.*\. Today is 5 pages, starting at /);
    await app.close();
  } finally {
    asks.restore();
  }
});

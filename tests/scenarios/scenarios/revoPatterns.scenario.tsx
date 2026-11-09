// Revo is told the patterns in the account's own days (REVO-40), worked out by the app from what
// Activity and the streak read. Here, on the real screens: Tuesday and Wednesday missed, both caught
// up on Thursday through Home's "Add to today", then a question to Revo. The question goes to Revo's
// real backend (the functions emulator; only the model answers from a recording).

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester, watchFunction } from '../harness/admin';
import { setServerDoc } from '../harness/serverDocs';
import { Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp } from '../harness/phone';

/** Home and the session in a stack, with Revo mounted as MainNavigator mounts it. */
function stack(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const Dashboard = req<any>('src/screens/main/DashboardScreen').default;
  const Session = req<any>('src/screens/revision/ActiveRevisionScreen').default;
  const { ReadingTimerProvider } = req<any>('src/context/ReadingTimerContext');
  const { RevoHost } = req<any>('src/components/revo/RevoHost');
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
        ...['Settings', 'PlanEdit', 'PlanDayEdit', 'Activity', 'ActivityDay', 'ActivityAll', 'JournalEntry', 'Memorization', 'Insights', 'QuranReader', 'PagesByStrength', 'ListenBack'].map(
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

it('[REVO-40] [SESS-7] Tuesday and Wednesday missed and caught up on Thursday: Revo is told the day made up for both, with each day’s caught-up pages', async () => {
  setZone(ZONES.london);
  setNow('2026-11-02 10:00');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  await setServerDoc(`coachSettings/${uid}`, { revoOn: true });

  // Monday: its five pages, in the session.
  app = await phone.open(stack);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  let home = new Home(app);
  await home.ready();
  let session = await home.startSession();
  await session.swipeThrough(session.pages().length);
  await session.back();
  await app.untilSynced();
  await app.close();

  // Tuesday and Wednesday: nothing. Thursday: Home offers both days; added, then revised in the session.
  setNow('2026-11-05 10:00');
  const asks = watchFunction('revoAsk');
  try {
    app = await phone.open(stack);
    await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
    home = new Home(app);
    await home.ready();
    await app.until(() => home.carryOver() === 'Add to today', 'the offer to catch up');
    expect(home.catchUp()).toMatch(/^Missed 2 days · /);
    await home.tap('today-carry-over');
    await app.until(() => home.carryOver() == null, 'the offer to go');
    session = await home.startSession();
    await session.swipeThrough(session.pages().length);
    await session.back();
    await app.untilSynced();

    // A question to Revo: the context it sends carries the day facts and the pattern.
    await tap(app, 'revo-button');
    await app.until(() => app.screen.queryByTestId('revo-input') != null, 'Revo’s composer');
    await app.act(async () => {
      app.mods.rtl.fireEvent.changeText(app.screen.getByTestId('revo-input'), 'How did my week go?');
    });
    await tap(app, 'revo-send');
    await app.until(() => asks.sent.length === 1, 'the question to reach revoAsk');
    const context = (asks.sent[0] as { context: { week: Record<string, unknown>[]; patterns: Record<string, unknown>[] } }).context;
    const thursday = context.week.find((w) => w.day === '2026-11-05')!;
    expect(thursday.caughtUp).toBeGreaterThanOrEqual(3);
    // Nothing revised in their own sessions; done by Thursday's catch-up, credited to them (SESS-7).
    expect(context.week.filter((w) => w.day === '2026-11-03' || w.day === '2026-11-04').map((w) => [w.pages, w.done])).toEqual([
      [0, true],
      [0, true],
    ]);
    expect(context.patterns).toEqual([
      { kind: 'catchingUp', day: '2026-11-05', pages: thursday.caughtUp, forDays: ['2026-11-03', '2026-11-04'], keepDailyAmount: true },
    ]);
    // The server took it (an app's new fields would be refused by one that doesn't know them).
    await app.until(() => app.screen.queryAllByTestId('revo-answer').length > 0, 'the answer');
    await app.close();
  } finally {
    asks.restore();
  }
});

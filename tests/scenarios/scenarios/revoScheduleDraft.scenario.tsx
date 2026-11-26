// Revo and the schedule (BEHAVIOUR.md REVO-43, Revisely Dev; Majd, Nov 25 2026: "adding revo to edit my schedule page
// and making it so that revo can help the user make or edit their schedule"). Opened from Edit schedule, Revo starts on
// the schedule with four starters; a schedule it drafts is a card with what changes, whose button opens Edit schedule
// filled in and not saved. Nothing is saved until Save. The real Edit schedule, Revo's host and backend (the functions
// emulator); only the model's words are a stand-in (functions/src/emulator.ts).

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { getServerDoc, setServerDoc } from '../harness/serverDocs';
import { Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp } from '../harness/phone';
import { plainText } from '../../../src/lib/passages';

// Revisely Dev (the draft is Dev's only).
jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => true }));

function stack(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const Dashboard = req<any>('src/screens/main/DashboardScreen').default;
  const PlanEdit = req<any>('src/screens/main/PlanEditScreen').default;
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
  // Revo's card navigates to Home's PlanEdit: Home is this stack (as MainNavigator's Home tab holds Dashboard and PlanEdit).
  const HomeStack = () =>
    h(
      Stack.Navigator,
      { screenOptions: { headerShown: false, animation: 'none' } },
      h(Stack.Screen, { name: 'Dashboard', component: Dashboard }),
      h(Stack.Screen, { name: 'PlanEdit', component: PlanEdit }),
      ...['ActiveRevision', 'PlanDayEdit', 'Memorization', 'Settings'].map((name) => h(Stack.Screen, { key: name, name, component: Elsewhere })),
    );
  const Root = createNativeStackNavigator();
  return h(
    ReadingTimerProvider,
    null,
    h(
      NavigationContainer,
      { ref },
      h(Root.Navigator, { screenOptions: { headerShown: false, animation: 'none' } }, h(Root.Screen, { name: 'Home', component: HomeStack })),
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

/** What the model says next for this account (functions/src/emulator.ts). */
const modelSays = (uid: string, reply: object) => setServerDoc(`emulator/anthropic/accounts/${uid}`, { reply: { text: JSON.stringify(reply), stopReason: 'end_turn' } });

it('[REVO-43] Revo from Edit schedule: the schedule and four starters; its draft is a card, then Edit schedule filled in and not saved until Save', async () => {
  setZone(ZONES.amman);
  setNow('2026-11-25 10:00');
  const phone = new Phone('phone');
  // 108 pages, 10 a day: every page comes round every 11 days.
  let app = await newAccount(phone, { memorized: pagesRange(1, 108), user: { dailyPageCapacity: 10 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  await setServerDoc(`coachSettings/${uid}`, { revoOn: true });

  app = await phone.open(stack);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  await new Home(app).ready();
  const nav = app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
  await app.act(async () => {
    nav.current.navigate('Home', { screen: 'PlanEdit' });
  });
  await app.until(() => app.screen.queryByTestId('plan-edit') != null, 'Edit schedule');

  // Opened here: the schedule in Edit schedule's words, and the four starters.
  await tap(app, 'revo-button');
  await app.until(() => app.screen.queryByTestId('revo-greeting') != null, 'Revo’s first line');
  const greeting = plainText(String(app.screen.getByTestId('revo-greeting').props.children));
  expect(greeting).toContain('Your schedule is 10 pages a day: every page comes round every 11 days.');
  for (const chip of ['Make it lighter', 'Finish a round sooner', 'Rest one day a week', 'Start a new plan']) {
    expect(app.screen.queryByTestId(`revo-chip-${chip}`)).not.toBeNull();
  }

  // A starter asks; the answer drafts 6 pages a day with a rest day a week.
  await modelSays(uid, {
    text: 'Then 6 pages a day with a rest day each week fits.',
    chart: null,
    textAfter: null,
    action: { kind: 'draftSchedule', title: 'A new schedule', detail: '6 pages a day, a weekly rest day', mode: 'pages', perDay: 6, restEvery: 7 },
    remember: [],
    title: 'A lighter schedule',
    chips: [],
  });
  await tap(app, 'revo-chip-Make it lighter');
  await app.until(() => app.screen.queryByTestId('revo-plan') != null, 'the draft’s card');
  // What changes, worked out on the phone: 108 pages in days of 6 is 18 days, and a rest day after every 6: 21.
  const rows = app.screen.getByTestId('revo-draft-rows');
  const labels = [...new Set(rows.findAll((n: any) => n.props?.accessible === true && typeof n.props.accessibilityLabel === 'string').map((n: any) => n.props.accessibilityLabel))];
  expect(labels).toEqual(['A day: 10 pages, then 6 pages', 'A round: Every 11 days, then Every 21 days', 'Rest days: None, then 3 a round']);
  // Nothing is saved by the answer.
  expect((await getServerDoc(`users/${uid}`))?.customPlan ?? null).toBeNull();

  // Its button opens Edit schedule filled in, not saved.
  await tap(app, 'revo-plan-do');
  await app.until(() => app.screen.queryByTestId('plan-revo-draft') != null, 'the draft in Edit schedule');
  expect(app.screen.getAllByText('6 pages a day').length).toBeGreaterThan(0);
  expect(app.screen.getAllByText('Every page comes round every 21 days').length).toBeGreaterThan(0);
  expect((await getServerDoc(`users/${uid}`))?.customPlan ?? null).toBeNull();

  // Only Save keeps it.
  await tap(app, 'plan-save');
  await app.untilSynced();
  await app.until(() => app.screen.queryByTestId('plan-revo-draft') == null, 'the draft saved');
  expect((await getServerDoc(`users/${uid}`))?.customPlan ?? null).not.toBeNull();
  const days = app.app.user?.customPlan?.days ?? [];
  expect(days).toHaveLength(21);
  expect(days.filter((d: number[]) => d.length === 0)).toHaveLength(3);
  await app.close();
});

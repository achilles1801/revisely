// Revo and the schedule (BEHAVIOUR.md REVO-43, Revisely Dev; Majd, Nov 25 2026: "adding revo to edit my schedule page
// and making it so that revo can help the user make or edit their schedule"). Opened from Edit schedule, Revo starts on
// the schedule with four starters; a schedule it drafts is a card with what changes, whose button opens Edit schedule
// filled in and not saved. Nothing is saved until Save. The real Edit schedule, Revo's host and backend (the functions
// emulator); only the model's words are a stand-in (functions/src/emulator.ts).

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { getServerDoc, listServerDocs, setServerDoc } from '../harness/serverDocs';
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
    BottomSheetModalProvider,
    null,
    h(
      ReadingTimerProvider,
      null,
      h(
        NavigationContainer,
        { ref },
        h(Root.Navigator, { screenOptions: { headerShown: false, animation: 'none' } }, h(Root.Screen, { name: 'Home', component: HomeStack })),
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

/** What the model says next for this account (functions/src/emulator.ts). */
const modelSays = (uid: string, reply: object) => setServerDoc(`emulator/anthropic/accounts/${uid}`, { reply: { text: JSON.stringify(reply), stopReason: 'end_turn' } });

/** The reply schema each request to the model carried, oldest first (its hash). */
async function schemasAsked(uid: string): Promise<string[]> {
  const docs = (await listServerDocs(`emulator/anthropic/accounts/${uid}/requests`)) as unknown as { at: number; outputSchemaSha256: string }[];
  return docs.sort((a, b) => a.at - b.at).map((r) => r.outputSchemaSha256);
}

/** The store app's reply schema, the one every answer before the draft was given with (replySchema.test.ts). */
const STORE_SCHEMA = 'ca725b35345fa9d4316a6e08e45b7f3a3c7c7833def4ea0b669b4c4d39dfba1e';

/** 108 pages, 10 a day (every page comes round every 11 days), on Wednesday 25 Nov; Revo opened from Edit schedule. */
async function openFromEditSchedule(): Promise<{ app: OpenApp; uid: string }> {
  setZone(ZONES.amman);
  setNow('2026-11-25 10:00');
  const phone = new Phone('phone');
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
  await tap(app, 'revo-button');
  await app.until(() => app.screen.queryByTestId('revo-greeting') != null, 'Revo’s first line');
  return { app, uid };
}

/** The draft card's rows, as a screen reader reads them. */
function draftRows(app: OpenApp): string[] {
  const rows = app.screen.getByTestId('revo-draft-rows');
  const labels: string[] = rows.findAll((n: any) => n.props?.accessible === true && typeof n.props.accessibilityLabel === 'string').map((n: any) => n.props.accessibilityLabel);
  return [...new Set(labels)];
}

it('[REVO-43] Revo from Edit schedule: the schedule and four starters; its draft is a card, then Edit schedule filled in and not saved until Save', async () => {
  const { app, uid } = await openFromEditSchedule();

  // Opened here: the schedule in Edit schedule's words, and the four starters.
  const greeting = plainText(String(app.screen.getByTestId('revo-greeting').props.children));
  expect(greeting).toContain('Your schedule is 10 pages a day: every page comes round every 11 days.');
  for (const chip of ['Make it lighter', 'Finish a round sooner', 'Rest one day a week', 'Start a new plan']) {
    expect(app.screen.queryByTestId(`revo-chip-${chip}`)).not.toBeNull();
  }

  // A starter asks; the answer drafts 6 pages a day with Fridays off (the board's example).
  await modelSays(uid, {
    text: 'Then 6 pages a day with Fridays off fits.',
    chart: null,
    textAfter: null,
    action: { kind: 'draftSchedule', title: 'A new schedule', detail: '6 pages a day with Fridays off', mode: 'pages', perDay: 6, restDays: [5], reverse: false },
    remember: [],
    title: 'A lighter schedule',
    chips: [],
  });
  await tap(app, 'revo-chip-Make it lighter');
  await app.until(() => app.screen.queryByTestId('revo-plan') != null, 'the draft’s card');
  // What changes, worked out on the phone: 108 pages at 6 a day is 18 days, 6 a week around Friday: 3 weeks, 21 days.
  expect(draftRows(app)).toEqual(['A day: 10 pages, then 6 pages', 'A round: Every 11 days, then Every 21 days', 'Rest days: None, then Friday']);
  // Asked with Revisely Dev's schema, the one with the draft in it.
  expect((await schemasAsked(uid)).map((h) => h === STORE_SCHEMA)).toEqual([false]);
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
  // The rest days are the Fridays: today, the day it's saved, is a Wednesday, so days 2, 9 and 16.
  expect(days.map((d: number[], i: number) => (d.length === 0 ? i : -1)).filter((i: number) => i >= 0)).toEqual([2, 9, 16]);
  await app.close();
});

it('[REVO-43] a draft with no rest day and the usual order (the schema asks for both): Revo’s card and Edit schedule, 18 days', async () => {
  const { app, uid } = await openFromEditSchedule();
  // Every field of a draft is required (functions/src/revo/replySchema.ts): none is restDays [], the usual order reverse false.
  await modelSays(uid, {
    text: '6 pages a day fits.',
    chart: null,
    textAfter: null,
    action: { kind: 'draftSchedule', title: 'A new schedule', detail: '6 pages a day', mode: 'pages', perDay: 6, restDays: [], reverse: false },
    remember: [],
    title: 'A lighter schedule',
    chips: [],
  });
  await tap(app, 'revo-chip-Make it lighter');
  await app.until(() => app.screen.queryByTestId('revo-plan') != null, 'the draft’s card');
  expect(draftRows(app)).toEqual(['A day: 10 pages, then 6 pages', 'A round: Every 11 days, then Every 18 days', 'Rest days: None, then None']);
  await tap(app, 'revo-plan-do');
  await app.until(() => app.screen.queryByTestId('plan-revo-draft') != null, 'the draft in Edit schedule');
  expect(app.screen.getAllByText('Every page comes round every 18 days').length).toBeGreaterThan(0);
  await app.close();
});

it('[REVO-43] the API refuses Revisely Dev’s schema (Nov 26 2026): Revo asks again with the store app’s and answers, with no draft', async () => {
  const { app, uid } = await openFromEditSchedule();
  // As the API answered every question from Revisely Dev once the draft was in its schema: a 400, "Schema is too
  // complex for compilation", before the model ran. Revo said "Revo couldn’t answer that. Try again." (Majd's phone).
  await setServerDoc(`emulator/anthropic/accounts/${uid}`, { refuseSchemaWith: 'draftSchedule' });
  await modelSays(uid, { text: 'Fewer pages a day makes it lighter: 6 a day brings each page round every 18 days.', chart: null, textAfter: null, action: null, remember: [], title: 'A lighter schedule', chips: [] });
  await tap(app, 'revo-chip-Make it lighter');
  await app.until(
    () => app.screen.queryByText('Fewer pages a day makes it lighter: 6 a day brings each page round every 18 days.') != null || app.screen.queryByText(/Revo couldn’t answer that/) != null,
    'Revo’s answer',
  );
  expect(app.screen.queryByText(/Revo couldn’t answer that/)).toBeNull();
  expect(app.screen.getByText('Fewer pages a day makes it lighter: 6 a day brings each page round every 18 days.')).toBeTruthy();
  // Dev's schema first, refused; then the store's, answered.
  const asked = await schemasAsked(uid);
  expect(asked).toHaveLength(2);
  expect(asked[0]).not.toBe(STORE_SCHEMA);
  expect(asked[1]).toBe(STORE_SCHEMA);
  expect(app.screen.queryByTestId('revo-plan')).toBeNull();
  await app.close();
});

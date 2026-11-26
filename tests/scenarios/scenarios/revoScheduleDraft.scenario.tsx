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

/** The real model's reply, word for word (functions/scripts/revo-draft-samples.js). */
const modelSent = (uid: string, text: string) => setServerDoc(`emulator/anthropic/accounts/${uid}`, { reply: { text, stopReason: 'end_turn' } });

/** The last request to the model: its schema's hash and the question as the model read it. */
async function lastAsked(uid: string): Promise<{ outputSchemaSha256: string; question: string }> {
  const docs = (await listServerDocs(`emulator/anthropic/accounts/${uid}/requests`)) as unknown as { at: number; outputSchemaSha256: string; messages: { content: string }[] }[];
  const last = docs.sort((a, b) => a.at - b.at).at(-1)!;
  return { outputSchemaSha256: last.outputSchemaSha256, question: last.messages.at(-1)!.content };
}

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
  // Asked with the schedule's format, the one with the draft in it.
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

it('[REVO-43] the API refuses the schedule’s format (as it refused Dev’s, Nov 26 2026): Revo asks again with the store app’s and answers, with no draft', async () => {
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
  // The schedule's format first, refused; then the store's, answered.
  const asked = await schemasAsked(uid);
  expect(asked).toHaveLength(2);
  expect(asked[0]).not.toBe(STORE_SCHEMA);
  expect(asked[1]).toBe(STORE_SCHEMA);
  expect(app.screen.queryByTestId('revo-plan')).toBeNull();
  await app.close();
});

it('[REVO-43] a request typed to Revo on Edit schedule goes with a reply format the model’s service compiles: the real answer is the draft card, then Edit schedule filled in', async () => {
  // Majd's Revisely Dev, Nov 26 2026: Revo answered in words only, never the card. The API refused Dev's reply format as
  // too big to compile (a 400, before the model ran) and Revo asked again with the store app's, which has no draft. The
  // emulator answers a format as the real API did (functions/test-recordings/anthropic/compiled-schemas.json).
  const { app, uid } = await openFromEditSchedule();
  // The real model's answer to this question, asked from Edit schedule with this format (revo-draft-samples.js, Nov 26).
  await modelSent(
    uid,
    '{"text":"Here\'s a lighter plan: 6 pages a day, with Friday as a rest day. It\'s slower, so a full cycle takes longer, but each day stays doable.","chart":null,"textAfter":"Check it in Edit schedule, then Save if it suits you.","action":{"kind":"draftSchedule","title":"6 pages a day, Fridays off","detail":"Lowers the daily amount from 10 to 6 pages, with Friday as a rest day","mode":"pages","perDay":6,"restDays":[5],"reverse":false},"remember":["Can only do about 6 pages a day; Fridays are busy"],"title":"Lighter plan, Fridays off","chips":["Why does a rest day come round?","What if I miss a day?"]}',
  );
  await app.until(() => app.screen.queryByTestId('revo-input') != null, 'Revo’s composer');
  await app.act(async () => {
    app.mods.rtl.fireEvent.changeText(app.screen.getByTestId('revo-input'), 'I can only do 6 pages, and Fridays are busy');
  });
  await tap(app, 'revo-send');
  await app.until(() => app.screen.queryByTestId('revo-plan') != null || app.screen.queryByText(/Here’s a lighter plan|Here's a lighter plan/) != null, 'Revo’s answer');

  // Asked once, with the schedule's format (one the real API compiled), and told it was asked from Edit schedule.
  const asked = await schemasAsked(uid);
  expect(asked).toHaveLength(1);
  expect(asked[0]).not.toBe(STORE_SCHEMA);
  expect((await lastAsked(uid)).question).toContain('Asked from Edit schedule:');

  // The card, as the board has it: "A new schedule", what changes, and the rows worked out on the phone.
  await app.until(() => app.screen.queryByTestId('revo-plan') != null, 'the draft’s card');
  expect(app.screen.getByText('A new schedule')).toBeTruthy();
  expect(app.screen.getByText('Lowers the daily amount from 10 to 6 pages, with Friday as a rest day')).toBeTruthy();
  expect(draftRows(app)).toEqual(['A day: 10 pages, then 6 pages', 'A round: Every 11 days, then Every 21 days', 'Rest days: None, then Friday']);

  // Its button: Edit schedule filled in, not saved.
  await tap(app, 'revo-plan-do');
  await app.until(() => app.screen.queryByTestId('plan-revo-draft') != null, 'the draft in Edit schedule');
  expect(app.screen.getAllByText('6 pages a day').length).toBeGreaterThan(0);
  expect(app.screen.getAllByText('Every page comes round every 21 days').length).toBeGreaterThan(0);
  expect((await getServerDoc(`users/${uid}`))?.customPlan ?? null).toBeNull();
  await app.close();
});

it('[REVO-43] Revo opened anywhere but Edit schedule asks with the store app’s format and never shows a draft', async () => {
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
  // From Home: even a reply with a draft in it shows none (the server keeps drafts for Edit schedule's questions).
  await modelSays(uid, {
    text: '6 pages a day fits.',
    chart: null,
    textAfter: null,
    action: { kind: 'draftSchedule', title: 'A new schedule', detail: '6 pages a day', mode: 'pages', perDay: 6, restDays: [], reverse: false },
    remember: [],
    title: 'A lighter schedule',
    chips: [],
  });
  await tap(app, 'revo-button');
  await app.until(() => app.screen.queryByTestId('revo-input') != null, 'Revo’s composer');
  await app.act(async () => {
    app.mods.rtl.fireEvent.changeText(app.screen.getByTestId('revo-input'), 'Make it lighter');
  });
  await tap(app, 'revo-send');
  await app.until(() => app.screen.queryByText('6 pages a day fits.') != null, 'Revo’s answer');
  expect(await schemasAsked(uid)).toEqual([STORE_SCHEMA]);
  expect((await lastAsked(uid)).question).not.toContain('Asked from Edit schedule');
  expect(app.screen.queryByTestId('revo-plan')).toBeNull();
  await app.close();
});

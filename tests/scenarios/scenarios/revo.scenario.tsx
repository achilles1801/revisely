// Revo in the app (REVO-20..23): a tester's Home with Revo's button; the opt-in first; the
// greeting written from the account's own plan; the day's limit; answers, follow-ups and failures.
// The real providers, Home and the session screen, and Revo's real backend: the app's own requests
// to the revo* functions in the functions emulator (harness/functions). Only the model is a
// stand-in, inside the functions: a recorded reply, or the text a test puts in it
// (`emulator/anthropic/accounts/<uid>` `reply`, functions/src/emulator.ts).

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester, watchFunction } from '../harness/admin';
import { getServerDoc, listServerDocs, setServerDoc } from '../harness/serverDocs';
import { Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp } from '../harness/phone';

/** Home and the session in a stack, with Revo mounted as MainNavigator mounts it. */
function revoStack(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const Dashboard = req<any>('src/screens/main/DashboardScreen').default;
  const Session = req<any>('src/screens/revision/ActiveRevisionScreen').default;
  const { ReadingTimerProvider } = req<any>('src/context/ReadingTimerContext');
  const { RevoHost } = req<any>('src/components/revo/RevoHost');
  const { navigationRef } = req<any>('src/navigation/navigationRef');
  // This launch's harness ref (a launch loads its modules afresh).
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
        ...['Settings', 'PlanEdit', 'PlanDayEdit', 'Activity', 'ActivityAll', 'ActivityDay', 'JournalEntry', 'Memorization', 'Insights'].map((name) =>
          h(Stack.Screen, { key: name, name, component: Elsewhere }),
        ),
      ),
    ),
    h(RevoHost),
  );
}

/** What the model says next for this account: this text, in the recorded reply (functions/src/emulator.ts). */
const modelSays = (uid: string, text: string, stopReason = 'end_turn') =>
  setServerDoc(`emulator/anthropic/accounts/${uid}`, { reply: { text, stopReason } });

/** What the model was asked for this account, oldest first. */
async function modelRequests(uid: string) {
  const docs = await listServerDocs(`emulator/anthropic/accounts/${uid}/requests`);
  return docs.sort((a, b) => Number(a.at) - Number(b.at)) as unknown as { kind: string; problems: string[]; messages: { role: string; content: string }[] }[];
}

const tap = async (app: OpenApp, testID: string) => {
  await app.until(() => app.screen.queryByTestId(testID) != null, `${testID} to show`);
  await app.act(async () => {
    app.mods.rtl.fireEvent.press(app.screen.getByTestId(testID));
  });
};

it('[REVO-21] [REVO-20] [REVO-22] Revo from Home: the opt-in first, a greeting from today’s plan, the day’s limit, and no button in a session', async () => {
  setZone(ZONES.amman);
  setNow('2026-11-06 10:00');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);

  app = await phone.open(revoStack);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const home = new Home(app);
  await home.ready();

  // [REVO-21] The button on Home; its first tap opens the opt-in, which sends nothing.
  await tap(app, 'revo-button');
  await app.until(() => app.screen.queryByTestId('revo-optin') != null, 'the opt-in');
  expect(app.screen.getByText('Meet Revo')).toBeTruthy();
  expect(app.screen.getByText('They’re only sent when you add one to a question.')).toBeTruthy();
  await tap(app, 'revo-not-now');
  expect((await getServerDoc(`coachSettings/${uid}`))?.optIn ?? false).toBe(false);
  await tap(app, 'revo-button');
  await tap(app, 'revo-turn-on');
  await app.until(() => app.screen.queryByTestId('revo-greeting') != null, 'the greeting');
  expect((await getServerDoc(`coachSettings/${uid}`))?.optIn).toBe(true);

  // [REVO-20] The greeting, written on the phone from today's plan (pages 1–5): no question asked.
  await app.until(() => app.screen.queryByTestId('revo-greeting') != null, 'the greeting');
  const greeting = String(app.screen.getByTestId('revo-greeting').props.children);
  expect(greeting).toMatch(/^Salaam( [^.]+)?\. Today is 5 pages, starting at p\. 1\. Ask me anything about your revision\.$/);
  expect(app.screen.getByTestId('revo-chip-How was my week?')).toBeTruthy();
  expect((await getServerDoc(`revoUsage/${uid}`))?.count ?? 0).toBe(0);

  // A suggestion asks it: one question counted, the answer shown.
  await tap(app, 'revo-chip-How was my week?');
  await app.until(() => app.screen.queryAllByTestId('revo-answer').length === 1, 'the answer');
  expect(await getServerDoc(`revoUsage/${uid}`)).toMatchObject({ day: '2026-11-06', count: 1 });
  expect((await modelRequests(uid)).map((r) => [r.kind, r.problems])).toEqual([['revo-ask', []]]);

  // [REVO-22] The day's questions used: the composer is greyed and says when Revo is back.
  // As the server counts them (revoUsage, which the app reads and only the functions write).
  await setServerDoc(`revoUsage/${uid}`, { day: '2026-11-06', count: 20 });
  await app.until(() => app.screen.queryByTestId('revo-limit') != null, 'the limit card');
  expect(app.screen.getByText('That’s today’s 20 questions')).toBeTruthy();
  expect(app.screen.getByText('Revo is back at midnight. Your conversations stay in History.')).toBeTruthy();
  const input = app.screen.getByTestId('revo-input');
  expect(input.props.editable).toBe(false);
  expect(input.props.placeholder).toBe('Back at midnight');

  // [REVO-21] Closed, then into today's session: no button there.
  await app.act(async () => {
    app.mods.rtl.fireEvent(app.screen.getByTestId('revo-sheet-handle'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  });
  await app.until(() => app.screen.queryByTestId('revo-button') != null, 'the button back on Home');
  await home.startSession();
  await app.until(() => app.screen.queryByTestId('revo-button') == null, 'no button in the session');
  await app.close();
});

const reply = (text: string, more: Record<string, unknown> = {}) => JSON.stringify({ text, chart: null, textAfter: null, action: null, remember: [], title: 'My week', chips: ['How is my pace?'], ...more });

it('[REVO-23] [REVO-3] answers come through the real callables, a first question and a follow-up; a failure says why and can be tried again', async () => {
  setZone(ZONES.amman);
  setNow('2026-11-06 10:00');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);

  const setOptions = watchFunction('revoSetOptions');
  const asks = watchFunction('revoAsk');
  const reviews = watchFunction('revoDayInReview');
  try {
    app = await phone.open(revoStack);
    await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
    await new Home(app).ready();

    // Turned on through revoSetOptions (its answer is the callable's { result }).
    await tap(app, 'revo-button');
    await tap(app, 'revo-turn-on');
    await app.until(() => app.screen.queryByTestId('revo-greeting') != null, 'the greeting');
    expect([setOptions.calls, asks.calls, reviews.calls]).toEqual([1, 0, 0]);

    // A first question: the answer the server stored shows in a new conversation.
    await modelSays(uid, reply('You revised steadily this week.'));
    await tap(app, 'revo-chip-How was my week?');
    await app.until(() => app.screen.queryByText('You revised steadily this week.') != null, 'the first answer');
    expect(asks.sent[asks.sent.length - 1]).toMatchObject({ chatId: null, question: 'How was my week?' });

    // A follow-up in that conversation (the path that crashed on Nov 7 2026, REACT-NATIVE-10).
    await modelSays(uid, reply('Today is 5 pages, starting at page 1.'));
    await app.act(async () => {
      app.mods.rtl.fireEvent.changeText(app.screen.getByTestId('revo-input'), 'And today?');
    });
    await tap(app, 'revo-send');
    await app.until(() => app.screen.queryByText('Today is 5 pages, starting at page 1.') != null, 'the follow-up’s answer');
    expect(typeof (asks.sent[asks.sent.length - 1] as { chatId?: unknown }).chatId).toBe('string');
    // The model got the conversation so far, then the follow-up.
    const followUp = (await modelRequests(uid)).pop()!;
    expect(followUp.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(followUp.messages[2].content).toMatch(/Question: And today\?$/);
    expect(app.screen.getByText('You revised steadily this week.')).toBeTruthy();
    expect(app.screen.queryAllByTestId('revo-question')).toHaveLength(2);
    expect(app.screen.queryByTestId('revo-broken')).toBeNull();

    // [REVO-3] A reply cut off before its text: the server's reason, the question given back, Try again.
    await modelSays(uid, '{"text": "Your weakest pa', 'max_tokens');
    await app.act(async () => {
      app.mods.rtl.fireEvent.changeText(app.screen.getByTestId('revo-input'), 'Which pages are weakest?');
    });
    await tap(app, 'revo-send');
    await app.until(() => app.screen.queryByTestId('revo-error') != null, 'the failure');
    expect(app.screen.getByText(/^Revo couldn’t answer that\. Try again\.\s+Try again$/)).toBeTruthy();
    // Given back: still 2 of today's questions counted.
    expect((await getServerDoc(`revoUsage/${uid}`))?.count).toBe(2);
    await modelSays(uid, reply('Pages 3 and 4 are rated weak.'));
    await app.act(async () => {
      app.mods.rtl.fireEvent.press(app.screen.getByText(/^\s*Try again$/));
    });
    await app.until(() => app.screen.queryByText('Pages 3 and 4 are rated weak.') != null, 'the answer on trying again');
    expect(app.screen.queryByTestId('revo-error')).toBeNull();

    // Offline: it says so, and nothing reached the server.
    await phone.goOffline();
    const before = (await modelRequests(uid)).length;
    await app.act(async () => {
      app.mods.rtl.fireEvent.changeText(app.screen.getByTestId('revo-input'), 'How is my pace?');
    });
    await tap(app, 'revo-send');
    await app.until(() => app.screen.queryByTestId('revo-error') != null, 'the offline note');
    expect(app.screen.getByText(/^You’re offline\. Revo needs the internet\.\s+Try again$/)).toBeTruthy();
    expect(asks.results[asks.results.length - 1]).toEqual({ network: 'offline' });
    expect((await modelRequests(uid)).length).toBe(before);
    await phone.goOnline();
    await app.close();
  } finally {
    setOptions.restore();
    asks.restore();
    reviews.restore();
  }
});

// Revo in the app (REVO-20..22): a tester's Home with Revo's button; the opt-in first; the
// greeting written from the account's own plan; the day's limit. The real providers, Home and
// the session screen against the emulators; Revo's server is the in-memory backend
// (lib/revo/memoryBackend), since the scenarios run no functions emulator and no model.

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester, serveRevo } from '../harness/admin';
import { Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp } from '../harness/phone';

type MemoryBackend = ReturnType<typeof import('../../../src/lib/revo/memoryBackend').createMemoryRevoBackend>;

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

async function openWithRevo(phone: Phone): Promise<{ app: OpenApp; backend: MemoryBackend }> {
  let backend: MemoryBackend | null = null;
  const app = await phone.open((mods) => {
    if (!backend) {
      const { createMemoryRevoBackend } = mods.require<typeof import('../../../src/lib/revo/memoryBackend')>('src/lib/revo/memoryBackend');
      backend = createMemoryRevoBackend();
      mods.require<typeof import('../../../src/lib/revo/backend')>('src/lib/revo/backend').__setRevoBackendForTests(backend);
    }
    return revoStack(mods);
  });
  return { app, backend: backend! };
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

  const opened = await openWithRevo(phone);
  app = opened.app;
  const backend = opened.backend;
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const home = new Home(app);
  await home.ready();

  // [REVO-21] The button on Home; its first tap opens the opt-in, which sends nothing.
  await tap(app, 'revo-button');
  await app.until(() => app.screen.queryByTestId('revo-optin') != null, 'the opt-in');
  expect(app.screen.getByText('Meet Revo')).toBeTruthy();
  expect(app.screen.getByText('They’re only sent when you add one to a question.')).toBeTruthy();
  await tap(app, 'revo-not-now');
  expect(backend.state().settings.optIn).toBe(false);
  await tap(app, 'revo-button');
  await tap(app, 'revo-turn-on');
  expect(backend.state().settings.optIn).toBe(true);

  // [REVO-20] The greeting, written on the phone from today's plan (pages 1–5): no question asked.
  await app.until(() => app.screen.queryByTestId('revo-greeting') != null, 'the greeting');
  const greeting = String(app.screen.getByTestId('revo-greeting').props.children);
  expect(greeting).toMatch(/^Salaam( [^.]+)?\. Today is 5 pages, starting at p\. 1\. Ask me anything about your revision\.$/);
  expect(app.screen.getByTestId('revo-chip-How was my week?')).toBeTruthy();
  expect(backend.state().usage.count).toBe(0);

  // A suggestion asks it: one question counted, the answer shown.
  await tap(app, 'revo-chip-How was my week?');
  await app.until(() => app.screen.queryAllByTestId('revo-answer').length === 1, 'the answer');
  expect(backend.state().usage).toEqual({ day: '2026-11-06', count: 1 });

  // [REVO-22] The day's questions used: the composer is greyed and says when Revo is back.
  await app.act(async () => backend.setRemaining('2026-11-06', 0));
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

/** Revo with its real backend: the app's own requests to the callables, served by the functions' code. */
async function openWithServedRevo(phone: Phone): Promise<OpenApp> {
  return phone.open((mods) => {
    mods.require<typeof import('../../../src/lib/revo/backend')>('src/lib/revo/backend').__setRevoBackendForTests(null);
    return revoStack(mods);
  });
}

const reply = (text: string, more: Record<string, unknown> = {}) => JSON.stringify({ text, chart: null, textAfter: null, action: null, remember: [], title: 'My week', chips: ['How is my pace?'], ...more });

it('[REVO-23] [REVO-3] answers come through the real callables, a first question and a follow-up; a failure says why and can be tried again', async () => {
  setZone(ZONES.amman);
  setNow('2026-11-06 10:00');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  markPreviewTester(uid);

  const served = serveRevo();
  try {
    app = await openWithServedRevo(phone);
    await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
    await new Home(app).ready();

    // Turned on through revoSetOptions (its answer is the callable's { result }).
    await tap(app, 'revo-button');
    await tap(app, 'revo-turn-on');
    await app.until(() => app.screen.queryByTestId('revo-greeting') != null, 'the greeting');
    expect(served.calls.map((c) => c.name)).toEqual(['revoSetOptions']);

    // A first question: the answer the server stored shows in a new conversation.
    served.reply = (name) => (name === 'revoAsk' ? reply('You revised steadily this week.') : undefined);
    await tap(app, 'revo-chip-How was my week?');
    await app.until(() => app.screen.queryByText('You revised steadily this week.') != null, 'the first answer');
    const first = served.calls[served.calls.length - 1];
    expect(first).toMatchObject({ name: 'revoAsk', data: { chatId: null, question: 'How was my week?' } });

    // A follow-up in that conversation (the path that crashed on Nov 7 2026, REACT-NATIVE-10).
    served.reply = () => reply('Today is 5 pages, starting at page 1.');
    await app.act(async () => {
      app.mods.rtl.fireEvent.changeText(app.screen.getByTestId('revo-input'), 'And today?');
    });
    await tap(app, 'revo-send');
    await app.until(() => app.screen.queryByText('Today is 5 pages, starting at page 1.') != null, 'the follow-up’s answer');
    const followUp = served.calls[served.calls.length - 1];
    expect(followUp.name).toBe('revoAsk');
    expect(typeof followUp.data.chatId).toBe('string');
    expect(app.screen.getByText('You revised steadily this week.')).toBeTruthy();
    expect(app.screen.queryAllByTestId('revo-question')).toHaveLength(2);
    expect(app.screen.queryByTestId('revo-broken')).toBeNull();

    // [REVO-3] A reply cut off before its text: the server's reason, the question given back, Try again.
    served.reply = () => '{"text": "Your weakest pa';
    await app.act(async () => {
      app.mods.rtl.fireEvent.changeText(app.screen.getByTestId('revo-input'), 'Which pages are weakest?');
    });
    await tap(app, 'revo-send');
    await app.until(() => app.screen.queryByTestId('revo-error') != null, 'the failure');
    expect(app.screen.getByText(/^Revo couldn’t answer that\. Try again\.\s+Try again$/)).toBeTruthy();
    served.reply = () => reply('Pages 3 and 4 are rated weak.');
    await app.act(async () => {
      app.mods.rtl.fireEvent.press(app.screen.getByText(/^\s*Try again$/));
    });
    await app.until(() => app.screen.queryByText('Pages 3 and 4 are rated weak.') != null, 'the answer on trying again');
    expect(app.screen.queryByTestId('revo-error')).toBeNull();

    // Offline: it says so, and nothing reached the server.
    served.offline = true;
    const before = served.calls.length;
    await app.act(async () => {
      app.mods.rtl.fireEvent.changeText(app.screen.getByTestId('revo-input'), 'How is my pace?');
    });
    await tap(app, 'revo-send');
    await app.until(() => app.screen.queryByTestId('revo-error') != null, 'the offline note');
    expect(app.screen.getByText(/^You’re offline\. Revo needs the internet\.\s+Try again$/)).toBeTruthy();
    expect(served.calls.length).toBe(before);
    await app.close();
  } finally {
    served.restore();
  }
});

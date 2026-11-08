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
import { withAuthRetry } from '../harness/authRetry';
import { getServerDoc, listServerDocs, setServerDoc } from '../harness/serverDocs';
import { Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp } from '../harness/phone';
import { plainText } from '../../../src/lib/passages';

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
  expect(app.screen.getByText('Only sent when you add their day, or the recording, to a question.')).toBeTruthy();
  await tap(app, 'revo-not-now');
  expect((await getServerDoc(`coachSettings/${uid}`))?.revoOn ?? false).toBe(false);
  await tap(app, 'revo-button');
  await tap(app, 'revo-turn-on');
  await app.until(() => app.screen.queryByTestId('revo-greeting') != null, 'the greeting');
  // [REVO-1] Revo's own switch; the Ask coach's is left alone.
  expect(await getServerDoc(`coachSettings/${uid}`)).toMatchObject({ revoOn: true });
  expect((await getServerDoc(`coachSettings/${uid}`))?.optIn).toBeUndefined();

  // [REVO-20] The greeting, written on the phone from today's plan (pages 1–5): no question asked.
  await app.until(() => app.screen.queryByTestId('revo-greeting') != null, 'the greeting');
  const greeting = String(app.screen.getByTestId('revo-greeting').props.children);
  // Where today starts, by surah (lib/passages), not by page number.
  expect(plainText(greeting)).toMatch(/^Salaam( [^.]+)?\. Today is 5 pages, starting at Al-Fatihah\. Ask me anything about your revision\.$/);
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

it('[REVO-31] [REVO-30] an answer that offers a screen: its button opens it (Jump to… on Home) and nothing happens before the tap; a screen the server doesn’t know never reaches the app', async () => {
  setZone(ZONES.amman);
  setNow('2026-11-06 10:00');
  const phone = new Phone('phone');
  // Juz 28 and 29 memorized, 20 pages a day.
  let app = await newAccount(phone, { memorized: pagesRange(542, 581), user: { dailyPageCapacity: 20 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);

  app = await phone.open(revoStack);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const home = new Home(app);
  await home.ready();
  const startBefore = home.title();
  await tap(app, 'revo-button');
  await tap(app, 'revo-turn-on');
  await app.until(() => app.screen.queryByTestId('revo-greeting') != null, 'the greeting');

  // A how-to question: the answer, and a card that opens Jump to….
  await modelSays(uid, reply('Open Jump to and pick Juz 29: today starts there, and the days after carry on from it.', {
    action: { kind: 'openScreen', title: 'Revise Juz 29 today', detail: 'In Jump to, choose Juz 29', screen: 'jumpTo' },
  }));
  await app.act(async () => {
    app.mods.rtl.fireEvent.changeText(app.screen.getByTestId('revo-input'), 'How do I revise Juz 29 today?');
  });
  await tap(app, 'revo-send');
  await app.until(() => app.screen.queryByTestId('revo-plan') != null, 'the card');
  expect(app.screen.getByText('Open Jump to')).toBeTruthy();
  // The guide went with the question, in the system prompt.
  const asked = (await modelRequests(uid)).pop()!;
  expect(asked.problems).toEqual([]);
  // Nothing has moved before the tap.
  expect(app.screen.queryByTestId('jump-go')).toBeNull();
  expect(home.title()).toBe(startBefore);

  // The tap closes Revo and opens Jump to… over Home; choosing Juz 29 starts today there.
  await tap(app, 'revo-plan-do');
  await app.until(() => app.screen.queryByTestId('jump-go') != null, 'the Jump to… sheet');
  await tap(app, 'jump-juz-29');
  await tap(app, 'jump-go');
  await app.untilSynced();
  await app.until(() => /Al[-\u2011]Mulk/.test(home.title() ?? ""), 'today to start at Juz 29');

  // A screen not on the list: the server drops the action, the answer stays, no card.
  await tap(app, 'revo-button');
  await modelSays(uid, reply('That isn’t something Revisely has.', {
    action: { kind: 'openScreen', title: 'Open it', detail: '', screen: 'adminPanel' },
  }));
  await app.act(async () => {
    app.mods.rtl.fireEvent.changeText(app.screen.getByTestId('revo-input'), 'Where are the admin tools?');
  });
  await tap(app, 'revo-send');
  await app.until(() => app.screen.queryByText('That isn’t something Revisely has.') != null, 'the answer');
  // (Opening Revo again started a new conversation: the first card isn't on screen.)
  expect(app.screen.queryByTestId('revo-plan')).toBeNull();
  await app.close();
});

type RevoBackendMod = typeof import('../../../src/lib/revo/backend');

/** What a Revo call through the app's backend is refused with ('off', 'daily', …). */
async function refusal(app: OpenApp, call: () => Promise<unknown>): Promise<string> {
  let caught: unknown = null;
  await app.act(async () => {
    try {
      await withAuthRetry(call);
    } catch (err) {
      caught = err;
    }
  });
  expect(caught).not.toBeNull();
  return (caught as { refusal?: string }).refusal ?? `not a RevoError: ${String(caught)}`;
}

/**
 * The least context the server takes, with nothing done today: a Day in review asked with it answers
 * none, with no model call, once the account's switch lets it through (and is refused when it doesn't).
 */
function quietContext(day: string) {
  return {
    totals: {
      memorizedPages: 20,
      revisedWithin7Days: 0,
      revisedWithin30Days: 0,
      daysWithSession30: 0,
      streakDays: 0,
      sessions30: 0,
      weakPages: 0,
      moderatePages: 0,
      strongPages: 0,
      weakRevisedLast7Days: 0,
      pagesPerDay7: 0,
      pagesPerDay30: 0,
      plannedPerDay: 5,
    },
    today: { plannedPages: 5, revisedPages: 0, minutes: 0, memorizedPages: 0, nextPages: [1, 2, 3, 4, 5], weakNext: [], done: false },
    weakPages: [],
    week: [{ day, pages: 0 }],
  };
}

it('[REVO-21] [REVO-1] [REVO-9] Revo’s own switch: with the Ask coach on, Revo still opens on its opt-in and sends nothing before it, the Day in review included; once on, a tap just after launch opens the chat', async () => {
  setZone(ZONES.amman);
  setNow('2026-11-06 20:00');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  const revo = () => app.mods.require<RevoBackendMod>('src/lib/revo/backend').revoBackend();
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  // Before Nov 7 2026 Revo read the Ask coach's switch (as setCoachOptIn writes it): this account had
  // Revo "on" without ever seeing Revo's opt-in.
  await setServerDoc(`coachSettings/${uid}`, { optIn: true });

  const setOptions = watchFunction('revoSetOptions');
  const asks = watchFunction('revoAsk');
  const reviews = watchFunction('revoDayInReview');
  try {
    app = await phone.open(revoStack);
    await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
    // [REVO-1] The changeover: the server still serves that account (an app from before #310 reads
    // the coach's switch and shows it Revo) until Revo's own switch is set. (Clear can't show it: it
    // is open to every account, REVO-37.) A quiet day's review: let through, none, no model call.
    await app.act(async () => {
      await expect(withAuthRetry(() => revo().dayInReview({ day: '2026-11-06', context: quietContext('2026-11-06') } as never))).resolves.toBeNull();
    });
    expect(reviews.calls).toBe(1);

    const home = new Home(app);
    await home.ready();

    // Something done today, in the evening: what the Day in review would be written from.
    const session = await home.startSession();
    await session.swipeThrough(2);
    await session.back();
    await app.untilSynced();
    await app.idle(500);

    // [REVO-21] [REVO-9] Nothing sent by the app (the one review above was this test's), and the first tap opens the opt-in.
    expect([setOptions.calls, asks.calls, reviews.calls]).toEqual([0, 0, 1]);
    await tap(app, 'revo-button');
    await app.until(() => app.screen.queryByTestId('revo-optin') != null, 'the opt-in');
    expect([setOptions.calls, asks.calls, reviews.calls]).toEqual([0, 0, 1]);

    // Turned on: the evening's Day in review is asked for now, not before.
    await modelSays(uid, reply('Two pages revised today.', { title: 'Day in review', chips: [] }));
    await tap(app, 'revo-turn-on');
    await app.until(() => reviews.calls > 1, 'the Day in review, once Revo is on');
    expect(setOptions.sent).toEqual([{ optIn: true }]);
    expect(await getServerDoc(`coachSettings/${uid}`)).toMatchObject({ revoOn: true, optIn: true });
    await app.close();

    // [REVO-1] Launched again: a tap as soon as the button shows waits for the account's switch and
    // opens the conversation (Revo is on), never the opt-in.
    app = await phone.open(revoStack);
    await tap(app, 'revo-button');
    let sawOptIn = false;
    await app.until(() => {
      sawOptIn ||= app.screen.queryByTestId('revo-optin') != null;
      return app.screen.queryByTestId('revo-history') != null;
    }, 'the conversation');
    expect(sawOptIn).toBe(false);

    // [REVO-1] Turned off with Revo's own switch: off on the server too, whatever the coach's says.
    await app.act(async () => {
      await withAuthRetry(() => revo().setOptions({ optIn: false }));
    });
    expect(await getServerDoc(`coachSettings/${uid}`)).toMatchObject({ revoOn: false, optIn: true });
    expect(await refusal(app, () => revo().dayInReview({ day: '2026-11-06', context: quietContext('2026-11-06') } as never))).toBe('off');
    await app.close();
  } finally {
    setOptions.restore();
    asks.restore();
    reviews.restore();
  }
});

it('[REVO-34] [REVO-35] [REVO-9] [REVO-20] every open starts on a greeting written then: after a session, a question, today finished and the next day; an earlier conversation or the Day in review only when picked, the review offered until it is opened', async () => {
  setZone(ZONES.amman);
  setNow('2026-11-06 10:00');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  await setServerDoc(`coachSettings/${uid}`, { revoOn: true });

  const reviews = watchFunction('revoDayInReview');
  try {
    app = await phone.open(revoStack);
    await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
    const home = new Home(app);
    await home.ready();

    const openRevo = async () => {
      await tap(app, 'revo-button');
      await app.until(() => app.screen.queryByTestId('revo-history') != null, 'Revo’s sheet');
    };
    const closeRevo = async () => {
      await app.act(async () => {
        app.mods.rtl.fireEvent(app.screen.getByTestId('revo-sheet-handle'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
      });
      await app.until(() => app.screen.queryByTestId('revo-button') != null, 'the button back on Home');
    };
    /** A new conversation: the greeting, nothing asked in it; what the greeting says. */
    const fresh = async (when: string) => {
      await app.until(() => app.screen.queryByTestId('revo-greeting') != null, `the greeting (${when})`);
      expect(app.screen.queryAllByTestId('revo-question')).toHaveLength(0);
      expect(app.screen.queryAllByTestId('revo-answer')).toHaveLength(0);
      return plainText(String(app.screen.getByTestId('revo-greeting').props.children));
    };
    const send = async (text: string) => {
      await app.act(async () => {
        app.mods.rtl.fireEvent.changeText(app.screen.getByTestId('revo-input'), text);
      });
      await tap(app, 'revo-send');
    };
    /** Revises the rest of today in its session, from the page it opens on. */
    const finishToday = async () => {
      const session = await home.startSession();
      const left = session.pages().length - session.pages().indexOf(session.current()!);
      await session.swipeThrough(left);
      await session.back();
      await app.untilSynced();
    };

    // The morning: today's plan.
    await openRevo();
    expect(await fresh('morning')).toMatch(/Today is 5 pages, starting at Al-Fatihah\./);
    await closeRevo();

    // Two pages revised: the next open says so.
    const session = await home.startSession();
    await session.swipeThrough(2);
    await session.back();
    await app.untilSynced();
    await openRevo();
    expect(await fresh('two pages')).toMatch(/You’re 2 pages into today, and .+ is next\./);

    // A question asked, then the sheet closed: the next open is a new conversation on the greeting,
    // and the question waits in History.
    await modelSays(uid, reply('You revised steadily this week.'));
    await tap(app, 'revo-chip-How was my week?');
    await app.until(() => app.screen.queryByText('You revised steadily this week.') != null, 'the answer');
    await closeRevo();
    await openRevo();
    // [REVO-35] The second open with nothing changed: today's line, then something else.
    expect(await fresh('after a question')).toMatch(/^Salaam( [^.]+)?\. You’re 2 pages into today, and .+ is next\. This week you’ve revised 2 pages on 1 day\.$/);
    await tap(app, 'revo-history');
    await app.until(() => app.screen.queryByText('My week') != null, 'the conversation in History');
    await tap(app, 'revo-back');
    expect(await fresh('back from History')).toMatch(/You’re 2 pages into today/);
    await closeRevo();

    // The evening, today finished: the Day in review is written (REVO-9), and the dot shows.
    setNow('2026-11-06 20:00');
    await modelSays(uid, reply('Three pages revised so far this evening.', { title: 'Day in review', chips: [] }));
    await finishToday();
    await app.until(() => reviews.calls > 0 && app.screen.queryByTestId('revo-button-dot') != null, 'the Day in review’s dot');

    // [REVO-34] The open still starts on a greeting written now, the review a row under it, not
    // what the sheet shows: it was written earlier and may no longer be true.
    await openRevo();
    expect(await fresh('evening')).toMatch(/Today’s 5 pages are done\./);
    expect(app.screen.queryByText('Three pages revised so far this evening.')).toBeNull();
    await tap(app, 'revo-review');
    await app.until(() => app.screen.queryByText('Three pages revised so far this evening.') != null, 'the Day in review, once picked');
    // A follow-up in it.
    await modelSays(uid, reply('Start tomorrow with Al-Baqarah.'));
    await send('What should I start with tomorrow?');
    await app.until(() => app.screen.queryByText('Start tomorrow with Al-Baqarah.') != null, 'the follow-up’s answer');
    await closeRevo();
    await app.idle(500);

    // [REVO-9] Opened, so no dot; and the next open is the greeting with no row, the follow-up
    // in the review notwithstanding. [REVO-35] Today was done already, so it doesn't say so again:
    // it leads with where tomorrow starts, as Home's line does, and its first suggestion follows.
    expect(app.screen.queryByTestId('revo-button-dot')).toBeNull();
    await openRevo();
    const second = await fresh('after the review');
    expect(second).toMatch(/^Salaam( [^.]+)?\. Tomorrow starts at Al-Baqarah, ayah \d+, 5 pages\.$/);
    expect(app.screen.getByTestId('revo-chip-How do I revise ahead?')).toBeTruthy();
    expect(app.screen.queryByTestId('revo-review')).toBeNull();
    await closeRevo();
    expect(app.screen.queryByTestId('revo-button-dot')).toBeNull();
    // Opened again: something else again (the week), never "done".
    await openRevo();
    const third = await fresh('third open, done');
    expect(third).toMatch(/^Salaam( [^.]+)?\. This week you’ve revised 5 pages on 1 day\.$/);
    expect(third).not.toBe(second);
    await closeRevo();

    // The next revision day (midnight here): the greeting is the new day's.
    setNow('2026-11-07 09:00');
    await app.foreground();
    await openRevo();
    expect(await fresh('next day')).toMatch(/Today is 5 pages, starting at /);
    await app.close();
  } finally {
    reviews.restore();
  }
});

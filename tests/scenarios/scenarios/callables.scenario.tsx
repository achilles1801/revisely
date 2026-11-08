// Our callable functions as the app calls them (COACH-5, ACCOUNT-1, RESET-2, RESET-3): the app's own
// client code (lib/coach/api, AuthContext.deleteAccount, lib/testerReset, lib/testScenarios) against
// the real functions in the emulator (harness/functions), with the account's sign-in and App Check,
// the real limits, ledger and Firestore writes. Only Anthropic answers from a recording
// (functions/test-recordings/anthropic, per account: harness/serverDocs sets its failures).
//
// Until Nov 2026 no test sent the app's real request to a function: the Ask coach's client returned
// the callable's `{ result }` envelope as the answer, so the sheet showed no answer, and nothing saw it.

import type { ReactElement } from 'react';
import { withAuthRetry } from '../harness/authRetry';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester, watchFunction } from '../harness/admin';
import { failAppCheck } from '../harness/appCheck';
import { deleteServerDoc, getServerDoc, listServerDocs, setServerDoc } from '../harness/serverDocs';
import { Phone, PASSWORD, type Booted, type OpenApp } from '../harness/phone';

type CoachApi = typeof import('../../../src/lib/coach/api');
type TesterReset = typeof import('../../../src/lib/testerReset');
type TestScenarios = typeof import('../../../src/lib/testScenarios');

const fs = jest.requireActual<typeof import('fs')>('fs');
const path = jest.requireActual<typeof import('path')>('path');

/** The Messages API reply the emulator answers with (functions/test-recordings/anthropic). */
function recorded(name: string): { content: { type: string; text: string }[]; usage: Record<string, number> } {
  const file = path.resolve(__dirname, '../../../functions/test-recordings/anthropic', `${name}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8')).body;
}

/** What the model was asked for this account (the emulator logs each request our functions sent). */
async function modelRequests(uid: string) {
  const docs = await listServerDocs(`emulator/anthropic/accounts/${uid}/requests`);
  return docs.sort((a, b) => Number(a.at) - Number(b.at)) as unknown as {
    kind: string;
    mode: string;
    problems: string[];
    drift: string[];
    messages: { role: string; content: string }[];
  }[];
}

const anthropicFails = (uid: string, mode: 'recorded' | 'overloaded' | 'rejected' | 'network') =>
  setServerDoc(`emulator/anthropic/accounts/${uid}`, { mode });

// Every total the app computes for Insights (lib/coach/totals); the sheet sends only the asked insight's.
const totals = {
  memorizedPages: 120,
  revisedWithin7Days: 44,
  revisedWithin30Days: 90,
  daysWithSession30: 20,
  streakDays: 6,
  sessions30: 22,
  weakPages: 3,
  moderatePages: 9,
  strongPages: 100,
  weakRevisedLast7Days: 1,
  pagesPerDay7: 4.3,
  pagesPerDay30: 3.9,
  plannedPerDay: 5,
};

/** A tester's account (the owner marked it, set-preview-tester.js), opened again with `screen`. */
async function testerAccount(phone: Phone, screen?: (mods: Booted) => ReactElement | null): Promise<OpenApp> {
  let app = await newAccount(phone, { memorized: pagesRange(582, 604), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  app = await phone.open(screen);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  return app;
}

const tap = async (app: OpenApp, testID: string) => {
  await app.until(() => app.screen.queryByTestId(testID) != null, `${testID} to show`);
  await app.act(async () => {
    app.mods.rtl.fireEvent.press(app.screen.getByTestId(testID));
  });
};

it('[COACH-4] [COACH-5] [COACH-2] the Ask coach sheet against the real function: turned on, an answer with the questions left, kept for the day', async () => {
  setZone(ZONES.chicago);
  // A month of its own: the ledger is shared by every account in a month. Empty to start with: a
  // second run of the suite (TESTING.md) uses the same emulators, and found this run's call there.
  setNow('2031-03-04 10:00');
  await deleteServerDoc('coachLedger/2031-03');
  const phone = new Phone('phone');
  const sheet = (mods: Booted) => {
    const { AskCoachSheet } = mods.require<typeof import('../../../src/components/coach/AskCoachSheet')>('src/components/coach/AskCoachSheet');
    return mods.React.createElement(AskCoachSheet, { visible: true, onClose: () => undefined, day: '2031-03-04', totals });
  };
  const app = await testerAccount(phone, sheet);
  const uid = app.uid;

  // Turned on from the sheet: the server keeps it.
  await tap(app, 'ask-coach-optin');
  await app.until(() => app.screen.queryByTestId('ask-coach-ask') != null, 'the question step');
  expect((await getServerDoc(`coachSettings/${uid}`))?.optIn).toBe(true);

  // Pace: the answer the model gave, and today's questions left.
  await tap(app, 'ask-coach-pace');
  await tap(app, 'ask-coach-ask');
  await app.until(() => app.screen.queryByTestId('ask-coach-answer') != null, 'the answer');
  const answer = recorded('coach').content[0].text;
  expect(app.screen.getByTestId('ask-coach-answer').props.children).toBe(answer);
  expect(app.screen.getByText('4 questions left today')).toBeTruthy();

  // [COACH-2] The model was sent the pace totals and nothing else, in a request it accepts.
  const asked = await modelRequests(uid);
  expect(asked).toHaveLength(1);
  expect(asked[0]).toMatchObject({ kind: 'coach', mode: 'recorded', problems: [], drift: [] });
  const sent = asked[0].messages.map((m) => m.content).join('\n');
  expect(sent).toContain('Totals: {"pagesPerDay7":4.3,"pagesPerDay30":3.9,"plannedPerDay":5}');
  expect(sent).not.toMatch(/memorizedPages|streakDays|weakPages|@/);

  // Counted once, and the month's ledger holds the call's tokens.
  expect((await getServerDoc(`coachUsage/${uid}__2031-03-04`))?.count).toBe(1);
  const ledger = await getServerDoc('coachLedger/2031-03');
  const usage = recorded('coach').usage;
  expect(ledger).toMatchObject({ calls: 1, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cacheReadTokens: usage.cache_read_input_tokens });
  expect(Number(ledger?.spendUsd)).toBeGreaterThan(0);

  // Asked again today (the insight picked again, then Ask): the kept answer, no call, nothing counted.
  await tap(app, 'ask-coach-pace');
  await tap(app, 'ask-coach-ask');
  await app.until(() => app.screen.queryByText(/^Kept for today\./) != null, 'the kept answer');
  expect(app.screen.getByTestId('ask-coach-answer').props.children).toBe(answer);
  expect(await modelRequests(uid)).toHaveLength(1);
  expect((await getServerDoc(`coachUsage/${uid}__2031-03-04`))?.count).toBe(1);
  await app.close();
});

it('[COACH-5] [COACH-1] the Ask coach refuses with its reason, and a failed call counts nothing', async () => {
  setZone(ZONES.chicago);
  setNow('2031-05-06 10:00');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(582, 604), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  const coach = () => app.mods.require<CoachApi>('src/lib/coach/api');
  const ask = () => withAuthRetry(() => coach().askCoach('pace', { pagesPerDay7: 4.3, pagesPerDay30: 3.9, plannedPerDay: 5 }, '2031-05-06'));
  const count = async () => Number((await getServerDoc(`coachUsage/${uid}__2031-05-06`))?.count ?? 0);
  const refused = async (pattern: RegExp) => {
    await app.act(async () => {
      await expect(ask()).rejects.toThrow(pattern);
    });
  };

  // Not a tester: neither the switch nor a question.
  await app.act(async () => {
    await expect(withAuthRetry(() => coach().setCoachOptIn(true))).rejects.toThrow(/not available on this account/);
  });
  await refused(/not available on this account/);

  await app.close();
  await markPreviewTester(uid);
  app = await phone.open();
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  // A tester who hasn't turned it on.
  await refused(/Turn the coach on first/);
  await app.act(async () => {
    await expect(withAuthRetry(() => coach().setCoachOptIn(true))).resolves.toEqual({ optIn: true });
  });

  // Today's five used.
  await setServerDoc(`coachUsage/${uid}__2031-05-06`, { count: 5, uid, day: '2031-05-06' });
  await refused(/used today’s 5 questions/);
  await setServerDoc(`coachUsage/${uid}__2031-05-06`, { count: 0 });

  // The model busy (529 on every attempt), its key refused, the connection failing: an error, nothing counted.
  await anthropicFails(uid, 'overloaded');
  await refused(/busy/);
  await anthropicFails(uid, 'rejected');
  await refused(/could not answer/);
  await anthropicFails(uid, 'network');
  await refused(/did not answer in time/);
  await anthropicFails(uid, 'recorded');
  expect(await count()).toBe(0);
  // Three attempts each for the busy model and the failing connection, one for the refused key.
  expect((await modelRequests(uid)).map((r) => r.mode)).toEqual([...Array(3).fill('overloaded'), 'rejected', ...Array(3).fill('network')]);

  // The phone not recognised by App Check: the function refuses before anything runs.
  failAppCheck();
  try {
    await refused(/Unauthenticated/);
  } finally {
    failAppCheck(false);
  }
  // Offline: the call never leaves the phone.
  const served = watchFunction('askCoach');
  await phone.goOffline();
  await refused(/Network request failed/);
  await phone.goOnline();
  expect(served.results).toEqual([{ network: 'offline' }]);
  expect(await count()).toBe(0);
  expect(await modelRequests(uid)).toHaveLength(7);

  // The month's cap reached (another month, its ledger full): paused, and the question given back.
  setNow('2031-06-03 10:00');
  await setServerDoc('coachLedger/2031-06', { spendUsd: 1000, month: '2031-06' });
  await app.act(async () => {
    await expect(withAuthRetry(() => coach().askCoach('pace', { pagesPerDay7: 4.3, pagesPerDay30: 3.9, plannedPerDay: 5 }, '2031-06-03'))).rejects.toThrow(
      /paused until next month/,
    );
  });
  expect((await getServerDoc(`coachUsage/${uid}__2031-06-03`))?.count ?? 0).toBe(0);
  expect(await modelRequests(uid)).toHaveLength(7);

  // And with nothing in the way, an answer.
  setNow('2031-05-06 10:05');
  let result: Awaited<ReturnType<CoachApi['askCoach']>> | undefined;
  await app.act(async () => {
    result = await ask();
  });
  expect(result).toEqual({ answer: recorded('coach').content[0].text, cached: false, remainingToday: 4 });
  await app.close();
});

it('[ACCOUNT-1] Delete account removes the account and its data from the server and signs out; offline or refused, nothing goes', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-06 10:00');
  const phone = new Phone('phone');
  const app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  const email = phone.email!;
  await app.untilSynced();
  // Revo's and the coach's documents, as their functions write them.
  await setServerDoc(`coachSettings/${uid}`, { optIn: true });
  await setServerDoc(`users/${uid}/revoMemory/m1`, { uid, text: 'Revises after Fajr', source: 'chat', day: '2026-11-06', chatId: 'c1', at: 1 });
  const deleteAccount = () => (app.auth.deleteAccount as () => Promise<void>)();
  const intact = async () => {
    expect(await getServerDoc(`users/${uid}`)).not.toBeNull();
    expect((await listServerDocs(`users/${uid}/pages`)).length).toBeGreaterThan(0);
    expect(app.auth.firebaseUser?.uid).toBe(uid);
  };

  // Offline: refused on the phone; everything stays, still signed in.
  await phone.goOffline();
  await app.act(async () => {
    await expect(deleteAccount()).rejects.toThrow(/Network request failed/);
  });
  await phone.goOnline();
  await intact();

  // The phone not recognised by App Check: the server refuses; everything stays.
  failAppCheck();
  try {
    await app.act(async () => {
      await expect(withAuthRetry(() => deleteAccount())).rejects.toThrow(/Unauthenticated/);
    });
  } finally {
    failAppCheck(false);
  }
  await intact();

  // Deleted: the account and everything of it, and the phone signed out.
  const served = watchFunction('deleteUserAccount');
  await app.act(() => withAuthRetry(() => deleteAccount()));
  expect(served.results).toEqual([{ result: { ok: true } }]);
  await app.until(() => app.auth.firebaseUser == null, 'the phone to be signed out');
  expect(await getServerDoc(`users/${uid}`)).toBeNull();
  expect(await listServerDocs(`users/${uid}/pages`)).toHaveLength(0);
  expect(await listServerDocs(`users/${uid}/revoMemory`)).toHaveLength(0);
  expect(await getServerDoc(`coachSettings/${uid}`)).toBeNull();
  // The sign-in is gone too.
  await app.act(async () => {
    await expect(app.auth.signIn(email, PASSWORD)).rejects.toBeTruthy();
  });
  await app.close();
});

it('[RESET-2] [RESET-3] Reset my data and Load test scenario refuse without App Check or a connection, and change nothing', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-06 10:00');
  const phone = new Phone('phone');
  const app = await testerAccount(phone);
  const memorized = () => app.app.pages.filter((p) => p.status === 'memorized').length;
  await app.until(() => memorized() === 23, 'the 23 memorized pages');
  const reset = () => app.mods.require<TesterReset>('src/lib/testerReset').resetMyData();
  const load = () => app.mods.require<TestScenarios>('src/lib/testScenarios').loadTestScenario('hafiz', app.app.user);

  failAppCheck();
  try {
    await app.act(async () => {
      await expect(withAuthRetry(reset)).rejects.toThrow(/Unauthenticated/);
      await expect(withAuthRetry(load)).rejects.toThrow(/Unauthenticated/);
    });
  } finally {
    failAppCheck(false);
  }
  await phone.goOffline();
  await app.act(async () => {
    await expect(reset()).rejects.toThrow(/Network request failed/);
    await expect(load()).rejects.toThrow(/Network request failed/);
  });
  await phone.goOnline();

  // Nothing was reset: the server still has the account's pages and onboarding.
  expect(await getServerDoc(`adminResets/${app.uid}`)).toBeNull();
  expect((await getServerDoc(`users/${app.uid}`))?.onboardingComplete).toBe(true);
  expect(app.app.onboardingComplete).toBe(true);
  expect(memorized()).toBe(23);
  await app.close();
});

type RevoBackendMod = typeof import('../../../src/lib/revo/backend');

/** A context as the app builds it (lib/revo/context): today 5 pages from 582, 2 done. */
function revoContext(day: string) {
  return {
    totals: {
      memorizedPages: 23,
      revisedWithin7Days: 10,
      revisedWithin30Days: 23,
      daysWithSession30: 6,
      streakDays: 2,
      sessions30: 6,
      weakPages: 1,
      moderatePages: 4,
      strongPages: 18,
      weakRevisedLast7Days: 1,
      pagesPerDay7: 4.1,
      pagesPerDay30: 3.6,
      plannedPerDay: 5,
    },
    today: { plannedPages: 5, revisedPages: 2, carriedPages: 0, doneEarlier: 0, otherPages: 0, minutes: 12, memorizedPages: 0, nextPages: [584, 585, 586], weakNext: [585], done: false },
    weakPages: [585],
    week: [{ day, pages: 2, planned: 5, done: false }],
    streak: { days: 2, atRisk: null },
    // As lib/revo/words writes them (surah and juz first).
    passages: { today: "An-Nazi'at 16 to At-Takwir · Juz 30", next: "An-Nazi'at 16 to At-Takwir · Juz 30", nextAt: "An-Nazi'at, ayah 16", weakNext: "'Abasa · Juz 30", weak: "'Abasa · Juz 30" },
    pageNames: { '584': "An-Nazi'at, ayahs 16–46 · Juz 30", '585': "'Abasa · Juz 30", '586': 'At-Takwir · Juz 30' },
    localTime: '20:10',
  };
}

/** What a refusal is, as Revo's sheet tells them apart (lib/revo/backend refusalOf). */
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

it('[REVO-1] [REVO-3] [REVO-4] [REVO-23] Revo through the app’s own backend: an answer, a follow-up, and every refusal told apart; a refused question counts nothing', async () => {
  setZone(ZONES.chicago);
  setNow('2031-07-08 20:10');
  const DAY = '2031-07-08';
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(582, 604), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  const revo = () => app.mods.require<RevoBackendMod>('src/lib/revo/backend').revoBackend();
  const ask = (over: Record<string, unknown> = {}) =>
    revo().ask({ chatId: null, day: DAY, question: 'How was my week?', context: revoContext(DAY), attach: null, ...over } as Parameters<ReturnType<typeof revo>['ask']>[0]);
  const count = async () => Number((await getServerDoc(`revoUsage/${uid}`))?.count ?? 0);

  // [REVO-1] Not a tester: refused, even to turn it on ('paused': Revo isn't open to the account, REVO-37).
  expect(await refusal(app, () => revo().setOptions({ optIn: true }))).toBe('paused');
  expect(await refusal(app, () => ask())).toBe('paused');
  await app.close();
  await markPreviewTester(uid);
  app = await phone.open();
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  // A tester who hasn't turned it on.
  expect(await refusal(app, () => ask())).toBe('off');
  await app.act(async () => {
    await expect(withAuthRetry(() => revo().setOptions({ optIn: true }))).resolves.toEqual({ optIn: true, memoryOn: true });
  });

  // An answer, then a follow-up in its conversation.
  let first: Awaited<ReturnType<typeof ask>> | undefined;
  await app.act(async () => {
    first = await withAuthRetry(() => ask());
  });
  expect(first).toMatchObject({ question: { role: 'user', text: 'How was my week?' }, reply: { role: 'revo' }, remainingToday: 19, cached: false });
  expect(first!.reply.text.length).toBeGreaterThan(0);
  let second: Awaited<ReturnType<typeof ask>> | undefined;
  await app.act(async () => {
    second = await withAuthRetry(() => ask({ chatId: first!.chatId, question: 'And today?' }));
  });
  expect(second).toMatchObject({ chatId: first!.chatId, remainingToday: 18 });
  expect(await count()).toBe(2);
  // Kept with the account: the chat and its four messages, as the app reads them.
  expect((await listServerDocs(`users/${uid}/revoChats/${first!.chatId}/messages`)).length).toBe(4);
  // [REVO-23] A chat that was deleted.
  expect(await refusal(app, () => ask({ chatId: 'gone-chat', question: 'And tomorrow?' }))).toBe('gone');

  // The model busy, its key refused, the connection failing: 'unavailable', the question given back.
  for (const mode of ['overloaded', 'rejected', 'network'] as const) {
    await anthropicFails(uid, mode);
    expect(await refusal(app, () => ask({ question: `A ${mode} question` }))).toBe('unavailable');
  }
  await anthropicFails(uid, 'recorded');
  expect(await count()).toBe(2);

  // [REVO-3] Today's 20 used: 'daily'. A day earlier than the one counted: 'clock'.
  await setServerDoc(`revoUsage/${uid}`, { day: DAY, count: 20 });
  expect(await refusal(app, () => ask({ question: 'One more?' }))).toBe('daily');
  setNow('2031-07-07 20:10');
  expect(await refusal(app, () => ask({ day: '2031-07-07', question: 'Yesterday?' }))).toBe('clock');
  setNow('2031-07-08 20:15');
  await setServerDoc(`revoUsage/${uid}`, { day: DAY, count: 2 });

  // No App Check, and offline: refused before the server does anything.
  failAppCheck();
  try {
    expect(await refusal(app, () => ask({ question: 'Without App Check?' }))).toBe('unavailable');
  } finally {
    failAppCheck(false);
  }
  await phone.goOffline();
  expect(await refusal(app, () => ask({ question: 'Offline?' }))).toBe('offline');
  await phone.goOnline();
  expect(await count()).toBe(2);

  // [REVO-4] The month's cap reached (another month, its ledger full): 'monthly', given back, no call.
  setNow('2031-08-04 20:10');
  await setServerDoc('coachLedger/2031-08', { spendUsd: 1000, month: '2031-08' });
  const callsBefore = (await listServerDocs(`emulator/anthropic/accounts/${uid}/requests`)).length;
  expect(await refusal(app, () => ask({ day: '2031-08-04', question: 'In August?' }))).toBe('monthly');
  expect((await getServerDoc(`revoUsage/${uid}`))?.count).toBe(0);
  expect((await listServerDocs(`emulator/anthropic/accounts/${uid}/requests`)).length).toBe(callsBefore);
  await app.close();
});

type RevoReleaseMod = typeof import('../../../src/lib/revo/release');
type RevoAvailabilityMod = typeof import('../../../src/lib/revo/availability');

// The switch is one document every file's functions read, so only "everyone" is tried here (testers
// keep Revo under it): "off" would refuse other files' testers while they run. The functions' and the
// app's handling of "off" is in properties/revo.property.ts and the app's tests.
it('[REVO-37] the release switch: everyone opens Revo to an account that isn’t a tester, with no new build, and the phone reads it', async () => {
  setZone(ZONES.chicago);
  setNow('2031-10-14 20:10');
  const DAY = '2031-10-14';
  const phone = new Phone('phone');
  const app = await newAccount(phone, { memorized: pagesRange(582, 604), user: { dailyPageCapacity: 5 } });
  const revo = () => app.mods.require<RevoBackendMod>('src/lib/revo/backend').revoBackend();
  const release = () => app.mods.require<RevoReleaseMod>('src/lib/revo/release');
  const { revoAvailable } = app.mods.require<RevoAvailabilityMod>('src/lib/revo/availability');
  try {
    // Testers only (config/app without it): the server refuses this account, and the phone hides Revo.
    expect(await refusal(app, () => revo().setOptions({ optIn: true }))).toBe('paused');
    await app.act(() => release().refreshRevoRelease(true));
    expect(release().currentRevoRelease()).toBe('testers');
    expect(revoAvailable(app.app.user, release().currentRevoRelease())).toBe(false);

    // Everyone: the same app reads it from config/app (its rules let every install read it), and the
    // functions open Revo to the account: it turns Revo on and gets an answer.
    await setServerDoc('config/app', { revo: 'everyone' });
    await app.act(() => release().refreshRevoRelease(true));
    expect(release().currentRevoRelease()).toBe('everyone');
    expect(revoAvailable(app.app.user, release().currentRevoRelease())).toBe(true);
    await app.act(async () => {
      await expect(withAuthRetry(() => revo().setOptions({ optIn: true }))).resolves.toEqual({ optIn: true, memoryOn: true });
    });
    let answer: unknown;
    await app.act(async () => {
      answer = await withAuthRetry(() =>
        revo().ask({ chatId: null, day: DAY, question: 'How was my week?', context: revoContext(DAY), attach: null } as Parameters<ReturnType<typeof revo>['ask']>[0]),
      );
    });
    expect(answer).toMatchObject({ reply: { role: 'revo' }, remainingToday: 19 });
  } finally {
    await deleteServerDoc('config/app');
  }
  await app.close();
});

it('[REVO-9] [REVO-10] [REVO-8] the Day in review once a day, skipped when capped; turning Revo off and Clear delete what they say', async () => {
  setZone(ZONES.chicago);
  setNow('2031-09-09 20:30');
  const DAY = '2031-09-09';
  const phone = new Phone('phone');
  const app = await testerAccount(phone);
  const uid = app.uid;
  const revo = () => app.mods.require<RevoBackendMod>('src/lib/revo/backend').revoBackend();
  await app.act(() => withAuthRetry(() => revo().setOptions({ optIn: true })));

  // [REVO-9] Written once: the second call finds the same chat, with no second model call.
  let review: { chatId: string } | null = null;
  await app.act(async () => {
    review = await withAuthRetry(() => revo().dayInReview({ day: DAY, context: revoContext(DAY) } as Parameters<ReturnType<typeof revo>['dayInReview']>[0]));
  });
  expect(review).toEqual({ chatId: `review-${DAY}` });
  await app.act(async () => {
    review = await withAuthRetry(() => revo().dayInReview({ day: DAY, context: revoContext(DAY) } as Parameters<ReturnType<typeof revo>['dayInReview']>[0]));
  });
  expect(review).toEqual({ chatId: `review-${DAY}` });
  const asked = await modelRequests(uid);
  expect(asked.map((r) => r.kind)).toEqual(['revo-review']);
  // Not counted among the day's questions.
  expect((await getServerDoc(`revoUsage/${uid}`))?.count ?? 0).toBe(0);
  // Nothing done that day: no review.
  const idle = { ...revoContext('2031-09-10'), today: { plannedPages: 5, revisedPages: 0, carriedPages: 0, doneEarlier: 0, otherPages: 0, minutes: 0, memorizedPages: 0, nextPages: [582], weakNext: [], done: false }, pageNames: {} };
  setNow('2031-09-10 20:30');
  await app.act(async () => {
    review = await withAuthRetry(() => revo().dayInReview({ day: '2031-09-10', context: idle } as Parameters<ReturnType<typeof revo>['dayInReview']>[0]));
  });
  expect(review).toBeNull();
  // The month's cap reached: skipped, never an error.
  setNow('2031-10-06 20:30');
  await setServerDoc('coachLedger/2031-10', { spendUsd: 1000, month: '2031-10' });
  await app.act(async () => {
    review = await withAuthRetry(() => revo().dayInReview({ day: '2031-10-06', context: revoContext('2031-10-06') } as Parameters<ReturnType<typeof revo>['dayInReview']>[0]));
  });
  expect(review).toBeNull();

  // [REVO-8] Clear memory, then [REVO-10] Clear history: each deletes only its own.
  setNow('2031-09-09 20:40');
  await setServerDoc(`users/${uid}/revoMemory/m1`, { uid, text: 'Revises after Fajr', source: 'chat', day: DAY, chatId: 'c', at: 1 });
  await app.act(() => withAuthRetry(() => revo().clear('memory')));
  expect(await listServerDocs(`users/${uid}/revoMemory`)).toHaveLength(0);
  expect(await getServerDoc(`users/${uid}/revoChats/review-${DAY}`)).not.toBeNull();
  await app.act(() => withAuthRetry(() => revo().clear('history')));
  expect(await listServerDocs(`users/${uid}/revoChats`)).toHaveLength(0);

  // [REVO-10] Turning Revo off deletes its conversations and memory; the day's count stays.
  await setServerDoc(`users/${uid}/revoMemory/m2`, { uid, text: 'Likes short plans', source: 'chat', day: DAY, chatId: 'c', at: 2 });
  let settings: { optIn: boolean } | undefined;
  await app.act(async () => {
    settings = await withAuthRetry(() => revo().setOptions({ optIn: false }));
  });
  expect(settings).toMatchObject({ optIn: false });
  expect(await listServerDocs(`users/${uid}/revoMemory`)).toHaveLength(0);
  expect((await getServerDoc(`coachSettings/${uid}`))?.revoOn).toBe(false);
  // [REVO-37] Deleting stays open once off (there is nothing left to delete).
  await app.act(async () => {
    await expect(withAuthRetry(() => revo().clear('memory'))).resolves.toBeUndefined();
  });
  expect(await listServerDocs(`users/${uid}/revoMemory`)).toHaveLength(0);
  await app.close();
});

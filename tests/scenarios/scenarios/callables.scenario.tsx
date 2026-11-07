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
import { getServerDoc, listServerDocs, setServerDoc } from '../harness/serverDocs';
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
  // A month of its own: the ledger is shared by every account in a month.
  setNow('2031-03-04 10:00');
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

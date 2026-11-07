// What Revo is told about today, the week and the streak, against what Home shows (REVO-26), in
// every test scenario Majd loads (Settings → Testing, RESET-3). Revo once said today was "0 of 5"
// while its week said 3 pages that day, and a streak of 0 where Home showed one to save (Nov 7
// 2026): its context read the logs its own way. It now comes from Home's own snapshot.
//
// In the evening in Chicago, when the UTC date is already tomorrow: a page marked memorized
// today must count today, not by the UTC date of its timestamp.

import type { ReactElement } from 'react';
import { advance, MINUTE, setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester, watchFunction } from '../harness/admin';
import { setServerDoc } from '../harness/serverDocs';
import { loadScenario } from '../harness/testScenario';
import { DailyLog, Home, Manager, homeStack } from '../harness/screens';
import { Phone, type Booted, type OpenApp } from '../harness/phone';
import { SCENARIO_IDS, type ScenarioId, type SeedPlan } from '../../../functions/src/testScenarios';
import type { RevoContext } from '../../../src/lib/revo/types';

type Fajr = typeof import('../../../src/lib/fajrBoundary');

interface Probe {
  build: () => RevoContext | null;
  /** Whether Revo has the Activity items Home's streak read (else both use the logs). */
  hasHistory: boolean;
}
const probe = globalThis as unknown as { __revoProbe?: Probe };

/** Home, with Revo's context hook mounted beside it as RevoHost mounts it. */
function homeWithRevo(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { useRevoContext } = req<typeof import('../../../src/lib/revo/useRevoContext')>('src/lib/revo/useRevoContext');
  const { useSharedActivityHistory } = req<typeof import('../../../src/lib/activityHistory')>('src/lib/activityHistory');
  const { useApp } = req<typeof import('../../../src/context/AppContext')>('src/context/AppContext');
  function RevoProbe() {
    const { day, build } = useRevoContext();
    const { user } = useApp();
    probe.__revoProbe = { build, hasHistory: useSharedActivityHistory(user?.id, day) != null };
    return null;
  }
  return React.createElement(React.Fragment, null, homeStack(mods), React.createElement(RevoProbe));
}

/** Home's Today post, read off the screen: its numbers as Home states them. */
function homeSays(home: Home): { planned?: number; done?: number; doneAll?: number; carried: number; isDone: boolean } {
  const title = home.title() ?? '';
  const progress = home.today().match(/(\d+) of (\d+)/);
  const doneAll = /Done · (\d+) pages?/.exec(title);
  const detail = home.detail() ?? '';
  const pages = /^(\d+) pages?/.exec(detail);
  const carried = /(\d+) from yesterday first/.exec(detail);
  if (doneAll) return { doneAll: Number(doneAll[1]), carried: 0, isDone: true };
  if (progress && title.startsWith('Continue at')) return { done: Number(progress[1]), planned: Number(progress[2]), carried: 0, isDone: false };
  return { planned: pages ? Number(pages[1]) : undefined, done: 0, carried: carried ? Number(carried[1]) : 0, isDone: false };
}

async function revoAgreesWithHome(app: OpenApp, scenario: ScenarioId, plan: SeedPlan): Promise<void> {
  const home = new Home(app);
  await home.ready();
  // Home's streak loads from the Activity items after the Today post shows; Revo reads the same copy.
  await app.until(() => probe.__revoProbe?.hasHistory === true, `Revo to have Home's history (${scenario})`, 20_000);
  await app.idle(300);
  const ctx = probe.__revoProbe!.build()!;
  expect(ctx).not.toBeNull();
  const says = homeSays(home);
  const where = `${scenario}: Home says "${home.today()}", Revo is told ${JSON.stringify({ today: ctx.today, streak: ctx.streak, week: ctx.week })}`;
  const t = ctx.today;

  // Today: the numbers Home states.
  expect([where, t.done]).toEqual([where, says.isDone]);
  if (says.doneAll != null) {
    // "Done · N pages": today's done pages and the pages its sessions revised that aren't today's.
    expect([where, t.revisedPages + t.otherPages]).toEqual([where, says.doneAll]);
  } else {
    expect([where, t.plannedPages]).toEqual([where, says.planned]);
    expect([where, t.revisedPages]).toEqual([where, says.done]);
    expect([where, t.carriedPages]).toEqual([where, says.carried]);
    expect([where, t.nextPages.length]).toEqual([where, Math.min(20, t.plannedPages - t.revisedPages)]);
  }

  // The streak: Home's, with the run that can come back in its grace (SESS-6).
  const streak = home.streak();
  if (streak.grace) {
    expect([where, ctx.streak.days, ctx.streak.atRisk?.previous]).toEqual([where, 0, streak.days]);
    const { yesterdayDone, yesterdayPlanned } = ctx.streak.atRisk!;
    expect([where, streak.ring]).toEqual([where, `${Math.round((yesterdayDone / yesterdayPlanned) * 100)} percent revised`]);
  } else {
    expect([where, ctx.streak]).toEqual([where, { days: streak.days, atRisk: null }]);
  }
  expect(ctx.totals.streakDays).toBe(ctx.streak.days);

  // The week ends today, as Home has it; the numbers add up; and the days done are the streak's.
  const today = ctx.week[6];
  expect([where, today.day, today.done]).toEqual([where, plan.today, t.done]);
  expect([where, today.pages]).toEqual([where, t.revisedPages - t.doneEarlier + t.otherPages]);
  if (!ctx.streak.atRisk) {
    // A run of days done ending today (done) or yesterday, as long as the streak (within the week).
    const from = t.done ? 6 : 5;
    let run = 0;
    while (from - run >= 0 && ctx.week[from - run].done) run++;
    expect([where, run]).toEqual([where, Math.min(ctx.streak.days, from + 1)]);
  } else {
    expect([where, ctx.week[5].done]).toEqual([where, false]);
  }

  // A page marked memorized counts on the revision day it was marked.
  const fajr = app.mods.require<Fajr>('src/lib/fajrBoundary');
  const markedToday = plan.pages.filter((p) => fajr.revisionDayOf(p.dateMemorized, app.app.user) === plan.today).length;
  expect([where, t.memorizedPages]).toEqual([where, markedToday]);
}

it('[REVO-26] Revo is told today, the week and the streak as Home shows them, in every test scenario', async () => {
  setZone(ZONES.chicago);
  // 19:30 in Chicago is 01:30 UTC on the next day.
  setNow('2026-11-05 19:30');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(582, 590), user: { dailyPageCapacity: 3 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  app = await phone.open(homeWithRevo);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');

  for (const scenario of SCENARIO_IDS) {
    advance(3 * MINUTE); // past the two minutes between loads
    const plan = await loadScenario(app, scenario);
    await revoAgreesWithHome(app, scenario, plan);
  }
  // 'new' was marked memorized minutes ago, after 18:00 here: tomorrow by the UTC date.
  await app.close();
}, 900_000);

// ---------------------------------------------------------------------------------------------
// Asked after each change made on the phone: what the app sent revoAsk is the state it shows now.
// ---------------------------------------------------------------------------------------------

/** Home, the session, the daily log and the memorization manager, with Revo mounted as MainNavigator mounts it. */
function revoAppStack(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const Dashboard = req<any>('src/screens/main/DashboardScreen').default;
  const Session = req<any>('src/screens/revision/ActiveRevisionScreen').default;
  const Journal = req<any>('src/screens/journal/JournalEntryScreen').default;
  const Manager = req<any>('src/screens/main/MemorizationScreen').default;
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
        h(Stack.Screen, { name: 'JournalEntry', component: Journal }),
        h(Stack.Screen, { name: 'Memorization', component: Manager }),
        ...['Settings', 'PlanEdit', 'PlanDayEdit', 'Activity', 'ActivityAll', 'ActivityDay', 'Insights'].map((name) =>
          h(Stack.Screen, { key: name, name, component: Elsewhere }),
        ),
      ),
    ),
    h(RevoHost),
  );
}

const pressId = async (app: OpenApp, testID: string) => {
  await app.until(() => app.screen.queryByTestId(testID) != null, `${testID} to show`);
  await app.act(async () => {
    app.mods.rtl.fireEvent.press(app.screen.getByTestId(testID));
  });
};

/** Opens Revo, asks `question`, waits for the answer and closes the sheet: the context the app sent. */
async function askRevo(app: OpenApp, asks: { sent: unknown[] }, question: string): Promise<RevoContext> {
  const before = asks.sent.length;
  await pressId(app, 'revo-button');
  await app.until(
    () => app.screen.queryByTestId('revo-input') != null,
    `the composer (on screen: ${['revo-optin', 'revo-history', 'revo-greeting', 'revo-sheet-handle'].filter((id) => app.screen.queryByTestId(id) != null).join(', ') || 'none of the sheet'})`,
  );
  const answers = app.screen.queryAllByTestId('revo-answer').length;
  await app.act(async () => {
    app.mods.rtl.fireEvent.changeText(app.screen.getByTestId('revo-input'), question);
  });
  await pressId(app, 'revo-send');
  await app.until(() => asks.sent.length > before && app.screen.queryAllByTestId('revo-answer').length > answers, `an answer to "${question}"`);
  expect(app.screen.queryByTestId('revo-error')).toBeNull();
  const sent = asks.sent[asks.sent.length - 1] as { context: RevoContext };
  await app.act(async () => {
    app.mods.rtl.fireEvent(app.screen.getByTestId('revo-sheet-handle'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  });
  await app.until(() => app.screen.queryByTestId('revo-button') != null, 'Revo closed');
  return sent.context;
}

/** Where Home says today starts or carries on ("Starts at Al-Mujadila, p. 542"), and its "N of M". */
function homeToday(home: Home): { page: number; done: number | null; of: number | null } {
  const page = Number(/p\. (\d+)/.exec(home.title() ?? '')?.[1] ?? NaN);
  const m = /(\d+) of (\d+)/.exec(home.today());
  return { page, done: m ? Number(m[1]) : null, of: m ? Number(m[2]) : null };
}

it('[REVO-26] Revo is asked with the state the phone shows now: after Jump to, a session part done then finished, pages revised ahead, pages marked memorized, a log note and a new plan', async () => {
  setZone(ZONES.chicago);
  // Made the day before, so only what is marked today counts as marked today.
  setNow('2026-11-04 10:00');
  const phone = new Phone('phone');
  // Juz 1–29 memorized (Juz 30 still to come), five pages a day from 1 November.
  let app = await newAccount(phone, {
    memorized: pagesRange(1, 581),
    user: { scheduleMode: 'pages', dailyPageCapacity: 5, scheduleAnchorDate: '2026-11-01T12:00:00' },
  });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  setNow('2026-11-05 10:00');
  await markPreviewTester(uid);
  await setServerDoc(`emulator/anthropic/accounts/${uid}`, {
    reply: { text: JSON.stringify({ text: 'Here is where you are.', chart: null, textAfter: null, action: null, remember: [], title: 'Today', chips: [] }), stopReason: 'end_turn' },
  });

  const asks = watchFunction('revoAsk');
  try {
    app = await phone.open(revoAppStack);
    await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
    const home = new Home(app);
    await home.ready();
    await pressId(app, 'revo-button');
    await pressId(app, 'revo-turn-on');
    await app.until(() => app.screen.queryByTestId('revo-greeting') != null, 'the greeting');
    await app.act(async () => {
      app.mods.rtl.fireEvent(app.screen.getByTestId('revo-sheet-handle'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    });

    // As the day began: where Home says it starts.
    let ctx = await askRevo(app, asks, 'Where do I start today?');
    expect(ctx.today.nextPages[0]).toBe(homeToday(home).page);
    expect([ctx.today.plannedPages, ctx.today.revisedPages]).toEqual([5, 0]);

    // Jump to Juz 5: today starts there (page 82), for Revo too.
    await home.jumpTo('jump-juz-5');
    await app.until(() => homeToday(home).page === 82, 'today to start at Juz 5');
    ctx = await askRevo(app, asks, 'And now?');
    expect(ctx.today.nextPages).toEqual([82, 83, 84, 85, 86]);

    // A session part done: three of five.
    let session = await home.startSession();
    await session.swipeThrough(3);
    await session.back();
    await app.until(() => homeToday(home).done === 3, 'Home to say 3 of 5');
    ctx = await askRevo(app, asks, 'How far am I?');
    expect([ctx.today.revisedPages, ctx.today.plannedPages, ctx.today.nextPages, ctx.today.done]).toEqual([3, 5, [85, 86], false]);
    expect(ctx.week[6].pages).toBe(3);

    // Finished.
    session = await home.startSession();
    await session.swipeThrough(2);
    await session.back();
    await app.until(() => /^Done/.test(home.title() ?? ''), 'Home to say Done');
    ctx = await askRevo(app, asks, 'Am I done?');
    expect([ctx.today.done, ctx.today.revisedPages, ctx.today.nextPages]).toEqual([true, 5, []]);

    // Two of tomorrow's pages revised ahead: today's other pages, in the week's count too.
    session = await home.openAhead();
    await session.swipeThrough(2);
    await session.back();
    await app.until(() => /Done · 7 pages/.test(home.title() ?? ''), 'Home to count the pages revised ahead');
    ctx = await askRevo(app, asks, 'What did I do today?');
    expect([ctx.today.otherPages, ctx.week[6].pages]).toEqual([2, 7]);

    // Juz 30 marked memorized today.
    const manager = new Manager(app);
    await manager.open();
    await manager.markJuzToday(30);
    await app.until(() => app.app.pages.filter((p) => p.status === 'memorized').length === 604, 'Juz 30 to be memorized');
    await app.act(async () => {
      (app.mods.require<{ navigation: { current: any } }>('./navRef').navigation.current as { goBack: () => void }).goBack();
    });
    ctx = await askRevo(app, asks, 'How much do I know?');
    expect([ctx.totals.memorizedPages, ctx.today.memorizedPages]).toEqual([604, 23]);

    // A note in the daily log: notes reach Revo only as an attachment the user picks (REVO-2).
    const log = new DailyLog(app);
    await log.open();
    await log.add('Revised with my teacher after Fajr');
    await app.act(async () => {
      (app.mods.require<{ navigation: { current: any } }>('./navRef').navigation.current as { goBack: () => void }).goBack();
    });
    ctx = await askRevo(app, asks, 'Anything else?');
    expect(JSON.stringify(ctx)).not.toContain('teacher');

    // A new plan, the automatic one at ten pages a day (as the plan editor saves it): it takes over today.
    const { userWithNewSchedule } = app.mods.require<typeof import('../../../src/lib/planChange')>('src/lib/planChange');
    const user = app.app.user!;
    const next = userWithNewSchedule(
      { ...user, dailyPageCapacity: 10 },
      { customPlan: null },
      { revisionDate: new Date(), memorized: app.app.pages.filter((p) => p.status === 'memorized'), logs: app.app.logs, newPlan: true },
    );
    await app.act(() => app.app.saveUser(next));
    await app.until(() => app.app.user?.dailyPageCapacity === 10, 'the new plan');
    ctx = await askRevo(app, asks, 'What is my plan now?');
    const shown = homeToday(home);
    expect(ctx.today.plannedPages).toBe(shown.of ?? Number(/(\d+) pages/.exec(home.detail() ?? '')?.[1]));
    if (!ctx.today.done) expect(ctx.today.nextPages[0]).toBe(shown.page);
    expect(ctx.totals.plannedPerDay).toBe(10);
    await app.close();
  } finally {
    asks.restore();
  }
});

it('[REVO-26] Add to today: the carried pages are in what Revo is told, as Home counts them', async () => {
  const { app } = await scenarioPhoneWithRevo('beginner');
  const home = new Home(app);
  const asks = watchFunction('revoAsk');
  try {
    expect(home.carryOver()).toBe('Add to today');
    await home.tap('today-carry-over');
    await app.until(() => home.carryOver() == null, 'the offer to go');
    const carried = Number(/(\d+) from yesterday first/.exec(home.detail() ?? '')?.[1] ?? 0);
    expect(carried).toBeGreaterThan(0);
    const ctx = await askRevo(app, asks, 'What is today?');
    expect(ctx.today.carriedPages).toBe(carried);
    expect(ctx.today.plannedPages).toBe(Number(/^(\d+) pages/.exec(home.detail() ?? '')?.[1]));
    expect(ctx.today.nextPages[0]).toBe(homeToday(home).page);
    await app.close();
  } finally {
    asks.restore();
  }
});

/** A tester with a test scenario loaded, on the Revo app stack, Revo turned on. */
async function scenarioPhoneWithRevo(scenario: ScenarioId): Promise<{ app: OpenApp; plan: SeedPlan }> {
  setZone(ZONES.chicago);
  setNow('2026-11-05 12:00');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(582, 590), user: { dailyPageCapacity: 3 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  app = await phone.open(revoAppStack);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const plan = await loadScenario(app, scenario);
  await setServerDoc(`emulator/anthropic/accounts/${uid}`, {
    reply: { text: JSON.stringify({ text: 'Here is today.', chart: null, textAfter: null, action: null, remember: [], title: 'Today', chips: [] }), stopReason: 'end_turn' },
  });
  await new Home(app).ready();
  await pressId(app, 'revo-button');
  await pressId(app, 'revo-turn-on');
  await app.until(() => app.screen.queryByTestId('revo-greeting') != null, 'the greeting');
  await app.act(async () => {
    app.mods.rtl.fireEvent(app.screen.getByTestId('revo-sheet-handle'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  });
  await app.until(() => app.screen.queryByTestId('revo-button') != null, 'Revo closed');
  return { app, plan };
}

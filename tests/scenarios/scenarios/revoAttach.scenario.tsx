// What Revo is sent when the user attaches something with + (REVO-32, REVO-33), against what the app
// shows for it, on the test scenarios Majd loads (Settings → Testing): Yusuf, Juz 14 and a page of
// the hafiz account (60 days of a juz a day, days missed, one left half done, ratings), and a day
// of the heavy-activity account (sessions, timed reading, daily-log notes). Majd's questions: "how
// many times have I revised this juz?", "should I revise Yusuf now or later?", "how often am I
// skipping this surah?" must be answered from the user's own data, exactly.
//
// Each figure is worked out here from the app's own data the way its screens read it (Insights:
// each page's rating and last revision; Activity: the day's sessions, readings and log; the
// streak: each day's plan and what was revised for it), not through lib/revo/facts; Juz 14's
// strength is read off the Insights screen itself.

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester, watchFunction } from '../harness/admin';
import { setServerDoc } from '../harness/serverDocs';
import { loadScenario } from '../harness/testScenario';
import { Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp } from '../harness/phone';
import type { ScenarioId, SeedPlan } from '../../../functions/src/testScenarios';
import type { JournalEntry, ReadingSession, RevisionLog, UserPage } from '../../../src/types';
import type { RevoDayFacts, RevoPassageFacts } from '../../../src/lib/revo/types';

type Nav = { navigation: { current: { navigate: (name: string) => void; goBack: () => void } } };

/** Home, Insights and Revo, as MainNavigator mounts Revo over the screens. */
function stack(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const Dashboard = req<any>('src/screens/main/DashboardScreen').default;
  const Insights = req<any>('src/screens/main/AlgorithmScreen').default;
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
        h(Stack.Screen, { name: 'Insights', component: Insights }),
        ...['ActiveRevision', 'Settings', 'PlanEdit', 'PlanDayEdit', 'Activity', 'ActivityAll', 'ActivityDay', 'JournalEntry', 'Memorization'].map((name) =>
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

async function closeRevo(app: OpenApp): Promise<void> {
  await app.act(async () => {
    app.mods.rtl.fireEvent(app.screen.getByTestId('revo-sheet-handle'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  });
  await app.until(() => app.screen.queryByTestId('revo-button') != null, 'Revo closed');
}

/** A tester on a new phone with `scenario` loaded, Revo on and closed. */
async function scenarioWithRevo(scenario: ScenarioId): Promise<{ app: OpenApp; plan: SeedPlan }> {
  setZone(ZONES.chicago);
  setNow('2026-11-05 12:00');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(582, 590), user: { dailyPageCapacity: 3 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  app = await phone.open(stack);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const plan = await loadScenario(app, scenario);
  await setServerDoc(`emulator/anthropic/accounts/${uid}`, {
    reply: { text: JSON.stringify({ text: 'Here it is.', chart: null, textAfter: null, action: null, remember: [], title: 'Attached', chips: [] }), stopReason: 'end_turn' },
  });
  await new Home(app).ready();
  await pressId(app, 'revo-button');
  await pressId(app, 'revo-turn-on');
  await app.until(() => app.screen.queryByTestId('revo-greeting') != null, 'the greeting');
  await closeRevo(app);
  return { app, plan };
}

/**
 * Opens Revo, adds what `pick` picks with +, asks, and returns what the app sent (after the answer
 * shows: the server took it).
 */
async function attachAndAsk(app: OpenApp, asks: { sent: unknown[] }, pick: () => Promise<void>, question: string): Promise<Record<string, any>> {
  const before = asks.sent.length;
  await pressId(app, 'revo-button');
  await app.until(() => app.screen.queryByTestId('revo-input') != null, 'the composer');
  await pressId(app, 'revo-plus');
  // Notes come with a day now: there is no separate Notes option.
  expect(app.screen.queryByTestId('revo-add-note')).toBeNull();
  await pick();
  await app.until(() => app.screen.queryByTestId('revo-context-chip') != null, 'the chip');
  const answers = app.screen.queryAllByTestId('revo-answer').length;
  await app.act(async () => {
    app.mods.rtl.fireEvent.changeText(app.screen.getByTestId('revo-input'), question);
  });
  await pressId(app, 'revo-send');
  await app.until(() => asks.sent.length > before && app.screen.queryAllByTestId('revo-answer').length > answers, `an answer to "${question}"`);
  expect(app.screen.queryByTestId('revo-error')).toBeNull();
  const sent = asks.sent[asks.sent.length - 1] as Record<string, any>;
  await closeRevo(app);
  return sent.attach;
}

async function search(app: OpenApp, text: string): Promise<void> {
  await pressId(app, 'revo-add-page');
  await app.until(() => app.screen.queryByTestId('revo-pick-search') != null, 'the search');
  await app.act(async () => {
    app.mods.rtl.fireEvent.changeText(app.screen.getByTestId('revo-pick-search'), text);
  });
  await pressId(app, 'revo-pick-page-0');
}

const DAY_MS = 86_400_000;
const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
const shift = (d: string, n: number) => new Date((dayNum(d) + n) * DAY_MS).toISOString().slice(0, 10);
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** The figures for some pages, worked out from the app's own data the way Insights and the streak read it. */
function expected(app: OpenApp, pagesOf: number[], today: string) {
  const pages = app.app.pages as UserPage[];
  const logs = app.app.logs as RevisionLog[];
  const user = app.app.user!;
  const byNumber = new Map(pages.map((p) => [p.pageNumber, p]));
  const memorized = pagesOf.filter((p) => byNumber.get(p)?.status === 'memorized');
  // Insights: a memorized page revised at least once, its rating; the average to one decimal.
  const rated = memorized.filter((p) => byNumber.get(p)!.lastRevisedDate).map((p) => byNumber.get(p)!.weaknessRating);
  const strength = {
    weak: rated.filter((r) => r <= 2).length,
    moderate: rated.filter((r) => r === 3).length,
    strong: rated.filter((r) => r >= 4).length,
    unrated: memorized.length - rated.length,
    average: rated.length ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10 : null,
  };
  // Times revised: the days each page was revised in a session.
  const revisedDays = (p: number) => new Set(logs.filter((l) => l.pagesRevised.includes(p) || Object.values(l.ahead ?? {}).some((x) => x.includes(p))).map((l) => l.date));
  const times = (window: number | null) => {
    const inWindow = (d: string) => window == null || dayNum(today) - dayNum(d) < window;
    const each = memorized.map((p) => [...revisedDays(p)].filter(inWindow).length);
    const days = new Set(pagesOf.flatMap((p) => [...revisedDays(p)].filter(inWindow)));
    return { days: days.size, minEach: each.length ? Math.min(...each) : 0, maxEach: each.length ? Math.max(...each) : 0 };
  };
  const lastDays = memorized.map((p) => byNumber.get(p)!.lastRevisedDate).filter((d): d is string => d != null).map((d) => d.slice(0, 10));
  // The streak's plan: a logged day's assignment, else the plan's pages; credited by the day's own
  // session or another session's pages revised for it.
  const { getPagesScheduledForDate } = app.mods.require<typeof import('../../../src/lib/algorithm')>('src/lib/algorithm');
  const memorizedPages = pages.filter((p) => p.status === 'memorized');
  const scheduled = (d: string) => {
    const log = logs.find((l) => l.date === d && l.pagesRevised.length > 0);
    if (log?.assignedPages) return log.assignedPages;
    const [y, m, dd] = d.split('-').map(Number);
    return getPagesScheduledForDate(user, new Date(y, m - 1, dd), memorizedPages);
  };
  const creditedOn = (d: string, p: number) =>
    logs.filter((l) => (l.date === d && l.pagesRevised.includes(p) && !Object.values(l.ahead ?? {}).flat().includes(p)) || (l.ahead?.[d] ?? []).includes(p)).map((l) => l.date);
  const plan = (window: number) => {
    const t = { days: 0, pages: 0, onDay: 0, late: 0, ahead: 0, skipped: 0, skippedDays: 0 };
    for (let k = 1; k <= window; k++) {
      const d = shift(today, -k);
      const mine = [...new Set(scheduled(d))].filter((p) => pagesOf.includes(p));
      if (!mine.length) continue;
      t.days++;
      t.pages += mine.length;
      let missed = false;
      for (const p of mine) {
        const by = creditedOn(d, p);
        if (by.includes(d)) t.onDay++;
        else if (by.some((x) => x < d)) t.ahead++;
        else if (by.some((x) => x > d)) t.late++;
        else {
          t.skipped++;
          missed = true;
        }
      }
      if (missed) t.skippedDays++;
    }
    return t;
  };
  // Next on the plan, as the plan editor lists the coming days.
  const { scheduledDaysFrom } = app.mods.require<typeof import('../../../src/lib/algorithm')>('src/lib/algorithm');
  const [y, m, d] = shift(today, 1).split('-').map(Number);
  const coming = scheduledDaysFrom(user, memorizedPages, new Date(y, m - 1, d), 60);
  const nextIndex = coming.findIndex((day) => day.some((p) => pagesOf.includes(p)));
  return {
    memorized: memorized.length,
    strength,
    revised: { last7: times(7), last30: times(30), all: times(null) },
    lastRevisedDaysAgo: lastDays.length ? dayNum(today) - dayNum(lastDays.sort().pop()!) : null,
    plan: { last7: plan(7), last30: plan(30) },
    next: nextIndex < 0 ? null : { inDays: nextIndex + 1, pages: coming[nextIndex].filter((p) => pagesOf.includes(p)).length },
  };
}

it('[REVO-32] Yusuf, Juz 14 and a page attached (hafiz): what Revo is sent is what Insights and the plan show', async () => {
  const { app, plan } = await scenarioWithRevo('hafiz');
  const asks = watchFunction('revoAsk');
  try {
    const today = plan.today;

    // Yusuf: by name.
    const yusuf = await attachAndAsk(app, asks, () => search(app, 'Yusuf'), 'Should I revise Yusuf now or later?');
    expect(yusuf).toMatchObject({ kind: 'surah', surah: 12, label: 'Yusuf' });
    const yf = yusuf.facts as RevoPassageFacts;
    expect(yf).toMatchObject({ pages: 14, ...expected(app, range(235, 248), today) });
    // Named by its surahs and juz, never by page numbers.
    expect(yf.name).toMatch(/^Yusuf/);
    expect(yf.name).not.toMatch(/\b2[34]\d\b/);
    for (const w of yf.weakSpots) expect(w.name).toMatch(/Yusuf|Hud/);

    // Juz 14: typed as people say it.
    const juz = await attachAndAsk(app, asks, () => search(app, 'Juz 14'), 'How many times have I revised this juz?');
    expect(juz).toMatchObject({ kind: 'juz', juz: 14, label: 'Juz 14' });
    const jf = juz.facts as RevoPassageFacts;
    expect(jf).toMatchObject({ pages: 20, ...expected(app, range(262, 281), today) });
    // The juz plan revises a juz on its day: every page of it the same number of times.
    expect(jf.revised.last30.minEach).toBe(jf.revised.last30.maxEach);

    // A page by number.
    const page = await attachAndAsk(app, asks, () => search(app, 'p. 288'), 'How is this page?');
    expect(page).toMatchObject({ kind: 'pages', pages: [288] });
    expect(page.facts).toMatchObject({ pages: 1, ...expected(app, [288], today) });

    // Insights' Juz 14 row, as the screen shows it: its pages revised at least once and their average.
    const nav = app.mods.require<Nav>('./navRef');
    await app.act(async () => nav.navigation.current.navigate('Insights'));
    await app.until(() => app.screen.queryByTestId('browse-tabs') != null, 'Insights');
    await app.act(async () => {
      const tabs = app.screen.getByTestId('browse-tabs');
      app.mods.rtl.fireEvent.press(app.mods.rtl.within(tabs).getByText('Juz'));
    });
    if (app.screen.queryByTestId('browse-juz-14') == null) await pressId(app, 'show-more');
    await app.until(() => app.screen.queryByTestId('browse-juz-14') != null, 'the Juz 14 row');
    const row: string = app.screen.getByTestId('browse-juz-14').props.accessibilityLabel;
    const [, count, average] = /Juz 14, (\d+) pages, average strength (\d\.\d)/.exec(row)!;
    const s = jf.strength;
    expect([s.weak + s.moderate + s.strong, s.average?.toFixed(1)]).toEqual([Number(count), average]);
    await app.close();
  } finally {
    asks.restore();
  }
}, 600_000);

it('[REVO-33] a day attached (heavy activity): its plan, sessions, minutes, reading and notes as Activity shows them; the picker says the notes go with it', async () => {
  const { app, plan } = await scenarioWithRevo('heavy-activity');
  const asks = watchFunction('revoAsk');
  try {
    const today = plan.today;
    // The latest day before today with a note in its log, within the picker's two weeks.
    const back = range(1, 13).find((k) => plan.notes.some((n) => n.day === shift(today, -k)))!;
    expect(back).toBeDefined();
    const day = shift(today, -back);
    const noteCount = plan.notes.filter((n) => n.day === day).length;

    let line = '';
    const attach = await attachAndAsk(
      app,
      asks,
      async () => {
        await pressId(app, 'revo-add-day');
        await app.until(() => app.screen.queryByTestId(`revo-pick-day-${back}`) != null, 'the day rows');
        // The row says what goes with the day before it is added.
        line = app.screen.getByTestId(`revo-pick-day-${back}`).props.accessibilityLabel;
        await pressId(app, `revo-pick-day-${back}`);
      },
      'How did this day go?',
    );
    expect(line).toContain(`includes ${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`);

    expect(attach).toMatchObject({ kind: 'revisionDay', day });
    expect(attach.label).toContain(`· ${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`);
    const f = attach.facts as RevoDayFacts;
    expect(f.daysAgo).toBe(back);

    // Activity's day, from its own builders and the app's data.
    const service = app.mods.require<{ getJournalEntries: (n: number) => Promise<JournalEntry[]>; getReadingSessions: () => Promise<ReadingSession[]> }>('src/services/firestoreService');
    const journal = await service.getJournalEntries(60);
    const readings = await service.getReadingSessions();
    const logs = app.app.logs as RevisionLog[];
    const { buildActivityDays, summarizeActivityDay } = app.mods.require<typeof import('../../../src/lib/activity')>('src/lib/activity');
    const shown = buildActivityDays({ logs, readings, journal }, app.app.user).find((d) => d.date === day)!;
    const summary = summarizeActivityDay(shown);
    expect(f.revised.pages).toBe(summary.revisedPages);
    expect(f.minutes).toBe(summary.revisionMinutes == null ? null : Math.round(summary.revisionMinutes));
    expect(f.readMinutes).toBe(Math.round(summary.readingSeconds / 60));
    expect(f.notes).toEqual(shown.journal!.entries.map((n) => n.text.trim()).filter(Boolean));
    expect(f.notes).toHaveLength(noteCount);

    // The day's plan: its session's pages, each revised on the day or not; done when all were.
    const session = logs.find((l) => l.date === day)!;
    const assigned = session.assignedPages ?? [];
    const revisedForIt = assigned.filter((p) => session.pagesRevised.includes(p));
    expect(f.plan).toMatchObject({ pages: assigned.length, onDay: revisedForIt.length, carried: 0 });
    expect(f.plan!.done).toBe(f.plan!.notDone === 0);
    // Ratings given that day, as the session saved them.
    const weak = session.weaknessUpdates.filter((w) => w.rating <= 2).map((w) => w.page);
    expect(f.ratings.weakPages).toEqual([...new Set(weak)].sort((a, b) => a - b));
    await app.close();
  } finally {
    asks.restore();
  }
}, 600_000);

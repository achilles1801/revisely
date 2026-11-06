// Settings → Testing → Load test scenario (BEHAVIOUR.md, RESET-3): a tester's
// account is reset and filled with each ready-made situation in turn, through
// the app's own lib/testScenarios calling the loadTestScenario function's own
// code against the emulators (harness/testerReset.js scenario). Each loaded
// account must hold every rule that can be read off it (harness/invariants)
// and keep its own promise (TESTING-CHECKLIST.md).

import { withAuthRetry } from '../harness/authRetry';
import { advance, MINUTE, setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester, serveLoadTestScenario } from '../harness/admin';
import { checkInvariants } from '../harness/invariants';
import { Home, homeStack } from '../harness/screens';
import { OpenApp, Phone } from '../harness/phone';
import { SCENARIO_IDS, ScenarioId, SeedPlan, buildScenario, parseContext } from '../../../functions/src/testScenarios';

type Lib = typeof import('../../../src/lib/testScenarios');
type AheadCredit = typeof import('../../../src/lib/aheadCredit');
type CarryOver = typeof import('../../../src/lib/carryOver');
type Algorithm = typeof import('../../../src/lib/algorithm');
type Fajr = typeof import('../../../src/lib/fajrBoundary');
type Service = typeof import('../../../src/services/firestoreService');
type Sync = typeof import('../../../src/lib/offline/sync');

const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const localDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Loads `scenario` the way Settings does, and waits for the phone to show it. */
async function load(app: OpenApp, scenario: ScenarioId): Promise<SeedPlan> {
  const lib = app.mods.require<Lib>('src/lib/testScenarios');
  const user = app.app.user;
  // The plan the server builds, from what the phone sends (the clock doesn't move meanwhile).
  const sent = lib.buildSeedContext(scenario, user, new Date());
  const plan = buildScenario(scenario, parseContext(sent, Date.now(), scenario), app.uid);
  await app.act(() => withAuthRetry(() => lib.loadTestScenario(scenario, user)));
  const dates = plan.sessions.map((s) => s.date).join();
  await app.until(
    () =>
      app.app.onboardingComplete &&
      app.app.pages.filter((p) => p.status === 'memorized').length === plan.pages.length &&
      [...app.app.logs]
        .map((l) => l.date)
        .filter((d) => !(scenario === 'offline-queue' && d === plan.today))
        .sort()
        .join() === dates,
    `the phone to show the ${scenario} scenario`,
    60_000,
  );
  await app.untilSynced().catch(() => undefined);
  return plan;
}

it('[RESET-3] a tester loads each test scenario in turn: every rule holds, and each keeps its promise', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-05 12:00');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(582, 590), user: { dailyPageCapacity: 3 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  markPreviewTester(uid);
  app = await phone.open(homeStack);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');

  const server = serveLoadTestScenario();
  try {
    for (const scenario of SCENARIO_IDS) {
      advance(3 * MINUTE); // past the two minutes between loads
      const plan = await load(app, scenario);
      const answer = server.results[server.results.length - 1] as { result?: { scenario: string; today: string } };
      expect(answer.result).toMatchObject({ scenario, today: plan.today });
      expect(app.app.user?.previewTester).toBe(true);
      await checkInvariants(app, plan);
      await promise(app, scenario, plan);
    }
    expect(server.calls).toBe(SCENARIO_IDS.length);
  } finally {
    server.restore();
  }
}, 900_000);

it('[RESET-3] an account that is not a tester is refused, and keeps everything', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-05 12:00');
  const phone = new Phone('phone');
  const app = await newAccount(phone, { memorized: pagesRange(582, 590), user: { dailyPageCapacity: 3 } });
  await app.until(() => app.app.pages.filter((p) => p.status === 'memorized').length === 9, 'the 9 memorized pages');
  const server = serveLoadTestScenario();
  try {
    const lib = app.mods.require<Lib>('src/lib/testScenarios');
    await app.act(async () => {
      await expect(withAuthRetry(() => lib.loadTestScenario('hafiz', app.app.user))).rejects.toThrow(/testers only/);
    });
    expect(server.calls).toBe(1);
    expect(app.app.pages.filter((p) => p.status === 'memorized')).toHaveLength(9);
    expect(app.app.user?.dailyPageCapacity).toBe(3);
  } finally {
    server.restore();
  }
});

/** What each scenario is for (TESTING-CHECKLIST.md), on Home and in the data. */
async function promise(app: OpenApp, scenario: ScenarioId, plan: SeedPlan): Promise<void> {
  const ahead = app.mods.require<AheadCredit>('src/lib/aheadCredit');
  const carry = app.mods.require<CarryOver>('src/lib/carryOver');
  const algorithm = app.mods.require<Algorithm>('src/lib/algorithm');
  const fajr = app.mods.require<Fajr>('src/lib/fajrBoundary');
  const svc = app.mods.require<Service>('src/services/firestoreService');
  const user = app.app.user!;
  const memorized = app.app.pages.filter((p) => p.status === 'memorized');
  const D = plan.today;
  const todays = algorithm.getPagesScheduledForDate(user, localDate(D), memorized);
  const offer = carry.leftoversFor(user, app.app.logs, D, todays, memorized);
  const home = new Home(app);
  await home.ready();

  switch (scenario) {
    case 'new':
      expect(app.app.logs).toHaveLength(0);
      expect(todays).toEqual([582, 583, 584, 585, 586]);
      expect(offer.pages).toEqual([]);
      expect(home.catchUp()).toBeNull();
      break;
    case 'beginner':
      // Two days missed and one left half done this week: the last three days' leftovers are offered.
      expect(offer.days.map((d) => d.day)).toEqual([addDays(D, -3), addDays(D, -2)]);
      expect(offer.days.find((d) => d.day === addDays(D, -2))?.missed).toBe(true);
      expect(home.catchUp()).toMatch(/Revise/);
      break;
    case 'hafiz':
      expect(app.app.logs).toHaveLength(55);
      expect(user.scheduleMode).toBe('juz');
      expect(todays).toEqual(pagesRange(1, 21)); // day 60 of a 30-day cycle: Juz 1 again
      expect((await app.act(() => svc.listRecordingDocs(app.uid))).live).toHaveLength(3);
      break;
    case 'partial-today': {
      const today = app.app.logs.find((l) => l.date === D)!;
      expect(today.pagesRevised).toHaveLength(2);
      expect(offer.days).toEqual([{ day: addDays(D, -1), ago: 1, missed: false }]);
      expect(offer.pages).toHaveLength(2);
      expect(home.catchUp()).toMatch(/Left yesterday/);
      break;
    }
    case 'missed-days':
      expect(app.app.logs.map((l) => l.date).sort().pop()).toBe(addDays(D, -3));
      expect(offer.days.filter((d) => d.missed).map((d) => d.day)).toEqual([addDays(D, -2), addDays(D, -1)]);
      expect(home.catchUp()).toMatch(/Missed/);
      break;
    case 'revise-ahead': {
      const tomorrow = algorithm.getPagesScheduledForDate(user, localDate(addDays(D, 1)), memorized);
      expect([...ahead.creditedOnDay(app.app.logs, addDays(D, 1))]).toEqual(tomorrow.slice(0, 2));
      expect(ahead.doneOnDay(app.app.logs, D).size).toBe(5); // its own three and the two ahead
      expect(home.ahead()).toMatch(/starts at/);
      break;
    }
    case 'fajr-edge': {
      expect(user.fajrBoundaryEnabled).toBe(true);
      // Opened at 00:30 on the calendar day after: still that revision day.
      const late = plan.sessions.find((s) => s.date === addDays(D, -2))!;
      expect(new Date(late.createdAt).getDate()).toBe(localDate(addDays(D, -1)).getDate());
      expect(fajr.revisionDayOf(late.createdAt, user)).toBe(addDays(D, -2));
      expect(app.app.logs.map((l) => l.date)).toContain(addDays(D, -2));
      break;
    }
    case 'custom-reverse':
      expect(todays).toEqual([598, 597, 596, 595]); // the plan's third day, two days in
      expect(user.customPlan?.direction).toBe('reverse');
      break;
    case 'heavy-activity': {
      const items = await app.act(() => svc.getActivityItemsBetween(addDays(D, -120), D, app.uid));
      expect(new Set(items.memorized.map((m) => m.day.slice(0, 7))).size).toBeGreaterThanOrEqual(3);
      expect(items.reads.length).toBeGreaterThan(10);
      expect(user.smartTrackingEnabled).toBe(true);
      break;
    }
    case 'offline-queue': {
      // Held: today's session, a note and a reading wait on the phone; the server has none of them.
      const sync = app.mods.require<Sync>('src/lib/offline/sync');
      expect(sync.isSyncHeld(app.uid)).toBe(true);
      expect(app.app.pendingChanges).toBe(3);
      expect(app.app.logs.find((l) => l.date === D)?.pagesRevised).toEqual(todays);
      const onServer = async () => (await app.act(() => svc.getSession(D, app.uid))) != null;
      expect(await onServer()).toBe(false);
      // Send held changes: they reach the server, in order (SYNC-1).
      await app.act(async () => sync.releaseSync(app.uid));
      await app.until(() => app.app.pendingChanges === 0, 'the held changes to be sent');
      expect(await onServer()).toBe(true);
      const notes = await app.act(() => svc.getJournalEntries(400, app.uid));
      expect(notes.find((d) => d.date === D)?.entries).toHaveLength(1);
      expect((await app.act(() => svc.getReadingSessions(500, app.uid))).some((r) => r.date === D)).toBe(true);
      break;
    }
  }
}

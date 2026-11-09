// A tester's account with one of Settings → Testing's test scenarios loaded
// (RESET-3), the way Majd starts each part of his test pass: the app's own
// lib/testScenarios calls the real loadTestScenario function in the functions
// emulator (harness/functions), and the phone shows the scenario with no relaunch.

import { withAuthRetry } from './authRetry';
import { setNow, setZone, ZONES } from './clock';
import { newAccount, pagesRange } from './account';
import { markPreviewTester } from './admin';
import { homeStack } from './screens';
import { OpenApp, Phone } from './phone';
import { ScenarioId, SeedPlan, buildScenario, parseContext } from '../../../functions/src/testScenarios';

type Lib = typeof import('../../../src/lib/testScenarios');

/**
 * Whether the phone shows the scenario's plan: the user document's schedule fields, which the
 * server writes last (after the pages and sessions), so a phone can show the new pages and
 * sessions under the plan it had before for a moment. The pages and sessions alone weren't
 * enough: RESET-3 checked "beginner"'s sessions against "new"'s plan (#400's CI), and
 * checklistPlans and checklistCatchUp read Home under scenarioPhone's own three pages a day
 * (#422's CI).
 */
export function planShown(user: Record<string, unknown> | null | undefined, want: Record<string, unknown>): boolean {
  if (!user) return false;
  for (const key of ['scheduleMode', 'dailyPageCapacity', 'dailyJuzCount', 'scheduleAnchorDate', 'fajrBoundaryEnabled', 'smartTrackingEnabled']) {
    if (key in want && user[key] !== want[key]) return false;
  }
  if ('customPlan' in want) {
    const plan = want.customPlan as { cycleStartDate: string; direction: string } | null;
    const shown = user.customPlan as { days?: unknown[]; cycleStartDate?: string; direction?: string } | null | undefined;
    if (plan === null) return !shown || !shown.days?.length;
    return shown?.cycleStartDate === plan.cycleStartDate && shown?.direction === plan.direction;
  }
  return true;
}

/** Loads `scenario` the way Settings does, and waits for the phone to show it, plan and all. */
export async function loadScenario(app: OpenApp, scenario: ScenarioId): Promise<SeedPlan> {
  const lib = app.mods.require<Lib>('src/lib/testScenarios');
  const user = app.app.user;
  // The plan the server builds, from what the phone sends (the clock doesn't move meanwhile).
  const sent = lib.buildSeedContext(scenario, user, new Date());
  const plan = buildScenario(scenario, parseContext(sent, Date.now(), scenario), app.uid);
  await app.act(() => withAuthRetry(() => lib.loadTestScenario(scenario, user)));
  const dates = plan.sessions.map((s) => s.date).join();
  await app.until(
    () =>
      planShown(app.app.user as unknown as Record<string, unknown> | null, plan.user) &&
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

/**
 * A new tester account on a new phone, at `at` in `zone` (Chicago, Thursday
 * Nov 5 2026 at noon by default), with `scenario` loaded and Home open.
 */
export async function scenarioPhone(
  scenario: ScenarioId,
  opts: { zone?: string; at?: string; before?: (app: OpenApp) => Promise<void> } = {},
): Promise<{ phone: Phone; app: OpenApp; plan: SeedPlan; D: string }> {
  setZone(opts.zone ?? ZONES.chicago);
  setNow(opts.at ?? '2026-11-05 12:00');
  const phone = new Phone('phone');
  // An account that has been through onboarding, as a tester's is.
  let app = await newAccount(phone, { memorized: pagesRange(582, 590), user: { dailyPageCapacity: 3 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  app = await phone.open(homeStack);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  // What the phone holds before the load (a recording, say).
  if (opts.before) await opts.before(app);
  const plan = await loadScenario(app, scenario);
  return { phone, app, plan, D: plan.today };
}

/** The calendar day `n` days from `day` ('YYYY-MM-DD'). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

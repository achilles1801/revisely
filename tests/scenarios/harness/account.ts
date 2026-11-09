// Accounts for scenarios, made the way the app makes them: sign-up through
// AuthContext, then onboarding through the same context calls the onboarding
// screens make (JuzSelectionScreen → updatePages, ScheduleScreen →
// createDefaultUser + saveUser + completeOnboarding).

import { withAuthRetry } from './authRetry';
import type { User, UserPage } from '../../../src/types';
import { newEmail, OpenApp, Phone } from './phone';

export interface Plan {
  /** Memorized pages (by number). */
  memorized: number[];
  /** Fields of the user as onboarding (or Settings) sets them: dailyPageCapacity, scheduleMode, fajrBoundaryEnabled, locationCoords, carryOverMode, customPlan… */
  user?: Partial<User>;
}

export const CITIES = {
  chicago: { latitude: 41.88, longitude: -87.63 },
  newYork: { latitude: 40.71, longitude: -74.01 },
  london: { latitude: 51.51, longitude: -0.13 },
  makkah: { latitude: 21.42, longitude: 39.83 },
  amman: { latitude: 31.95, longitude: 35.93 },
  sydney: { latitude: -33.87, longitude: 151.21 },
  reykjavik: { latitude: 64.15, longitude: -21.94 },
  kathmandu: { latitude: 27.72, longitude: 85.32 },
  kiritimati: { latitude: 1.87, longitude: -157.43 },
  suva: { latitude: -18.14, longitude: 178.44 },
} as const;

export function pagesRange(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/**
 * Signs up on `phone`, waits for the account to load in that same launch
 * (SYNC-4: it once stayed on "loading" until a relaunch), then until the server
 * holds it, and relaunches, so that scenarios start from an account that exists.
 */
export async function signUpAndRelaunch(phone: Phone, email = newEmail()): Promise<OpenApp> {
  let app = phone.current ?? (await phone.open());
  await app.act(() =>
    withAuthRetry(() => app.auth.signUp(email, 'scenario-password', 'Scenario'), {
      ifCreated: () => app.auth.signIn(email, 'scenario-password'),
    }),
  );
  phone.email = email;
  await app.untilLoaded();
  const svc = app.mods.require<typeof import('../../../src/services/firestoreService')>('src/services/firestoreService');
  const uid = app.uid;
  const deadline = performance.now() + 45_000;
  while (!(await svc.pagesExistOnServer(uid)) || !(await svc.userDocExistsOnServer(uid))) {
    if (performance.now() > deadline) throw new Error('the new account never reached the server');
    await app.idle(100);
  }
  await app.close();
  app = await phone.open();
  await app.untilLoaded();
  return app;
}

/** Onboarding: the memorized pages, then the plan (ScheduleScreen.handleStart). */
export async function onboard(app: OpenApp, plan: Plan): Promise<void> {
  const memorized = new Set(plan.memorized);
  const changed: UserPage[] = app.app.pages
    .filter((p) => memorized.has(p.pageNumber))
    .map((p) => ({ ...p, status: 'memorized' as const, dateMemorized: new Date().toISOString() }));
  await app.act(() => app.app.updatePages(changed, changed.map((p) => p.pageNumber)));
  // As ScheduleScreen: the name from sign-up.
  const name = app.auth.firebaseUser && (app.auth.firebaseUser as { displayName?: string | null }).displayName;
  const user = app.app.createDefaultUser({
    name: name || undefined,
    dailyPageCapacity: 5,
    notificationsEnabled: false,
    ...plan.user,
  });
  await app.act(() => Promise.all([app.app.saveUser(user), app.app.completeOnboarding()]));
  await app.until(
    () => app.app.onboardingComplete && app.app.pages.filter((p) => p.status === 'memorized').length === memorized.size,
    'onboarding to show',
  );
  await app.untilSynced();
}

/** A signed-up, onboarded account on `phone`, with the app open. */
export async function newAccount(phone: Phone, plan: Plan): Promise<OpenApp> {
  const app = await signUpAndRelaunch(phone);
  await onboard(app, plan);
  return app;
}

/**
 * A new custom plan saved from the plan editor (PlanEditScreen.handleSave with a
 * new plan): the days from today's revision day, through the same functions.
 */
export async function saveCustomPlan(
  app: OpenApp,
  days: number[][],
  direction: 'forward' | 'reverse' = 'forward',
  /** A saved plan loaded and saved keeps its name (SCHED-7). */
  name?: string,
): Promise<void> {
  const { createCustomPlanFromDraft } = app.mods.require<typeof import('../../../src/lib/schedulePlans')>('src/lib/schedulePlans');
  const { userWithNewSchedule } = app.mods.require<typeof import('../../../src/lib/planChange')>('src/lib/planChange');
  const { getRevisionDateForUser } = app.mods.require<typeof import('../../../src/lib/fajrBoundary')>('src/lib/fajrBoundary');
  const user = app.app.user!;
  const revisionDate = getRevisionDateForUser(user);
  const memorized = app.app.pages.filter((p) => p.status === 'memorized');
  const plan = createCustomPlanFromDraft(days, direction, revisionDate, name);
  const next = userWithNewSchedule(user, { customPlan: plan }, { revisionDate, memorized, logs: app.app.logs, newPlan: true });
  await app.act(() => app.app.saveUser(next));
  await app.untilSynced();
}

/**
 * An edit of the plan shown, saved from the plan editor (PlanEditScreen: the
 * days it opens with, `initialState`, then handleSave with newPlan false).
 * `edit` gets the days as the editor shows them (today first) and returns the
 * days to save.
 */
export async function saveEditedPlan(app: OpenApp, edit: (shown: number[][]) => number[][]): Promise<void> {
  const algorithm = app.mods.require<typeof import('../../../src/lib/algorithm')>('src/lib/algorithm');
  const plans = app.mods.require<typeof import('../../../src/lib/schedulePlans')>('src/lib/schedulePlans');
  const builder = app.mods.require<typeof import('../../../src/lib/planBuilder')>('src/lib/planBuilder');
  const { userWithNewSchedule } = app.mods.require<typeof import('../../../src/lib/planChange')>('src/lib/planChange');
  const { getRevisionDateForUser } = app.mods.require<typeof import('../../../src/lib/fajrBoundary')>('src/lib/fajrBoundary');
  const user = app.app.user!;
  const plan = user.customPlan;
  if (!plan || plan.days.length === 0) throw new Error('saveEditedPlan: no custom plan to edit');
  const revisionDate = getRevisionDateForUser(user);
  const memorized = app.app.pages.filter((p) => p.status === 'memorized');
  const shifted = (user.scheduleShiftPages ?? 0) > 0 && plan.cycleStartDate <= plans.dateToLocalISODay(revisionDate);
  const shown = shifted
    ? algorithm.scheduledDaysFrom(user, memorized, revisionDate, plan.days.length)
    : builder.rotateCustomPlanToToday(plan, revisionDate);
  // The editor keeps the plan's name through an edit (SCHED-7).
  const saved = plans.createCustomPlanFromDraft(edit(shown.map((d) => [...d])), plan.direction, revisionDate, plan.name);
  const next = userWithNewSchedule(user, { customPlan: saved }, { revisionDate, memorized, logs: app.app.logs, newPlan: false });
  await app.act(() => app.app.saveUser(next));
  await app.untilSynced();
}

/** Changes the user the way Settings does (saveUser with the edited user). */
export async function changeUser(app: OpenApp, fields: Partial<User>): Promise<void> {
  const user = app.app.user;
  if (!user) throw new Error('no user loaded');
  await app.act(() => app.app.saveUser({ ...user, ...fields }));
}

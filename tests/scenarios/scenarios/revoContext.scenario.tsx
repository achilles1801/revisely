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
import { markPreviewTester } from '../harness/admin';
import { loadScenario } from '../harness/testScenario';
import { Home, homeStack } from '../harness/screens';
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

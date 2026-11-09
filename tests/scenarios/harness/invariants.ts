// BEHAVIOUR.md's rules that can be read off an account at rest: what the phone
// holds (useApp), what the schedule gives each day, and what the server holds
// for the day's log, readings and Activity items. checkInvariants runs them all
// against a phone showing a loaded test scenario (RESET-3), with the scenario as
// the server built it to compare with.

import type { OpenApp } from './phone';
import type { SeedPlan } from '../../../functions/src/testScenarios';
import type { User, UserPage } from '../../../src/types';

type Fajr = typeof import('../../../src/lib/fajrBoundary');
type Algorithm = typeof import('../../../src/lib/algorithm');
type CarryOver = typeof import('../../../src/lib/carryOver');
type AheadCredit = typeof import('../../../src/lib/aheadCredit');
type Service = typeof import('../../../src/services/firestoreService');

const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
};
const localDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

function fail(rule: string, message: string): never {
  throw new Error(`[${rule}] ${message}`);
}

/** Checks the phone and the server's account against every rule that applies. */
export async function checkInvariants(app: OpenApp, plan: SeedPlan): Promise<void> {
  const fajr = app.mods.require<Fajr>('src/lib/fajrBoundary');
  const algorithm = app.mods.require<Algorithm>('src/lib/algorithm');
  const carry = app.mods.require<CarryOver>('src/lib/carryOver');
  const ahead = app.mods.require<AheadCredit>('src/lib/aheadCredit');
  const svc = app.mods.require<Service>('src/services/firestoreService');
  const user = app.app.user as User;
  const logs = app.app.logs;
  const memorized: UserPage[] = app.app.pages.filter((p) => p.status === 'memorized');
  const memorizedSet = new Set(memorized.map((p) => p.pageNumber));
  const today = fajr.getRevisionDayForUser(user);
  const scheduled = (day: string) => algorithm.getPagesScheduledForDate(user, localDate(day), memorized);

  // RESET-3: the phone shows the account as the scenario made it.
  if (!app.app.onboardingComplete) fail('RESET-3', 'onboarding is not done');
  const want = plan.pages.map((p) => p.pageNumber);
  if (JSON.stringify([...memorizedSet].sort((a, b) => a - b)) !== JSON.stringify(want)) {
    fail('RESET-3', `memorized pages ${memorizedSet.size}, the scenario has ${want.length}`);
  }
  // Changes still waiting on the phone (the Offline queue scenario holds them) show
  // through the outbox; the server's sessions are the rest.
  const outbox = app.mods.require<typeof import('../../../src/lib/offline/outbox')>('src/lib/offline/outbox');
  const waiting = new Set(
    outbox
      .pendingEntries(app.uid)
      .filter((e) => e.op.kind === 'session.add')
      .map((e) => (e.op as { date: string }).date),
  );
  const shown = [...logs]
    .filter((l) => !waiting.has(l.date))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => `${l.date}:${l.pagesRevised.join(',')}`);
  const seeded = plan.sessions.map((s) => `${s.date}:${s.pagesRevised.join(',')}`);
  if (JSON.stringify(shown) !== JSON.stringify(seeded)) fail('RESET-3', `sessions ${shown.join(' ')} vs ${seeded.join(' ')}`);

  // DAY-1, DAY-2: the revision day is the one the scenario was built for.
  if (today !== plan.today) fail(user.fajrBoundaryEnabled ? 'DAY-2' : 'DAY-1', `today is ${today}, the scenario's ${plan.today}`);

  // DAY-4, DAY-9: each session on the revision day it was opened on, nothing on a day not started.
  for (const s of plan.sessions) {
    if (s.date > today) fail('DAY-9', `a session on ${s.date}, after today ${today}`);
    if (fajr.revisionDayOf(s.createdAt, user) !== s.date) fail('DAY-4', `the session opened at ${new Date(s.createdAt).toISOString()} is on ${s.date}`);
  }

  // SCHED-1–4, SCHED-6: today's pages, by the plan.
  const todays = scheduled(today);
  if (new Set(todays).size !== todays.length) fail('SCHED-6', `today holds a page twice: ${todays.join(',')}`);
  for (const p of todays) if (!memorizedSet.has(p)) fail('SCHED-1', `today holds page ${p}, not memorized`);
  if (user.customPlan && user.customPlan.days.length > 0) {
    const k = algorithm.calendarDaysBetween(localDate(user.customPlan.cycleStartDate), localDate(today));
    const day = user.customPlan.days[((k % user.customPlan.days.length) + user.customPlan.days.length) % user.customPlan.days.length];
    if (JSON.stringify(todays) !== JSON.stringify(day)) fail('SCHED-3', `today ${todays.join(',')} vs the plan's ${day.join(',')}`);
    if (user.customPlan.direction === 'reverse') {
      const flat = user.customPlan.days.flat();
      if (flat[0] < flat[flat.length - 1]) fail('SCHED-4', 'a reverse plan that runs forward');
    }
  } else if (user.scheduleMode === 'juz') {
    const juz = new Set(todays.map(algorithm.juzKeyForPage));
    const theirs = memorized.map((p) => p.pageNumber).filter((p) => juz.has(algorithm.juzKeyForPage(p)));
    if (todays.length !== theirs.length) fail('SCHED-2', `today's juz ${[...juz].join(',')} hold ${theirs.length} pages, today has ${todays.length}`);
  } else if (todays.length !== Math.min(user.dailyPageCapacity, memorizedSet.size)) {
    fail('SCHED-1', `today has ${todays.length} pages, the plan ${user.dailyPageCapacity}`);
  }
  // Each day's session was given that day's pages (the server's plan is the app's).
  if (plan.scenario !== 'heavy-activity') {
    for (const s of plan.sessions) {
      if (JSON.stringify(s.assignedPages) !== JSON.stringify(scheduled(s.date))) {
        fail('SCHED-5', `${s.date}'s session holds ${s.assignedPages.join(',')}, the schedule ${scheduled(s.date).join(',')}`);
      }
    }
  }

  // AHEAD-2: a page revised ahead is one the later day is scheduled to have.
  for (const log of logs) {
    for (const [day, pages] of Object.entries(log.ahead ?? {})) {
      const theirs = new Set(scheduled(day));
      for (const p of pages) if (!theirs.has(p)) fail('AHEAD-2', `page ${p} credited to ${day}, not scheduled then`);
    }
  }

  // SESS-2: a day whose own pages were all revised is done.
  for (const s of plan.sessions) {
    if (s.state !== 'COMPLETED') continue;
    const done = ahead.doneOnDay(logs, s.date);
    for (const p of s.assignedPages) if (!done.has(p)) fail('SESS-2', `${s.date} was completed, page ${p} not done`);
  }

  // CARRY-1: what Home offers comes from the last three days and was not revised since.
  const offer = carry.leftoversFor(user, logs, today, todays, memorized);
  const recent = new Set(logs.filter((l) => l.date >= addDays(today, -3) && l.date <= today).flatMap((l) => l.pagesRevised));
  for (const p of offer.pages) if (recent.has(p)) fail('CARRY-1', `page ${p} offered, revised in the last three days`);
  for (const d of offer.days) if (d.ago < 1 || d.ago > 3) fail('CARRY-1', `a day ${d.ago} days back offered`);

  // LOG-1, LOG-3, DAY-9: every note of the scenario is in the log, on its revision day.
  const journal = await app.act(() => svc.getJournalEntries(400, app.uid));
  const notes = journal.flatMap((d) => d.entries.map((n) => ({ ...n, day: d.date })));
  if (notes.length !== plan.notes.length) fail('LOG-1', `${notes.length} notes in the log, the scenario wrote ${plan.notes.length}`);
  for (const n of notes) {
    if (n.day > today) fail('DAY-9', `a note on ${n.day}, after today`);
    if (fajr.revisionDayOf(n.at, user) !== n.day) fail('LOG-3', `the note at ${new Date(n.at).toISOString()} is on ${n.day}`);
  }

  // DAY-9: timed readings on the revision day they started.
  const readings = await app.act(() => svc.getReadingSessions(500, app.uid));
  if (readings.length !== plan.readingSessions.length) fail('DAY-9', `${readings.length} readings, the scenario wrote ${plan.readingSessions.length}`);
  for (const r of readings) {
    const startedAt = typeof r.startedAt === 'number' ? r.startedAt : new Date(r.startedAt as unknown as string).getTime();
    if (fajr.revisionDayOf(startedAt, user) !== r.date) fail('DAY-9', `the reading at ${new Date(startedAt).toISOString()} is on ${r.date}`);
  }

  // ACT-1, ACT-2: the Activity items beside each session (dual write) and each reading.
  const first = [plan.today, ...plan.sessions.map((s) => s.date), ...plan.memorizations.map((m) => m.day), ...plan.readingSessions.map((r) => r.date)]
    .sort()[0];
  const items = await app.act(() => svc.getActivityItemsBetween(first, plan.today, app.uid));
  const key = (x: { id: string; day: string; pages: number[] }) => `${x.id}@${x.day}:${[...x.pages].sort((a, b) => a - b).join(',')}`;
  const same = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  if (!same(items.revisions.map(key), plan.revisions.map(key))) fail('ACT-2', 'the Revised items are not the sessions’');
  for (const r of items.revisions) {
    const s = plan.sessions.find((x) => x.date === r.day);
    if (!s) fail('ACT-2', `a Revised item on ${r.day} with no session`);
  }
  if (!same(items.reads.map(key), plan.reads.map(key))) fail('ACT-2', 'the Read items are not the readings’');
  for (const m of plan.memorizations) {
    if (fajr.revisionDayOf(m.occurredAt, user) !== m.day) fail('ACT-1', `memorized at ${new Date(m.occurredAt).toISOString()} filed on ${m.day}`);
  }
  if (!same(items.memorized.map(key), plan.memorizations.filter((m) => m.day >= first).map(key))) {
    fail('ACT-1', 'the Memorized items are not the scenario’s');
  }
}

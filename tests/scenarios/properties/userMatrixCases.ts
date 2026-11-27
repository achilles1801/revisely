// The accounts and rules of the user-matrix property test (userMatrix.property.ts; tests/scenarios/USER-MATRIX.md).
//
// Every kind of user: accounts generated across the matrix (how much is memorized,
// the plan, the days before today and today itself, the settings, the clock), run through what each screen shows,
// with the app's own code, and checked against the rules every screen keeps.
//
// Majd, Nov 27 2026, after Home showed a new account's "Mark memorized pages" on a rest day of his plan (HOME-9): "can
// we have a session sweep through all different possible scenarios that could arise from every type of user so we can
// make sure we take into account every single case and edge case so bugs like this never come again".
//
// Home's Today post comes from lib/homeToday, the function Home draws; the widget from lib/widgets/snapshot; the
// reminders from lib/reminders/plan; what Revo is told and its greeting from lib/revo. No screen's output is worked
// out here: the test only builds accounts and checks what comes back.

import fc from 'fast-check';
import { getPagesForDay } from '../../../src/lib/algorithm';
import { nextRevisionDayPlan } from '../../../src/lib/aheadPlan';
import { getPagesForJuz, getQuranData } from '../../../src/lib/quranData';
import { ayahsOnPage } from '../../../src/lib/ayahKeys';
import { getNextRevisionDayStart, getRevisionDateForUser, getRevisionDayForUser } from '../../../src/lib/fajrBoundary';
import { formatPercent, homeToday, homeTodayTexts, type HomeToday } from '../../../src/lib/homeToday';
import { applyCarryOver, leftoversFor } from '../../../src/lib/carryOver';
import { handLogsOf } from '../../../src/lib/activityHistory';
import { revisablePages } from '../../../src/lib/memorizedAyahs';
import { createCustomPlanFromDraft } from '../../../src/lib/schedulePlans';
import { buildDefaultPlanDays } from '../../../src/lib/algorithm';
import { buildWidgetSnapshot } from '../../../src/lib/widgets/snapshot';
import { planRevisionReminders, type PlannedReminder } from '../../../src/lib/reminders/plan';
import { buildRevoContext } from '../../../src/lib/revo/context';
import { greetingExtrasFor, revoGreeting } from '../../../src/lib/revo/greeting';
import { t } from '../../../src/i18n';
import type { HistoryItem } from '../../../src/lib/streakFromItems';
import type { RevisionLog, User, UserPage } from '../../../src/types';
import { addDays } from '../harness/clock';
import { CITIES, baseUser, dayFromIndex, methodArb, useZone, zoneArb } from './fixtures';


const QURAN = getQuranData();
const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
const parse = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// ---------------------------------------------------------------------------
// The account

/** How much is memorized: the matrix's rows, from nothing to all 604, a part of a page among them (MEM-4). */
export type Memorized = { kind: string; whole: number[]; part: { page: number; keep: number } | null };

export const memorizedArb: fc.Arbitrary<Memorized> = fc.oneof(
  fc.constant<Memorized>({ kind: 'none', whole: [], part: null }),
  fc.integer({ min: 1, max: 604 }).map((p) => ({ kind: 'one page', whole: [p], part: null })),
  // Part of one page and nothing else (only An-Nas, say), or beside whole pages.
  fc
    .record({ page: fc.integer({ min: 1, max: 604 }), keep: fc.integer({ min: 1, max: 50 }), whole: fc.uniqueArray(fc.integer({ min: 1, max: 604 }), { maxLength: 6 }) })
    .map(({ page, keep, whole }) => ({ kind: 'part of a page', whole: whole.filter((p) => p !== page), part: { page, keep } })),
  fc.integer({ min: 1, max: 30 }).map((j) => ({ kind: 'one juz', whole: getPagesForJuz(j), part: null })),
  fc.uniqueArray(fc.integer({ min: 1, max: 604 }), { minLength: 2, maxLength: 40 }).map((whole) => ({ kind: 'scattered', whole, part: null })),
  fc
    .tuple(fc.integer({ min: 1, max: 604 }), fc.integer({ min: 1, max: 300 }))
    .map(([a, n]) => ({ kind: 'a run', whole: range(a, Math.min(604, a + n)), part: null })),
  fc.uniqueArray(fc.integer({ min: 1, max: 604 }), { maxLength: 30 }).map((gaps) => ({ kind: 'most', whole: range(1, 604).filter((p) => !gaps.includes(p)), part: null })),
  fc.constant<Memorized>({ kind: 'all 604', whole: range(1, 604), part: null }),
  // All but the last ayahs of one page (99.9…%).
  fc
    .record({ page: fc.integer({ min: 1, max: 604 }), keep: fc.integer({ min: 1, max: 50 }) })
    .map(({ page, keep }) => ({ kind: 'all but part of a page', whole: range(1, 604).filter((p) => p !== page), part: { page, keep } })),
);

export function pagesFor(m: Memorized): UserPage[] {
  const whole = new Set(m.whole);
  return range(1, 604).map((pageNumber) => {
    const base: UserPage = { pageNumber, status: 'not_memorized', dateMemorized: null, weaknessRating: 4, lastRevisedDate: null, totalRevisionCount: 0, skipCount: 0 };
    if (whole.has(pageNumber)) return { ...base, status: 'memorized', dateMemorized: '2025-01-01' };
    if (m.part && m.part.page === pageNumber) {
      const ayahs = ayahsOnPage(pageNumber);
      // Some of its ayahs, never all (all of them make it memorized), at least one.
      const keep = ayahs.length > 1 ? ayahs.slice(0, 1 + (m.part.keep % (ayahs.length - 1))) : [];
      return keep.length > 0 ? { ...base, status: 'in_progress', verses: keep } : base;
    }
    return base;
  });
}

/** The plan: pages or juz a day, or a custom plan (rest days, all rest, reverse), started some time ago or later. */
export type PlanKind =
  | { kind: 'pages'; perDay: number }
  | { kind: 'juz'; perDay: number }
  | { kind: 'custom'; days: number[][] | 'reverse' | 'all rest'; startsIn: number };

export const planArb: fc.Arbitrary<PlanKind> = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 1, max: 40 }).map((perDay) => ({ kind: 'pages' as const, perDay })) },
  { weight: 2, arbitrary: fc.integer({ min: 1, max: 3 }).map((perDay) => ({ kind: 'juz' as const, perDay })) },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant('custom' as const),
      // Its days by position in the memorized pages (filled in once they're known); an empty day is a rest day.
      days: fc.oneof(
        { weight: 4, arbitrary: fc.array(fc.oneof({ weight: 1, arbitrary: fc.constant([] as number[]) }, { weight: 3, arbitrary: fc.uniqueArray(fc.integer({ min: 0, max: 603 }), { minLength: 1, maxLength: 15 }) }), { minLength: 1, maxLength: 14 }) },
        { weight: 1, arbitrary: fc.constant('reverse' as const) },
        { weight: 1, arbitrary: fc.constant('all rest' as const) },
      ),
      // Saved this many days ago (negative: it starts later).
      startsIn: fc.integer({ min: -5, max: 60 }),
    }),
  },
);

/** The days before today, newest first: a stretch away, then a stretch of days each done, part done or missed. */
export type Past = { away: number; days: ('done' | 'part' | 'missed')[] };
export const pastArb: fc.Arbitrary<Past> = fc.record({
  away: fc.oneof(fc.constant(0), fc.constant(1), fc.integer({ min: 2, max: 6 }), fc.integer({ min: 14, max: 60 })),
  days: fc.array(fc.constantFrom<'done' | 'part' | 'missed'>('done', 'done', 'done', 'part', 'missed'), { maxLength: 14 }),
});

/** Today. */
export type Today = 'none' | 'part' | 'done' | 'done and ahead' | 'done ahead yesterday' | 'by hand';
export const todayArb = fc.constantFrom<Today>('none', 'none', 'part', 'done', 'done and ahead', 'done ahead yesterday', 'by hand');

export type Case = {
  zone: string;
  dayIndex: number;
  hour: number;
  minute: number;
  memorized: Memorized;
  plan: PlanKind;
  anchorDaysAgo: number;
  smart: boolean;
  fajr: { on: false } | { on: true; city: keyof typeof CITIES; method: string };
  carryMode: 'shift' | 'add' | undefined;
  past: Past;
  today: Today;
  addLeftovers: boolean;
  insights: number[];
  historyLoaded: boolean;
};

export const caseArb: fc.Arbitrary<Case> = fc.record({
  zone: zoneArb,
  dayIndex: fc.integer({ min: 30, max: 1060 }),
  hour: fc.constantFrom(0, 1, 3, 6, 9, 12, 15, 18, 21, 23),
  minute: fc.constantFrom(0, 30, 59),
  memorized: memorizedArb,
  plan: planArb,
  anchorDaysAgo: fc.integer({ min: -5, max: 400 }),
  smart: fc.boolean(),
  fajr: fc.oneof(
    { weight: 2, arbitrary: fc.constant({ on: false as const }) },
    { weight: 1, arbitrary: fc.record({ on: fc.constant(true as const), city: fc.constantFrom(...(Object.keys(CITIES) as (keyof typeof CITIES)[])), method: methodArb }) },
  ),
  carryMode: fc.constantFrom<'shift' | 'add' | undefined>('shift', 'add', undefined),
  past: pastArb,
  today: todayArb,
  addLeftovers: fc.boolean(),
  insights: fc.uniqueArray(fc.integer({ min: 0, max: 603 }), { maxLength: 4 }),
  historyLoaded: fc.boolean(),
});

export interface Built {
  user: User;
  pages: UserPage[];
  logs: RevisionLog[];
  history: HistoryItem[] | null;
  now: Date;
  day: string;
  date: Date;
}

let ids = 0;
const sessionOn = (date: string, revised: number[], assigned: number[], ahead?: Record<string, number[]>): RevisionLog => ({
  id: `s${++ids}`,
  date,
  assignedPages: assigned,
  pagesRevised: revised,
  pagesSkipped: [],
  weaknessUpdates: [],
  durationMinutes: 10,
  ...(ahead ? { ahead } : {}),
});

/** The account a case describes, at its moment: the user, its pages, its sessions and its hand-logged pages. */
export function build(c: Case): Built {
  // With the Fajr boundary on, the phone is in the saved place's zone.
  const zone = c.fajr.on ? CITIES[c.fajr.city].zone : c.zone;
  useZone(zone);
  const now = dayFromIndex(c.dayIndex, c.hour, c.minute);
  const pages = pagesFor(c.memorized);
  const memorized = revisablePages(pages);
  const numbers = memorized.map((p) => p.pageNumber);
  const at = (i: number) => numbers[i % Math.max(1, numbers.length)];

  let user: User = {
    ...baseUser,
    id: 'matrix',
    smartTrackingEnabled: c.smart,
    dailyPageCapacity: c.plan.kind === 'pages' ? c.plan.perDay : 5,
    scheduleMode: c.plan.kind === 'juz' ? 'juz' : 'pages',
    dailyJuzCount: c.plan.kind === 'juz' ? c.plan.perDay : 1,
    scheduleAnchorDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - c.anchorDaysAgo, 12).toISOString(),
    fajrBoundaryEnabled: c.fajr.on,
    locationCoords: c.fajr.on ? { latitude: CITIES[c.fajr.city].latitude, longitude: CITIES[c.fajr.city].longitude } : null,
    fajrCalculationMethod: c.fajr.on ? c.fajr.method : baseUser.fajrCalculationMethod,
    ...(c.carryMode ? { carryOverMode: c.carryMode } : {}),
  };
  const day = getRevisionDayForUser(user, now);
  const date = getRevisionDateForUser(user, now);

  if (c.plan.kind === 'custom' && numbers.length > 0) {
    const saved = parse(addDays(day, -c.plan.startsIn));
    const days =
      c.plan.days === 'reverse'
        ? buildDefaultPlanDays(user, memorized, 'reverse', saved)
        : c.plan.days === 'all rest'
          ? [[], [], []]
          : c.plan.days.map((d) => [...new Set(d.map(at))]);
    user = { ...user, customPlan: createCustomPlanFromDraft(days, c.plan.days === 'reverse' ? 'reverse' : 'forward', saved) };
  }

  // The days before today: each done, part done or missed, as its own day's pages were then; then the stretch away.
  const logs: RevisionLog[] = [];
  c.past.days.forEach((kind, i) => {
    const d = addDays(day, -(c.past.away + 1 + i));
    const due = getPagesForDay(user, parse(d), memorized);
    if (kind === 'missed' || due.length === 0) return;
    logs.push(sessionOn(d, kind === 'done' ? due : due.slice(0, Math.ceil(due.length / 2)), due));
  });

  // "Add to today" for the leftovers, as Home's button does (CARRY-1..4).
  if (c.addLeftovers) {
    const leftovers = leftoversFor(user, logs, day, getPagesForDay(user, date, memorized), memorized);
    if (leftovers.pages.length > 0) user = applyCarryOver(user, memorized, leftovers.pages, date, leftovers.from);
  }
  // "Revise these first tomorrow", put on today from Insights yesterday (ACT-24).
  if (c.insights.length > 0 && numbers.length > 0 && !user.carryOver) {
    user = { ...user, carryOver: { day, pages: [...new Set(c.insights.map(at))], skip: 0, source: 'insights' } };
  }

  const todayPages = getPagesForDay(user, date, memorized);
  const manual: HistoryItem[] = [];
  const ms = now.getTime();
  switch (c.today) {
    case 'part':
      if (todayPages.length > 1) logs.push(sessionOn(day, todayPages.slice(0, Math.floor(todayPages.length / 2)), todayPages));
      break;
    case 'done':
      if (todayPages.length > 0) logs.push(sessionOn(day, todayPages, todayPages));
      break;
    case 'done and ahead': {
      if (todayPages.length === 0) break;
      const next = nextRevisionDayPlan(user, pages, day, new Set(todayPages), logs);
      logs.push(sessionOn(day, todayPages, todayPages, next ? { [next.day]: next.pages } : undefined));
      break;
    }
    case 'done ahead yesterday':
      // Yesterday's session revised today's pages ahead (AHEAD-2): no session today.
      if (todayPages.length > 0) logs.push(sessionOn(addDays(day, -1), [], [], { [day]: todayPages }));
      break;
    case 'by hand':
      // Logged by hand in Activity (ACT-15): Activity's + → Revised elsewhere, counted for today.
      if (todayPages.length > 0) manual.push({ id: 'manual-1', day, countsFor: day, pages: todayPages, assigned: [], occurredAt: ms });
      break;
    default:
      break;
  }
  // Pages logged by hand reach Home through the Activity items; with the items not loaded yet, Home has only the logs.
  const history = c.historyLoaded || manual.length > 0 ? manual : null;
  return { user, pages, logs, history, now, day, date };
}

function homeInput(b: Built) {
  return { user: b.user, pages: b.pages, logs: b.logs, quranData: QURAN, day: b.day, date: b.date, history: b.history, now: b.now.getTime(), quiet: false };
}

export function homeFor(b: Built): HomeToday {
  return homeToday(homeInput(b));
}

// ---------------------------------------------------------------------------
// The rules

const BROKEN = /NaN|undefined|\bnull\b|Infinity|\[object|\{\{|\}\}/;

/** A line a screen shows: no missing value, nothing unfilled, not empty, no doubled or stray spaces before a stop. */
export function expectClean(text: string, where: string): void {
  if (BROKEN.test(text) || text.trim() === '' || /\s[.,·]\s*$/.test(text) || / {2,}/.test(text)) {
    throw new Error(`${where} shows a broken line: ${JSON.stringify(text)}`);
  }
}

export function describe_(c: Case, b: Built, home: HomeToday): string {
  return JSON.stringify({
    memorized: c.memorized.kind,
    plan: c.plan.kind === 'custom' ? { custom: Array.isArray(c.plan.days) ? `${c.plan.days.length} days` : c.plan.days, startsIn: c.plan.startsIn } : c.plan,
    day: b.day,
    today: c.today,
    past: c.past,
    status: home.snapshot.status,
    pages: home.assignment.pages.length,
    own: home.snapshot.own.length,
    carried: home.snapshot.carried.length,
    title: home.lines.title.text,
    cta: home.lines.cta,
  });
}

/** HOME-9 and the Today post's own rules: words, button and numbers. */
export function checkHome(home: HomeToday, where: string): void {
  const { lines, snapshot, assignment } = home;
  for (const text of homeTodayTexts(home)) expectClean(text, `Home (${where})`);
  const anyMemorized = home.memorized.fraction > 0;
  if (anyMemorized) {
    // HOME-9: never the new account's state while a page is memorized.
    expect(lines.title.text).not.toBe(t('lib.today.nothingTitle'));
    expect(lines.cta).not.toBe(t('lib.today.markCta'));
    expect(home.action?.kind).not.toBe('memorization');
    // With pages memorized, the memorized line never says 0%; short of the whole Qur'an, never 100%.
    expect(home.memorized.body).not.toBe(t('home.today.memorized', { percent: formatPercent(0) }));
    if (home.memorized.fraction < 1) expect(home.memorized.body).not.toBe(t('home.today.memorized', { percent: formatPercent(1) }));
  } else {
    // Nothing memorized: the new account's state, and nothing else.
    expect(lines.title.text).toBe(t('lib.today.nothingTitle'));
    expect(home.action).toEqual({ kind: 'memorization' });
  }
  // A rest day is a day with no pages, with pages memorized.
  if (lines.rest) {
    expect(assignment.pages.length).toBe(0);
    expect(anyMemorized).toBe(true);
  }
  // The button does what it says.
  if (!lines.cta) {
    // No button only on a rest day with no next revision day.
    expect(home.action).toBeNull();
    expect(lines.rest && home.ahead == null).toBe(true);
  }
  switch (home.action?.kind) {
    case 'session':
      // A session with something in it: today's pages, or (today done) the carried pages left.
      expect(assignment.pages.length).toBeGreaterThan(0);
      if (snapshot.status === 'completed') expect(snapshot.carriedLeft).toBeGreaterThan(0);
      break;
    case 'ahead':
      expect(assignment.pages.length).toBe(0);
      expect(home.ahead?.plan.pages.length).toBeGreaterThan(0);
      expect((home.ahead?.plan.day ?? '') > snapshot.day).toBe(true);
      break;
    case 'review':
      expect(snapshot.status).toBe('completed');
      break;
    default:
      break;
  }
  // The numbers: never negative, done never more than the total, and "N of total" only while part done.
  if (lines.detail.kind === 'progress') {
    expect(lines.detail.total).toBe(assignment.pages.length);
    expect(lines.detail.done).toBeGreaterThan(0);
    expect(lines.detail.done).toBeLessThan(lines.detail.total);
  }
  expect(snapshot.pagesDone).toBeLessThanOrEqual(snapshot.pages.length);
  expect(snapshot.carriedLeft).toBeGreaterThanOrEqual(0);
  // The revise-ahead line is for a day that is done, and opens a later day with pages.
  if (home.aheadLine) {
    expect(snapshot.status).toBe('completed');
    expect((home.ahead?.plan.day ?? '') > snapshot.day).toBe(true);
  }
}

/** The widget says what Home says about today (lib/widgets/snapshot). */
export function checkWidget(b: Built, home: HomeToday): void {
  const widget = buildWidgetSnapshot({ signedIn: true, user: b.user, onboardingComplete: true, pages: b.pages, logs: b.logs, quranData: QURAN, accent: 'indigo', now: b.now, history: b.history });
  const anyRevisable = revisablePages(b.pages).length > 0;
  expect(widget.state).toBe(anyRevisable ? 'ready' : 'noPlan');
  if (widget.state !== 'ready') return;
  const today = widget.days[0];
  expect(today.day).toBe(home.snapshot.day);
  // Done on Home, done on the widget; and the same number of pages to do.
  expect({ day: today.day, completed: today.completed }).toEqual({ day: today.day, completed: home.snapshot.status === 'completed' });
  // The pages that finish the day: its own, or on a day with none of its own (pages from Insights on an off day), all of it.
  expect(today.total).toBe(home.snapshot.own.length || home.snapshot.pages.length);
  expect(today.done).toBeLessThanOrEqual(today.total);
  if (today.completed) expect(today.done).toBe(today.total);
  else if (today.total > 0) expect(today.done).toBeLessThan(today.total);
  // A day with pages is named; a rest day as Home names it (HOME-9): "Rest day", then where the next day starts.
  if (home.assignment.pages.length > 0) {
    expect(today.title).not.toBe('');
    expect(today.where).not.toBe('');
  } else if (home.lines.rest && home.lines.detail.kind === 'text') {
    expect({ title: today.title, where: today.where, short: today.short }).toEqual({ title: home.lines.title.text, where: home.lines.detail.text, short: home.lines.title.text });
  }
  for (const d of widget.days) {
    expectClean(d.title, `the widget's ${d.day} (title)`);
    expectClean(d.where, `the widget's ${d.day} (where)`);
  }
  for (const d of widget.days) expect(d.done).toBeGreaterThanOrEqual(0);
}

/** The reminders agree with Home about today: none of today's asks once Home says Done, no congratulation before. */
export function checkReminders(b: Built, home: HomeToday): PlannedReminder[] {
  const planned = planRevisionReminders({
    now: b.now,
    user: { ...b.user, notificationsEnabled: true },
    name: '',
    pages: b.pages,
    logs: b.logs,
    history: b.history,
    quranData: QURAN,
    place: null,
    settings: { method: 'NorthAmerica' } as never,
    laterDays: 6,
  });
  for (const r of planned) {
    expectClean(r.title, `reminder ${r.id} (title)`);
    expectClean(r.body, `reminder ${r.id} (body)`);
  }
  const today = planned.filter((r) => r.day === home.snapshot.day);
  if (home.snapshot.status === 'completed') {
    expect(today.filter((r) => r.kind !== 'congrat').map((r) => r.kind)).toEqual([]);
  } else {
    expect(today.filter((r) => r.kind === 'congrat').map((r) => r.kind)).toEqual([]);
  }
  // A day with no pages gets no reminder.
  if (home.assignment.pages.length === 0) expect(today).toEqual([]);
  // Tomorrow, as Home will show it when it comes (the same data): done ahead already, no reminder asks for it.
  const start = getNextRevisionDayStart(b.user, b.now);
  const then = new Date(start.getTime() + 60_000);
  const tomorrow = homeToday({ ...homeInput(b), day: getRevisionDayForUser(b.user, then), date: getRevisionDateForUser(b.user, then), now: then.getTime() });
  const asks = planned.filter((r) => r.day === tomorrow.snapshot.day).map((r) => r.kind);
  if (tomorrow.snapshot.status === 'completed' || tomorrow.assignment.pages.length === 0) expect(asks).toEqual([]);
  return planned;
}

/** What Revo is told agrees with Home, and its greeting reads cleanly (lib/revo). */
export function checkRevo(b: Built, home: HomeToday): void {
  const ctx = buildRevoContext({ user: b.user, pages: b.pages, logs: b.logs, snapshot: home.snapshot, history: b.history, now: b.now });
  expect(ctx.today.plannedPages).toBe(home.assignment.pages.length);
  expect(ctx.today.done).toBe(home.snapshot.status === 'completed');
  expect(ctx.today.revisedPages).toBe(home.snapshot.pagesDone);
  const numbers: number[] = [];
  JSON.stringify(ctx, (_k, v) => {
    if (typeof v === 'number') numbers.push(v);
    return v;
  });
  for (const n of numbers) {
    if (!Number.isFinite(n) || n < 0) throw new Error(`Revo is told a number that isn't one: ${n}`);
  }
  const extras = greetingExtrasFor({ user: b.user, pages: b.pages, logs: b.logs, day: b.day, assignment: home.assignment.pages, snapshot: home.snapshot });
  for (const open of [0, 1, 2]) expectClean(revoGreeting(null, ctx, open, extras), `Revo's greeting (open ${open})`);
}


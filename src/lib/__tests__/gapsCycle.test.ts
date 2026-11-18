import { pushBack, pushBackLine, type PushBackInput } from '../gapsCycle';
import { juzKeyForPage } from '../algorithm';
import * as quranData from '../quranData';
import type { User, UserPage } from '../../types';

// 20 pages, 5 a day from 1 January: a 4-day cycle. 1 Jan 1–5, 2 Jan 6–10, 3 Jan 11–15, 4 Jan 16–20, 5 Jan 1–5…
// Today is 9 January: pages 1–5.
const TODAY = '2026-01-09';
const user: User = {
  id: 'u1',
  createdAt: '2026-01-01T12:00:00Z',
  smartTrackingEnabled: false,
  hasSeenSmartTrackingPreview: false,
  dailyPageCapacity: 5,
  scheduleMode: 'pages',
  dailyJuzCount: 1,
  reminderTime: '08:00',
  notificationsEnabled: true,
  currentMemorizationJuz: null,
  currentMemorizationPage: null,
  currentKhatamPage: 1,
  customPlan: null,
  savedPlans: [],
  streak: 0,
  lastRevisionDate: null,
  memorizedSurahs: [],
  fajrBoundaryEnabled: false,
  locationCoords: null,
  fajrCalculationMethod: 'NorthAmerica',
  scheduleAnchorDate: '2026-01-01T12:00:00Z',
};
const pages = (from: number, to: number): UserPage[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    pageNumber: from + i,
    status: 'memorized',
    dateMemorized: '2025-12-01',
    weaknessRating: 4,
    lastRevisedDate: null,
    totalRevisionCount: 0,
    skipCount: 0,
  })) as UserPage[];
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Each page's last revision: the day of its group's slot, as given. */
function input(last: Record<string, number[]>, over: Partial<PushBackInput> = {}): PushBackInput {
  const byPage = new Map<number, string>();
  for (const [day, ps] of Object.entries(last)) for (const p of ps) byPage.set(p, day);
  return { user, memorized: pages(1, 20), today: TODAY, lastRevised: (p) => byPage.get(p) ?? null, since: () => null, ...over };
}
// Revised on every slot up to yesterday (and today's not yet).
const ON_PLAN = { '2026-01-05': range(1, 5), '2026-01-06': range(6, 10), '2026-01-07': range(11, 15), '2026-01-08': range(16, 20) };

describe('pushBack', () => {
  it('revised on every slot: nothing late, the plan goes round in 4 days', () => {
    expect(pushBack(input(ON_PLAN))).toEqual({ cycleDays: 4, late: [], due: null, next: null, days: 0, missed: false });
  });

  it('two days missed: their pages come round a cycle late, 8 → 12 January', () => {
    const v = pushBack(input({ ...ON_PLAN, '2026-01-03': range(11, 15), '2026-01-04': range(16, 20), '2026-01-07': [], '2026-01-08': [] }))!;
    expect(v.late.map((l) => l.page)).toEqual(range(11, 20));
    expect(v.late[0]).toEqual({ page: 11, due: '2026-01-07', next: '2026-01-11' });
    expect([v.due, v.next, v.days, v.missed]).toEqual(['2026-01-08', '2026-01-12', 4, true]);
  });

  it('caught up today (Add to today, on top): one day late, not a cycle', () => {
    const v = pushBack(
      input(
        { ...ON_PLAN, '2026-01-03': range(11, 15), '2026-01-04': range(16, 20), '2026-01-07': [], '2026-01-08': [] },
        { user: { ...user, carryOverMode: 'add', carryOver: { day: TODAY, pages: range(11, 20), skip: 0 } } },
      ),
    )!;
    expect(v.late[0]).toEqual({ page: 11, due: '2026-01-07', next: TODAY });
    expect([v.due, v.next, v.days]).toEqual(['2026-01-08', TODAY, 1]);
  });

  it('caught up with Keep daily amount: the rest of the plan slides back two days, and says so', () => {
    // Ten pages carried into today in place of its own five: everything after moves back ten pages.
    const v = pushBack(
      input(
        { ...ON_PLAN, '2026-01-03': range(11, 15), '2026-01-04': range(16, 20), '2026-01-07': [], '2026-01-08': [] },
        { user: { ...user, carryOverMode: 'shift', scheduleShiftPages: 10, carryOver: { day: TODAY, pages: range(11, 20), skip: 10 } } },
      ),
    )!;
    // Pages 1–5, due today, now come round on the 11th; 6–10, due the 10th, on the 12th.
    expect(v.late.find((l) => l.page === 1)).toEqual({ page: 1, due: TODAY, next: '2026-01-11' });
    expect(v.late.find((l) => l.page === 6)).toEqual({ page: 6, due: '2026-01-10', next: '2026-01-12' });
    expect([v.due, v.next, v.days, v.missed]).toEqual(['2026-01-10', '2026-01-12', 2, false]);
    expect(v.cycleDays).toBe(4);
  });

  it('a day off by plan is never late: a custom plan with a rest day', () => {
    // 1 Jan [1,2], 2 Jan [3,4], 3 Jan off, 4 Jan [5,6]; today (9 Jan) is [1,2].
    const custom: User = { ...user, customPlan: { days: [[1, 2], [3, 4], [], [5, 6]], cycleStartDate: '2026-01-01', direction: 'forward' } };
    const memorized = pages(1, 6);
    const onPlan = pushBack(input({ '2026-01-05': [1, 2], '2026-01-06': [3, 4], '2026-01-08': [5, 6] }, { user: custom, memorized }))!;
    expect(onPlan.late).toEqual([]);
    expect(onPlan.cycleDays).toBe(4);
    const missed = pushBack(input({ '2026-01-05': [1, 2], '2026-01-06': [3, 4], '2026-01-04': [5, 6] }, { user: custom, memorized }))!;
    expect(missed.late.map((l) => l.page)).toEqual([5, 6]);
    expect([missed.due, missed.next, missed.days]).toEqual(['2026-01-08', '2026-01-12', 4]);
  });

  it('a plan changed today is judged by the new plan alone, and pages it leaves out are left out', () => {
    // A new plan from today: 1–10 over two days. Pages 11–20 aren't in it.
    const changed: User = { ...user, customPlan: { days: [range(1, 5), range(6, 10)], cycleStartDate: TODAY, direction: 'forward' } };
    const v = pushBack(input({ '2026-01-07': range(1, 10) }, { user: changed }))!;
    expect(v.cycleDays).toBe(2);
    // 6–10, last revised on the 7th, due the 9th (every 2 days now), come round tomorrow.
    expect(v.late.map((l) => l.page)).toEqual(range(6, 10));
    expect([v.due, v.next, v.days]).toEqual([TODAY, '2026-01-10', 1]);
    expect(v.late.some((l) => l.page > 10)).toBe(false);
  });

  it('juz mode: a juz a day', () => {
    // Juz 1 (1–21), juz 2 (22–41): two days round; today (day 8) is juz 1.
    const juz: User = { ...user, scheduleMode: 'juz', dailyJuzCount: 1 };
    const memorized = pages(1, 41);
    const v = pushBack(input({ '2026-01-07': range(1, 21), '2026-01-08': range(22, 41) }, { user: juz, memorized }))!;
    expect(v.cycleDays).toBe(2);
    expect(v.late).toEqual([]);
  });

  it('a page never revised counts from when it was memorized', () => {
    const since = (day: string) => () => day;
    // Pages 6–10 come round tomorrow: memorized on the 6th, they're on time; on the 1st, a cycle late.
    const onTime = pushBack(input({ ...ON_PLAN, '2026-01-06': [] }, { since: since('2026-01-06') }))!;
    expect(onTime.late).toEqual([]);
    const lateOnes = pushBack(input({ ...ON_PLAN, '2026-01-06': [] }, { since: since('2026-01-01') }))!;
    expect(lateOnes.late.map((l) => l.page)).toEqual(range(6, 10));
  });

  it('nothing to measure: no pages, or no plan slot', () => {
    expect(pushBack(input({}, { memorized: [] }))).toBeNull();
    const empty: User = { ...user, customPlan: { days: [[]], cycleStartDate: '2026-01-01', direction: 'forward' } };
    expect(pushBack(input({}, { user: empty }))).toBeNull();
  });
});

describe('pushBack on a hafiz’s juz plan', () => {
  // The Heavy user test scenario (a juz a day, about 450 pages) took 2 to 4 s to open Insights on the scenario harness,
  // nearly all of it here: each of the 92 days read worked out every memorized page's juz again for every day of the
  // cycle (Nov 17 2026).
  // Counted, not timed: a time limit failed on a loaded CI runner (418 ms against 100, Nov 18 2026). The cost was the
  // surah lookups behind each page's juz, worked out again for every page of every day read: about 2 million of them
  // before; none now that the juz keys are a table (built by the line above, before counting).
  it('reads 450 pages, a juz a day, at once', () => {
    const juzPlan: User = { ...user, scheduleMode: 'juz', dailyJuzCount: 1 };
    const memorized = pages(155, 604);
    const juz = new Set(memorized.map((p) => juzKeyForPage(p.pageNumber))).size;
    const lookups = jest.spyOn(quranData, 'getSurahForPage');
    const v = pushBack({ user: juzPlan, memorized, today: TODAY, lastRevised: () => '2026-01-08', since: () => null })!;
    expect(v.cycleDays).toBe(juz);
    expect(lookups.mock.calls.length).toBeLessThan(1000);
    lookups.mockRestore();
  });
});

describe('pushBackLine', () => {
  it('names the push-back in natural words, the pages and both dates, and the plan in days', () => {
    const v = pushBack(input({ ...ON_PLAN, '2026-01-03': range(11, 15), '2026-01-04': range(16, 20), '2026-01-07': [], '2026-01-08': [] }))!;
    expect(pushBackLine(v)).toEqual({
      title: 'Full revision pushed back 4 days',
      detail: '10 pages from your gaps come round by 12 Jan instead of 8 Jan. Your plan goes round every 4 days.',
      late: true,
    });
    expect(pushBackLine({ ...v, days: 16 }).title).toBe('Full revision pushed back over 2 weeks');
    expect(pushBackLine({ ...v, days: 16 }, true).title).toBe('Full revision pushed back 16 days');
  });

  it('slid back by a catch-up, not missed: no "from your gaps"', () => {
    const v = pushBack(
      input(
        { ...ON_PLAN, '2026-01-03': range(11, 15), '2026-01-04': range(16, 20), '2026-01-07': [], '2026-01-08': [] },
        { user: { ...user, carryOverMode: 'shift', scheduleShiftPages: 10, carryOver: { day: TODAY, pages: range(11, 20), skip: 10 } } },
      ),
    )!;
    expect(pushBackLine(v).detail).toMatch(/^\d+ pages come round by 12 Jan instead of 10 Jan\. Your plan goes round every 4 days\.$/);
  });

  it('on schedule', () => {
    expect(pushBackLine(pushBack(input(ON_PLAN))!)).toEqual({
      title: 'Full revision on schedule',
      detail: 'Every page comes round within 4 days, as your plan has it.',
      late: false,
    });
  });
});

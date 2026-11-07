// "Jump to…": today starts at a juz, a surah or a page and the days after carry
// on from it, on every kind of schedule, keeping what today already holds.
import { describeStart, jumpablePages, jumpTo, targetStart, todayStartPage, undoJump } from '../jump';
import { getPagesForDay, getPagesScheduledForDate } from '../algorithm';
import { hasCarriedOver } from '../carryOver';
import type { RevisionLog, User, UserPage } from '../../types';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const mem = (nums: number[]): UserPage[] =>
  nums.map((pageNumber) => ({
    pageNumber,
    status: 'memorized',
    dateMemorized: '2025-01-01',
    weaknessRating: 4,
    lastRevisedDate: null,
    totalRevisionCount: 0,
    skipCount: 0,
  }));

const baseUser: User = {
  id: 'u1',
  createdAt: '2026-01-01T12:00:00Z',
  smartTrackingEnabled: false,
  hasSeenSmartTrackingPreview: false,
  dailyPageCapacity: 10,
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
  scheduleAnchorDate: '2026-10-15T12:00:00',
};

const day = (d: number) => new Date(2026, 9, d);
const TODAY = day(17);
const TODAY_KEY = '2026-10-17';
const log = (date: string, assignedPages: number[], pagesRevised: number[]) =>
  ({ id: date, date, assignedPages, pagesRevised, pagesSkipped: [], weaknessUpdates: [], durationMinutes: 5 }) as unknown as RevisionLog;

// Juz 1 (pages 1–21) and juz 30 (582–604): 44 pages, 10 a day.
const JUZ_1_AND_30 = mem([...range(1, 21), ...range(582, 604)]);
const ctx = (memorized: UserPage[], logs: RevisionLog[] = [], revisionDate = TODAY) => ({ memorized, logs, revisionDate });
const on = (user: User, memorized: UserPage[], d: number) => getPagesScheduledForDate(user, day(d), memorized);

describe('the automatic schedule (pages a day)', () => {
  it('starts today at the juz, and the days after carry on from it', () => {
    // Before: day 2 since the anchor, today is [21, 582…590].
    expect(on(baseUser, JUZ_1_AND_30, 17)).toEqual([21, ...range(582, 590)]);
    const r = jumpTo(baseUser, { kind: 'juz', juz: 30 }, ctx(JUZ_1_AND_30))!;
    expect(r.startPage).toBe(582);
    expect(r.today).toBe(true);
    expect(on(r.user, JUZ_1_AND_30, 17)).toEqual(range(582, 591));
    expect(on(r.user, JUZ_1_AND_30, 18)).toEqual(range(592, 601));
    // Past the end of what's memorized it wraps to the start.
    expect(on(r.user, JUZ_1_AND_30, 19)).toEqual([602, 603, 604, ...range(1, 7)]);
    // The plan itself and its start stay as they were.
    expect(r.user.scheduleAnchorDate).toBe(baseUser.scheduleAnchorDate);
    expect(r.user.customPlan).toBeNull();
  });

  it('a page near the end wraps around to the start of the memorized pages', () => {
    const r = jumpTo(baseUser, { kind: 'page', page: 600 }, ctx(JUZ_1_AND_30))!;
    expect(on(r.user, JUZ_1_AND_30, 17)).toEqual([600, 601, 602, 603, 604, 1, 2, 3, 4, 5]);
    expect(on(r.user, JUZ_1_AND_30, 18)).toEqual(range(6, 15));
  });

  it('a partly memorized juz starts at its first memorized page; nothing memorized there: no jump', () => {
    const partial = mem([...range(225, 235), ...range(582, 604)]);
    const r = jumpTo(baseUser, { kind: 'juz', juz: 12 }, ctx(partial))!;
    expect(r.startPage).toBe(225);
    expect(on(r.user, partial, 17)[0]).toBe(225);
    expect(jumpTo(baseUser, { kind: 'juz', juz: 5 }, ctx(partial))).toBeNull();
    expect(jumpTo(baseUser, { kind: 'page', page: 222 }, ctx(partial))).toBeNull();
  });

  it('jumping again from a jumped schedule lands on the new start (the offset isn’t added up)', () => {
    const once = jumpTo(baseUser, { kind: 'juz', juz: 30 }, ctx(JUZ_1_AND_30))!.user;
    const twice = jumpTo(once, { kind: 'surah', surah: 2 }, ctx(JUZ_1_AND_30))!;
    expect(on(twice.user, JUZ_1_AND_30, 17)).toEqual(range(2, 11));
    expect(twice.user.scheduleShiftPages).toBeGreaterThanOrEqual(0);
    expect(twice.user.scheduleShiftPages).toBeLessThan(44);
  });
});

describe('today: what it already holds', () => {
  it('pages already revised today stay (done) and the new start’s pages follow', () => {
    const logs = [log(TODAY_KEY, [21, 582, 583], [21, 582])];
    const r = jumpTo(baseUser, { kind: 'juz', juz: 1 }, ctx(JUZ_1_AND_30, logs))!;
    expect(r.user.carryOver).toEqual({ day: TODAY_KEY, pages: [21, 582], skip: 0 });
    expect(getPagesForDay(r.user, TODAY, JUZ_1_AND_30)).toEqual([21, 582, ...range(1, 10)]);
  });

  it('pages carried into today and not revised are dropped: they were the old start’s, and the new start is today', () => {
    const carried = { ...baseUser, scheduleShiftPages: 1, carryOver: { day: TODAY_KEY, pages: [600], skip: 1 } };
    const r = jumpTo(carried, { kind: 'juz', juz: 1 }, ctx(JUZ_1_AND_30))!;
    expect(r.user.carryOver).toEqual({ day: TODAY_KEY, pages: [], skip: 0 });
    expect(getPagesForDay(r.user, TODAY, JUZ_1_AND_30)).toEqual(range(1, 10));
  });

  it('pages carried into today and revised today stay in it, first', () => {
    const carried = { ...baseUser, carryOver: { day: TODAY_KEY, pages: [600], skip: 0 } };
    const logs = [log(TODAY_KEY, [600], [600])];
    const r = jumpTo(carried, { kind: 'juz', juz: 1 }, ctx(JUZ_1_AND_30, logs))!;
    expect(r.user.carryOver).toEqual({ day: TODAY_KEY, pages: [600], skip: 0 });
    expect(getPagesForDay(r.user, TODAY, JUZ_1_AND_30)).toEqual([600, ...range(1, 10)]);
  });

  it('nothing revised today: yesterday’s carry-over is dropped, and today is marked carried so no leftovers come back in front of the start', () => {
    const stale = { ...baseUser, carryOver: { day: '2026-10-16', pages: [5], skip: 0 } };
    const r = jumpTo(stale, { kind: 'juz', juz: 30 }, ctx(JUZ_1_AND_30))!;
    expect(r.user.carryOver).toEqual({ day: TODAY_KEY, pages: [], skip: 0 });
    expect(hasCarriedOver(r.user, TODAY_KEY)).toBe(true);
    expect(getPagesForDay(r.user, TODAY, JUZ_1_AND_30)).not.toContain(5);
  });

  it('pages revised ahead for today from an earlier session are not kept in front of the new start', () => {
    const logs = [{ ...log('2026-10-16', [], []), ahead: { [TODAY_KEY]: [600] } }];
    const r = jumpTo(baseUser, { kind: 'juz', juz: 1 }, ctx(JUZ_1_AND_30, logs))!;
    expect(r.user.carryOver).toEqual({ day: TODAY_KEY, pages: [], skip: 0 });
    expect(getPagesForDay(r.user, TODAY, JUZ_1_AND_30)).not.toContain(600);
  });

  it('today is the revision (Fajr) day passed in, not the clock’s', () => {
    const logs = [log('2026-10-16', [1], [1])];
    // Before Fajr on Oct 17, the revision day is still Oct 16.
    const r = jumpTo(baseUser, { kind: 'juz', juz: 30 }, ctx(JUZ_1_AND_30, logs, day(16)))!;
    expect(r.user.carryOver).toEqual({ day: '2026-10-16', pages: [1], skip: 0 });
    expect(getPagesScheduledForDate(r.user, day(16), JUZ_1_AND_30)[0]).toBe(582);
  });
});

describe('a custom plan', () => {
  // Pages 10–15 over four days, the third off.
  const plan = (cycleStartDate: string) => ({
    ...baseUser,
    customPlan: { days: [[10, 11], [12, 13], [], [14, 15]], cycleStartDate, direction: 'forward' as const },
  });
  const PLAN_PAGES = mem([...range(10, 15), 100]);

  it('starts today at the page; each day keeps its size, off days stay off', () => {
    const user = plan('2026-10-14'); // Oct 17 is day 3: [14, 15]
    const r = jumpTo(user, { kind: 'page', page: 10 }, ctx(PLAN_PAGES))!;
    expect(on(r.user, PLAN_PAGES, 17)).toEqual([10, 11]);
    expect(on(r.user, PLAN_PAGES, 18)).toEqual([12, 13]);
    expect(on(r.user, PLAN_PAGES, 19)).toEqual([14, 15]);
    expect(on(r.user, PLAN_PAGES, 20)).toEqual([]);
    expect(r.user.customPlan).toEqual(user.customPlan);
  });

  it('on an off day, the next revision day starts there', () => {
    const user = plan('2026-10-15'); // Oct 17 is day 2, off
    const r = jumpTo(user, { kind: 'page', page: 12 }, ctx(PLAN_PAGES))!;
    expect(r.today).toBe(false);
    expect(on(r.user, PLAN_PAGES, 17)).toEqual([]);
    expect(on(r.user, PLAN_PAGES, 18)).toEqual([12, 13]);
  });

  it('only what the plan goes through: a memorized page outside it can’t be jumped to', () => {
    const user = plan('2026-10-14');
    expect(jumpablePages(user, PLAN_PAGES)).toEqual(new Set(range(10, 15)));
    expect(jumpTo(user, { kind: 'page', page: 100 }, ctx(PLAN_PAGES))).toBeNull();
  });

  it('a plan in reverse enters a surah at its last page', () => {
    const juz30 = mem(range(582, 604));
    const desc = range(582, 604).reverse();
    const user = {
      ...baseUser,
      customPlan: { days: [desc.slice(0, 10), desc.slice(10, 20), desc.slice(20)], cycleStartDate: TODAY_KEY, direction: 'reverse' as const },
    };
    // An-Naba is pages 582–583: going down, the plan reaches it at 583.
    const r = jumpTo(user, { kind: 'surah', surah: 78 }, ctx(juz30))!;
    expect(r.startPage).toBe(583);
    expect(on(r.user, juz30, 17).slice(0, 3)).toEqual([583, 582, 604]);
  });
});

describe('juz a day', () => {
  const JUZ_1_2_30 = mem([...range(1, 41), ...range(582, 604)]);
  const juzMode = { ...baseUser, scheduleMode: 'juz' as const, dailyJuzCount: 1 };

  it('today becomes the chosen juz, the next day the juz after it', () => {
    // Before: day 2 since the anchor → juz 30.
    expect(on(juzMode, JUZ_1_2_30, 17)).toEqual(range(582, 604));
    const r = jumpTo(juzMode, { kind: 'juz', juz: 1 }, ctx(JUZ_1_2_30))!;
    expect(on(r.user, JUZ_1_2_30, 17)).toEqual(range(1, 21));
    expect(on(r.user, JUZ_1_2_30, 18)).toEqual(range(22, 41));
    expect(r.user.scheduleShiftPages).toBe(0);
  });

  it('a surah or a page goes to its juz', () => {
    const r = jumpTo(juzMode, { kind: 'page', page: 30 }, ctx(JUZ_1_2_30))!;
    expect(on(r.user, JUZ_1_2_30, 17)).toEqual(range(22, 41));
  });

  it('two juz a day can’t land on every juz: then the pages move instead', () => {
    const four = mem([...range(1, 61), ...range(582, 604)]); // juz 1, 2, 3, 30
    const two = { ...juzMode, dailyJuzCount: 2 };
    const r = jumpTo(two, { kind: 'juz', juz: 2 }, ctx(four))!;
    expect(on(r.user, four, 17)[0]).toBe(22);
    expect(r.startPage).toBe(22);
  });
});

describe('undo, and what the sheet shows', () => {
  it('Undo puts the schedule back (and clears a carry-over the jump made)', () => {
    const logs = [log(TODAY_KEY, [21], [21])];
    const r = jumpTo(baseUser, { kind: 'juz', juz: 30 }, ctx(JUZ_1_AND_30, logs))!;
    const undone = undoJump(r.user, baseUser);
    expect(undone.carryOver).toBeNull();
    expect(undone.scheduleShiftPages).toBe(0);
    expect(on(undone, JUZ_1_AND_30, 17)).toEqual(on(baseUser, JUZ_1_AND_30, 17));
  });

  it('where today starts, and the toast’s words', () => {
    expect(todayStartPage(baseUser, TODAY, JUZ_1_AND_30)).toBe(21);
    expect(describeStart({ kind: 'juz', juz: 30 }, 582)).toBe('Juz 30 · p. 582');
    expect(describeStart({ kind: 'page', page: 600 }, 600)).toBe('p. 600');
    expect(describeStart({ kind: 'surah', surah: 78 }, 583)).toMatch(/^An-Naba.* · p\. 583$/);
  });

  it('targetStart: where a cycle reads into a target, from a given place', () => {
    expect(targetStart([1, 2, 3, 4, 5], 0, new Set([3, 4]))).toBe(2);
    expect(targetStart([4, 5, 1, 2, 3], 3, new Set([3, 4]))).toBe(4);
    expect(targetStart([1, 2], 1, new Set([1, 2]))).toBe(0);
    expect(targetStart([1, 2], 0, new Set([9]))).toBeNull();
  });
});

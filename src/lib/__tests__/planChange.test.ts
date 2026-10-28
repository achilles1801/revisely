// A new schedule and today's revision: today switches to it at once, whether or
// not today was started; pages already revised today stay counted (on today, done).
import { revisedOn, userWithNewSchedule } from '../planChange';
import { applyCarryOver, findLeftoverPages, hasCarriedOver } from '../carryOver';
import { generateDailyAssignment } from '../algorithm';
import type { CustomPlan, RevisionLog, User, UserPage } from '../../types';

const baseUser: User = {
  id: 'u1',
  createdAt: '2026-01-01T12:00:00Z',
  smartTrackingEnabled: false,
  hasSeenSmartTrackingPreview: false,
  dailyPageCapacity: 3,
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
  // Day 0 on Oct 15: the automatic schedule gives Oct 16 [4,5,6], Oct 17 [7,8,9].
  scheduleAnchorDate: '2026-10-15T12:00:00',
};

const memorized: UserPage[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((pageNumber) => ({
  pageNumber,
  status: 'memorized',
  dateMemorized: '2025-01-01',
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
}));
const memorizedSet = new Set(memorized.map((p) => p.pageNumber));

const TODAY = '2026-10-17';
const today = new Date(2026, 9, 17);
const day = (d: number) => new Date(2026, 9, d);
const pagesOn = (user: User, d: number) => generateDailyAssignment(memorized, [], user, day(d)).pages;

function log(date: string, assignedPages: number[], pagesRevised: number[]): RevisionLog {
  return {
    id: date,
    date,
    assignedPages,
    pagesRevised,
    pagesSkipped: [],
    weaknessUpdates: [],
    durationMinutes: 5,
  } as unknown as RevisionLog;
}

// Yesterday's session stopped after page 4: 5 and 6 are left over, and the user
// added them to today (keep daily amount: today is [5, 6, 7], the plan moves back).
const yesterday = log('2026-10-16', [4, 5, 6], [4]);
const withLeftovers = applyCarryOver(baseUser, memorized, [5, 6], today);

const newPlan: CustomPlan = {
  days: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
  cycleStartDate: TODAY,
  direction: 'forward',
};

const save = (before: User, customPlan: CustomPlan | null, logs: RevisionLog[], newPlanSaved = true) =>
  userWithNewSchedule(before, { customPlan }, { revisionDate: today, memorized, logs, newPlan: newPlanSaved });

describe('a new plan switches today to it at once', () => {
  it('reproduces the report: before, yesterday’s leftovers stayed on top of today', () => {
    expect(pagesOn(withLeftovers, 17)).toEqual([5, 6, 7]);
  });

  it('nothing revised today: today is exactly the new plan’s first day, the days after follow it', () => {
    const after = save(withLeftovers, newPlan, [yesterday]);
    expect(pagesOn(after, 17)).toEqual([1, 2, 3]);
    expect(pagesOn(after, 18)).toEqual([4, 5, 6]);
    expect(pagesOn(after, 19)).toEqual([7, 8, 9]);
    expect(after.scheduleShiftPages ?? 0).toBe(0);
    expect(after.customPlan?.cycleStartDate).toBe(TODAY);
  });

  it('part of today revised: the revised pages stay on today (counted), the rest is the new first day', () => {
    const after = save(withLeftovers, newPlan, [yesterday, log(TODAY, [5, 6, 7], [5])]);
    expect(pagesOn(after, 17)).toEqual([5, 1, 2, 3]);
    expect(pagesOn(after, 18)).toEqual([4, 5, 6]);
  });

  it('a revised page that is also on the new first day is listed once', () => {
    const after = save(baseUser, newPlan, [log(TODAY, [7, 8, 9], [2, 7])]);
    expect(pagesOn(after, 17)).toEqual([2, 7, 1, 3]);
  });

  it('today already done: today still switches; what was done stays done, the new first day is to do', () => {
    const after = save(withLeftovers, newPlan, [yesterday, log(TODAY, [5, 6, 7], [5, 6, 7])]);
    expect(pagesOn(after, 17)).toEqual([5, 6, 7, 1, 2, 3]);
    expect(pagesOn(after, 18)).toEqual([4, 5, 6]);
  });

  it('yesterday’s leftovers are not offered again today', () => {
    const leftovers = findLeftoverPages([yesterday], TODAY, pagesOn(baseUser, 17), memorizedSet);
    expect(leftovers).toEqual([5, 6]);
    const after = save(baseUser, newPlan, [yesterday]);
    expect(hasCarriedOver(after, TODAY)).toBe(true);
  });

  it('a loaded plan whose first day matches today’s still takes over today (the leftovers go)', () => {
    // Today's own slot is [7, 8, 9] on the automatic schedule; carry 5 on top (added on top).
    const added = applyCarryOver({ ...baseUser, carryOverMode: 'add' }, memorized, [5], today);
    expect(pagesOn(added, 17)).toEqual([5, 7, 8, 9]);
    const same: CustomPlan = { days: [[7, 8, 9], [1, 2, 3], [4, 5, 6]], cycleStartDate: TODAY, direction: 'forward' };
    expect(pagesOn(save(added, same, []), 17)).toEqual([7, 8, 9]);
  });

  it('back to the automatic schedule: today is the automatic day, without the old plan’s leftovers', () => {
    const onPlan = applyCarryOver({ ...baseUser, customPlan: newPlan }, memorized, [9], today);
    expect(pagesOn(onPlan, 17)).toEqual([9, 1, 2]);
    const after = save(onPlan, null, [log('2026-10-16', [7, 8, 9], [7, 8])]);
    expect(pagesOn(after, 17)).toEqual([7, 8, 9]);
  });
});

describe('an edit to the plan shown', () => {
  it('that changes today’s day: today switches to it (revised pages kept)', () => {
    const onPlan = { ...baseUser, customPlan: newPlan };
    const edited: CustomPlan = { ...newPlan, days: [[1, 2], [4, 5, 6], [7, 8, 9]] };
    const after = save(onPlan, edited, [log(TODAY, [1, 2, 3], [3])], false);
    expect(pagesOn(after, 17)).toEqual([3, 1, 2]);
  });

  it('that leaves today’s day alone (a later day changed): today stays as it is, leftovers included', () => {
    const onPlan = { ...baseUser, customPlan: { ...newPlan, cycleStartDate: '2026-10-15' } };
    const carried = applyCarryOver(onPlan, memorized, [5, 6], today);
    // The editor shows today's day (the shift folded in) first; day 3 edited.
    const edited: CustomPlan = { days: [[5, 6, 7], [8, 9, 1], [2, 3]], cycleStartDate: TODAY, direction: 'forward' };
    const after = save(carried, edited, [yesterday], false);
    expect(pagesOn(after, 17)).toEqual([5, 6, 7]);
    expect(after.carryOver).toEqual({ day: TODAY, pages: [5, 6], skip: 0 });
  });
});

describe('revisedOn', () => {
  it('every page revised on the day, once, in order', () => {
    expect(revisedOn([log(TODAY, [1, 2], [2, 1]), log(TODAY, [3], [1, 3]), log('2026-10-16', [4], [4])], TODAY)).toEqual([
      2, 1, 3,
    ]);
  });
});

// The owner's example: 5 of 10 done today, then today's and tomorrow's days are
// swapped in the editor: today is now 15 pages with 5 of them done.
describe('5 of 10 done, then today and tomorrow swapped: 5 of 15', () => {
  const thirty: UserPage[] = Array.from({ length: 30 }, (_, i) => ({ ...memorized[0], pageNumber: i + 1 }));
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const plan: CustomPlan = { days: [range(1, 10), range(11, 20), range(21, 30)], cycleStartDate: TODAY, direction: 'forward' };
  const onPlan: User = { ...baseUser, dailyPageCapacity: 10, customPlan: plan };
  const revisedToday = log(TODAY, range(1, 10), range(1, 5));
  const todayOf = (u: User) => generateDailyAssignment(thirty, [], u, today).pages;
  const progress = (u: User) => {
    const pages = todayOf(u);
    const done = new Set(revisedToday.pagesRevised);
    return { done: pages.filter((p) => done.has(p)).length, total: pages.length };
  };
  const edit = (days: number[][]) =>
    userWithNewSchedule(onPlan, { customPlan: { ...plan, days } }, {
      revisionDate: today,
      memorized: thirty,
      logs: [revisedToday],
      newPlan: false,
    });

  it('before: 5 of 10', () => {
    expect(progress(onPlan)).toEqual({ done: 5, total: 10 });
  });

  it('swapped: the 5 done stay on today, done, then tomorrow’s 10: 5 of 15', () => {
    const after = edit([range(11, 20), range(1, 10), range(21, 30)]);
    expect(todayOf(after)).toEqual([...range(1, 5), ...range(11, 20)]);
    expect(progress(after)).toEqual({ done: 5, total: 15 });
    // Tomorrow is the old today, all 10 pages.
    expect(generateDailyAssignment(thirty, [], after, day(18)).pages).toEqual(range(1, 10));
  });

  it('done pages that are also on the new day are counted once and stay done', () => {
    // Today edited to pages 4–13: 4 and 5 were already revised.
    const after = edit([range(4, 13), range(14, 23), [...range(24, 30), 1, 2, 3]]);
    expect(todayOf(after)).toEqual(range(1, 13));
    expect(progress(after)).toEqual({ done: 5, total: 13 });
  });
});

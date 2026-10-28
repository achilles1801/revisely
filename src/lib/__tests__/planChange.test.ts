// A new schedule (a plan saved in the editor, or the automatic one) and today's
// revision: today becomes the new plan's first day unless today was already
// revised (then the user chooses, or it waits for tomorrow once today is done).
import { holdsToday, planScheduleChange, revisedOn, scheduleFromTomorrow } from '../planChange';
import { applyCarryOver, findLeftoverPages, hasCarriedOver } from '../carryOver';
import { generateDailyAssignment, scheduleStartingByToday } from '../algorithm';
import { rotateCustomPlanToToday } from '../planBuilder';
import { createCustomPlanFromDraft } from '../schedulePlans';
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
    completed: false,
  } as RevisionLog;
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

const change = (before: User, customPlan: CustomPlan | null, logs: RevisionLog[]) =>
  planScheduleChange(before, { customPlan }, { revisionDate: today, memorized, logs });

describe('a new plan and today, nothing revised yet', () => {
  it('reproduces the report: today was still yesterday’s leftovers on top of the new plan', () => {
    expect(pagesOn(withLeftovers, 17)).toEqual([5, 6, 7]);
    const c = change(withLeftovers, newPlan, [yesterday]);
    expect(c.changesToday).toBe(true);
    expect(c.progress).toBe('none');
    expect(c.defaultStart).toBe('today');
  });

  it('today is exactly the new plan’s first day, and the days after follow it', () => {
    const after = change(withLeftovers, newPlan, [yesterday]).apply('today');
    expect(pagesOn(after, 17)).toEqual([1, 2, 3]);
    expect(pagesOn(after, 18)).toEqual([4, 5, 6]);
    expect(pagesOn(after, 19)).toEqual([7, 8, 9]);
    expect(after.scheduleShiftPages ?? 0).toBe(0);
    expect(after.customPlan?.cycleStartDate).toBe(TODAY);
  });

  it('yesterday’s leftovers are not offered again today: the new plan starts fresh', () => {
    // Not carried over yet: the offer was there before.
    const notCarried = baseUser;
    const leftovers = findLeftoverPages([yesterday], TODAY, pagesOn(notCarried, 17), new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(leftovers).toEqual([5, 6]);
    const after = change(notCarried, newPlan, [yesterday]).apply('today');
    expect(hasCarriedOver(after, TODAY)).toBe(true);
    expect(pagesOn(after, 17)).toEqual([1, 2, 3]);
  });

  it('back to the automatic schedule: today is the automatic day, without the old plan’s leftovers', () => {
    const onPlan = applyCarryOver({ ...baseUser, customPlan: newPlan }, memorized, [9], today);
    expect(pagesOn(onPlan, 17)).toEqual([9, 1, 2]);
    const after = change(onPlan, null, [log('2026-10-16', [7, 8, 9], [7, 8])]).apply('today');
    expect(pagesOn(after, 17)).toEqual([7, 8, 9]);
  });
});

describe('an edit that leaves today’s day alone keeps today as it is', () => {
  it('a later day changed: the leftovers stay on today, nothing asked', () => {
    const onPlan = { ...baseUser, customPlan: { ...newPlan, cycleStartDate: '2026-10-15' } };
    const carried = applyCarryOver(onPlan, memorized, [5, 6], today);
    // The editor shows today's day (the shift folded in) first; day 3 edited.
    const edited: CustomPlan = { days: [[5, 6, 7], [8, 9, 1], [2, 3]], cycleStartDate: TODAY, direction: 'forward' };
    const c = change(carried, edited, [yesterday]);
    expect(c.changesToday).toBe(false);
    expect(c.defaultStart).toBe('today');
    const after = c.apply('today');
    expect(pagesOn(after, 17)).toEqual([5, 6, 7]);
    expect(after.carryOver).toEqual({ day: TODAY, pages: [5, 6], skip: 0 });
  });
});

describe('a new plan after some of today was revised: the user chooses', () => {
  const todayLog = log(TODAY, [5, 6, 7], [5]);

  it('asks (no default) and says what was revised', () => {
    const c = change(withLeftovers, newPlan, [yesterday, todayLog]);
    expect(c.progress).toBe('partial');
    expect(c.defaultStart).toBeNull();
  });

  it('start today: today becomes the new first day, what was revised stays on it as done', () => {
    const after = change(withLeftovers, newPlan, [yesterday, todayLog]).apply('today');
    expect(pagesOn(after, 17)).toEqual([5, 1, 2, 3]);
    expect(pagesOn(after, 18)).toEqual([4, 5, 6]);
  });

  it('start tomorrow: today stays exactly as it was, the new plan’s first day is tomorrow', () => {
    const after = change(withLeftovers, newPlan, [yesterday, todayLog]).apply('tomorrow');
    expect(pagesOn(after, 17)).toEqual([5, 6, 7]);
    expect(pagesOn(after, 18)).toEqual([1, 2, 3]);
    expect(pagesOn(after, 19)).toEqual([4, 5, 6]);
    expect(pagesOn(after, 20)).toEqual([7, 8, 9]);
    expect(pagesOn(after, 21)).toEqual([1, 2, 3]);
    expect(holdsToday(after, today)).toBe(true);
  });

  it('start tomorrow is stored without a future start, so older versions read it the same way', () => {
    const after = change(withLeftovers, newPlan, [yesterday, todayLog]).apply('tomorrow');
    // The plan starts today, its last day first; Home's repair (in every
    // version) leaves a start of today alone.
    expect(after.customPlan?.cycleStartDate).toBe(TODAY);
    expect(after.customPlan?.days).toEqual([[7, 8, 9], [1, 2, 3], [4, 5, 6]]);
    expect(scheduleStartingByToday(after, today)).toBeNull();
    expect(after.carryOver).toEqual({ day: TODAY, pages: [5, 6, 7], skip: 3 });
  });

  it('a held day over a rest day is still recognised (skip at least 1)', () => {
    const withRest: CustomPlan = { ...newPlan, days: [[1, 2, 3], [4, 5, 6], []] };
    const after = change(withLeftovers, withRest, [yesterday, todayLog]).apply('tomorrow');
    expect(pagesOn(after, 17)).toEqual([5, 6, 7]);
    expect(pagesOn(after, 18)).toEqual([1, 2, 3]);
    expect(holdsToday(after, today)).toBe(true);
  });

  it('start tomorrow on the automatic schedule: today as it was, tomorrow the automatic day', () => {
    const onPlan = { ...baseUser, customPlan: newPlan };
    const after = change(onPlan, null, [log(TODAY, [1, 2, 3], [1])]).apply('tomorrow');
    expect(pagesOn(after, 17)).toEqual([1, 2, 3]);
    expect(pagesOn(after, 18)).toEqual(pagesOn(baseUser, 18));
  });
});

describe('a new plan once today is done', () => {
  it('starts tomorrow without asking; today keeps the pages that were done', () => {
    const c = change(withLeftovers, newPlan, [yesterday, log(TODAY, [5, 6, 7], [5, 6, 7])]);
    expect(c.progress).toBe('done');
    expect(c.defaultStart).toBe('tomorrow');
    const after = c.apply('tomorrow');
    expect(pagesOn(after, 17)).toEqual([5, 6, 7]);
    expect(pagesOn(after, 18)).toEqual([1, 2, 3]);
  });
});

describe('a plan that starts tomorrow, changed again today', () => {
  const later = change(withLeftovers, newPlan, [yesterday, log(TODAY, [5, 6, 7], [5])]).apply('tomorrow');

  it('the editor shows it from tomorrow; an edit saved from there still starts tomorrow, today held', () => {
    const shown = rotateCustomPlanToToday(later.customPlan!, day(18));
    expect(shown).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    const edited = [[1, 2, 3], [4, 5, 6], [8, 9]];
    const after = scheduleFromTomorrow(later, { customPlan: createCustomPlanFromDraft(edited, 'forward', today) }, {
      revisionDate: today,
      memorized,
    });
    expect(pagesOn(after, 17)).toEqual([5, 6, 7]);
    expect(pagesOn(after, 18)).toEqual([1, 2, 3]);
    expect(pagesOn(after, 20)).toEqual([8, 9]);
    expect(holdsToday(after, today)).toBe(true);
  });

  it('a save that keeps today’s slot keeps today held (the hold is not a shift)', () => {
    const c = change(later, later.customPlan, []);
    expect(c.changesToday).toBe(false);
    const after = c.apply('today');
    expect(pagesOn(after, 17)).toEqual([5, 6, 7]);
    expect(pagesOn(after, 18)).toEqual([1, 2, 3]);
  });

  it('a carry-over that keeps the daily amount is not a held day', () => {
    expect(holdsToday(withLeftovers, today)).toBe(false);
    expect(holdsToday(applyCarryOver({ ...baseUser, carryOverMode: 'add' }, memorized, [5, 6], today), today)).toBe(false);
  });
});

describe('revisedOn', () => {
  it('every page revised on the day, once, in order', () => {
    expect(revisedOn([log(TODAY, [1, 2], [2, 1]), log(TODAY, [3], [1, 3]), log('2026-10-16', [4], [4])], TODAY)).toEqual([2, 1, 3]);
  });
});

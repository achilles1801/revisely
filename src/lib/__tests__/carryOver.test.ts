import {
  applyCarryOver,
  findLeftoverPages,
  hasCarriedOver,
  settleCarryOverForNewPlan,
} from '../carryOver';
import { generateDailyAssignment, scheduledDaysFrom } from '../algorithm';
import type { RevisionLog, User, UserPage } from '../../types';

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
  scheduleAnchorDate: '2026-01-01T12:00:00Z',
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

function log(date: string, assignedPages: number[], pagesRevised: number[]): RevisionLog {
  return {
    id: `${date}-${pagesRevised.join('.')}`,
    date,
    assignedPages,
    pagesRevised,
    pagesSkipped: [],
    weaknessUpdates: [],
    durationMinutes: 5,
  };
}

const TODAY = '2026-10-17';
const today = new Date(2026, 9, 17);

describe('findLeftoverPages', () => {
  it('returns yesterday’s assigned pages that were not revised', () => {
    const logs = [log('2026-10-16', [1, 2, 3], [1])];
    expect(findLeftoverPages(logs, TODAY, [4, 5, 6], memorizedSet)).toEqual([2, 3]);
  });

  it('merges several sessions on the same day', () => {
    const logs = [log('2026-10-16', [1, 2, 3], [1]), log('2026-10-16', [1, 2, 3], [3])];
    expect(findLeftoverPages(logs, TODAY, [4, 5, 6], memorizedSet)).toEqual([2]);
  });

  it('skips pages already revised today or already in today’s session', () => {
    const logs = [log('2026-10-16', [1, 2, 3], [1]), log(TODAY, [4, 5, 6], [2])];
    expect(findLeftoverPages(logs, TODAY, [3, 4, 5], memorizedSet)).toEqual([]);
  });

  it('ignores a day with no session, and days before the lookback', () => {
    const logs = [log('2026-10-15', [1, 2, 3], [1])];
    expect(findLeftoverPages(logs, TODAY, [], memorizedSet)).toEqual([]);
    expect(findLeftoverPages(logs, TODAY, [], memorizedSet, 2)).toEqual([2, 3]);
  });

  it('drops pages that are no longer memorized', () => {
    const logs = [log('2026-10-16', [1, 2, 3], [1])];
    expect(findLeftoverPages(logs, TODAY, [], new Set([1, 2]))).toEqual([2]);
  });
});

const day = (d: number) => new Date(2026, 9, d);
const pagesOn = (user: User, d: number) => generateDailyAssignment(memorized, [], user, day(d)).pages;

describe('applyCarryOver', () => {
  const plan = {
    days: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
    cycleStartDate: '2026-10-15', // Oct 16 = [4,5,6], Oct 17 = [7,8,9]
    direction: 'forward' as const,
  };

  it('keep daily amount: leftovers first, the end of today moves to tomorrow, the plan flows on', () => {
    const user = { ...baseUser, customPlan: plan };
    const next = applyCarryOver(user, memorized, [5, 6], today);
    expect(pagesOn(next, 17)).toEqual([5, 6, 7]);
    expect(pagesOn(next, 18)).toEqual([8, 9, 1]);
    expect(pagesOn(next, 19)).toEqual([2, 3, 4]);
    // The plan itself is untouched: same days, same start.
    expect(next.customPlan).toBe(plan);
    expect(next.scheduleShiftPages).toBe(2);
  });

  it('keeps an automatic schedule automatic', () => {
    const user = { ...baseUser, scheduleAnchorDate: new Date(2026, 9, 16, 12).toISOString() }; // Oct 16 = [1,2,3]
    expect(pagesOn(user, 17)).toEqual([4, 5, 6]);
    const next = applyCarryOver(user, memorized, [2, 3], today);
    expect(next.customPlan).toBeNull();
    expect(pagesOn(next, 17)).toEqual([2, 3, 4]);
    expect(pagesOn(next, 18)).toEqual([5, 6, 7]);
  });

  it('drops pages revised yesterday when the leftovers are scattered', () => {
    const user = { ...baseUser, customPlan: plan };
    // Oct 16 = [4,5,6] and only 5 was revised.
    const next = applyCarryOver(user, memorized, [4, 6], today);
    expect(pagesOn(next, 17)).toEqual([4, 6, 7]);
    expect(pagesOn(next, 18)).toEqual([8, 9, 1]);
  });

  it('with more leftovers than today holds, today is all leftovers and today’s plan moves whole', () => {
    const big = { days: [[1, 2, 3, 4, 5], [6, 7], [8, 9]], cycleStartDate: '2026-10-16', direction: 'forward' as const };
    const user = { ...baseUser, customPlan: big };
    const next = applyCarryOver(user, memorized, [2, 3, 4, 5], today);
    expect(pagesOn(next, 17)).toEqual([2, 3, 4, 5]);
    expect(pagesOn(next, 18)).toEqual([6, 7]);
    // Carried once: the button's leftovers are gone and a second apply is a no-op.
    expect(hasCarriedOver(next, TODAY)).toBe(true);
    expect(applyCarryOver(next, memorized, [2, 3], today)).toBe(next);
  });

  it('on an off day the leftovers become today and nothing shifts', () => {
    const withOff = { days: [[1, 2, 3], [], [4, 5, 6]], cycleStartDate: '2026-10-16', direction: 'forward' as const };
    const user = { ...baseUser, customPlan: withOff };
    const next = applyCarryOver(user, memorized, [2, 3], today);
    expect(pagesOn(next, 17)).toEqual([2, 3]);
    expect(pagesOn(next, 18)).toEqual([4, 5, 6]);
    expect(next.scheduleShiftPages ?? 0).toBe(0);
  });

  it('add on top: today gets the leftovers plus its own pages, nothing else moves', () => {
    const user: User = { ...baseUser, customPlan: plan, carryOverMode: 'add' };
    const next = applyCarryOver(user, memorized, [5, 6], today);
    expect(pagesOn(next, 17)).toEqual([5, 6, 7, 8, 9]);
    expect(pagesOn(next, 18)).toEqual([1, 2, 3]);
  });

  it('does not show a carried page that is no longer memorized', () => {
    const user: User = { ...baseUser, customPlan: plan, carryOverMode: 'add' };
    const next = applyCarryOver(user, memorized, [5, 6], today);
    const without5 = memorized.filter((p) => p.pageNumber !== 5);
    expect(generateDailyAssignment(without5, [], next, today).pages).toEqual([6, 7, 8, 9]);
  });

  it('keeps "Go back a day" working after a shift (plan start is untouched)', () => {
    const user = { ...baseUser, customPlan: plan };
    const next = applyCarryOver(user, memorized, [5, 6], today);
    // Tomorrow, going back a day repeats tomorrow's slot the day after.
    expect(pagesOn(next, 18)).toEqual([8, 9, 1]);
    expect(next.customPlan?.cycleStartDate).toBe('2026-10-15');
  });

  it('saving the plan in the editor keeps today as it is and folds the shift into the plan', () => {
    const user = { ...baseUser, customPlan: plan };
    const shifted = applyCarryOver(user, memorized, [5, 6], today);
    const shown = scheduledDaysFrom(shifted, memorized, today, 3);
    expect(shown).toEqual([[5, 6, 7], [8, 9, 1], [2, 3, 4]]);
    const saved: User = {
      ...settleCarryOverForNewPlan(shifted, TODAY),
      customPlan: { days: shown, cycleStartDate: TODAY, direction: 'forward' },
    };
    expect(saved.scheduleShiftPages).toBe(0);
    expect(pagesOn(saved, 17)).toEqual([5, 6, 7]);
    expect(pagesOn(saved, 18)).toEqual([8, 9, 1]);
  });
});

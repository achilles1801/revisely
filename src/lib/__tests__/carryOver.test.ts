import {
  applyCarryOver,
  findLeftoverPages,
  shiftDaysForCarryOver,
} from '../carryOver';
import { generateDailyAssignment } from '../algorithm';
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

describe('shiftDaysForCarryOver', () => {
  it('moves leftovers to the front and keeps every day’s size', () => {
    const days = [[4, 5, 6], [7, 8, 9], [1, 2, 3]]; // index 0 = today, last = yesterday
    expect(shiftDaysForCarryOver(days, [2, 3])).toEqual([[2, 3, 4], [5, 6, 7], [8, 9, 1]]);
  });

  it('fills today with leftovers when there are more than fit', () => {
    expect(shiftDaysForCarryOver([[3], [1, 2]], [1, 2])).toEqual([[1], [2, 3]]);
  });
});

describe('applyCarryOver', () => {
  const plan = {
    days: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
    cycleStartDate: '2026-10-15', // Oct 16 = [4,5,6], Oct 17 = [7,8,9]
    direction: 'forward' as const,
  };

  it('keep daily amount: today starts with the leftovers and the plan shifts', () => {
    const user = { ...baseUser, customPlan: plan };
    const next = applyCarryOver(user, memorized, [5, 6], today);
    expect(next.customPlan?.cycleStartDate).toBe(TODAY);
    expect(generateDailyAssignment(memorized, [], next, today).pages).toEqual([5, 6, 7]);
    const tomorrow = new Date(2026, 9, 18);
    expect(generateDailyAssignment(memorized, [], next, tomorrow).pages).toEqual([8, 9, 1]);
    expect(next.carryOver ?? null).toBeNull();
  });

  it('add on top: today gets the leftovers plus its own pages, nothing else moves', () => {
    const user: User = { ...baseUser, customPlan: plan, carryOverMode: 'add' };
    const next = applyCarryOver(user, memorized, [5, 6], today);
    expect(next.customPlan).toBe(plan);
    expect(generateDailyAssignment(memorized, [], next, today).pages).toEqual([5, 6, 7, 8, 9]);
    const tomorrow = new Date(2026, 9, 18);
    expect(generateDailyAssignment(memorized, [], next, tomorrow).pages).toEqual([1, 2, 3]);
  });

  it('turns the automatic schedule into a shifted custom plan', () => {
    const user = { ...baseUser, scheduleAnchorDate: '2026-10-16T12:00:00Z' };
    // Oct 16 = [1,2,3], Oct 17 = [4,5,6]
    expect(generateDailyAssignment(memorized, [], user, today).pages).toEqual([4, 5, 6]);
    const next = applyCarryOver(user, memorized, [3], today);
    expect(generateDailyAssignment(memorized, [], next, today).pages).toEqual([3, 4, 5]);
  });

  it('adds on top when the plan was pushed back past today', () => {
    const user = { ...baseUser, customPlan: { ...plan, cycleStartDate: '2026-10-20' } };
    const next = applyCarryOver(user, memorized, [5], today);
    expect(next.carryOver).toEqual({ day: TODAY, pages: [5] });
  });
});

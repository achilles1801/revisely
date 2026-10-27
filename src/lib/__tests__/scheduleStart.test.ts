// "Behind? Move the plan back a day" on a schedule that starts today: not
// offered, and an account an earlier version left with a start in the future
// gets today's revision back.
import {
  canPushScheduleBack,
  getPagesForDay,
  scheduleStartingByToday,
  shiftScheduleAnchor,
} from '../algorithm';
import { createCustomPlanFromDraft } from '../schedulePlans';
import type { User, UserPage } from '../../types';

const today = new Date(2026, 9, 27, 9, 0);
const day = (offset: number) => new Date(2026, 9, 27 + offset, 9, 0);

const memorized: UserPage[] = Array.from({ length: 6 }, (_, i) => ({
  pageNumber: i + 1,
  status: 'memorized',
  dateMemorized: '2026-10-27',
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
}));

/** A brand-new account: made this morning, its schedule counts from today. */
const fresh: User = {
  id: 'u1',
  createdAt: new Date(2026, 9, 27, 8, 0).toISOString(),
  scheduleAnchorDate: new Date(2026, 9, 27, 8, 0).toISOString(),
  smartTrackingEnabled: false,
  hasSeenSmartTrackingPreview: false,
  dailyPageCapacity: 2,
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
};

describe('going back a day', () => {
  it('is not offered on a new account: there is no yesterday to repeat', () => {
    expect(canPushScheduleBack(fresh, today)).toBe(false);
  });

  it('is offered from the second day on', () => {
    expect(canPushScheduleBack(fresh, day(1))).toBe(true);
    const older = { ...fresh, scheduleAnchorDate: day(-5).toISOString() };
    expect(canPushScheduleBack(older, today)).toBe(true);
  });

  it('follows a custom plan: not on the day it was saved, yes after', () => {
    const planned: User = { ...fresh, customPlan: createCustomPlanFromDraft([[1, 2], [3, 4]], 'forward', today) };
    expect(canPushScheduleBack(planned, today)).toBe(false);
    expect(canPushScheduleBack(planned, day(1))).toBe(true);
  });

  it('when offered, today repeats yesterday', () => {
    const older = { ...fresh, scheduleAnchorDate: day(-1).toISOString() };
    const yesterday = getPagesForDay(older, day(-1), memorized);
    expect(getPagesForDay(shiftScheduleAnchor(older, 1), today, memorized)).toEqual(yesterday);
  });
});

describe('an account left with a start in the future', () => {
  // What an earlier version did when "back a day" was tapped on the first day.
  const stuck = shiftScheduleAnchor(fresh, 1);

  it('had nothing to revise today', () => {
    expect(getPagesForDay(stuck, today, memorized)).toEqual([]);
  });

  it('starts today again: today gets the first day of the schedule', () => {
    const repaired = scheduleStartingByToday(stuck, today);
    expect(repaired).not.toBeNull();
    expect(getPagesForDay(repaired!, today, memorized)).toEqual([1, 2]);
    expect(getPagesForDay(repaired!, day(1), memorized)).toEqual([3, 4]);
    expect(canPushScheduleBack(repaired!, today)).toBe(false);
  });

  it('a custom plan in the same state is repaired the same way', () => {
    const planned = shiftScheduleAnchor(
      { ...fresh, customPlan: createCustomPlanFromDraft([[5, 6], [1, 2]], 'forward', today) },
      1,
    );
    expect(getPagesForDay(planned, today, memorized)).toEqual([]);
    const repaired = scheduleStartingByToday(planned, today)!;
    expect(repaired.customPlan?.cycleStartDate).toBe('2026-10-27');
    expect(getPagesForDay(repaired, today, memorized)).toEqual([5, 6]);
  });

  it('leaves a schedule that started by today alone', () => {
    expect(scheduleStartingByToday(fresh, today)).toBeNull();
    expect(scheduleStartingByToday({ ...fresh, scheduleAnchorDate: day(-3).toISOString() }, today)).toBeNull();
  });
});

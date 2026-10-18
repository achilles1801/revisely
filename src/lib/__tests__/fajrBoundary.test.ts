import {
  getFajrTimeFor,
  getNextRevisionDayStart,
  getRevisionDateForUser,
  getRevisionDayForUser,
} from '../fajrBoundary';
import { generateDailyAssignment } from '../algorithm';
import type { User, UserPage } from '../../types';

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
  fajrBoundaryEnabled: true,
  // Fajr is computed for the coordinates and compared with the device's clock,
  // so place the user where solar time matches this machine's time zone:
  // fajr then falls in the early morning wherever the tests run.
  locationCoords: {
    latitude: 30,
    longitude: Math.max(-165, Math.min(165, -new Date(2026, 9, 17, 12).getTimezoneOffset() / 4)),
  },
  fajrCalculationMethod: 'MuslimWorldLeague',
  scheduleAnchorDate: '2026-01-01T12:00:00Z',
};

const day = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Noon local time, so the calendar day is unambiguous in any time zone.
const noon = new Date(2026, 9, 17, 12, 0, 0);
const fajr = getFajrTimeFor(noon, user) as Date;
const MIN = 60_000;

describe('revision day with the fajr boundary', () => {
  it('still counts as yesterday just before fajr', () => {
    const before = new Date(fajr.getTime() - MIN);
    if (day(before) !== day(noon)) return; // fajr this close to midnight: nothing to test
    const yesterday = new Date(2026, 9, 16);
    expect(getRevisionDayForUser(user, before)).toBe(day(yesterday));
    expect(getRevisionDateForUser(user, before).getTime()).toBe(yesterday.getTime());
  });

  it('turns over at fajr', () => {
    const after = new Date(fajr.getTime() + MIN);
    expect(getRevisionDayForUser(user, after)).toBe(day(noon));
    expect(getRevisionDateForUser(user, after).getTime()).toBe(new Date(2026, 9, 17).getTime());
  });

  it('uses midnight when the boundary is off', () => {
    const off = { ...user, fajrBoundaryEnabled: false };
    const before = new Date(fajr.getTime() - MIN);
    expect(getRevisionDayForUser(off, before)).toBe(day(before));
    expect(getNextRevisionDayStart(off, noon).getTime()).toBe(new Date(2026, 9, 18).getTime());
  });

  it('next turnover is today’s fajr before it, tomorrow’s after it', () => {
    expect(getNextRevisionDayStart(user, new Date(fajr.getTime() - MIN)).getTime()).toBe(
      fajr.getTime(),
    );
    const next = getNextRevisionDayStart(user, new Date(fajr.getTime() + MIN));
    const tomorrowsFajr = getFajrTimeFor(new Date(2026, 9, 18, 12), user) as Date;
    expect(next.getTime()).toBe(tomorrowsFajr.getTime());
  });

  it('schedules the revision day, not the calendar day, between midnight and fajr', () => {
    const planned: User = {
      ...user,
      customPlan: {
        days: [[1, 2], [3, 4], [5, 6]],
        cycleStartDate: '2026-10-16',
        direction: 'forward',
      },
    };
    const memorized: UserPage[] = [1, 2, 3, 4, 5, 6].map((pageNumber) => ({
      pageNumber,
      status: 'memorized',
      dateMemorized: '2025-01-01',
      weaknessRating: 4,
      lastRevisedDate: null,
      totalRevisionCount: 0,
      skipCount: 0,
    }));
    const lateNight = new Date(2026, 9, 17, 0, 30); // before fajr: still Oct 16
    if (lateNight.getTime() >= getFajrTimeFor(lateNight, user)!.getTime()) return;
    const assignment = generateDailyAssignment(
      memorized,
      [],
      planned,
      getRevisionDateForUser(planned, lateNight),
    );
    expect(assignment.date).toBe('2026-10-16');
    expect(assignment.pages).toEqual([1, 2]);
  });
});

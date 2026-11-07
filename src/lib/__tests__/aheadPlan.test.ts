import {
  daysDoneAhead,
  nextRevisionDayPlan,
  revisionDayAfter,
  revisionDayPlan,
  weekdayLabel,
} from '../aheadPlan';
import type { RevisionLog, User, UserPage } from '../../types';

// Three pages a day over nine memorized pages: a three-day cycle from the anchor.
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

const pages: UserPage[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((pageNumber) => ({
  pageNumber,
  status: 'memorized',
  dateMemorized: '2025-01-01',
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
}));

function log(date: string, pagesRevised: number[], ahead?: Record<string, number[]>): RevisionLog {
  return {
    id: date,
    date,
    assignedPages: pagesRevised,
    pagesRevised,
    pagesSkipped: [],
    weaknessUpdates: [],
    durationMinutes: null,
    ...(ahead ? { ahead } : {}),
  };
}

describe('nextRevisionDayPlan', () => {
  it('is the next day with pages, with its pages in the schedule’s order', () => {
    expect(nextRevisionDayPlan(baseUser, pages, '2026-01-01', new Set([1, 2, 3]))).toEqual({
      day: '2026-01-02',
      pages: [4, 5, 6],
    });
  });

  it('stops at the end of one cycle: the next day’s pages were taken already', () => {
    const taken = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(nextRevisionDayPlan(baseUser, pages, '2026-01-01', taken)).toBeNull();
  });

  it('passes over a day already done ahead', () => {
    const logs = [log('2026-01-01', [1, 2, 3], { '2026-01-02': [4, 5, 6] })];
    expect(nextRevisionDayPlan(baseUser, pages, '2026-01-01', new Set([1, 2, 3]), logs)).toEqual({
      day: '2026-01-03',
      pages: [7, 8, 9],
    });
  });
});

describe('daysDoneAhead', () => {
  it('counts a day whose pages were all revised ahead, and not a part-done one', () => {
    const logs = [log('2026-01-01', [1, 2, 3], { '2026-01-02': [4, 5, 6], '2026-01-03': [7] })];
    expect([...daysDoneAhead(baseUser, pages, logs)]).toEqual(['2026-01-02']);
  });
});

describe('revisionDayPlan and day helpers', () => {
  it('is one day’s pages', () => {
    expect(revisionDayPlan(baseUser, pages, '2026-01-03')).toEqual({ day: '2026-01-03', pages: [7, 8, 9] });
  });

  it('steps by calendar day, across a year', () => {
    expect(revisionDayAfter('2026-12-31')).toBe('2027-01-01');
  });

  it('names the weekday', () => {
    expect(weekdayLabel('2026-11-02')).toBe('Mon');
  });
});

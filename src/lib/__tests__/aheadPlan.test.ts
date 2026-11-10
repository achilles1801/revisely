import {
  aheadDayLabel,
  aheadLead,
  daysDoneAhead,
  nextRevisionDayPlan,
  revisionDayAfter,
  revisionDayPlan,
  startsCycle,
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

  // AHEAD-3 (Majd, Nov 9 2026): past the cycle's end the cycle restarts. The day repeats pages taken
  // already, so it is a new round, revised apart from them.
  it('goes on past the end of a cycle: the next day repeats pages taken already, a new round', () => {
    const taken = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(nextRevisionDayPlan(baseUser, pages, '2026-01-03', taken)).toEqual({ day: '2026-01-04', pages: [1, 2, 3], round: true });
  });

  it('a new round passes over the next cycle’s days already done ahead, and needs no round once nothing repeats', () => {
    // Today (Jan 1) and the whole cycle done; the next cycle’s first day (Jan 4) done too, in a round.
    const logs = [log('2026-01-01', [1, 2, 3, 4, 5, 6, 7, 8, 9], { '2026-01-02': [4, 5, 6], '2026-01-03': [7, 8, 9], '2026-01-04': [1, 2, 3] })];
    // From Home: today’s pages are 1–3; Jan 5 repeats none of them.
    expect(nextRevisionDayPlan(baseUser, pages, '2026-01-01', new Set([1, 2, 3]), logs)).toEqual({ day: '2026-01-05', pages: [4, 5, 6] });
  });

  it('is a new round only when the pages it still needs repeat taken ones (those already credited to it don’t)', () => {
    const logs = [log('2026-01-01', [1, 2, 3], { '2026-01-04': [1] })];
    expect(nextRevisionDayPlan(baseUser, pages, '2026-01-03', new Set([1, 2, 3]), logs)).toEqual({ day: '2026-01-04', pages: [2, 3], round: true });
    const done = [log('2026-01-01', [1, 2, 3], { '2026-01-04': [1, 2] })];
    expect(nextRevisionDayPlan(baseUser, pages, '2026-01-03', new Set([1, 2]), done)).toEqual({ day: '2026-01-04', pages: [3] });
  });

  it('passes over a day already done ahead', () => {
    const logs = [log('2026-01-01', [1, 2, 3], { '2026-01-02': [4, 5, 6] })];
    expect(nextRevisionDayPlan(baseUser, pages, '2026-01-01', new Set([1, 2, 3]), logs)).toEqual({
      day: '2026-01-03',
      pages: [7, 8, 9],
    });
  });
});

describe('naming the next day (AHEAD-3)', () => {
  it('starts a cycle on its first page: pages a day, a custom plan, juz a day', () => {
    // Pages a day: Jan 4 starts on page 1 again.
    expect(startsCycle(baseUser, pages, '2026-01-04', 1)).toBe(true);
    expect(startsCycle(baseUser, pages, '2026-01-05', 4)).toBe(false);
    // Partly done (it would open on page 2): the cycle already began.
    expect(startsCycle(baseUser, pages, '2026-01-04', 2)).toBe(false);
    const custom: User = { ...baseUser, customPlan: { cycleStartDate: '2026-01-01', days: [[], [1, 2, 3], [4, 5, 6, 7, 8, 9]] } as User['customPlan'] };
    // Day one is an off day: the cycle begins on its first day with pages.
    expect(startsCycle(custom, pages, '2026-01-05', 1)).toBe(true);
    expect(startsCycle(custom, pages, '2026-01-06', 4)).toBe(false);
    const juz: User = { ...baseUser, scheduleMode: 'juz', dailyJuzCount: 1 };
    expect(startsCycle(juz, pages, '2026-01-02', 1)).toBe(true);
  });

  it('Tomorrow, then Next cycle for a cycle’s first day, else the weekday (with the date a week on)', () => {
    expect(aheadLead(baseUser, pages, '2026-01-03', { day: '2026-01-04', pages: [1, 2, 3] })).toBe('Tomorrow');
    expect(aheadLead(baseUser, pages, '2026-01-01', { day: '2026-01-04', pages: [1, 2, 3] })).toBe('Next cycle');
    expect(aheadLead(baseUser, pages, '2026-01-01', { day: '2026-01-05', pages: [4, 5, 6] })).toBe('Mon');
    expect(aheadLead(baseUser, pages, '2026-01-01', { day: '2026-01-05', pages: [4, 5, 6] }, { long: true })).toBe('Monday');
    expect(aheadDayLabel('2026-01-01', '2026-01-08')).toBe('Thu 8 Jan');
    expect(aheadDayLabel('2026-01-01', '2026-01-07')).toBe('Wed');
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

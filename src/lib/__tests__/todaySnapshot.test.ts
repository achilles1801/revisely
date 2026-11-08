// Home's status for today (lib/todaySnapshot) when pages from Insights are first (ACT-24). Majd's phone,
// Nov 8 2026: every page revised, yet "28 of 28", "Continue at Quraysh" and Continue revision: the day's
// own pages were all among the pages put first, so none counted as its own and it was never done.
import { todaySnapshot } from '../todaySnapshot';
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

const pages: UserPage[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((pageNumber) => ({
  pageNumber,
  status: 'memorized',
  dateMemorized: '2025-01-01',
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
}));

const revised = (date: string, assignedPages: number[], pagesRevised: number[]): RevisionLog => ({
  id: `${date}-s`,
  date,
  assignedPages,
  pagesRevised,
  pagesSkipped: [],
  weaknessUpdates: [],
  durationMinutes: 5,
});

function snapshotOn(user: User, day: string, logs: RevisionLog[]) {
  const [y, m, d] = day.split('-').map(Number);
  const assignment = generateDailyAssignment(pages, [], user, new Date(y, m - 1, d)).pages;
  return todaySnapshot({ user, pages, logs, day, assignment, history: null, now: new Date(y, m - 1, d, 12).getTime() });
}

describe('[ACT-24] [SESS-7] today with pages from Insights first', () => {
  // Oct 16 = [1, 2, 3], Oct 17 = [4, 5], Oct 18 = [6, 7], Oct 19 = [8, 9].
  const plan = { days: [[1, 2, 3], [4, 5], [6, 7], [8, 9]], cycleStartDate: '2026-10-16', direction: 'forward' as const };

  it('the day’s own pages among them are still its own: revised, the day is done', () => {
    const user: User = { ...baseUser, customPlan: plan, carryOver: { day: '2026-10-18', pages: [9, 6, 7], skip: 0, source: 'insights' } };
    const snap = snapshotOn(user, '2026-10-18', [revised('2026-10-18', [6, 7], [9, 6, 7])]);
    expect(snap.pages).toEqual([9, 6, 7]);
    expect(snap.own).toEqual([6, 7]);
    expect(snap.status).toBe('completed');
  });

  it('they stay extra: the day’s own pages alone finish it', () => {
    const user: User = { ...baseUser, customPlan: plan, carryOver: { day: '2026-10-18', pages: [9, 6], skip: 0, source: 'insights' } };
    expect(snapshotOn(user, '2026-10-18', [revised('2026-10-18', [6, 7], [6, 7])]).status).toBe('completed');
    expect(snapshotOn(user, '2026-10-18', [revised('2026-10-18', [6, 7], [9, 6])]).status).toBe('partial');
  });

  it('an off day given pages from Insights is done once they are revised, not “N of N” and Continue for good', () => {
    const withOff = { days: [[1, 2, 3], [], [4, 5, 6]], cycleStartDate: '2026-10-16', direction: 'forward' as const };
    const user: User = { ...baseUser, customPlan: withOff, carryOver: { day: '2026-10-17', pages: [8, 9], skip: 0, source: 'insights' } };
    expect(snapshotOn(user, '2026-10-17', [revised('2026-10-17', [], [8])]).status).not.toBe('completed');
    expect(snapshotOn(user, '2026-10-17', [revised('2026-10-17', [], [8, 9])]).status).toBe('completed');
  });
});

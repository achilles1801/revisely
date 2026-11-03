// Revising ahead, as the rest of the app reads it: carry-over, Insights' missed
// revisions, Activity, and Home's "starts at" line.
import { findLeftoverPages } from '../carryOver';
import { getMissedScheduledRevisions } from '../algorithm';
import { buildActivityDays, summarizeActivityDay } from '../activity';
import { buildActivityItems } from '../activityItems';
import { aheadLine, NBSP } from '../todayLines';
import type { RevisionLog, User, UserPage } from '../../types';

const user: User = {
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

const memorizedPages: UserPage[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((pageNumber) => ({
  pageNumber,
  status: 'memorized',
  dateMemorized: '2025-01-01',
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
}));
const memorized = new Set(memorizedPages.map((p) => p.pageNumber));

function log(
  date: string,
  pagesRevised: number[],
  extra: Partial<RevisionLog> = {},
): RevisionLog {
  return {
    id: date,
    date,
    assignedPages: pagesRevised,
    pagesRevised,
    pagesSkipped: [],
    weaknessUpdates: [],
    durationMinutes: null,
    ...extra,
  };
}

describe('carry-over', () => {
  it('a page revised ahead for yesterday is done, not a leftover', () => {
    // Yesterday (Jan 2) was [4, 5, 6]: 4 was revised that day, 5 and 6 ahead on Jan 1.
    const logs = [
      log('2026-01-01', [1, 2, 3], { ahead: { '2026-01-02': [5, 6] } }),
      log('2026-01-02', [4], { assignedPages: [4, 5, 6] }),
    ];
    expect(findLeftoverPages(logs, '2026-01-03', [7, 8, 9], memorized)).toEqual([]);
  });

  it('pages of yesterday that were neither revised nor credited still carry over', () => {
    const logs = [
      log('2026-01-01', [1, 2, 3], { ahead: { '2026-01-02': [5] } }),
      log('2026-01-02', [4], { assignedPages: [4, 5, 6] }),
    ];
    expect(findLeftoverPages(logs, '2026-01-03', [7, 8, 9], memorized)).toEqual([6]);
  });
});

describe('Insights: missed revisions', () => {
  // Page 4 is scheduled on Jan 2. Today is Jan 3.
  const today = new Date(2026, 0, 3);
  const page = memorizedPages[3];

  it('counts the day missed when nothing was revised on it', () => {
    expect(getMissedScheduledRevisions(page, user, memorizedPages, [log('2026-01-01', [1, 2, 3])], today)).toBe(1);
  });

  it('a page revised ahead for its day is not missed', () => {
    const sessions = [log('2026-01-01', [1, 2, 3], { ahead: { '2026-01-02': [4] } })];
    expect(getMissedScheduledRevisions(page, user, memorizedPages, sessions, today)).toBe(0);
  });
});

describe('Activity', () => {
  const sessions = [log('2026-01-05', [1, 2], { ahead: { '2026-01-06': [3, 4] } })];

  it('shows the session as revised ahead, and the day it counts for as done ahead', () => {
    const titles = buildActivityItems({ logs: sessions }).map((i) => `${i.day} ${i.title}`);
    expect(titles).toContain('2026-01-05 Revised ahead for Tue · 2 pages');
    expect(titles).toContain('2026-01-06 Done ahead on Mon');
  });

  it('a day done ahead has its pages, with no session of its own', () => {
    const days = buildActivityDays({ logs: sessions, readings: [], journal: [] });
    const target = days.find((d) => d.date === '2026-01-06');
    expect(target?.revisions).toEqual([]);
    expect(target && summarizeActivityDay(target).aheadPages).toBe(2);
    // Those pages are not counted as revised on the day that did not revise them.
    expect(target && summarizeActivityDay(target).revisedPages).toBe(0);
  });
});

describe('Home: the line that opens the next day', () => {
  it('starts with the lead and the first page, with a non-breaking space before the page number', () => {
    const line = aheadLine('Tomorrow', 4);
    expect(line.text.startsWith('Tomorrow starts at ')).toBe(true);
    expect(line.text).toContain(`p.${NBSP}4`);
  });
});

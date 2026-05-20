import {
  buildDefaultPlanDays,
  calculatePageUrgency,
  countCompletedSessions,
  generateDailyAssignment,
  getMissedScheduledRevisions,
  getPagesScheduledForDate,
  INSIGHTS_MIN_SESSIONS,
} from '../algorithm';
import type { User, UserPage, QuranPage, RevisionLog, CustomPlan } from '../../types';

const baseUser: User = {
  id: 'u1',
  createdAt: '2026-01-01T12:00:00Z',
  smartTrackingEnabled: false,
  hasSeenSmartTrackingPreview: false,
  dailyPageCapacity: 5,
  reminderTime: '08:00',
  notificationsEnabled: true,
  currentMemorizationJuz: null,
  currentMemorizationPage: null,
  currentKhatamPage: 1,
  customPlan: null,
  streak: 0,
  lastRevisionDate: null,
  memorizedSurahs: [],
  fajrBoundaryEnabled: false,
  locationCoords: null,
  fajrCalculationMethod: 'NorthAmerica',
  scheduleAnchorDate: '2026-01-01T12:00:00Z',
};

function makePage(overrides: Partial<UserPage>): UserPage {
  return {
    pageNumber: 1,
    status: 'memorized',
    dateMemorized: '2025-01-01',
    weaknessRating: 4,
    lastRevisedDate: '2026-05-01',
    totalRevisionCount: 0,
    skipCount: 0,
    ...overrides,
  };
}

function makeLog(overrides: Partial<RevisionLog>): RevisionLog {
  return {
    id: `log-${Math.random()}`,
    date: '2026-05-01',
    pagesRevised: [],
    pagesSkipped: [],
    weaknessUpdates: [],
    durationMinutes: 10,
    ...overrides,
  };
}

describe('getPagesScheduledForDate', () => {
  // 10 memorized pages, 5 per day → 2-day cycle.
  const memorized: UserPage[] = Array.from({ length: 10 }, (_, i) =>
    makePage({ pageNumber: i + 1 }),
  );
  const user = { ...baseUser, dailyPageCapacity: 5 };

  it('returns the first slice on day 0', () => {
    const result = getPagesScheduledForDate(user, new Date('2026-01-01T12:00:00Z'), memorized);
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it('advances to the next slice on day 1', () => {
    const result = getPagesScheduledForDate(user, new Date('2026-01-02T12:00:00Z'), memorized);
    expect(result).toEqual([6, 7, 8, 9, 10]);
  });

  it('wraps back to the start after one full cycle', () => {
    const result = getPagesScheduledForDate(user, new Date('2026-01-03T12:00:00Z'), memorized);
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns empty when no pages are memorized', () => {
    expect(getPagesScheduledForDate(user, new Date('2026-01-01T12:00:00Z'), [])).toEqual([]);
  });

  it('caps the slice size at the memorized count', () => {
    const tiny = [makePage({ pageNumber: 1 }), makePage({ pageNumber: 2 })];
    const result = getPagesScheduledForDate(user, new Date('2026-01-01T12:00:00Z'), tiny);
    expect(result).toEqual([1, 2]);
  });
});

describe('getMissedScheduledRevisions', () => {
  const memorized: UserPage[] = Array.from({ length: 5 }, (_, i) =>
    makePage({ pageNumber: i + 1 }),
  );
  // With dailyPageCapacity 5 and 5 memorized pages, every day all 5 pages
  // are scheduled.
  const user = { ...baseUser, dailyPageCapacity: 5, createdAt: '2026-01-01T12:00:00Z' };

  it('returns 0 when the page was revised in every scheduled session', () => {
    const page = makePage({ pageNumber: 1, lastRevisedDate: '2026-01-04' });
    const sessions: RevisionLog[] = [
      makeLog({ date: '2026-01-02', pagesRevised: [1] }),
      makeLog({ date: '2026-01-03', pagesRevised: [1] }),
      makeLog({ date: '2026-01-04', pagesRevised: [1] }),
    ];
    const today = new Date('2026-01-04T12:00:00Z');
    expect(
      getMissedScheduledRevisions(page, user, memorized, sessions, today),
    ).toBe(0);
  });

  it('counts each scheduled-but-not-revised day after the last revision', () => {
    const page = makePage({ pageNumber: 1, lastRevisedDate: '2026-01-01' });
    const sessions: RevisionLog[] = [
      makeLog({ date: '2026-01-01', pagesRevised: [1] }),
    ];
    // Today is Jan 4 → Jan 2, 3, 4 all scheduled and missed = 3 misses.
    const today = new Date('2026-01-04T12:00:00Z');
    expect(
      getMissedScheduledRevisions(page, user, memorized, sessions, today),
    ).toBe(3);
  });

  it('counts a submitted session that skipped the page as a miss', () => {
    const page = makePage({ pageNumber: 1, lastRevisedDate: '2026-01-01' });
    const sessions: RevisionLog[] = [
      makeLog({ date: '2026-01-01', pagesRevised: [1] }),
      makeLog({ date: '2026-01-02', pagesRevised: [2, 3], pagesSkipped: [1] }),
    ];
    const today = new Date('2026-01-02T12:00:00Z');
    expect(
      getMissedScheduledRevisions(page, user, memorized, sessions, today),
    ).toBe(1);
  });

  it('returns 0 for non-memorized pages', () => {
    const page = makePage({ pageNumber: 1, status: 'in_progress' });
    expect(
      getMissedScheduledRevisions(page, user, memorized, [], new Date('2026-01-04T12:00:00Z')),
    ).toBe(0);
  });
});

describe('calculatePageUrgency', () => {
  const memorized: UserPage[] = Array.from({ length: 5 }, (_, i) =>
    makePage({ pageNumber: i + 1 }),
  );
  const user = { ...baseUser, dailyPageCapacity: 5, createdAt: '2026-01-01T12:00:00Z' };
  const today = new Date('2026-01-10T12:00:00Z');

  it('returns 0 for non-memorized pages', () => {
    const page = makePage({ pageNumber: 1, status: 'in_progress' });
    expect(calculatePageUrgency(page, user, memorized, [], today)).toBe(0);
  });

  it('grows with consistency debt (more missed = higher urgency)', () => {
    const onTime = makePage({
      pageNumber: 1,
      lastRevisedDate: '2026-01-10',
      dateMemorized: '2020-01-01',
    });
    const behind = makePage({
      pageNumber: 1,
      lastRevisedDate: '2026-01-05',
      dateMemorized: '2020-01-01',
    });
    expect(
      calculatePageUrgency(behind, user, memorized, [], today),
    ).toBeGreaterThan(calculatePageUrgency(onTime, user, memorized, [], today));
  });

  it('weights weaker pages higher than strong pages with the same debt', () => {
    const weak = makePage({
      pageNumber: 1,
      lastRevisedDate: '2026-01-05',
      weaknessRating: 1,
      dateMemorized: '2020-01-01',
    });
    const strong = makePage({
      pageNumber: 1,
      lastRevisedDate: '2026-01-05',
      weaknessRating: 5,
      dateMemorized: '2020-01-01',
    });
    expect(
      calculatePageUrgency(weak, user, memorized, [], today),
    ).toBeGreaterThan(
      calculatePageUrgency(strong, user, memorized, [], today),
    );
  });

  it('boosts recently-memorized pages via the recency bonus', () => {
    // Both pages on schedule (no missed revisions) but one is newly memorized.
    const sessions: RevisionLog[] = Array.from({ length: 10 }, (_, i) => {
      const day = String(i + 1).padStart(2, '0');
      return makeLog({ date: `2026-01-${day}`, pagesRevised: [1] });
    });
    const justMemorized = makePage({
      pageNumber: 1,
      lastRevisedDate: '2026-01-10',
      dateMemorized: '2026-01-01',
    });
    const longAgo = makePage({
      pageNumber: 1,
      lastRevisedDate: '2026-01-10',
      dateMemorized: '2020-01-01',
    });
    expect(
      calculatePageUrgency(justMemorized, user, memorized, sessions, today),
    ).toBeGreaterThan(
      calculatePageUrgency(longAgo, user, memorized, sessions, today),
    );
  });
});

describe('generateDailyAssignment', () => {
  const today = new Date('2026-01-01T12:00:00Z');
  const user = { ...baseUser, dailyPageCapacity: 2, createdAt: '2026-01-01T12:00:00Z' };
  const quranData: QuranPage[] = [
    { pageNumber: 1, juzNumber: 1, surahNumber: 1, surahName: 'Al-Fatihah', surahNameArabic: 'الفاتحة', startingAyah: 1 },
    { pageNumber: 2, juzNumber: 1, surahNumber: 2, surahName: 'Al-Baqarah', surahNameArabic: 'البقرة', startingAyah: 1 },
    { pageNumber: 3, juzNumber: 1, surahNumber: 2, surahName: 'Al-Baqarah', surahNameArabic: 'البقرة', startingAyah: 6 },
    { pageNumber: 22, juzNumber: 2, surahNumber: 2, surahName: 'Al-Baqarah', surahNameArabic: 'البقرة', startingAyah: 142 },
  ];

  it('returns exactly dailyPageCapacity pages from the schedule', () => {
    const pages = [
      makePage({ pageNumber: 1 }),
      makePage({ pageNumber: 2 }),
      makePage({ pageNumber: 3 }),
    ];
    const result = generateDailyAssignment(pages, quranData, user, today);
    expect(result.totalPages).toBe(2);
    expect(result.pages).toHaveLength(2);
  });

  it('only schedules memorized pages', () => {
    const pages = [
      makePage({ pageNumber: 1, status: 'in_progress' }),
      makePage({ pageNumber: 2, status: 'memorized' }),
    ];
    const result = generateDailyAssignment(pages, quranData, user, today);
    expect(result.pages).toEqual([2]);
  });

  it('groups returned pages by juz in juzBreakdown', () => {
    const pages = [makePage({ pageNumber: 1 }), makePage({ pageNumber: 22 })];
    const result = generateDailyAssignment(pages, quranData, user, today);
    const juzNumbers = result.juzBreakdown.map((j) => j.juz);
    expect(juzNumbers).toEqual([1, 2]);
  });

  it('includes the date in YYYY-MM-DD format', () => {
    const result = generateDailyAssignment([], quranData, user, today);
    expect(result.date).toBe('2026-01-01');
  });
});

describe('countCompletedSessions', () => {
  it('counts only sessions with at least one page revised', () => {
    const logs: RevisionLog[] = [
      makeLog({ date: '2026-01-01', pagesRevised: [1] }),
      makeLog({ date: '2026-01-02', pagesRevised: [] }),
      makeLog({ date: '2026-01-03', pagesRevised: [2, 3] }),
    ];
    expect(countCompletedSessions(logs)).toBe(2);
  });

  it('returns 0 for an empty array', () => {
    expect(countCompletedSessions([])).toBe(0);
  });
});

describe('INSIGHTS_MIN_SESSIONS', () => {
  it('is set to 5 (the agreed populated-tab threshold)', () => {
    expect(INSIGHTS_MIN_SESSIONS).toBe(5);
  });
});

describe('buildDefaultPlanDays', () => {
  const memorized: UserPage[] = Array.from({ length: 10 }, (_, i) =>
    makePage({ pageNumber: i + 1 }),
  );
  const user = { ...baseUser, dailyPageCapacity: 4, createdAt: '2026-01-01T12:00:00Z' };
  const createdToday = new Date('2026-01-01T12:00:00Z');

  it('every day is exactly pagesPerDay pages, wrapping at the end', () => {
    // 10 pages, 4/day → cycle length 3. Last day wraps tail-to-head so
    // every day has the full 4 pages.
    const days = buildDefaultPlanDays(user, memorized, 'forward', createdToday);
    expect(days).toEqual([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 1, 2]]);
  });

  it('reverses the order when direction is reverse', () => {
    const days = buildDefaultPlanDays(user, memorized, 'reverse', createdToday);
    expect(days).toEqual([[10, 9, 8, 7], [6, 5, 4, 3], [2, 1, 10, 9]]);
  });

  it('rotates so today is index 0', () => {
    // Day 1 of usage — sliding window advances by perDay (4).
    const today = new Date('2026-01-02T12:00:00Z');
    const days = buildDefaultPlanDays(user, memorized, 'forward', today);
    expect(days).toEqual([[5, 6, 7, 8], [9, 10, 1, 2], [3, 4, 5, 6]]);
  });

  it('matches the live scheduler for today (editor and revision session agree)', () => {
    const today = new Date('2026-01-02T12:00:00Z');
    const editorDays = buildDefaultPlanDays(user, memorized, 'forward', today);
    const scheduledToday = getPagesScheduledForDate(user, today, memorized);
    expect(editorDays[0]).toEqual(scheduledToday);
  });

  it('returns an empty list when no pages are memorized', () => {
    expect(buildDefaultPlanDays(user, [], 'forward', createdToday)).toEqual([]);
  });
});

describe('getPagesScheduledForDate with customPlan', () => {
  const memorized: UserPage[] = Array.from({ length: 5 }, (_, i) =>
    makePage({ pageNumber: i + 1 }),
  );

  it('uses the custom plan when present', () => {
    const customPlan: CustomPlan = {
      days: [[100], [200], []],
      cycleStartDate: '2026-01-01',
      direction: 'forward',
    };
    const user = { ...baseUser, customPlan };
    expect(
      getPagesScheduledForDate(user, new Date('2026-01-01T12:00:00Z'), memorized),
    ).toEqual([100]);
    expect(
      getPagesScheduledForDate(user, new Date('2026-01-02T12:00:00Z'), memorized),
    ).toEqual([200]);
    // Off day
    expect(
      getPagesScheduledForDate(user, new Date('2026-01-03T12:00:00Z'), memorized),
    ).toEqual([]);
  });

  it('loops the custom plan after one full cycle', () => {
    const customPlan: CustomPlan = {
      days: [[100], [200]],
      cycleStartDate: '2026-01-01',
      direction: 'forward',
    };
    const user = { ...baseUser, customPlan };
    expect(
      getPagesScheduledForDate(user, new Date('2026-01-03T12:00:00Z'), memorized),
    ).toEqual([100]);
    expect(
      getPagesScheduledForDate(user, new Date('2026-01-04T12:00:00Z'), memorized),
    ).toEqual([200]);
  });

  it('falls back to the default plan when customPlan is empty', () => {
    const customPlan: CustomPlan = {
      days: [],
      cycleStartDate: '2026-01-01',
      direction: 'forward',
    };
    const user = {
      ...baseUser,
      dailyPageCapacity: 5,
      createdAt: '2026-01-01T12:00:00Z',
      customPlan,
    };
    expect(
      getPagesScheduledForDate(user, new Date('2026-01-01T12:00:00Z'), memorized),
    ).toEqual([1, 2, 3, 4, 5]);
  });
});

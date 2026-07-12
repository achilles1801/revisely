import {
  buildAutoBalancePlanDays,
  buildDefaultPlanDays,
  buildOneJuzPerDayPlanDays,
  buildWeakestFirstPlanDays,
  calculatePageUrgency,
  countCompletedSessions,
  generateDailyAssignment,
  getMissedScheduledRevisions,
  getPagesScheduledForDate,
  INSIGHTS_MIN_SESSIONS,
  shiftScheduleAnchor,
} from '../algorithm';
import type { User, UserPage, QuranPage, RevisionLog, CustomPlan } from '../../types';

const baseUser: User = {
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
  it('is set to 3 (the agreed populated-tab threshold)', () => {
    expect(INSIGHTS_MIN_SESSIONS).toBe(3);
  });
});

describe('getPagesScheduledForDate — juz mode', () => {
  // Pages 1-21 = Juz 1, 22-41 = Juz 2, 42-61 = Juz 3 (per Madani layout).
  // We give the user a handful of pages from juz 1 and juz 3 so we can prove
  // the scheduler skips juz 2 (which has nothing memorized) and rotates only
  // through juz the user actually owns.
  const memorized: UserPage[] = [
    makePage({ pageNumber: 1 }),
    makePage({ pageNumber: 5 }),
    makePage({ pageNumber: 21 }),
    makePage({ pageNumber: 42 }),
    makePage({ pageNumber: 55 }),
  ];
  const juzUser: User = {
    ...baseUser,
    scheduleMode: 'juz',
    dailyJuzCount: 1,
    scheduleAnchorDate: '2026-01-01T12:00:00Z',
  };

  it('day 0 returns memorized pages of the lowest-numbered memorized juz', () => {
    const day0 = new Date('2026-01-01T12:00:00Z');
    const result = getPagesScheduledForDate(juzUser, day0, memorized);
    expect(result).toEqual([1, 5, 21]); // all juz-1 pages the user has
  });

  it('day 1 advances to the next memorized juz (skipping juz with no memorized pages)', () => {
    const day1 = new Date('2026-01-02T12:00:00Z');
    const result = getPagesScheduledForDate(juzUser, day1, memorized);
    expect(result).toEqual([42, 55]); // juz 3 — juz 2 was skipped (nothing memorized)
  });

  it('cycles back to the first juz after one full rotation', () => {
    const day2 = new Date('2026-01-03T12:00:00Z');
    const result = getPagesScheduledForDate(juzUser, day2, memorized);
    expect(result).toEqual([1, 5, 21]);
  });

  it('dailyJuzCount > 1 returns the union of multiple juz on the same day', () => {
    const userTwoJuz = { ...juzUser, dailyJuzCount: 2 };
    const day0 = new Date('2026-01-01T12:00:00Z');
    const result = getPagesScheduledForDate(userTwoJuz, day0, memorized);
    expect(result).toEqual([1, 5, 21, 42, 55]); // juz 1 + juz 3 pages
  });

  it('returns empty when no pages are memorized', () => {
    const day0 = new Date('2026-01-01T12:00:00Z');
    expect(getPagesScheduledForDate(juzUser, day0, [])).toEqual([]);
  });

  it('falls through to pages mode when scheduleMode is "pages"', () => {
    const pagesUser = { ...juzUser, scheduleMode: 'pages' as const, dailyPageCapacity: 2 };
    const day0 = new Date('2026-01-01T12:00:00Z');
    const result = getPagesScheduledForDate(pagesUser, day0, memorized);
    // Sliding window of 2 across [1, 5, 21, 42, 55] starting at day 0.
    expect(result).toEqual([1, 5]);
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

describe('buildAutoBalancePlanDays', () => {
  const memorized: UserPage[] = Array.from({ length: 10 }, (_, i) =>
    makePage({ pageNumber: i + 1 }),
  );
  const user = { ...baseUser, dailyPageCapacity: 4 };

  it('slices into equal perDay chunks, wrapping the tail from the head', () => {
    // 10 pages, 4/day → 3 days; last day wraps so every day is exactly 4.
    expect(buildAutoBalancePlanDays(user, memorized)).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 1, 2],
    ]);
  });

  it('starts at the beginning regardless of the schedule anchor', () => {
    // Unlike buildDefaultPlanDays, the preset is anchor-independent — a "fresh
    // start" reset, not a rotation onto today.
    const shiftedAnchor = { ...user, scheduleAnchorDate: '2025-06-01T12:00:00Z' };
    expect(buildAutoBalancePlanDays(shiftedAnchor, memorized)[0]).toEqual([1, 2, 3, 4]);
  });

  it('reverses the order when direction is reverse', () => {
    expect(buildAutoBalancePlanDays(user, memorized, 'reverse')).toEqual([
      [10, 9, 8, 7],
      [6, 5, 4, 3],
      [2, 1, 10, 9],
    ]);
  });

  it('returns an empty list when nothing is memorized', () => {
    expect(buildAutoBalancePlanDays(user, [])).toEqual([]);
  });
});

describe('buildOneJuzPerDayPlanDays', () => {
  it('makes one day per memorized juz, holding that juz pages', () => {
    // Pages 1,5,21 = Juz 1; 42,55 = Juz 3 (Madani layout). Juz 2 is absent.
    const memorized: UserPage[] = [
      makePage({ pageNumber: 1 }),
      makePage({ pageNumber: 5 }),
      makePage({ pageNumber: 21 }),
      makePage({ pageNumber: 42 }),
      makePage({ pageNumber: 55 }),
    ];
    expect(buildOneJuzPerDayPlanDays(memorized)).toEqual([
      [1, 5, 21],
      [42, 55],
    ]);
  });

  it('returns an empty list when nothing is memorized', () => {
    expect(buildOneJuzPerDayPlanDays([])).toEqual([]);
  });
});

describe('buildWeakestFirstPlanDays', () => {
  const today = new Date('2026-01-10T12:00:00Z');
  // All three fully on schedule (last revised after "today" → 0 missed,
  // robustly, regardless of runner timezone) and equally recent, so only the
  // weakness multiplier separates them: rating 1 > rating 3 > rating 5.
  const weak = makePage({
    pageNumber: 2,
    weaknessRating: 1,
    dateMemorized: '2026-01-08',
    lastRevisedDate: '2026-02-01',
  });
  const mid = makePage({
    pageNumber: 3,
    weaknessRating: 3,
    dateMemorized: '2026-01-08',
    lastRevisedDate: '2026-02-01',
  });
  const strong = makePage({
    pageNumber: 1,
    weaknessRating: 5,
    dateMemorized: '2026-01-08',
    lastRevisedDate: '2026-02-01',
  });
  const memorized = [strong, weak, mid];

  it('orders the cycle weakest (most urgent) first', () => {
    const user = { ...baseUser, dailyPageCapacity: 1, createdAt: '2026-01-01T12:00:00Z' };
    expect(buildWeakestFirstPlanDays(user, memorized, [], today)).toEqual([
      [2],
      [3],
      [1],
    ]);
  });

  it('chunks by perDay with the remainder on the last day (no wrap)', () => {
    const user = { ...baseUser, dailyPageCapacity: 2, createdAt: '2026-01-01T12:00:00Z' };
    expect(buildWeakestFirstPlanDays(user, memorized, [], today)).toEqual([
      [2, 3],
      [1],
    ]);
  });

  it('returns an empty list when nothing is memorized', () => {
    const user = { ...baseUser, dailyPageCapacity: 5 };
    expect(buildWeakestFirstPlanDays(user, [], [], today)).toEqual([]);
  });
});

describe('shiftScheduleAnchor', () => {
  const memorized: UserPage[] = Array.from({ length: 10 }, (_, i) =>
    makePage({ pageNumber: i + 1 }),
  );
  const user = {
    ...baseUser,
    dailyPageCapacity: 5,
    scheduleAnchorDate: '2026-01-01T12:00:00Z',
  };
  const D3 = new Date('2026-01-03T12:00:00Z');
  const D2 = new Date('2026-01-02T12:00:00Z');
  const D4 = new Date('2026-01-04T12:00:00Z');

  it('+1 slides every assignment one day later (today shows yesterday’s set)', () => {
    const shifted = shiftScheduleAnchor(user, 1);
    // Day 3 after the shift == day 2 before it.
    expect(getPagesScheduledForDate(shifted, D3, memorized)).toEqual(
      getPagesScheduledForDate(user, D2, memorized),
    );
  });

  it('-1 slides every assignment one day earlier (skip ahead)', () => {
    const shifted = shiftScheduleAnchor(user, -1);
    // Day 3 after the shift == day 4 before it.
    expect(getPagesScheduledForDate(shifted, D3, memorized)).toEqual(
      getPagesScheduledForDate(user, D4, memorized),
    );
  });

  it('shifts the custom-plan cycle start when a custom plan is set', () => {
    const customUser = {
      ...user,
      customPlan: {
        days: [[100], [200], [300]],
        cycleStartDate: '2026-01-01',
        direction: 'forward' as const,
      },
    };
    const shifted = shiftScheduleAnchor(customUser, 1);
    expect(shifted.customPlan?.cycleStartDate).toBe('2026-01-02');
    // Day 2 after the shift == day 1 before it.
    expect(getPagesScheduledForDate(shifted, D2, memorized)).toEqual(
      getPagesScheduledForDate(customUser, new Date('2026-01-01T12:00:00Z'), memorized),
    );
  });

  it('is a no-op for deltaDays 0', () => {
    expect(shiftScheduleAnchor(user, 0)).toBe(user);
  });
});

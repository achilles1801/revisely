import {
  calculatePageUrgency,
  generateDailyAssignment,
  updateDangerThreshold,
} from '../algorithm';
import type { User, UserPage, QuranPage } from '../../types';

const baseUser: User = {
  id: 'u1',
  createdAt: '2026-01-01',
  mode: 'weighted',
  dailyPageCapacity: 5,
  activeDays: [0, 1, 2, 3, 4, 5, 6],
  reminderTime: '08:00',
  notificationsEnabled: true,
  dangerAlertEnabled: true,
  dangerThresholdDays: 10,
  currentMemorizationJuz: null,
  currentMemorizationPage: null,
  currentKhatamPage: 1,
  streak: 0,
  lastRevisionDate: null,
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

describe('calculatePageUrgency', () => {
  const today = new Date('2026-05-10T00:00:00Z');

  it('returns 0 for non-memorized pages', () => {
    const page = makePage({ status: 'in_progress' });
    expect(calculatePageUrgency(page, baseUser, today)).toBe(0);
  });

  it('returns 0 when lastRevisedDate is missing', () => {
    const page = makePage({ lastRevisedDate: null });
    expect(calculatePageUrgency(page, baseUser, today)).toBe(0);
  });

  it('grows with days since last revision', () => {
    const recent = makePage({ lastRevisedDate: '2026-05-08' });
    const stale = makePage({ lastRevisedDate: '2026-04-20' });
    expect(calculatePageUrgency(stale, baseUser, today)).toBeGreaterThan(
      calculatePageUrgency(recent, baseUser, today),
    );
  });

  it('penalises pages with a high skip count', () => {
    const fresh = makePage({ skipCount: 0 });
    const skipped = makePage({ skipCount: 5 });
    expect(calculatePageUrgency(skipped, baseUser, today)).toBeGreaterThan(
      calculatePageUrgency(fresh, baseUser, today),
    );
  });

  it('weights weaker pages higher than strong pages', () => {
    const strong = makePage({ weaknessRating: 5 });
    const weak = makePage({ weaknessRating: 1 });
    expect(calculatePageUrgency(weak, baseUser, today)).toBeGreaterThan(
      calculatePageUrgency(strong, baseUser, today),
    );
  });

  it('boosts recently-memorized pages via the recency multiplier', () => {
    const justMemorized = makePage({ dateMemorized: '2026-05-01' });
    const longAgoMemorized = makePage({ dateMemorized: '2024-01-01' });
    expect(calculatePageUrgency(justMemorized, baseUser, today)).toBeGreaterThan(
      calculatePageUrgency(longAgoMemorized, baseUser, today),
    );
  });
});

describe('generateDailyAssignment', () => {
  const today = new Date('2026-05-10T00:00:00Z');
  const quranData: QuranPage[] = [
    { pageNumber: 1, juzNumber: 1, surahNumber: 1, surahName: 'Al-Fatihah', surahNameArabic: 'الفاتحة', startingAyah: 1 },
    { pageNumber: 2, juzNumber: 1, surahNumber: 2, surahName: 'Al-Baqarah', surahNameArabic: 'البقرة', startingAyah: 1 },
    { pageNumber: 3, juzNumber: 1, surahNumber: 2, surahName: 'Al-Baqarah', surahNameArabic: 'البقرة', startingAyah: 6 },
    { pageNumber: 22, juzNumber: 2, surahNumber: 2, surahName: 'Al-Baqarah', surahNameArabic: 'البقرة', startingAyah: 142 },
  ];

  it('returns at most dailyPageCapacity pages', () => {
    const user = { ...baseUser, dailyPageCapacity: 2 };
    const pages = [
      makePage({ pageNumber: 1, lastRevisedDate: '2026-04-01' }),
      makePage({ pageNumber: 2, lastRevisedDate: '2026-04-15' }),
      makePage({ pageNumber: 3, lastRevisedDate: '2026-05-01' }),
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
    const result = generateDailyAssignment(pages, quranData, baseUser, today);
    expect(result.pages).toEqual([2]);
  });

  it('groups returned pages by juz in juzBreakdown', () => {
    const pages = [
      makePage({ pageNumber: 1 }),
      makePage({ pageNumber: 22 }),
    ];
    const result = generateDailyAssignment(pages, quranData, baseUser, today);
    const juzNumbers = result.juzBreakdown.map((j) => j.juz);
    expect(juzNumbers).toEqual([1, 2]);
  });

  it('estimates duration at ~1.25 minutes per page', () => {
    const pages = [
      makePage({ pageNumber: 1 }),
      makePage({ pageNumber: 2 }),
      makePage({ pageNumber: 3 }),
      makePage({ pageNumber: 22 }),
    ];
    const result = generateDailyAssignment(pages, quranData, baseUser, today);
    expect(result.estimatedMinutes).toBe(Math.round(4 * 1.25));
  });

  it('includes the date in YYYY-MM-DD format', () => {
    const result = generateDailyAssignment([], quranData, baseUser, today);
    expect(result.date).toBe('2026-05-10');
  });
});

describe('updateDangerThreshold', () => {
  it('returns the current threshold when fewer than 10 data points', () => {
    expect(updateDangerThreshold(baseUser, [3, 4, 5])).toBe(baseUser.dangerThresholdDays);
  });

  it('clamps to a minimum of 5 days', () => {
    const samples = Array(20).fill(1);
    expect(updateDangerThreshold(baseUser, samples)).toBe(5);
  });

  it('clamps to a maximum of 30 days', () => {
    const samples = Array(20).fill(60);
    expect(updateDangerThreshold(baseUser, samples)).toBe(30);
  });

  it('uses the 25th percentile of the data', () => {
    const samples = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const result = updateDangerThreshold(baseUser, samples);
    expect(result).toBe(12);
  });
});

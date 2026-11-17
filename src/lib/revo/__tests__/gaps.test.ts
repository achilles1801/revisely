import { revoGaps } from '../gaps';
import type { User, UserPage } from '../../../types';

// 20 pages, 5 a day from 1 January (a 4-day cycle). Today is 15 January.
const TODAY = '2026-01-15';
const user = {
  id: 'u1',
  createdAt: '2026-01-01T12:00:00Z',
  dailyPageCapacity: 5,
  scheduleMode: 'pages',
  dailyJuzCount: 1,
  customPlan: null,
  fajrBoundaryEnabled: false,
  locationCoords: null,
  scheduleAnchorDate: '2026-01-01T12:00:00Z',
} as unknown as User;
const page = (pageNumber: number, lastRevisedDate: string | null): UserPage =>
  ({ pageNumber, status: 'memorized', dateMemorized: '2025-12-01T00:00:00.000Z', weaknessRating: 4, lastRevisedDate, totalRevisionCount: 1, skipCount: 0 }) as UserPage;

describe('revoGaps', () => {
  it('the section’s figures over 30 days, the full revision, and each surah’s days since revised', () => {
    // Revised every day to the 6th, then the 12th and 13th: a 6-day gap; nothing since (2 days).
    const days = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-12', '2026-01-13'];
    const history = days.map((day) => ({ day, pages: [1] }));
    // Pages 1–3 (Al-Fatihah, Al-Baqarah) revised on the 13th; 4–20 (Al-Baqarah) on the 6th.
    const pages = Array.from({ length: 20 }, (_, i) => page(i + 1, i < 3 ? '2026-01-13T00:00:00.000Z' : '2026-01-06T00:00:00.000Z'));
    const g = revoGaps({ user, pages, history, today: TODAY, firstDay: '2026-01-01' })!;
    expect(g.lastRevisedDaysAgo).toBe(2);
    expect(g.longestGap).toEqual({ days: 6, endedDaysAgo: 3 });
    expect(g.usualStepDays).toBe(1);
    expect(g.longGaps).toBe(1);
    expect(g.fullRevision).toMatchObject({ cycleDays: 4 });
    expect(g.fullRevision!.latePages).toBeGreaterThan(0);
    expect(g.surahs).toEqual([
      { name: 'Al-Baqarah', daysAgo: 9 },
      { name: 'Al-Fatihah', daysAgo: 2 },
    ]);
  });

  it('a long absence still open is the longest gap, not ended', () => {
    const g = revoGaps({ user, pages: [page(1, '2025-12-20T00:00:00.000Z')], history: [{ day: '2025-12-20', pages: [1] }], today: TODAY, firstDay: '2025-12-01' })!;
    expect(g.lastRevisedDaysAgo).toBe(26);
    expect(g.longestGap).toEqual({ days: 26, endedDaysAgo: null });
  });

  it('a surah never revised: null, and "not yet" in its first 30 days', () => {
    const fresh = { ...page(582, null), dateMemorized: '2026-01-10T00:00:00.000Z' } as UserPage;
    const g = revoGaps({ user, pages: [page(1, '2026-01-14T00:00:00.000Z'), fresh, page(600, null)], history: [{ day: '2026-01-14', pages: [1] }], today: TODAY, firstDay: '2025-12-01' })!;
    expect(g.surahs).toContainEqual({ name: 'An-Naba', daysAgo: null, notYet: true });
    expect(g.surahs[0]).toMatchObject({ daysAgo: null });
    expect(g.surahs[0].notYet).toBeUndefined();
  });

  it('nothing revised on record: nothing to send', () => {
    expect(revoGaps({ user, pages: [page(1, null)], history: [], today: TODAY })).toBeNull();
  });
});

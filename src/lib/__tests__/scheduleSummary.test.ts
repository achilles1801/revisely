// The schedule in Edit schedule's own words (SCHED-7), which Settings → Revision's Schedule row repeats (SET-1).
import type { User, UserPage } from '../../types';
import { liveScheduleDays, scheduleAmount, scheduleSummary } from '../scheduleSummary';

const user = (extra: Partial<User> = {}): User =>
  ({
    id: 'u1',
    createdAt: '2026-10-01T12:00:00',
    scheduleAnchorDate: '2026-11-01T12:00:00',
    dailyPageCapacity: 10,
    scheduleMode: 'pages',
    dailyJuzCount: 1,
    customPlan: null,
    fajrBoundaryEnabled: false,
    ...extra,
  }) as unknown as User;

const pages = (from: number, count: number): UserPage[] =>
  Array.from({ length: count }, (_, i) => ({ pageNumber: from + i, status: 'memorized' }) as unknown as UserPage);

const today = new Date(2026, 10, 25);

describe('[SET-1] [SCHED-7] the schedule in two lines', () => {
  it('pages a day, and every page comes round every so many days', () => {
    expect(scheduleSummary(user(), pages(495, 110), today)).toEqual({
      perDay: '10 pages a day',
      repeats: 'Every page comes round every 11 days',
    });
  });

  it('a juz a day says so until the schedule is edited', () => {
    const juz = user({ scheduleMode: 'juz', dailyJuzCount: 1 });
    const memorized = pages(542, 60); // Juz 28, 29 and 30
    const { days } = liveScheduleDays(juz, memorized, today);
    expect(scheduleAmount(juz, days)).toBe('1 juz');
    expect(scheduleAmount(juz, days, true)).toMatch(/pages$/);
  });

  it('a custom plan whose days differ gives the range', () => {
    const plan = user({
      customPlan: { days: [[1, 2, 3], [4, 5]], direction: 'forward', startDate: '2026-11-25' } as unknown as User['customPlan'],
    });
    expect(scheduleAmount(plan, [[1, 2, 3], [4, 5]])).toBe('2–3 pages');
  });

  it('nothing memorized: nothing to say (Edit schedule says why)', () => {
    expect(scheduleSummary(user(), [], today)).toBeNull();
  });
});

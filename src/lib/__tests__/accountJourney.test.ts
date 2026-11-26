jest.mock('../../services/firestoreService', () => ({}));
jest.mock('../../context/AppContext', () => ({ useApp: () => ({}) }));
import { longestRunOf, milestoneDaysOf, pagesRevisedOf } from '../accountJourney';
import type { HistoryItem } from '../streakFromItems';

const item = (day: string, pages: number[], occurredAt = 0): HistoryItem => ({ id: day, day, countsFor: day, pages, assigned: pages, occurredAt });

describe('what the account has done (ACCOUNT-4)', () => {
  it('counts every revision: a page revised on three days is three', () => {
    expect(pagesRevisedOf([item('2026-11-01', [1, 2, 3]), item('2026-11-02', [1, 2]), item('2026-11-03', [1])])).toBe(6);
    expect(pagesRevisedOf([])).toBe(0);
  });

  it('finds the longest run of days', () => {
    expect(longestRunOf([])).toBe(0);
    expect(longestRunOf(['2026-11-01'])).toBe(1);
    expect(longestRunOf(['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05', '2026-11-06'])).toBe(3);
    // Across a month's end, in any order, with a day twice.
    expect(longestRunOf(['2026-12-01', '2026-11-30', '2026-11-29', '2026-11-30'])).toBe(3);
  });

  it('dates each milestone by the day it was reached', () => {
    const days = milestoneDaysOf([item('2026-11-03', new Array(45).fill(1)), item('2026-11-01', new Array(8).fill(1)), item('2026-11-02', new Array(5).fill(1))]);
    expect(days.get(10)).toBe('2026-11-02');
    expect(days.get(50)).toBe('2026-11-03');
    expect(days.has(100)).toBe(false);
  });
});

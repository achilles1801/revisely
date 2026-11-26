// A schedule Revo drafts (REVO-43): built as Create new plan builds it, from where today starts, with rest days if asked;
// the card's rows say what changes, from the account's own pages.
import type { User, UserPage } from '../../../types';
import { draftRows, draftScheduleDays, validDraft, withRestDays } from '../scheduleDraft';

const user = {
  id: 'u1',
  createdAt: '2026-10-01T12:00:00',
  scheduleAnchorDate: '2026-11-25T12:00:00',
  dailyPageCapacity: 10,
  scheduleMode: 'pages',
  dailyJuzCount: 1,
  customPlan: null,
  fajrBoundaryEnabled: false,
} as unknown as User;
const pages = (from: number, count: number): UserPage[] =>
  Array.from({ length: count }, (_, i) => ({ pageNumber: from + i, status: 'memorized' }) as unknown as UserPage);
const today = new Date(2026, 10, 25);

describe('[REVO-43] a drafted schedule', () => {
  it('takes only what the app can build', () => {
    expect(validDraft({ mode: 'pages', perDay: 6 })).toBe(true);
    expect(validDraft({ mode: 'juz', perDay: 1, restEvery: 7, reverse: true })).toBe(true);
    expect(validDraft({ mode: 'pages', perDay: 0 })).toBe(false);
    expect(validDraft({ mode: 'juz', perDay: 4 })).toBe(false);
    expect(validDraft({ mode: 'pages', perDay: 6, restEvery: 15 })).toBe(false);
    expect(validDraft(null)).toBe(false);
  });

  it('a rest day after every so many revision days, and once a round when the round is shorter', () => {
    expect(withRestDays([[1], [2], [3], [4]], 3)).toEqual([[1], [2], [], [3], [4], []]);
    expect(withRestDays([[1], [2]], 7)).toEqual([[1], [2], []]);
  });

  it('pages a day from where today starts, in days of that many', () => {
    const { days, direction } = draftScheduleDays(user, pages(1, 108), today, { mode: 'pages', perDay: 6, restEvery: 7 });
    expect(direction).toBe('forward');
    expect(days).toHaveLength(21);
    expect(days[0]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(days.filter((d) => d.length === 0)).toHaveLength(3);
    expect(new Set(days.flat()).size).toBe(108);
  });

  it('the card’s rows: a day, a round and rest days, now and with the draft', () => {
    expect(draftRows(user, pages(1, 108), today, { mode: 'pages', perDay: 6, restEvery: 7 })).toEqual([
      { label: 'A day', now: '10 pages', draft: '6 pages' },
      { label: 'A round', now: 'Every 11 days', draft: 'Every 21 days' },
      { label: 'Rest days', now: 'None', draft: '3 a round' },
    ]);
    expect(draftRows(user, pages(542, 60), today, { mode: 'juz', perDay: 1 })[0]).toEqual({ label: 'A day', now: '10 pages', draft: '1 juz' });
    expect(draftRows(user, [], today, { mode: 'pages', perDay: 6 })).toEqual([]);
  });
});

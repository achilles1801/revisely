// A schedule Revo drafts (REVO-43): built as Create new plan builds it, from where today starts, with rest days if asked;
// the card's rows say what changes, from the account's own pages.
import type { User, UserPage } from '../../../types';
import { draftRows, draftScheduleDays, validDraft, withRestWeekdays } from '../scheduleDraft';

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
    expect(validDraft({ mode: 'pages', perDay: 6, restDays: [5], reverse: true })).toBe(true);
    expect(validDraft({ mode: 'juz', perDay: 1, reverse: true })).toBe(true);
    // Weekdays off are pages a day only, one to three of them.
    expect(validDraft({ mode: 'juz', perDay: 1, restDays: [5] })).toBe(false);
    expect(validDraft({ mode: 'pages', perDay: 6, restDays: [0, 1, 2, 3] })).toBe(false);
    expect(validDraft({ mode: 'pages', perDay: 0 })).toBe(false);
    expect(validDraft({ mode: 'juz', perDay: 4 })).toBe(false);
    expect(validDraft({ mode: 'pages', perDay: 6, restDays: [7] })).toBe(false);
    expect(validDraft(null)).toBe(false);
  });

  it('rest on weekdays: whole weeks from today’s weekday, the pages spread evenly over the other days', () => {
    // From a Wednesday (3), Fridays (5) off: day 2 of each week.
    expect(withRestWeekdays([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]], [5], 3)).toEqual([[1, 2], [3, 4], [], [5, 6], [7, 8], [9, 10], [11, 12]]);
    // Fewer pages than a week holds at that amount: still a whole week, the days shorter.
    expect(withRestWeekdays([[1, 2], [3, 4]], [5], 3)).toEqual([[1], [2], [], [3], [4], [], []]);
  });

  it('pages a day from where today starts, in days of that many', () => {
    // Wednesday 25 November; Fridays off.
    const { days, direction } = draftScheduleDays(user, pages(1, 108), today, { mode: 'pages', perDay: 6, restDays: [5] });
    expect(direction).toBe('forward');
    expect(days).toHaveLength(21);
    expect(days[0]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(days.map((d, i) => (d.length === 0 ? i : -1)).filter((i) => i >= 0)).toEqual([2, 9, 16]);
    expect(new Set(days.flat()).size).toBe(108);
  });

  it('the card’s rows: a day, a round and rest days, now and with the draft', () => {
    expect(draftRows(user, pages(1, 108), today, { mode: 'pages', perDay: 6, restDays: [5] })).toEqual([
      { label: 'A day', now: '10 pages', draft: '6 pages' },
      { label: 'A round', now: 'Every 11 days', draft: 'Every 21 days' },
      { label: 'Rest days', now: 'None', draft: 'Friday' },
    ]);
    expect(draftRows(user, pages(542, 60), today, { mode: 'juz', perDay: 1 })[0]).toEqual({ label: 'A day', now: '10 pages', draft: '1 juz' });
    expect(draftRows(user, [], today, { mode: 'pages', perDay: 6 })).toEqual([]);
  });
});

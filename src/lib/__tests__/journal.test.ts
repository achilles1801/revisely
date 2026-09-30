import {
  emptyJournalEntry,
  filterJournalEntries,
  formatJournalDay,
  formatJournalMonth,
  journalMonths,
  JournalSort,
  sortJournalEntries,
  formatJournalDayRelative,
  formatMinutes,
  isJournalEntryEmpty,
  journalTotalMinutes,
  parseMinutesInput,
  recentJournalDays,
  shiftDay,
  sumJournalMinutes,
  summarizeRevisedPages,
} from '../journal';
import { JournalEntry } from '../../types';

function entry(date: string, overrides: Partial<JournalEntry> = {}): JournalEntry {
  return { ...emptyJournalEntry(date), ...overrides };
}

describe('journalTotalMinutes', () => {
  it('is null when neither time was recorded', () => {
    expect(journalTotalMinutes(entry('2026-09-28'))).toBeNull();
  });

  it('treats a missing side as zero', () => {
    expect(
      journalTotalMinutes(entry('2026-09-26', { revisionMinutes: 13 })),
    ).toBe(13);
    expect(
      journalTotalMinutes(
        entry('2026-09-23', { memorizationMinutes: 20, revisionMinutes: 10 }),
      ),
    ).toBe(30);
  });
});

describe('isJournalEntryEmpty', () => {
  it('ignores whitespace', () => {
    expect(isJournalEntryEmpty(entry('2026-09-28', { notes: '  ' }))).toBe(true);
  });

  it('counts a time with no text as content', () => {
    expect(
      isJournalEntryEmpty(entry('2026-09-28', { memorizationMinutes: 5 })),
    ).toBe(false);
  });
});

describe('formatMinutes', () => {
  it('formats minutes and hours', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(63)).toBe('1h 3m');
  });
});

describe('parseMinutesInput', () => {
  it('returns null for blank input', () => {
    expect(parseMinutesInput('')).toBeNull();
    expect(parseMinutesInput('abc')).toBeNull();
  });

  it('drops non-digits and caps at a day', () => {
    expect(parseMinutesInput('35')).toBe(35);
    expect(parseMinutesInput('3.5')).toBe(35);
    expect(parseMinutesInput('99999')).toBe(1440);
  });
});

describe('dates', () => {
  it('shifts across month boundaries', () => {
    expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('formats like a notes-app table', () => {
    expect(formatJournalDay('2026-09-23')).toBe('Wed 9/23');
  });

  it('uses Today / Yesterday relative labels', () => {
    expect(formatJournalDayRelative('2026-09-28', '2026-09-28')).toBe('Today');
    expect(formatJournalDayRelative('2026-09-27', '2026-09-28')).toBe('Yesterday');
    expect(formatJournalDayRelative('2026-09-26', '2026-09-28')).toBe('Sat 9/26');
  });
});

describe('recentJournalDays', () => {
  it('lists each recent day newest first, with gaps as null', () => {
    const days = recentJournalDays(
      [entry('2026-09-27', { revision: '1p anbiya' })],
      '2026-09-28',
      3,
    );
    expect(days.map((d) => d.date)).toEqual([
      '2026-09-28',
      '2026-09-27',
      '2026-09-26',
    ]);
    expect(days[0].entry).toBeNull();
    expect(days[1].entry?.revision).toBe('1p anbiya');
  });
});

describe('sumJournalMinutes', () => {
  it('only counts entries inside the window', () => {
    const entries = [
      entry('2026-09-28', { revisionMinutes: 30 }),
      entry('2026-09-27', { memorizationMinutes: 60, revisionMinutes: 3 }),
      entry('2026-09-21', { memorizationMinutes: 100 }), // 8 days back
    ];
    expect(sumJournalMinutes(entries, '2026-09-28', 7)).toEqual({
      memorization: 60,
      revision: 33,
      total: 93,
      activeDays: 2,
    });
  });
});

describe('summarizeRevisedPages', () => {
  it('returns empty for no pages', () => {
    expect(summarizeRevisedPages([])).toBe('');
  });

  it('names a single surah', () => {
    // Pages 305–308 are all within Maryam.
    expect(summarizeRevisedPages([305, 306, 307, 308])).toBe('4p Maryam');
  });

  it('joins two surahs', () => {
    // Page 312 holds the end of Maryam and the start of Taha.
    expect(summarizeRevisedPages([311, 312, 313])).toBe('3p Maryam + Taha');
  });

  it('collapses many surahs into a range', () => {
    const result = summarizeRevisedPages([582, 583, 584, 585, 586]);
    expect(result).toMatch(/^5p .+ – .+$/);
  });

  it('dedupes pages', () => {
    expect(summarizeRevisedPages([306, 306])).toBe('1p Maryam');
  });
});

describe('journal filtering & sorting', () => {
  const today = '2026-09-29';
  const entries = [
    entry('2026-09-29', { revisionMinutes: 10, updatedAt: 100 }),
    entry('2026-09-20', { memorizationMinutes: 45, updatedAt: 300 }),
    entry('2026-08-31', { revisionMinutes: 5, memorizationMinutes: 5, updatedAt: 200 }),
    entry('2026-08-01', { updatedAt: 50 }),
  ];

  it('filters by rolling windows and by month', () => {
    const dates = (f: string) =>
      filterJournalEntries(entries, f, today).map((e) => e.date);
    expect(dates('all')).toHaveLength(4);
    expect(dates('last7')).toEqual(['2026-09-29']);
    expect(dates('last30')).toEqual(['2026-09-29', '2026-09-20', '2026-08-31']);
    expect(dates('2026-08')).toEqual(['2026-08-31', '2026-08-01']);
  });

  it('lists months newest first', () => {
    expect(journalMonths(entries)).toEqual(['2026-09', '2026-08']);
    expect(formatJournalMonth('2026-09')).toBe('September 2026');
  });

  it('sorts by date, last update, and total time', () => {
    const dates = (s: JournalSort) => sortJournalEntries(entries, s).map((e) => e.date);
    expect(dates('newest')).toEqual(['2026-09-29', '2026-09-20', '2026-08-31', '2026-08-01']);
    expect(dates('oldest')).toEqual(['2026-08-01', '2026-08-31', '2026-09-20', '2026-09-29']);
    expect(dates('recentlyLogged')).toEqual(['2026-09-20', '2026-08-31', '2026-09-29', '2026-08-01']);
    expect(dates('mostTime')).toEqual(['2026-09-20', '2026-09-29', '2026-08-31', '2026-08-01']);
  });
});

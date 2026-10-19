import {
  activityInWindow,
  activityMonths,
  buildActivityDays,
  emptyActivityDay,
  filterActivityDays,
  isActivityDayEmpty,
  normalizeReadingSession,
  readingSessionDay,
  recentActivityDays,
  sortActivityDays,
  sumActivity,
  summarizeActivityDay,
} from '../activity';
import { emptyJournalEntry, journalFirstDay } from '../journal';
import { getRevisionDayForUser } from '../fajrBoundary';
import type { JournalEntry, ReadingSession, RevisionLog, User } from '../../types';

function log(date: string, pagesRevised: number[], overrides: Partial<RevisionLog> = {}): RevisionLog {
  return {
    id: `log-${date}-${pagesRevised.join('.')}`,
    date,
    pagesRevised,
    pagesSkipped: [],
    weaknessUpdates: [],
    durationMinutes: null,
    ...overrides,
  };
}

// Local wall-clock time on a given day, so tests are timezone-independent.
function at(date: string, hour: number, minute = 0): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute).getTime();
}

function reading(
  date: string,
  startHour: number,
  minutes: number,
  overrides: Partial<ReadingSession> = {},
): ReadingSession {
  const startedAt = at(date, startHour);
  return {
    id: `r-${date}-${startHour}`,
    date,
    startedAt,
    endedAt: startedAt + minutes * 60_000,
    durationSeconds: minutes * 60,
    mode: 'stopwatch',
    targetSeconds: null,
    pages: [],
    pagesVisited: [],
    ...overrides,
  };
}

function entry(date: string, overrides: Partial<JournalEntry> = {}): JournalEntry {
  return { ...emptyJournalEntry(date), ...overrides };
}

describe('buildActivityDays', () => {
  it('returns nothing for a brand-new account', () => {
    expect(buildActivityDays({ logs: [], readings: [], journal: [] })).toEqual([]);
  });

  it('merges the three sources into one day', () => {
    const days = buildActivityDays({
      logs: [log('2026-10-10', [1, 2, 3], { durationMinutes: 12 })],
      readings: [reading('2026-10-10', 9, 20)],
      journal: [entry('2026-10-10', { notes: 'Good day' })],
    });
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe('2026-10-10');
    expect(days[0].revisions).toHaveLength(1);
    expect(days[0].readings).toHaveLength(1);
    expect(days[0].journal?.notes).toBe('Good day');
  });

  it('keeps days with only one kind of activity, newest first', () => {
    const days = buildActivityDays({
      logs: [log('2026-10-08', [5])],
      readings: [reading('2026-10-10', 9, 5)],
      journal: [entry('2026-10-09', { memorization: '1/2 p3' })],
    });
    expect(days.map((d) => d.date)).toEqual(['2026-10-10', '2026-10-09', '2026-10-08']);
    expect(days[0].revisions).toEqual([]);
    expect(days[0].journal).toBeNull();
    expect(days[1].readings).toEqual([]);
    expect(days[2].readings).toEqual([]);
  });

  it('orders several reading sessions in a day by start time', () => {
    // getReadingSessions returns newest first.
    const days = buildActivityDays({
      logs: [],
      readings: [reading('2026-10-10', 21, 10), reading('2026-10-10', 6, 15), reading('2026-10-10', 13, 5)],
      journal: [],
    });
    expect(days[0].readings.map((r) => new Date(r.startedAt).getHours())).toEqual([6, 13, 21]);
    expect(summarizeActivityDay(days[0]).readingSeconds).toBe(30 * 60);
    expect(summarizeActivityDay(days[0]).readingCount).toBe(3);
  });

  it('groups by stored revision day, not the calendar day it started', () => {
    // 2am before fajr on the 11th belongs to the revision day of the 10th.
    const late = reading('2026-10-10', 0, 10, { startedAt: at('2026-10-11', 2), endedAt: at('2026-10-11', 2, 10) });
    const days = buildActivityDays({ logs: [log('2026-10-10', [7])], readings: [late], journal: [] });
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe('2026-10-10');
    expect(days[0].readings).toHaveLength(1);
  });

  it('skips empty journal entries and revision logs with nothing revised', () => {
    const days = buildActivityDays({
      logs: [log('2026-10-10', [], { pagesSkipped: [4, 5] })],
      readings: [],
      journal: [entry('2026-10-09', { notes: '   ' })],
    });
    expect(days).toEqual([]);
  });

  it('keeps more than one revision session on a day and counts pages once', () => {
    const days = buildActivityDays({
      logs: [
        log('2026-10-10', [1, 2], { id: 'a', durationMinutes: 10 }),
        log('2026-10-10', [2, 3], { id: 'b', durationMinutes: 5 }),
      ],
      readings: [],
      journal: [],
    });
    expect(days[0].revisions).toHaveLength(2);
    const s = summarizeActivityDay(days[0]);
    expect(s.revisedPages).toBe(3);
    expect(s.revisionMinutes).toBe(15);
  });

  it('ignores malformed dates', () => {
    const days = buildActivityDays({
      logs: [log('', [1])],
      readings: [],
      journal: [entry('not-a-day', { notes: 'x' })],
    });
    expect(days).toEqual([]);
  });
});

describe('legacy reading sessions', () => {
  it('fills in missing fields', () => {
    const legacy = {
      id: 'old',
      date: '2026-09-01',
      startedAt: at('2026-09-01', 8),
      endedAt: 0,
      durationSeconds: undefined,
      mode: undefined,
      targetSeconds: undefined,
      pages: undefined,
      pagesVisited: undefined,
    } as unknown as ReadingSession;
    const s = normalizeReadingSession(legacy)!;
    expect(s.endedAt).toBe(s.startedAt);
    expect(s.durationSeconds).toBe(0);
    expect(s.mode).toBe('stopwatch');
    expect(s.targetSeconds).toBeNull();
    expect(s.pages).toEqual([]);
    expect(s.pagesVisited).toEqual([]);
  });

  it('derives a missing day from the start time', () => {
    const s = { date: undefined, startedAt: at('2026-09-02', 15) } as unknown as ReadingSession;
    expect(readingSessionDay(s)).toBe('2026-09-02');
  });

  it('uses the fajr-aware revision day for a missing date', () => {
    // Solar time matched to this machine's time zone (as in fajrBoundary.test),
    // so 1am is before fajr wherever the tests run.
    const user = {
      fajrBoundaryEnabled: true,
      locationCoords: {
        latitude: 30,
        longitude: Math.max(-165, Math.min(165, -new Date(2026, 8, 2, 12).getTimezoneOffset() / 4)),
      },
      fajrCalculationMethod: 'MuslimWorldLeague',
    } as User;
    const startedAt = at('2026-09-02', 1);
    const s = { date: '', startedAt } as unknown as ReadingSession;
    expect(readingSessionDay(s, user)).toBe(getRevisionDayForUser(user, new Date(startedAt)));
    expect(readingSessionDay(s, user)).toBe('2026-09-01');
  });

  it('drops a session with neither a date nor a start time', () => {
    const broken = { id: 'x', date: undefined, startedAt: 0 } as unknown as ReadingSession;
    expect(normalizeReadingSession(broken)).toBeNull();
    expect(buildActivityDays({ logs: [], readings: [broken], journal: [] })).toEqual([]);
  });
});

describe('summarizeActivityDay', () => {
  it('reports nulls for times nobody recorded', () => {
    const day = buildActivityDays({ logs: [log('2026-10-10', [1])], readings: [], journal: [] })[0];
    const s = summarizeActivityDay(day);
    expect(s.revisionMinutes).toBeNull();
    expect(s.journalMinutes).toBeNull();
    expect(s.totalMinutes).toBe(0);
  });

  it('adds up time from every source', () => {
    const day = buildActivityDays({
      logs: [log('2026-10-10', [1], { durationMinutes: 10 })],
      readings: [reading('2026-10-10', 9, 20)],
      journal: [entry('2026-10-10', { memorizationMinutes: 15, revisionMinutes: 5 })],
    })[0];
    const s = summarizeActivityDay(day);
    expect(s.journalMinutes).toBe(20);
    expect(s.totalMinutes).toBe(50);
  });

  it('tracks the latest save time', () => {
    const r = reading('2026-10-10', 9, 20);
    const day = buildActivityDays({
      logs: [],
      readings: [r],
      journal: [entry('2026-10-10', { notes: 'n', updatedAt: r.endedAt + 1000 })],
    })[0];
    expect(summarizeActivityDay(day).lastActivityAt).toBe(r.endedAt + 1000);
  });
});

describe('recentActivityDays', () => {
  const today = '2026-10-10';

  it('fills the window with empty days, newest first', () => {
    const days = buildActivityDays({ logs: [log('2026-10-08', [1])], readings: [], journal: [] });
    const recent = recentActivityDays(days, today, 3);
    expect(recent.map((d) => d.date)).toEqual(['2026-10-10', '2026-10-09', '2026-10-08']);
    expect(isActivityDayEmpty(recent[0])).toBe(true);
    expect(isActivityDayEmpty(recent[2])).toBe(false);
  });

  it('has no blank days before sign-up, but always today', () => {
    const user = { createdAt: new Date(2026, 9, 10, 12).toISOString() } as User;
    const firstDay = journalFirstDay(user, []);
    const recent = recentActivityDays([], today, 7, firstDay);
    expect(recent.map((d) => d.date)).toEqual(['2026-10-10']);
  });

  it('keeps days with activity from before the sign-up date', () => {
    // Imported/older data predates createdAt: those days are part of the account.
    const user = { createdAt: new Date(2026, 9, 10, 12).toISOString() } as User;
    const days = buildActivityDays({ logs: [], readings: [reading('2026-10-07', 9, 5)], journal: [] });
    const firstDay = journalFirstDay(user, days);
    expect(firstDay).toBe('2026-10-07');
    const recent = recentActivityDays(days, today, 7, firstDay);
    expect(recent.map((d) => d.date)).toEqual([
      '2026-10-10',
      '2026-10-09',
      '2026-10-08',
      '2026-10-07',
    ]);
  });

  it('crosses month and DST boundaries by calendar day', () => {
    const recent = recentActivityDays([], '2026-11-02', 4);
    expect(recent.map((d) => d.date)).toEqual(['2026-11-02', '2026-11-01', '2026-10-31', '2026-10-30']);
  });
});

describe('filter, sort and totals', () => {
  const today = '2026-10-10';
  const days = buildActivityDays({
    logs: [log('2026-10-10', [1, 2]), log('2026-09-20', [3])],
    readings: [reading('2026-10-05', 9, 60), reading('2026-08-01', 9, 10)],
    journal: [
      entry('2026-10-09', { revisionMinutes: 30, updatedAt: 5 }),
      entry('2026-09-20', { notes: 'x', updatedAt: 99 }),
    ],
  });

  it('filters by the last 7 / 30 days and by month', () => {
    expect(filterActivityDays(days, 'all', today)).toHaveLength(days.length);
    expect(filterActivityDays(days, 'last7', today).map((d) => d.date)).toEqual([
      '2026-10-10',
      '2026-10-09',
      '2026-10-05',
    ]);
    expect(filterActivityDays(days, 'last30', today).map((d) => d.date)).toEqual([
      '2026-10-10',
      '2026-10-09',
      '2026-10-05',
      '2026-09-20',
    ]);
    expect(filterActivityDays(days, '2026-08', today).map((d) => d.date)).toEqual(['2026-08-01']);
  });

  it('lists months with activity, newest first', () => {
    expect(activityMonths(days)).toEqual(['2026-10', '2026-09', '2026-08']);
    expect(activityMonths([])).toEqual([]);
  });

  it('sorts newest, oldest, by time and by last save', () => {
    expect(sortActivityDays(days, 'newest').map((d) => d.date)[0]).toBe('2026-10-10');
    expect(sortActivityDays(days, 'oldest').map((d) => d.date)[0]).toBe('2026-08-01');
    expect(sortActivityDays(days, 'mostTime').map((d) => d.date).slice(0, 2)).toEqual([
      '2026-10-05',
      '2026-10-09',
    ]);
    const recently = sortActivityDays(days, 'recentlyLogged').map((d) => d.date);
    expect(recently[0]).toBe('2026-10-05'); // endedAt ms beats tiny updatedAt values
    // Days without any timestamp fall back to newest first.
    expect(recently.indexOf('2026-10-10')).toBeLessThan(recently.length);
  });

  it('does not mutate the input when sorting', () => {
    const before = days.map((d) => d.date);
    sortActivityDays(days, 'oldest');
    expect(days.map((d) => d.date)).toEqual(before);
  });

  it('totals a window and skips empty days', () => {
    const week = activityInWindow(days, today, 7);
    const totals = sumActivity([...week, emptyActivityDay('2026-10-08')]);
    expect(totals).toEqual({ revisedPages: 2, readingSeconds: 3600, journalMinutes: 30, activeDays: 3 });
    expect(sumActivity([])).toEqual({ revisedPages: 0, readingSeconds: 0, journalMinutes: 0, activeDays: 0 });
  });
});

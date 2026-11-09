// Patterns in the account's last days, for Revo (REVO-40). The app finds them from Activity's own
// credits (catch-up pages credited to earlier days, pages revised ahead to later ones) and each day's
// session time; Revo is told what was found and never infers one itself.
import type { RevisionLog, User, UserPage } from '../../../types';
import { recomputePagesFromLogs } from '../../algorithm';
import type { HistoryItem } from '../../streakFromItems';
import { todaySnapshot } from '../../todaySnapshot';
import { buildRevoContext } from '../context';
import { daySignals, revoPatterns, sessionStarts, type RevoDaySignals } from '../patterns';

const log = (date: string, pagesRevised: number[], extra: Partial<RevisionLog> = {}): RevisionLog => ({
  id: date,
  date,
  assignedPages: pagesRevised,
  pagesRevised,
  pagesSkipped: [],
  weaknessUpdates: [],
  durationMinutes: null,
  ...extra,
});

/** A session's own Activity item, started at `hhmm` local time on `day`. */
const item = (day: string, hhmm: string, extra: Partial<HistoryItem> = {}): HistoryItem => ({
  id: day,
  day,
  countsFor: day,
  pages: [1],
  assigned: [1],
  occurredAt: new Date(`${day}T${hhmm}:00`).getTime(),
  ...extra,
});

type WeekDay = { day: string; pages: number; planned: number; done: boolean } & RevoDaySignals;
const quiet: RevoDaySignals = { caughtUp: 0, caughtUpFor: [], ahead: 0, aheadFor: [], started: null };
/** A week of 2-page days, Nov 1–7, each done on its own day unless `over` says otherwise. */
const week = (over: Record<string, Partial<WeekDay>> = {}): WeekDay[] =>
  Array.from({ length: 7 }, (_, i) => {
    const day = `2026-11-0${i + 1}`;
    return { day, pages: 2, planned: 2, done: true, ...quiet, ...over[day] };
  });
const patterns = (w: WeekDay[], extra: { starts?: Map<string, string>; streakDays?: number; keepDailyAmount?: boolean } = {}) =>
  revoPatterns({ today: '2026-11-07', week: w, starts: extra.starts ?? new Map(), streakDays: extra.streakDays ?? 0, keepDailyAmount: extra.keepDailyAmount ?? true });

describe('what each day caught up, revised ahead and when it started (REVO-40)', () => {
  it('[REVO-40] a session’s credit to earlier days is caught up, to later days is ahead; each page once, the days in order', () => {
    const logs = [
      log('2026-11-05', [590, 591, 586, 587, 588, 594, 595, 596], {
        ahead: { '2026-11-04': [588], '2026-11-03': [586, 587], '2026-11-07': [594, 595], '2026-11-08': [596] },
      }),
      log('2026-11-05', [586], { id: 'second', ahead: { '2026-11-03': [586] } }),
      log('2026-11-06', [592, 593]),
    ];
    expect(daySignals(logs, '2026-11-05', new Map([['2026-11-05', '21:40']]))).toEqual({
      caughtUp: 3,
      caughtUpFor: ['2026-11-03', '2026-11-04'],
      ahead: 3,
      aheadFor: ['2026-11-07', '2026-11-08'],
      started: '21:40',
    });
    expect(daySignals(logs, '2026-11-06', new Map())).toEqual(quiet);
  });

  it('[REVO-40] a day’s start is its session’s own Activity item, local time; credit items and pages logged by hand don’t set it', () => {
    const starts = sessionStarts([
      item('2026-11-05', '23:15'),
      item('2026-11-05', '08:00', { id: '2026-11-05-ahead-2026-11-06', countsFor: '2026-11-06' }),
      item('2026-11-06', '07:30', { id: 'manual-abc' }),
      item('2026-11-04', '06:05', { occurredAt: null }),
    ]);
    expect([...starts]).toEqual([['2026-11-05', '23:15']]);
    expect(sessionStarts(null).size).toBe(0);
  });
});

describe('the patterns Revo is told about (REVO-40)', () => {
  it('[REVO-40] an ordinary week (each day done on its own day, mornings, a short streak) has no pattern', () => {
    const starts = new Map(week().map((w) => [w.day, '06:30']));
    expect(patterns(week(), { starts, streakDays: 5 })).toEqual([]);
  });

  it('[REVO-40] catching up: the latest day that revised at least half a usual day (3 pages at least) for earlier days, naming them, with Keep daily amount', () => {
    const w = week({
      '2026-11-03': { pages: 0, done: false },
      '2026-11-04': { pages: 0, done: false },
      '2026-11-05': { pages: 6, caughtUp: 4, caughtUpFor: ['2026-11-03', '2026-11-04'] },
    });
    expect(patterns(w, { keepDailyAmount: false })).toEqual([
      { kind: 'catchingUp', day: '2026-11-05', pages: 4, forDays: ['2026-11-03', '2026-11-04'], keepDailyAmount: false },
    ]);
    // Two pages caught up is a leftover, not a catch-up.
    const small = week({ '2026-11-05': { pages: 4, caughtUp: 2, caughtUpFor: ['2026-11-04'] } });
    expect(patterns(small)).toEqual([]);
    // Half a usual day: with 20-page days, 10 pages.
    const big = (n: number) =>
      patterns(week({ ...Object.fromEntries(week().map((d) => [d.day, { planned: 20, pages: 20 }])), '2026-11-06': { planned: 20, pages: 20 + n, caughtUp: n, caughtUpFor: ['2026-11-05'] } }));
    expect(big(9)).toEqual([]);
    expect(big(10)).toEqual([expect.objectContaining({ kind: 'catchingUp', pages: 10 })]);
  });

  it('[REVO-40] revising far ahead: a day that covered 3 or more later days with at least two days’ worth, and the credited days since with nothing left', () => {
    const w = week({
      '2026-11-03': { pages: 10, ahead: 8, aheadFor: ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-08'] },
      '2026-11-04': { pages: 0 },
      '2026-11-05': { pages: 0 },
      '2026-11-06': { pages: 1 },
    });
    expect(patterns(w)).toEqual([{ kind: 'aheadBurst', day: '2026-11-03', pages: 8, days: 4, quietDays: 2 }]);
    // Two later days, or fewer pages than two days' worth: not a burst.
    expect(patterns(week({ '2026-11-03': { pages: 8, ahead: 6, aheadFor: ['2026-11-04', '2026-11-05'] } }))).toEqual([]);
    expect(patterns(week({ '2026-11-03': { pages: 5, ahead: 3, aheadFor: ['2026-11-04', '2026-11-05', '2026-11-06'] } }))).toEqual([]);
  });

  it('[REVO-40] late at night: at least 3 of the last 14 days with revision, and at least half, started from 10 PM until 4 AM', () => {
    const starts = (times: string[]) => new Map(times.map((t, i) => [`2026-11-${String(7 - i).padStart(2, '0')}`, t]));
    expect(patterns(week(), { starts: starts(['22:00', '23:30', '03:59', '18:00', '07:00', '21:59']) })).toEqual([
      { kind: 'lateNights', late: 3, of: 6 },
    ]);
    // 04:00 and 21:59 aren't late; 2 late days aren't often; 3 of 8 aren't half.
    expect(patterns(week(), { starts: starts(['04:00', '21:59', '23:00', '23:10']) })).toEqual([]);
    expect(patterns(week(), { starts: starts(['23:00', '23:10', '23:20', '07:00', '07:00', '07:00', '07:00', '07:00']) })).toEqual([]);
    // Older than 14 days doesn't count.
    const old = new Map([...starts(['23:00', '23:10']), ['2026-10-20', '23:30'], ['2026-10-21', '23:30']]);
    expect(patterns(week(), { starts: old })).toEqual([]);
  });

  it('[REVO-40] steady: a streak of 7 days or more with nothing caught up this week', () => {
    expect(patterns(week(), { streakDays: 12 })).toEqual([{ kind: 'steady', days: 12 }]);
    expect(patterns(week(), { streakDays: 6 })).toEqual([]);
    // A day restored by catching up the next isn't steady.
    expect(patterns(week({ '2026-11-05': { pages: 4, caughtUp: 2, caughtUpFor: ['2026-11-04'] } }), { streakDays: 12 })).toEqual([]);
  });

  it('[REVO-40] built into Revo’s context from the account itself: Tuesday and Wednesday missed, both caught up on Thursday, which started late', () => {
    const user = {
      id: 'u1',
      createdAt: '2026-10-01T12:00:00',
      scheduleAnchorDate: '2026-11-01T12:00:00',
      dailyPageCapacity: 2,
      scheduleMode: 'pages',
      dailyJuzCount: 1,
      customPlan: null,
      fajrBoundaryEnabled: false,
      locationCoords: null,
    } as unknown as User;
    const logs = [
      log('2026-11-01', [582, 583]),
      log('2026-11-02', [584, 585]),
      log('2026-11-05', [590, 591, 586, 587, 588, 589], { assignedPages: [590, 591], ahead: { '2026-11-03': [586, 587], '2026-11-04': [588, 589] } }),
    ];
    const memorized: UserPage[] = Array.from({ length: 10 }, (_, i) => ({
      pageNumber: 582 + i,
      status: 'memorized',
      dateMemorized: '2026-09-01T09:00:00',
      weaknessRating: 4,
      lastRevisedDate: null,
      totalRevisionCount: 0,
      skipCount: 0,
    }));
    const pages = recomputePagesFromLogs(memorized, logs);
    const history = [item('2026-11-01', '06:10'), item('2026-11-02', '06:20'), item('2026-11-05', '23:40')];
    const snapshot = todaySnapshot({ user, pages, logs, day: '2026-11-06', assignment: [582, 583], history: null, now: Date.parse('2026-11-06T10:00:00') });
    const ctx = buildRevoContext({ user, pages, logs, snapshot, history, patterns: true });
    expect(ctx.week.find((w) => w.day === '2026-11-05')).toEqual(expect.objectContaining({ pages: 6, caughtUp: 4, ahead: 0, started: '23:40' }));
    expect(ctx.week.find((w) => w.day === '2026-11-03')).toEqual(expect.objectContaining({ pages: 0, caughtUp: 0, started: null }));
    expect(ctx.patterns).toEqual([{ kind: 'catchingUp', day: '2026-11-05', pages: 4, forDays: ['2026-11-03', '2026-11-04'], keepDailyAmount: true }]);
    // The week sends counts and a time, never the credited days themselves.
    expect(Object.keys(ctx.week[0]).sort()).toEqual(['ahead', 'caughtUp', 'day', 'done', 'pages', 'planned', 'started']);
    // Keep daily amount off ('add'): the pattern says so.
    const off = buildRevoContext({ user: { ...user, carryOverMode: 'add' } as User, pages, logs, snapshot, history, patterns: true });
    expect(off.patterns).toEqual([expect.objectContaining({ kind: 'catchingUp', keepDailyAmount: false })]);
  });

  it('[REVO-40] until config/app.revoPatterns says the server takes them, the context is exactly as before: no patterns, no day facts', () => {
    const user = { id: 'u1', createdAt: '2026-10-01T12:00:00', scheduleAnchorDate: '2026-11-01T12:00:00', dailyPageCapacity: 2, scheduleMode: 'pages', dailyJuzCount: 1, customPlan: null, fajrBoundaryEnabled: false, locationCoords: null } as unknown as User;
    const logs = [log('2026-11-05', [590, 591, 586, 587, 588, 589], { ahead: { '2026-11-03': [586, 587], '2026-11-04': [588, 589] } })];
    const pages = recomputePagesFromLogs(
      Array.from({ length: 10 }, (_, i) => ({ pageNumber: 582 + i, status: 'memorized', dateMemorized: '2026-09-01T09:00:00', weaknessRating: 4, lastRevisedDate: null, totalRevisionCount: 0, skipCount: 0 }) as UserPage),
      logs,
    );
    const snapshot = todaySnapshot({ user, pages, logs, day: '2026-11-06', assignment: [582, 583], history: null, now: Date.parse('2026-11-06T10:00:00') });
    const ctx = buildRevoContext({ user, pages, logs, snapshot, history: [item('2026-11-05', '23:40')] });
    expect('patterns' in ctx).toBe(false);
    expect(ctx.week.map((w) => Object.keys(w).sort())).toEqual(Array(7).fill(['day', 'done', 'pages', 'planned']));
  });
});

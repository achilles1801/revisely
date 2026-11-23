import { recomputePagesFromLogs } from '../algorithm';
import type { RevisionLog, UserPage } from '../../types';

// The app reads the latest 100 days of sessions (AppContext's SESSIONS_READ). Past that, the self-heal
// re-derives pages from a window of the history: a page keeps what the window can't speak for (SYNC-6).

const page = (n: number, fields: Partial<UserPage> = {}): UserPage =>
  ({
    pageNumber: n,
    status: 'memorized',
    dateMemorized: null,
    lastRevisedDate: null,
    weaknessRating: 4,
    totalRevisionCount: 0,
    skipCount: 0,
    ...fields,
  }) as unknown as UserPage;

const log = (date: string, revised: number[], extra: Partial<RevisionLog> = {}): RevisionLog => ({
  id: date,
  date,
  pagesRevised: revised,
  pagesSkipped: [],
  weaknessUpdates: [],
  durationMinutes: 10,
  ...extra,
});

// The window: every session from Aug 1 on; page 1 was last revised on Mar 3, before it, and rated 2 then.
const SINCE = '2026-08-01';
const old = page(1, { lastRevisedDate: '2026-03-03T00:00:00.000Z', totalRevisionCount: 31, weaknessRating: 2, skipCount: 1 });
const windowLogs = [log('2026-08-01', [5, 6]), log('2026-08-02', [7], { pagesSkipped: [1] }), log('2026-11-16', [5], { weaknessUpdates: [{ page: 5, rating: 5 }] })];

describe('re-deriving pages from the latest 100 days of sessions (SYNC-6)', () => {
  it('[SYNC-6] a page last revised before the window keeps its day, count and rating; skips never drop', () => {
    const [p1] = recomputePagesFromLogs([old], windowLogs, [], SINCE);
    expect(p1.lastRevisedDate).toBe('2026-03-03T00:00:00.000Z');
    expect(p1.totalRevisionCount).toBe(31);
    expect(p1.weaknessRating).toBe(2);
    expect(p1.skipCount).toBe(1);
    // Without the window it is wiped, as every launch did before Nov 17 2026.
    const [wiped] = recomputePagesFromLogs([old], windowLogs);
    expect([wiped.lastRevisedDate, wiped.totalRevisionCount, wiped.weaknessRating]).toEqual([null, 0, 4]);
  });

  it('[SYNC-6] a page revised in the window takes the window’s day, its newest rating, and never a lower count', () => {
    const p5 = page(5, { lastRevisedDate: '2026-07-01T00:00:00.000Z', totalRevisionCount: 40, weaknessRating: 3 });
    const [after] = recomputePagesFromLogs([p5], windowLogs, [], SINCE);
    expect([after.lastRevisedDate, after.totalRevisionCount, after.weaknessRating, after.skipCount]).toEqual(['2026-11-16', 40, 5, 0]);
    // Rated before the window only: its rating stays.
    const p6 = page(6, { weaknessRating: 2, totalRevisionCount: 2 });
    const [six] = recomputePagesFromLogs([p6], windowLogs, [], SINCE);
    expect([six.lastRevisedDate, six.totalRevisionCount, six.weaknessRating]).toEqual(['2026-08-01', 2, 2]);
  });

  it('[SYNC-6] a page logged by hand before the window still moves its day on when the page had none later', () => {
    const p9 = page(9, { lastRevisedDate: '2026-05-01T00:00:00.000Z', totalRevisionCount: 3 });
    const [nine] = recomputePagesFromLogs([p9], windowLogs, [{ day: '2026-06-10', pages: [9] }], SINCE);
    expect([nine.lastRevisedDate, nine.totalRevisionCount]).toEqual(['2026-06-10', 3]);
  });

  it('[SYNC-6] with the whole history (under 100 days) nothing changes from before', () => {
    expect(recomputePagesFromLogs([old], windowLogs, [], null)).toEqual(recomputePagesFromLogs([old], windowLogs));
  });
});

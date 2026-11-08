import { recomputePagesFromLogs } from '../algorithm';
import type { RevisionLog, UserPage } from '../../types';

const page = (n: number, rating = 4): UserPage =>
  ({ pageNumber: n, status: 'memorized', dateMemorized: null, lastRevisedDate: null, weaknessRating: rating, totalRevisionCount: 0, skipCount: 0 }) as unknown as UserPage;

const monday: RevisionLog = {
  id: '2026-11-02',
  date: '2026-11-02',
  pagesRevised: [1, 2],
  pagesSkipped: [9],
  weaknessUpdates: [{ page: 2, rating: 3 }],
  durationMinutes: 10,
};

describe('re-deriving pages with those logged by hand (ACT-16)', () => {
  it('[ACT-16] a page logged as revised elsewhere is revised that day: last revised day, count, skips cleared; rating kept', () => {
    const [p1, p2, p9] = recomputePagesFromLogs([page(1), page(2), page(9)], [monday], [{ day: '2026-11-03', pages: [9, 2] }]);
    expect([p1.lastRevisedDate, p1.totalRevisionCount, p1.weaknessRating]).toEqual(['2026-11-02', 1, 4]);
    expect([p2.lastRevisedDate, p2.totalRevisionCount, p2.weaknessRating]).toEqual(['2026-11-03', 2, 3]);
    expect([p9.lastRevisedDate, p9.totalRevisionCount, p9.skipCount]).toEqual(['2026-11-03', 1, 0]);
  });

  it('[ACT-16] without pages logged by hand it is as before', () => {
    expect(recomputePagesFromLogs([page(1), page(2)], [monday])).toEqual(recomputePagesFromLogs([page(1), page(2)], [monday], []));
  });
});

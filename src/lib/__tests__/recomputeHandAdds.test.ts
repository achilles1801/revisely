import { recomputePagesFromLogs } from '../algorithm';
import type { RevisionLog, UserPage } from '../../types';

const page = (n: number, rating = 4): UserPage =>
  ({ pageNumber: n, status: 'memorized', dateMemorized: null, lastRevisedDate: null, weaknessRating: rating, totalRevisionCount: 0, skipCount: 0 }) as unknown as UserPage;

const monday: RevisionLog = {
  id: '2026-11-02',
  date: '2026-11-02',
  pagesRevised: [1, 2],
  pagesSkipped: [],
  weaknessUpdates: [{ page: 2, rating: 3 }],
  durationMinutes: 10,
};

describe('re-deriving pages with the pages added by hand (ACT-16)', () => {
  it('[ACT-16] a hand add is a revision of its pages that day, with its strength', () => {
    const [p1, p2, p9] = recomputePagesFromLogs([page(1), page(2), page(9)], [monday], [
      { day: '2026-11-03', pages: [9, 2], ratings: { '9': 2, '2': 5 } },
    ]);
    expect([p1.lastRevisedDate, p1.totalRevisionCount, p1.weaknessRating]).toEqual(['2026-11-02', 1, 4]);
    expect([p2.lastRevisedDate, p2.totalRevisionCount, p2.weaknessRating]).toEqual(['2026-11-03', 2, 5]);
    expect([p9.lastRevisedDate, p9.totalRevisionCount, p9.weaknessRating]).toEqual(['2026-11-03', 1, 2]);
  });

  it('[ACT-16] a hand add with no strength keeps the rating its sessions gave; on its day it comes after the session', () => {
    const sameDay: RevisionLog = { ...monday, id: '2026-11-03', date: '2026-11-03', weaknessUpdates: [{ page: 2, rating: 3 }] };
    const [, p2] = recomputePagesFromLogs([page(1), page(2)], [sameDay], [{ day: '2026-11-03', pages: [2] }]);
    expect(p2.weaknessRating).toBe(3);
    const [, rated] = recomputePagesFromLogs([page(1), page(2)], [sameDay], [{ day: '2026-11-03', pages: [2], ratings: { '2': 1 } }]);
    expect(rated.weaknessRating).toBe(1);
  });

  it('[ACT-16] without hand adds it is as before', () => {
    expect(recomputePagesFromLogs([page(1), page(2)], [monday])).toEqual(recomputePagesFromLogs([page(1), page(2)], [monday], []));
  });
});

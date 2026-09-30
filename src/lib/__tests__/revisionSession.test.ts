import { pagesToUnrevise, removeRevisedPages } from '../revisionSession';
import { recomputePagesFromLogs } from '../algorithm';
import type { RevisionLog, UserPage } from '../../types';

function log(overrides: Partial<RevisionLog> = {}): RevisionLog {
  return {
    id: '2026-09-30',
    date: '2026-09-30',
    assignedPages: [331, 332, 333, 334, 335, 336, 337, 338, 339, 340],
    pagesRevised: [331, 332, 333, 334, 335, 336, 337],
    pagesSkipped: [],
    weaknessUpdates: [{ page: 331, rating: 2 }],
    durationMinutes: 20,
    ...overrides,
  };
}

describe('pagesToUnrevise', () => {
  it('finds saved pages that were unchecked', () => {
    const persisted = new Set([331, 332, 333, 334, 335, 336, 337]);
    const completed = new Set([334, 335, 336, 337]);
    expect(pagesToUnrevise(completed, persisted)).toEqual([331, 332, 333]);
  });

  it('ignores marks that were never saved', () => {
    // 338 checked but not auto-saved yet: nothing to take back.
    expect(pagesToUnrevise(new Set([331, 338]), new Set([331]))).toEqual([]);
  });
});

describe('removeRevisedPages', () => {
  it('takes pages out of today’s session: 7/10 becomes 4/10', () => {
    const next = removeRevisedPages(log(), [331, 332, 333]);
    expect(next.pagesRevised).toEqual([334, 335, 336, 337]);
    expect(next.id).toBe('2026-09-30');
    expect(next.assignedPages).toHaveLength(10);
  });

  it('keeps ratings given while revising', () => {
    expect(removeRevisedPages(log(), [331]).weaknessUpdates).toEqual([
      { page: 331, rating: 2 },
    ]);
  });

  it('rolls back the page’s revision stats once recomputed from logs', () => {
    const page: UserPage = {
      pageNumber: 331,
      status: 'memorized',
      dateMemorized: null,
      weaknessRating: 4,
      lastRevisedDate: '2026-09-30',
      totalRevisionCount: 3,
      skipCount: 0,
    };
    const earlier = log({ id: '2026-09-20', date: '2026-09-20', pagesRevised: [331] });
    const [after] = recomputePagesFromLogs(
      [page],
      [earlier, removeRevisedPages(log(), [331])],
    );
    expect(after.lastRevisedDate).toBe('2026-09-20');
    expect(after.totalRevisionCount).toBe(1);
  });
});

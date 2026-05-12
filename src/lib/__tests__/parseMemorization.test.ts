import { applyEntriesToPages, type ParsedEntry } from '../parseMemorization';
import type { UserPage } from '../../types';

function makePages(specs: Array<Partial<UserPage> & { pageNumber: number }>): UserPage[] {
  return specs.map((spec) => ({
    status: 'not_memorized',
    dateMemorized: null,
    weaknessRating: 4,
    lastRevisedDate: null,
    totalRevisionCount: 0,
    skipCount: 0,
    ...spec,
  }));
}

describe('applyEntriesToPages', () => {
  it('marks the requested page range as memorized and returns changed pages', () => {
    const pages = makePages([{ pageNumber: 1 }, { pageNumber: 2 }, { pageNumber: 3 }]);
    const entries: ParsedEntry[] = [
      { type: 'page_range', startPage: 1, endPage: 2, status: 'memorized' },
    ];

    const { pages: updated, changedPageNumbers } = applyEntriesToPages(pages, entries);

    expect(changedPageNumbers).toEqual([1, 2]);
    expect(updated[0].status).toBe('memorized');
    expect(updated[0].dateMemorized).not.toBeNull();
    expect(updated[2].status).toBe('not_memorized');
  });

  it('resets pages not covered by any entry to not_memorized', () => {
    const pages = makePages([
      { pageNumber: 1, status: 'memorized', dateMemorized: '2024-01-01' },
      { pageNumber: 2, status: 'memorized', dateMemorized: '2024-01-01' },
    ]);
    const entries: ParsedEntry[] = [
      { type: 'page_range', startPage: 1, endPage: 1, status: 'memorized' },
    ];

    const { pages: updated, changedPageNumbers } = applyEntriesToPages(pages, entries);

    expect(updated[0].status).toBe('memorized');
    expect(updated[1].status).toBe('not_memorized');
    expect(updated[1].dateMemorized).toBeNull();
    expect(changedPageNumbers).toEqual([2]);
  });

  it('lets memorized override in_progress when both apply to the same page', () => {
    const pages = makePages([{ pageNumber: 1 }]);
    const entries: ParsedEntry[] = [
      { type: 'page_range', startPage: 1, endPage: 1, status: 'in_progress' },
      { type: 'page_range', startPage: 1, endPage: 1, status: 'memorized' },
    ];

    const { pages: updated } = applyEntriesToPages(pages, entries);

    expect(updated[0].status).toBe('memorized');
  });

  it('also lets memorized win when listed before in_progress', () => {
    const pages = makePages([{ pageNumber: 1 }]);
    const entries: ParsedEntry[] = [
      { type: 'page_range', startPage: 1, endPage: 1, status: 'memorized' },
      { type: 'page_range', startPage: 1, endPage: 1, status: 'in_progress' },
    ];

    const { pages: updated } = applyEntriesToPages(pages, entries);

    expect(updated[0].status).toBe('memorized');
  });

  it('returns no changes when entries describe the existing state', () => {
    const pages = makePages([
      { pageNumber: 1, status: 'memorized', dateMemorized: '2024-01-01' },
    ]);
    const entries: ParsedEntry[] = [
      { type: 'page_range', startPage: 1, endPage: 1, status: 'memorized' },
    ];

    const { changedPageNumbers } = applyEntriesToPages(pages, entries);
    expect(changedPageNumbers).toEqual([]);
  });

  it('clears dateMemorized when a previously-memorized page is downgraded', () => {
    const pages = makePages([
      { pageNumber: 1, status: 'memorized', dateMemorized: '2024-01-01' },
    ]);
    const entries: ParsedEntry[] = [
      { type: 'page_range', startPage: 1, endPage: 1, status: 'in_progress' },
    ];

    const { pages: updated } = applyEntriesToPages(pages, entries);
    expect(updated[0].status).toBe('in_progress');
    expect(updated[0].dateMemorized).toBeNull();
  });
});

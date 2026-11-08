// What a page change writes (AppContext pageChange): a partly memorized page's ayahs, and nothing
// about ayahs for any other page (MEM-1).
import { pageChange } from '../AppContext';
import type { PageStatus, UserPage } from '../../types';

const page = (status: PageStatus, verses?: number[]): UserPage => ({
  pageNumber: 563,
  status,
  dateMemorized: status === 'not_memorized' ? null : '2026-11-03T12:00:00.000Z',
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
  ...(verses ? { verses } : {}),
});

describe('a page change and its ayahs (MEM-1)', () => {
  it('a page becoming partly memorized writes "learning" with its ayahs', () => {
    expect(pageChange(page('in_progress', [67013, 67014]), page('not_memorized'))).toEqual({
      pageNumber: 563,
      status: 'learning',
      dateMemorized: Date.parse('2026-11-03T12:00:00.000Z'),
      verses: [67013, 67014],
    });
  });

  it('more ayahs write the ayahs alone; the last one makes it memorized and clears them', () => {
    expect(pageChange(page('in_progress', [67013, 67014, 67015]), page('in_progress', [67013, 67014]))).toEqual({
      pageNumber: 563,
      verses: [67013, 67014, 67015],
    });
    expect(pageChange(page('memorized'), page('in_progress', [67013, 67014]))).toEqual({ pageNumber: 563, status: 'memorized', verses: null });
  });

  it('a page that never had ayahs is never written with them', () => {
    expect(pageChange(page('memorized'), page('not_memorized'))).toEqual({
      pageNumber: 563,
      status: 'memorized',
      dateMemorized: Date.parse('2026-11-03T12:00:00.000Z'),
    });
    expect(pageChange({ ...page('memorized'), weaknessRating: 2 }, page('memorized'))).toEqual({ pageNumber: 563, weaknessRating: 2 });
  });
});

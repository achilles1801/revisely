import { computeMemorizationStats, formatFractional } from '../memorizationStats';
import { getPagesForJuz } from '../quranData';
import { UserPage } from '../../types';

function memorized(pageNumbers: number[]): UserPage[] {
  return pageNumbers.map(
    (pageNumber) => ({ pageNumber, status: 'memorized' }) as unknown as UserPage,
  );
}

describe('computeMemorizationStats', () => {
  it('is all zeros with nothing memorized', () => {
    expect(computeMemorizationStats([])).toEqual({
      pages: 0,
      completeJuz: 0,
      fractionalJuz: 0,
      surahs: 0,
    });
  });

  it('counts a full juz 30 with its surahs', () => {
    const stats = computeMemorizationStats(memorized(getPagesForJuz(30)));
    expect(stats.completeJuz).toBe(1);
    expect(stats.fractionalJuz).toBeCloseTo(1);
    expect(stats.pages).toBe(getPagesForJuz(30).length);
    // An-Naba (78) through An-Nas (114).
    expect(stats.surahs).toBe(37);
  });

  it('does not count a surah that spills into an unmemorized juz', () => {
    // Al-Baqarah starts in juz 1 and runs into juz 3.
    const stats = computeMemorizationStats(memorized(getPagesForJuz(1)));
    expect(stats.completeJuz).toBe(1);
    expect(stats.surahs).toBe(1); // Al-Fatihah only
  });

  it('formats fractional juz', () => {
    expect(formatFractional(3)).toBe('3');
    expect(formatFractional(3.44)).toBe('3.4');
  });
});

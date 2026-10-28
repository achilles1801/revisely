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
      juzFractions: Array(30).fill(0),
    });
  });

  it('each juz’s share, juz 1 first: a whole juz is 1, half a juz about 0.5, the rest 0', () => {
    const juz30 = getPagesForJuz(30);
    const juz2 = getPagesForJuz(2);
    const half = juz2.slice(0, Math.floor(juz2.length / 2));
    const stats = computeMemorizationStats(memorized([...juz30, ...half]));
    expect(stats.juzFractions).toHaveLength(30);
    expect(stats.juzFractions[29]).toBe(1);
    expect(stats.juzFractions[1]).toBeCloseTo(half.length / juz2.length);
    expect(stats.juzFractions[1]).toBeGreaterThan(0.4);
    expect(stats.juzFractions[1]).toBeLessThan(0.6);
    expect(stats.juzFractions[0]).toBe(0);
    // They add up to the fractional juz.
    expect(stats.juzFractions.reduce((a, b) => a + b, 0)).toBeCloseTo(stats.fractionalJuz);
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

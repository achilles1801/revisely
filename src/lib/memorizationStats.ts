import { UserPage } from '../types';
import { juzShares, memorizedPageShare, memorizedSurahs } from './memorizedAyahs';

export interface MemorizationStats {
  /** Pages memorized whole (0–604). */
  pages: number;
  /**
   * Pages memorized, a partly memorized page counting by its share of the page (MEM-2): 305.6.
   * Home's % memorized and the progress bars read this.
   */
  share: number;
  /** Fully memorized juz (0–30). */
  completeJuz: number;
  /** Juz including partial progress, e.g. 3.4. */
  fractionalJuz: number;
  /** Surahs with every ayah memorized (0–114). */
  surahs: number;
  /** Each juz's memorized share (0–1), juz 1 first: 30 numbers. */
  juzFractions: number[];
}

export function computeMemorizationStats(pages: UserPage[]): MemorizationStats {
  const juzFractions = juzShares(pages);
  return {
    pages: pages.filter((p) => p.status === 'memorized').length,
    share: memorizedPageShare(pages),
    completeJuz: juzFractions.filter((s) => s >= 1).length,
    fractionalJuz: juzFractions.reduce((n, s) => n + s, 0),
    surahs: memorizedSurahs(pages).length,
    juzFractions,
  };
}

export function formatFractional(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
}

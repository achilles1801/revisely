import { getPagesForJuz, getSurahsInJuz } from './quranData';
import { UserPage } from '../types';

export interface MemorizationStats {
  /** Memorized pages (0–604). */
  pages: number;
  /** Fully memorized juz (0–30). */
  completeJuz: number;
  /** Juz including partial progress, e.g. 3.4. */
  fractionalJuz: number;
  /** Fully memorized surahs (0–114). */
  surahs: number;
}

export function computeMemorizationStats(pages: UserPage[]): MemorizationStats {
  const memorized = new Set(
    pages.filter((p) => p.status === 'memorized').map((p) => p.pageNumber),
  );
  let completeJuz = 0;
  let fractionalJuz = 0;
  const surahs = new Set<number>();
  // A surah can span juz; it's complete only if every page in every juz is.
  const incompleteSurahs = new Set<number>();

  for (let juz = 1; juz <= 30; juz++) {
    const juzPages = getPagesForJuz(juz);
    const count = juzPages.filter((pn) => memorized.has(pn)).length;
    if (juzPages.length > 0) fractionalJuz += count / juzPages.length;
    if (juzPages.length > 0 && count === juzPages.length) completeJuz++;

    for (const surah of getSurahsInJuz(juz)) {
      if (surah.pagesInJuz.every((pn) => memorized.has(pn))) surahs.add(surah.number);
      else incompleteSurahs.add(surah.number);
    }
  }
  for (const n of incompleteSurahs) surahs.delete(n);

  return { pages: memorized.size, completeJuz, fractionalJuz, surahs: surahs.size };
}

export function formatFractional(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
}

// The beginner path's surahs (BEGIN-1, BEGIN-5): Al-Fatihah, then Juz 'Amma from An-Nas back to An-Naba, the short
// surahs most people know first and pray with (Tarteel's help centre describes Juz 'Amma from An-Nas backwards). What a
// beginner knows is kept by the ayah like everything memorized (MEM-1): a surah is known once all its ayahs are, also
// when it shares its page with others (An-Nas on the last page), and the page is then revised for those ayahs (MEM-4).

import { ayahCount, ayahKey, ayahSharesOnPage, type AyahKey } from '../ayahKeys';
import { memorizedSurahs, type PageMemorization } from '../memorizedAyahs';
import type { PartialPages } from '../passages';

/** Al-Fatihah, then An-Nas (114) back to An-Naba (78): 38 surahs. */
export const BEGINNER_SURAHS: readonly number[] = [1, ...Array.from({ length: 114 - 78 + 1 }, (_, i) => 114 - i)];

/** Every ayah of a surah, in order. */
export function surahAyahs(sura: number): AyahKey[] {
  return Array.from({ length: ayahCount(sura) }, (_, i) => ayahKey(sura, i + 1));
}

/** The surahs fully memorized (every ayah, MEM-2), on the path or not. */
export function knownSurahs(pages: readonly PageMemorization[]): Set<number> {
  return new Set(memorizedSurahs(pages));
}

/** The first surah on the path not yet known, or null once all 38 are. */
export function nextSurahOnPath(known: ReadonlySet<number>): number | null {
  return BEGINNER_SURAHS.find((s) => !known.has(s)) ?? null;
}

/**
 * What saving a choice of the path's surahs changes: the ayahs of surahs newly chosen, and (in setup, `removing`) those of
 * surahs known before and no longer chosen. A surah off the path is never touched.
 */
export function surahChoiceChanges(
  known: ReadonlySet<number>,
  chosen: ReadonlySet<number>,
  removing: boolean,
): { add: AyahKey[]; remove: AyahKey[]; added: number[] } {
  const added = BEGINNER_SURAHS.filter((s) => chosen.has(s) && !known.has(s));
  const removed = removing ? BEGINNER_SURAHS.filter((s) => known.has(s) && !chosen.has(s)) : [];
  return { add: added.flatMap(surahAyahs), remove: removed.flatMap(surahAyahs), added };
}

/**
 * A beginner's daily amount, set by their setup (they skip "How much a day?"): Al-Fatihah and Juz 'Amma are 24 pages, so
 * until 10 pages are known everything known comes round every day, and past that in about two or three days. Settings →
 * Revision changes it as for anyone.
 */
export const BEGINNER_DAILY_PAGES = 10;

/** A page of text, recited at a steady pace, in minutes (the "about N min" on a beginner's Home, BEGIN-3). */
export const MINUTES_A_PAGE = 2;

/**
 * About how long today's pages take (BEGIN-3): two minutes a page of text, a partly memorized page for its memorized ayahs'
 * share (MEM-2), and the mushaf's first two pages, half pages inside their frames, as half. At least a minute.
 */
export function minutesFor(pages: readonly number[], partial: PartialPages): number {
  let total = 0;
  for (const page of pages) {
    const mine = partial.get(page);
    let share = 1;
    if (mine) {
      const shares = ayahSharesOnPage(page);
      share = Math.min(1, mine.reduce((n, k) => n + (shares.get(k) ?? 0), 0));
    }
    total += share * (page <= 2 ? 0.5 : 1) * MINUTES_A_PAGE;
  }
  return Math.max(1, Math.round(total));
}

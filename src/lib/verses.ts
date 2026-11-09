// Moving between verses: next/previous across surahs, the page a verse sits on,
// the global verse number recitation files are named by, and how far "Play"
// continues (to the end of the juz).

import { AyahRef, boundsFile, versesOnPage } from './ayahBounds';
import { getMushafEdition, MushafEditionId } from './mushafEdition';
import { getJuzForPage, getSurah, getSurahDisplay, getSurahsForPage, SurahOnPage } from './quranData';

export interface VerseKey {
  sura: number;
  ayah: number;
}

export const verseKey = (v: VerseKey) => `${v.sura}:${v.ayah}`;

function ayahCount(sura: number): number {
  return getSurahDisplay(sura)?.ayahCount ?? 0;
}

/** The verse after `v`, crossing into the next surah; null after An-Nas 6. */
export function nextVerse(v: VerseKey): VerseKey | null {
  if (v.ayah < ayahCount(v.sura)) return { sura: v.sura, ayah: v.ayah + 1 };
  if (v.sura < 114) return { sura: v.sura + 1, ayah: 1 };
  return null;
}

/** The verse before `v`, crossing into the previous surah; null before Al-Fatihah 1. */
export function previousVerse(v: VerseKey): VerseKey | null {
  if (v.ayah > 1) return { sura: v.sura, ayah: v.ayah - 1 };
  if (v.sura > 1) return { sura: v.sura - 1, ayah: ayahCount(v.sura - 1) };
  return null;
}

/** 1-based position of the verse in the whole Qur'an (1:1 = 1, 114:6 = 6236). */
export function globalVerseNumber(v: VerseKey): number {
  let n = 0;
  for (let s = 1; s < v.sura; s++) n += ayahCount(s);
  return n + v.ayah;
}

const firstPages = new Map<MushafEditionId, Map<string, number>>();

/** The page where a verse starts (the page its first line is on), in the edition chosen unless named. */
export function pageOfVerse(v: VerseKey, edition: MushafEditionId = getMushafEdition()): number {
  let firstPage = firstPages.get(edition);
  if (!firstPage) {
    firstPage = new Map();
    const bounds = boundsFile(edition);
    for (let page = 1; page <= 604; page++) {
      const d = bounds[String(page)] ?? [];
      for (let i = 0; i < d.length; i += 6) {
        const key = `${d[i]}:${d[i + 1]}`;
        if (!firstPage.has(key)) firstPage.set(key, page);
      }
    }
    firstPages.set(edition, firstPage);
  }
  return firstPage.get(verseKey(v)) ?? 1;
}

export function toAyahRef(v: VerseKey): AyahRef {
  return { page: pageOfVerse(v), sura: v.sura, ayah: v.ayah };
}

/**
 * The verse that plays after `v` when playing "to the end of the juz", or null
 * when `v` is the juz's last verse. Juz in this mushaf start at the top of a page.
 */
export function nextVerseInJuz(v: VerseKey): VerseKey | null {
  const next = nextVerse(v);
  if (!next) return null;
  return getJuzForPage(pageOfVerse(next)) === getJuzForPage(pageOfVerse(v)) ? next : null;
}

/**
 * The surah at the top of a page as the chosen print draws it (the reader's
 * header). The 1405 pages use the page table, as before; the 1441 print's
 * first verse can belong to the surah before (page 586 begins in 'Abasa).
 */
export function firstSurahOnPage(page: number, edition: MushafEditionId = getMushafEdition()): SurahOnPage | undefined {
  if (edition === 'madani1405') return getSurahsForPage(page)[0];
  const first = versesOnPage(page, edition)[0];
  const surah = first ? getSurah(first.sura) : undefined;
  return surah ? { number: surah.number, name: surah.name, nameArabic: surah.nameArabic } : getSurahsForPage(page)[0];
}

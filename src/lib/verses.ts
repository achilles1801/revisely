// Moving between verses: next/previous across surahs, the page a verse sits on,
// the global verse number recitation files are named by, and how far "Play"
// continues (to the end of the juz).

import { AyahRef } from './ayahBounds';
import { getJuzForPage, getSurahDisplay } from './quranData';

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

type BoundsFile = Record<string, number[]>;
let firstPage: Map<string, number> | null = null;

/** The page where a verse starts (the page its first line is on). */
export function pageOfVerse(v: VerseKey): number {
  if (!firstPage) {
    firstPage = new Map();
    const bounds = require('../data/ayahBounds.json') as BoundsFile;
    for (let page = 1; page <= 604; page++) {
      const d = bounds[String(page)] ?? [];
      for (let i = 0; i < d.length; i += 6) {
        const key = `${d[i]}:${d[i + 1]}`;
        if (!firstPage.has(key)) firstPage.set(key, page);
      }
    }
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

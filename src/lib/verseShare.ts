// A verse as text, for Copy and Share on a held verse:
//
//   [RLE]<the verse in Arabic>﴿ ٥ ﴾[PDF]
//
//   Āli-'Imrān, Ayah 5
//
// The Arabic is the verse sheet's (Uthmani, alquran.cloud; lib/translation):
// always the whole verse, as the API gives it, never a page's lines (in this
// mushaf every page ends at the end of a verse anyway). It sits between
// right-to-left embedding marks, so it pastes right to left in left-to-right
// apps too; the verse number is in Arabic-Indic digits inside the ornate
// parentheses the mushaf uses. The reference is the app's surah name.

import { getSurahDisplay } from './quranData';
import { getArabicVerse } from './translation';

/** RIGHT-TO-LEFT EMBEDDING … POP DIRECTIONAL FORMATTING. */
export const RLE = '\u202B';
export const PDF = '\u202C';

const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/** 286 → "٢٨٦". */
export function arabicDigits(n: number): string {
  return String(n)
    .split('')
    .map((d) => ARABIC_INDIC[Number(d)] ?? d)
    .join('');
}

/** The end-of-verse mark: "﴿ ٥ ﴾". */
export function verseEndMark(ayah: number): string {
  // U+FD3F then U+FD3E, in that logical order, as Quran.com's copied verses have them.
  return `\uFD3F ${arabicDigits(ayah)} \uFD3E`;
}

/** "Āli-'Imrān, Ayah 5". */
export function verseReference(sura: number, ayah: number): string {
  const name = getSurahDisplay(sura)?.nameDisplay ?? `Surah ${sura}`;
  return `${name}, Ayah ${ayah}`.normalize('NFC');
}

/** The text that Copy puts on the clipboard and Share sends. */
export function formatVerseForSharing(arabic: string, sura: number, ayah: number): string {
  return `${RLE}${arabic.trim()}${verseEndMark(ayah)}${PDF}\n\n${verseReference(sura, ayah)}`;
}

/**
 * The shareable text of a verse held on `page`. The hold has already started
 * loading its Arabic (prefetchVerseText), so this is usually immediate; it
 * fails only when the verse was never loaded and there is no connection.
 */
export async function verseShareText(page: number, sura: number, ayah: number): Promise<string> {
  const arabic = await getArabicVerse(page, sura, ayah);
  return formatVerseForSharing(arabic, sura, ayah);
}

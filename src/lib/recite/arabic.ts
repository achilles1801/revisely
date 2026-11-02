// Comparing what speech recognition heard with the words of the mushaf.
//
// Both sides are reduced to bare letters first: no diacritics or Qur'anic signs,
// one form of alef, ya and ta marbuta, hamza carriers as their letter. What is left
// tells words apart (a memorisation slip changes letters: يعملون for تعملون, فقال
// for وقال), while spelling conventions (the Uthmani الصلوة and the standard
// الصلاة, ٱ and ا) and recognition noise in the vowel marks do not count.

/** Diacritics, Qur'anic annotation signs, tatweel and invisible formatting marks. */
const MARKS = /[ؐ-ًؚ-ٟۖ-ۭـ​-‏⁦-⁩﻿]/g;
/** Anything that is not an Arabic letter once the marks are gone. */
const NON_LETTERS = /[^ء-ي]/g;

const LETTER_MAP: Record<string, string> = {
  'أ': 'ا', // أ
  'إ': 'ا', // إ
  'آ': 'ا', // آ
  'ٱ': 'ا', // ٱ (wasla)
  'ى': 'ي', // ى → ي
  'ة': 'ه', // ة → ه
  'ؤ': 'و', // ؤ → و
  'ئ': 'ي', // ئ → ي
};

/**
 * A word as bare letters. The superscript (dagger) alef of the Uthmani script is
 * written as a full alef (ٱلْكِتَـٰبُ is الكتاب), except on an alef maqsura.
 */
export function normalizeWord(word: string): string {
  let out = '';
  // On an alef maqsura (عَلَىٰ, مُوسَىٰ) it only says how the ى is read.
  const alefs = word.replace(/ى([ً-ٟ]*)ٰ/g, 'ى$1').replace(/ٰ/g, 'ا');
  for (const ch of alefs.replace(MARKS, '')) {
    out += LETTER_MAP[ch] ?? ch;
  }
  // Lone hamza (ء) carries no letter of its own in recognition output.
  return out.replace(/ء/g, '').replace(NON_LETTERS, '');
}

/**
 * A word with its hamzas left out, seat and all: يئوده (mushaf) and يأوده (how
 * recognition writes it) are one word spelled two ways. Only for comparing
 * words that are otherwise the same; a hamza at the very start stays, as alef.
 */
export function looseWord(word: string): string {
  const bare = word.replace(MARKS, '');
  const rest = bare.slice(1).replace(/[أإآءؤئ]/g, '');
  return normalizeWord(bare.slice(0, 1) + rest);
}

const WORD_BREAK = /[\s ،؛,.!?:;"'()[\]{}«»\-–—]+/;

/** Recognised text as normalised words (empty ones dropped). */
export function normalizeText(text: string): string[] {
  return splitWords(text).keys;
}

/**
 * How else a heard word may be written: recognition writes a final long ā as ى
 * (السفهى) where the mushaf has ا (السفهاء), and the two sound the same. Null
 * when there is no other way.
 */
export function soundAlike(word: string): string | null {
  const bare = word.replace(MARKS, '');
  if (!bare.endsWith('ى') || bare.length < 3) return null;
  return normalizeWord(bare.slice(0, -1) + 'ا');
}

/**
 * Recognised text as words, in step: normalised (`keys`), without hamzas
 * (`loose`), another way of writing it (`alike`, see soundAlike) and as written
 * (`raw`).
 */
export function splitWords(text: string): { keys: string[]; loose: string[]; alike: (string | null)[]; raw: string[] } {
  const keys: string[] = [];
  const loose: string[] = [];
  const alike: (string | null)[] = [];
  const raw: string[] = [];
  for (const word of text.split(WORD_BREAK)) {
    const key = normalizeWord(word);
    if (!key) continue;
    keys.push(key);
    loose.push(looseWord(word));
    alike.push(soundAlike(word));
    raw.push(word);
  }
  return { keys, loose, alike, raw };
}

/** Levenshtein distance, with an early exit once it exceeds `max`. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** 1 for the same letters, falling towards 0 as more letters differ. */
export function similarity(a: string, b: string): number {
  const len = Math.max(a.length, b.length);
  if (len === 0) return 1;
  return 1 - editDistance(a, b) / len;
}

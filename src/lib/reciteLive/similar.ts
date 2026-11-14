// Similar phrases (mutashabihat) for a marked word, worked out on the phone from the word data (pure).
//
// A place reads almost the same when its words around a word like the marked one match the passage's: at least
// three neighbours the same, side by side, and the word itself the same or close (وَأُوتِيَتْ مِن كُلِّ شَىْءٍ in
// An-Naml 23 and وَأُوتِينَا مِن كُلِّ شَىْءٍ in An-Naml 16). Mixing such places up is a common slip in memorizing.

import { similarity } from '../recite/arabic';
import type { QuranWords } from '../recite/quranWords';

export interface SimilarPlace {
  sura: number;
  ayah: number;
  /** The word at the marked word's place. */
  w: number;
  /** The words to show: [from, to), within the ayah. */
  from: number;
  to: number;
  /** Words that match the passage's (the rest differ). */
  same: number[];
}

/** How close the word at a place must be to the marked one (same, or a near spelling). */
const CLOSE = 0.55;
/** Neighbours compared on each side, and how many must match. */
const REACH = 3;
const NEED = 3;
/** At most this many places. */
const LIMIT = 8;

const key = (words: QuranWords, i: number) => words.keys(i)[0];

/** Places elsewhere that read almost the same as the passage around word `w` (not `w`'s own), in mushaf order. */
export function similarPhrases(words: QuranWords, w: number): SimilarPlace[] {
  const target = key(words, w);
  const [vFrom, vTo] = words.verseRange(words.ref(w).sura, words.ref(w).ayah);
  // The passage's neighbours, within its ayah.
  const after: string[] = [];
  for (let d = 1; d <= REACH && w + d < vTo; d++) after.push(key(words, w + d));
  const before: string[] = [];
  for (let d = 1; d <= REACH && w - d >= vFrom; d++) before.push(key(words, w - d));
  if (after.length + before.length < NEED) return [];

  const out: SimilarPlace[] = [];
  for (let j = 0; j < words.count && out.length < LIMIT; j++) {
    if (j === w) continue;
    // Cheap first: a neighbour must match.
    const a1 = after.length > 0 && j + 1 < words.count && key(words, j + 1) === after[0];
    const b1 = before.length > 0 && j > 0 && key(words, j - 1) === before[0];
    if (!a1 && !b1) continue;
    const ref = words.ref(j);
    const [jFrom, jTo] = words.verseRange(ref.sura, ref.ayah);
    const same: number[] = [];
    for (let d = 1; d <= after.length && j + d < jTo; d++) {
      if (key(words, j + d) !== after[d - 1]) break;
      same.push(j + d);
    }
    for (let d = 1; d <= before.length && j - d >= jFrom; d++) {
      if (key(words, j - d) !== before[d - 1]) break;
      same.push(j - d);
    }
    if (same.length < NEED) continue;
    const here = key(words, j);
    if (here !== target && similarity(here, target) < CLOSE) continue;
    if (here === target) same.push(j);
    const lo = Math.min(j, ...same);
    const hi = Math.max(j, ...same);
    out.push({
      sura: ref.sura,
      ayah: ref.ayah,
      w: j,
      from: Math.max(jFrom, lo - 1),
      to: Math.min(jTo, hi + 2),
      same: same.sort((x, y) => x - y),
    });
  }
  return out;
}

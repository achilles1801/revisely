// Where a take looks for its start, and where it ends.
//
// A take from the reader's mic looks anywhere on the page on screen (protocol 6's `startBy`: the page's last ayah).
// The others are given a span:
// - A spot test (RECITE-8): from a verse on to an ayah further on, that stops by itself at its end.
// - A voice search's one result (Majd, Nov 15 2026: "take them to that page as if they're about to recite it"): the
//   checker looks for the start only in the ayahs found, and the take goes on until Stop.

import type { QuranWords } from '../recite/quranWords';

export interface TakeSpan {
  /** The take's first ayah (the start frame's `s`/`a`). */
  from: [number, number];
  /**
   * The last ayah the reciter may start in: the checker looks for the start from `from`'s first word to the end of this
   * one (protocol 6's `startBy`). Absent: the take starts at `from`'s first word.
   */
  startBy?: [number, number];
  /** The passage's last ayah (`s2`/`a2`): the take stops by itself once its last word is decided. Absent: on to Stop. */
  to?: [number, number];
}

/** What a search found: the ayah its words start in, and the one they end in when they run on. */
export interface FoundAyahs {
  sura: number;
  ayah: number;
  last?: { sura: number; ayah: number };
}

/**
 * A take over what a search found: the reciter may begin again at the found ayah's start or carry on from the words
 * they searched with, so the checker looks from the first ayah found to the last (it also looks one ayah past it).
 */
export function foundSpan(found: FoundAyahs): TakeSpan {
  const last = found.last ?? found;
  return { from: [found.sura, found.ayah], startBy: [last.sura, last.ayah] };
}

/** The span's last word, where the take stops by itself; null when it goes on until Stop. */
export function spanEndWord(words: QuranWords, span: TakeSpan | null): number | null {
  if (!span?.to) return null;
  return words.verseRange(span.to[0], span.to[1])[1] - 1;
}

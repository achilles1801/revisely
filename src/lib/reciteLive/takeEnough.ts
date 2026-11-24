// A take is a recitation, not a press of the microphone (RECITE-27). Majd, Nov 23 2026: "someone could click the mic for
// like two seconds say nothing and when they end it still counts as a take which obviously shouldn't happen -- atleast
// one verse has to be recited". The same rule for every mode, on the server and on the phone.

import type { QuranWords } from '../recite/quranWords';
import type { Mark } from './contract';
import { furthestWord, type LiveState } from './state';

/**
 * The bar for an ayah too long to finish in one go (the debt ayah takes minutes): this many words count as a take. About
 * one line of the mushaf (77,430 words over 604 pages of 15 lines is 8.5). Majd's to change.
 */
export const LONG_AYAH_WORDS = 9;

/** The cursor runs a moment behind the voice: an ayah of 3 words or more counts with its last word not yet reached. */
export const reachedEnd = (a0: number, a1: number, last: number): boolean => last >= a1 - 1 - (a1 - a0 >= 3 ? 1 : 0);

/** Words `first` to `last` hold a whole ayah, or a long ayah's good stretch. */
export function recitedEnough(words: QuranWords, first: number, last: number): boolean {
  if (last < first) return false;
  if (last - first + 1 >= LONG_AYAH_WORDS) return true;
  const r = words.ref(first);
  const [a0, a1] = words.verseRange(r.sura, r.ayah);
  if (a0 === first) return reachedEnd(a0, a1, last);
  // Came in partway through: the next ayah has to be whole.
  if (a1 >= words.count) return false;
  const n = words.ref(a1);
  const [b0, b1] = words.verseRange(n.sura, n.ayah);
  return reachedEnd(b0, b1, last);
}

/** The furthest word a mark shows was heard. A skipped word wasn't: a silent take can end with nothing but those. */
function lastMarked(marks: readonly Mark[]): number | null {
  let last: number | null = null;
  for (const m of marks) if (m.kind !== 'skipped' && (last == null || m.w > last)) last = m.w;
  return last;
}

/** How far a take got, from its live frames and its marks; null when nothing was heard. */
export function reachedWord(reached: number | null, marks: readonly Mark[]): number | null {
  const marked = lastMarked(marks);
  if (reached == null) return marked;
  return marked == null ? reached : Math.max(reached, marked);
}

/** Whether a finished take counts. A recitation of several takes (`links`) is long by definition. */
export function isATake(state: LiveState, words: QuranWords, links?: readonly unknown[] | null): boolean {
  if ((links?.length ?? 0) > 1) return true;
  const first = state.start ?? state.final?.start ?? state.final?.from ?? null;
  const last = reachedWord(furthestWord(state), state.final?.marks ?? Object.values(state.marks));
  return first != null && last != null && recitedEnough(words, first, last);
}

// "Recite the mistakes again" (Majd, Nov 15 2026: one take over the stretch from the first mistake to the last).
//
// Memorizers fix a weak spot by repeating it, starting a little before so it joins what comes first. So the take runs
// from the ayah before the first mistake's (in the same surah) to the ayah of the last, and stops by itself once the
// checker has decided its last word: reciting on would only add "Added after the end" marks.

import type { QuranWords } from '../recite/quranWords';
import type { Mark } from './contract';

/** A take's passage: from one ayah to another, both included. */
export interface AyahRange {
  from: [number, number];
  to: [number, number];
}

/** The marks worth reciting again: every one but tajweed notes ("not clear" ones too: say them more clearly). */
export const drillMarks = (marks: Mark[]) => marks.filter((m) => m.kind !== 'tajweed');

/** The stretch to recite again, or null when there's nothing to drill. */
export function drillRange(marks: Mark[]): AyahRange | null {
  const ms = drillMarks(marks);
  if (ms.length === 0) return null;
  const key = (m: Mark) => m.ayah[0] * 1000 + m.ayah[1];
  const first = ms.reduce((a, b) => (key(b) < key(a) ? b : a));
  const last = ms.reduce((a, b) => (key(b) > key(a) ? b : a));
  const [s, a] = first.ayah;
  return { from: [s, a > 1 ? a - 1 : a], to: [last.ayah[0], last.ayah[1]] };
}

/** The range's last word (where a drill take stops by itself). */
export function lastWordOf(words: QuranWords, range: AyahRange): number {
  return words.verseRange(range.to[0], range.to[1])[1] - 1;
}

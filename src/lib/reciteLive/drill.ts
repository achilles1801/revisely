// "Recite the mistakes again" (Majd, Nov 15 2026: one take over the stretch from the first mistake to the last).
//
// Memorizers fix a weak spot by repeating it, starting a little before so it joins what comes first. So the take runs
// from the ayah before the first mistake's (in the same surah) to the ayah of the last, and stops by itself once the
// checker has decided its last word: reciting on would only add "Extra word after the end" marks.

import type { QuranWords } from '../recite/quranWords';
import { openInRange, wordMemories } from '../reciteMemory/memory';
import type { MemoryRecord } from '../reciteMemory/record';
import type { Mark } from './contract';

/** A take's passage: from one ayah to another, both included. */
export interface AyahRange {
  from: [number, number];
  to: [number, number];
}

/** The marks worth reciting again: every one but tajweed notes ("not clear" ones too: say them more clearly). */
export const drillMarks = (marks: Mark[]) => marks.filter((m) => m.kind !== 'tajweed');

/**
 * The stretch to recite again, or null when there's nothing to drill. The ayahs with words peeked count too (Majd, Nov
 * 15 2026): a word shown by hand is one not recalled.
 */
export function drillRange(marks: Mark[], peekedAyahs: readonly (readonly [number, number])[] = []): AyahRange | null {
  const ayahs = [...drillMarks(marks).map((m) => m.ayah), ...peekedAyahs];
  if (ayahs.length === 0) return null;
  const key = (x: readonly [number, number]) => x[0] * 1000 + x[1];
  const first = ayahs.reduce((a, b) => (key(b) < key(a) ? b : a));
  const last = ayahs.reduce((a, b) => (key(b) > key(a) ? b : a));
  const [s, a] = first;
  return { from: [s, a > 1 ? a - 1 : a], to: [last[0], last[1]] };
}

/** The range's last word (where a drill take stops by itself). */
export function lastWordOf(words: QuranWords, range: AyahRange): number {
  return words.verseRange(range.to[0], range.to[1])[1] - 1;
}

/** The page's remembered mistakes to recite again (the held mic's "Recite your N mistakes here"). */
export interface OpenDrill {
  /** Words still to fix on the page, one each (tajweed notes left out, as drillMarks does). */
  count: number;
  /** From the ayah before the first such word's to the last one's: the take stops by itself at its end. */
  range: AyahRange;
  /** Each word's latest wrong try, in page order (the summary's "Before: …"). */
  marks: Mark[];
}

/**
 * The page's words still marked in Recite's memory (lib/reciteMemory: open until two right takes on two days) as one
 * stretch to recite again, or null when the page has none. The same stretch as "Recite the mistakes again" (#594)
 * gives a take's own marks, here from every take that reached the page (the idea of Nov 15 2026,
 * 2026-11-15-recite-drill-open-mistakes).
 */
export function openDrill(records: readonly MemoryRecord[], words: QuranWords, page: number): OpenDrill | null {
  const [from, to] = words.pageRange(page);
  if (to <= from) return null;
  const marks = drillMarks(
    openInRange(wordMemories(records), from, to)
      .map((m) => m.lastMark)
      .filter((m): m is Mark => m != null),
  );
  const range = drillRange(marks);
  return range ? { count: marks.length, range, marks } : null;
}

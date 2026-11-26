// Where a mark is shown (pure).
//
// The checker sends an extra word (`added`) on the word it came after: its `w`, and its id `<w>:added:`. The app shows it
// on the next word instead, the one the reciter was reaching for (Majd, Nov 25 2026: "extra word marks which is
// essentially when the user doesn't know what the next word is should be put on the next word not on the word before the
// stumble because the word before the stumble was said right"). Its highlight, the bar's word, the card's place, the
// summary's row, the page a tap opens and the word Recite's memory keeps all follow from its `w` and `ayah`, so
// `placeMark` moves those once, where marks come in: a take's marks (lib/reciteLive/state) and the takes Recite's memory
// loads (lib/reciteMemory/record), old ones included. The id stays the checker's, so what is sent back (Not a mistake,
// Put back) is unchanged, and `checkerWord` still reads the checker's place from it: placing a mark twice is the same as
// placing it once.

import type { Mark } from './contract';
import { getQuranWords, type QuranWords } from '../recite/quranWords';

const ADDED_ID = /^(\d+):added:/;

/** The word the checker put a mark on: for an extra word, the word it came after (its id keeps it once moved). */
export function checkerWord(m: Pick<Mark, 'id' | 'w' | 'kind'>): number {
  if (m.kind !== 'added') return m.w;
  const hit = ADDED_ID.exec(m.id);
  return hit ? Number(hit[1]) : m.w;
}

/**
 * The mark as shown: an extra word on the next word, its ayah that word's. It stays on the word it came after when there
 * is no next word to reach for: after the end of what was being recited (`trail`, "Extra word after the end"), or at
 * the end of its surah. Without the word data (not loaded yet) it is left as it came.
 */
export function placeMark<M extends Mark>(m: M, words: QuranWords | null = getQuranWords()): M {
  if (m.kind !== 'added' || m.detail === 'trail' || !words) return m;
  const after = checkerWord(m);
  const next = after + 1;
  if (after < 0 || next >= words.count) return m;
  const was = words.ref(after);
  const to = words.ref(next);
  if (to.sura !== was.sura) return m;
  if (m.w === next && m.ayah[0] === to.sura && m.ayah[1] === to.ayah) return m;
  return { ...m, w: next, ayah: [to.sura, to.ayah] };
}

/** Whether an extra word is shown on the word it was reaching for (true), or still on the word it came after. */
export const onNextWord = (m: Pick<Mark, 'id' | 'w' | 'kind'>): boolean => m.kind === 'added' && m.w !== checkerWord(m);

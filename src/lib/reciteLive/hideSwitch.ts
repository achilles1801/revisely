// What a page shows when it is switched to hidden (Majd, Nov 22 2026, of Tarteel's: "do the same"; RECITE-21).

import type { QuranWords } from '../recite/quranWords';
import type { Revealed } from './view';

const NONE: Revealed = new Set();

/**
 * The words a page keeps on show when it is switched to hidden. During a take (`running`), everything behind the reciter
 * stays: the words before where the take started on this page (the words recited since show anyway, RECITE-6), so only
 * what is ahead hides; a page wholly before the start stays shown whole. After a take, or before one, nothing: the page
 * hides everything.
 */
export function revealedOnHide(words: QuranWords, page: number, take: { running: boolean; startWord: number | null }): Revealed {
  if (!take.running || take.startWord == null) return NONE;
  const [from, to] = words.pageRange(page);
  const end = Math.min(to, take.startWord);
  if (end <= from) return NONE;
  const out = new Set<number>();
  for (let w = from; w < end; w++) out.add(w);
  return out;
}

/** What the hidden page follows of a take: its recited words while it runs, none once the page was hidden after it. */
export function hiddenTakeInfo<T extends { saidUpTo: number | null; startWord: number | null; cursor: number | null }>(info: T, hiddenAfterTake: boolean): T {
  return hiddenAfterTake ? { ...info, saidUpTo: null, startWord: null } : info;
}

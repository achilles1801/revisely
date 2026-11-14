// What the reader's recite bar and hidden view show of a live take (pure).

import type { QuranWords } from '../recite/quranWords';
import type { WordFollow } from '../recite/hiddenPage';
import type { Mark } from './contract';
import { furthestWord, LiveState, mistakeCount } from './state';
import { formatAccuracy, pageAccuracy, ScoreLevel, scoreLevel } from './score';

/** A word in the bar: the one being said, one already said, or one said wrong (as heard). */
export interface BarWord {
  w: number;
  text: string;
  tone: 'current' | 'said' | 'wrong';
}

/** The words heard, for the bar: the last two up to the cursor (newest last). Check shows a wrong word as heard. */
export function barWords(state: LiveState, words: QuranWords, opts: { check: boolean; startWord: number | null }): BarWord[] {
  if (state.cursor == null) return [];
  const wrong = new Map<number, Mark>();
  const skipped = new Set<number>();
  if (opts.check) {
    for (const m of Object.values(state.marks)) {
      if (m.kind === 'word' && m.heard) wrong.set(m.w, m);
      if (m.kind === 'skipped') skipped.add(m.w);
    }
  }
  const out: BarWord[] = [];
  for (let w = state.cursor; w >= 0 && out.length < 2; w--) {
    if (opts.startWord != null && w < opts.startWord) break;
    if (skipped.has(w)) continue;
    const m = wrong.get(w);
    out.unshift(
      m
        ? { w, text: m.heard ?? words.uthmani(w), tone: 'wrong' }
        : { w, text: words.uthmani(w), tone: w === state.cursor ? 'current' : 'said' },
    );
  }
  return out;
}

/** The score pill (Check): by the page, as Tarteel counts (1 mistake on a 134-word page is 99.2%). */
export function scorePill(state: LiveState, words: QuranWords, startWord: number | null): { text: string; level: ScoreLevel } | null {
  if (startWord == null) return null;
  const last = furthestWord(state) ?? startWord;
  const accuracy = pageAccuracy(words, mistakeCount(state), startWord, last);
  return { text: formatAccuracy(accuracy), level: scoreLevel(accuracy) };
}

// ------------------------------------------------------------------ hidden view

/** Words shown by hand on hidden pages (‹ a word, ‹‹ an ayah, a tap on a verse). */
export type Revealed = ReadonlySet<number>;
export const NOTHING_SHOWN: Revealed = new Set();

/** Whether a word shows on a hidden page: recited (up to what the checker has decided, from the take's start) or shown by hand. */
export function wordShown(w: number, revealed: Revealed, live: { saidUpTo: number | null; startWord: number | null }): boolean {
  if (revealed.has(w)) return true;
  return live.saidUpTo != null && live.startWord != null && w >= live.startWord && w <= live.saidUpTo;
}

/** The first word on a page still hidden, or null. */
export function nextHiddenWord(
  words: QuranWords,
  page: number,
  revealed: Revealed,
  live: { saidUpTo: number | null; startWord: number | null },
): number | null {
  const [from, to] = words.pageRange(page);
  for (let w = from; w < to; w++) if (!wordShown(w, revealed, live)) return w;
  return null;
}

/** ‹: the next hidden word shown. */
export function revealNextWord(words: QuranWords, page: number, revealed: Revealed, live: { saidUpTo: number | null; startWord: number | null }): Revealed {
  const w = nextHiddenWord(words, page, revealed, live);
  return w == null ? revealed : new Set([...revealed, w]);
}

/** ‹‹ (or a tap on a verse): every word of an ayah shown: the one the next hidden word is in, or `verse`. */
export function revealAyah(
  words: QuranWords,
  page: number,
  revealed: Revealed,
  live: { saidUpTo: number | null; startWord: number | null },
  verse?: { sura: number; ayah: number },
): Revealed {
  let target = verse;
  if (!target) {
    const w = nextHiddenWord(words, page, revealed, live);
    if (w == null) return revealed;
    const r = words.ref(w);
    target = { sura: r.sura, ayah: r.ayah };
  }
  const [from, to] = words.verseRange(target.sura, target.ayah);
  const out = new Set(revealed);
  for (let w = from; w < to; w++) out.add(w);
  return out;
}

/** What the hidden page overlay (lib/recite/hiddenPage) needs: which words show, and where the reciter is. */
export function hiddenFollow(
  words: QuranWords,
  revealed: Revealed,
  live: { saidUpTo: number | null; startWord: number | null; cursor: number | null },
): WordFollow {
  return { words, shown: (w) => wordShown(w, revealed, live), next: live.cursor };
}

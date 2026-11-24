// What the reader's recite bar and hidden view show of a live take (pure).

import type { QuranWords } from '../recite/quranWords';
import type { WordFollow } from '../recite/hiddenPage';
import { isUnclear, strongestByWord, type Mark } from './contract';
import { barUpTo, furthestWord, LiveState, LiveStatus, mistakeCount } from './state';
import { formatAccuracy, pageAccuracy, ScoreLevel, scoreLevel } from './score';

/**
 * A word in the bar: the newest one said (`current`, in the following ink), one said before it, one said wrong (as heard, on red), one with a wrong
 * haraka or letter (tone `slip`, on amber; `part` says which) or a tajweed note (on violet): the page's highlights (Majd,
 * Nov 15 2026; components/reciteLive/markColours' `toneFill`). The colours never follow the accent.
 */
export interface BarWord {
  w: number;
  text: string;
  tone: 'current' | 'said' | 'wrong' | 'slip' | 'tajweed';
  /** A `slip` word's mistake: a wrong haraka or a wrong letter (a letter when it has both), for a screen reader. */
  part?: 'harakat' | 'letter';
}

/**
 * The words heard, for the bar: the last two said (newest last), never the word being said (RECITE-28). Check shows a
 * wrong word as heard. `upTo` (a hidden page): no further than the page shows (RECITE-6).
 */
export function barWords(
  state: LiveState,
  words: QuranWords,
  opts: { check: boolean; startWord: number | null; upTo?: number | null },
): BarWord[] {
  const said = barUpTo(state);
  if (said == null) return [];
  const top = opts.upTo !== undefined ? Math.min(said, opts.upTo ?? -1) : said;
  const wrong = new Map<number, Mark>();
  const skipped = new Set<number>();
  const slipped = new Map<number, 'harakat' | 'letter'>();
  const tajweed = new Set<number>();
  if (opts.check) {
    for (const m of Object.values(state.marks)) {
      if (m.kind === 'word' && m.heard) wrong.set(m.w, m);
      if (m.kind === 'skipped') skipped.add(m.w);
      if (m.kind === 'tajweed') tajweed.add(m.w);
      // A "not clear" haraka or letter isn't shown as a mistake in the bar: it wasn't heard as wrong.
      else if ((m.kind === 'harakat' || m.kind === 'letter') && !isUnclear(m)) slipped.set(m.w, slipped.get(m.w) === 'letter' ? 'letter' : m.kind);
    }
  }
  const out: BarWord[] = [];
  for (let w = top; w >= 0 && out.length < 2; w--) {
    if (opts.startWord != null && w < opts.startWord) break;
    if (skipped.has(w)) continue;
    const m = wrong.get(w);
    const part = slipped.get(w);
    out.unshift(
      m
        ? { w, text: m.heard ?? words.uthmani(w), tone: 'wrong' }
        : part
          ? { w, text: words.uthmani(w), tone: 'slip', part }
          : { w, text: words.uthmani(w), tone: tajweed.has(w) ? 'tajweed' : out.length === 0 ? 'current' : 'said' },
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

/**
 * The first word on a page still hidden, or null: from where the take started when that is on the page (a take can
 * start anywhere on it, and the words before its start aren't what comes next), else from the page's top.
 */
export function nextHiddenWord(
  words: QuranWords,
  page: number,
  revealed: Revealed,
  live: { saidUpTo: number | null; startWord: number | null },
): number | null {
  const [from, to] = words.pageRange(page);
  const begin = live.startWord != null && live.startWord > from && live.startWord < to ? live.startWord : from;
  for (let w = begin; w < to; w++) if (!wordShown(w, revealed, live)) return w;
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

/**
 * The mistakes the hidden page keeps on its covers (RECITE-13; Majd, Nov 20 2026: "if I hide the page, that highlight
 * should still be there. Obviously, the word won't be shown"): for each word on `page` still covered, the take's mark
 * (its strongest), else the one Recite's memory holds there (`past`). A word that shows has its highlight behind its ink.
 */
/**
 * What a tap on the bar's score opens (RECITE-17; Majd, Nov 21 2026: "the percentage score should be clickable throughout
 * the whole process"): while the take runs or Stop waits, what it has found so far; once it's done, its summary.
 */
export function scoreTapOpens(status: LiveStatus): 'so-far' | 'summary' | null {
  if (status === 'listening' || status === 'checking') return 'so-far';
  if (status === 'done') return 'summary';
  return null;
}

export function coverHighlights(
  words: QuranWords,
  page: number,
  shown: (w: number) => boolean,
  live: readonly Mark[],
  past: readonly Mark[],
): { mark: Mark; past: boolean }[] {
  const [from, to] = words.pageRange(page);
  const onPage = (m: Mark) => m.w >= from && m.w < to && !shown(m.w);
  const out: { mark: Mark; past: boolean }[] = [];
  const marked = new Set<number>();
  for (const m of strongestByWord(live.filter(onPage)).values()) {
    marked.add(m.w);
    out.push({ mark: m, past: false });
  }
  for (const m of strongestByWord(past.filter(onPage)).values()) if (!marked.has(m.w)) out.push({ mark: m, past: true });
  return out;
}

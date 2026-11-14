// The score pill: its figure and colour (pure).
//
// Two ways to count are on the table (a product choice for Majd, Nov 13 2026):
// - the checker's: 1 − mistakes ÷ words reached (the model session's rule, sent in `score`);
// - by the page, as Tarteel does: 1 − mistakes ÷ the words on the pages reached. One mistake on page 379's 134 words
//   is 99.2%, where words reached gives 85.7% for one mistake seven words in.
// Both go through the same figure and colour.

import type { QuranWords } from '../recite/quranWords';

/** good: at most a mistake a page. warn: two or three. bad: more. */
export type ScoreLevel = 'good' | 'warn' | 'bad';

/** The colour for an accuracy (0–1). Set for the page count: 1 mistake on 120–150 words is good, 4 is bad. */
export function scoreLevel(accuracy: number): ScoreLevel {
  if (accuracy >= 0.99) return 'good';
  if (accuracy >= 0.975) return 'warn';
  return 'bad';
}

/** "100%", "99.2%": one decimal under 100, rounded down, so a take with a mistake never reads 100%. */
export function formatAccuracy(accuracy: number): string {
  const a = Math.min(1, Math.max(0, accuracy));
  if (a >= 1) return '100%';
  // (a little slack, so 0.985 isn't 984.999… tenths)
  const tenths = Math.floor(a * 1000 + 1e-6);
  return `${Math.min(999, tenths) / 10}%`.replace(/^(\d+)%$/, '$1.0%');
}

/** The words on the mushaf pages from `first`'s page to `last`'s. */
export function wordsOnPagesReached(words: QuranWords, first: number, last: number): number {
  const a = words.pageOf(Math.min(first, last));
  const b = words.pageOf(Math.max(first, last));
  return words.pageRange(b)[1] - words.pageRange(a)[0];
}

/** By the page: 1 − mistakes ÷ the words on the pages reached. */
export function pageAccuracy(words: QuranWords, mistakes: number, first: number, last: number): number {
  const n = wordsOnPagesReached(words, first, last);
  return n > 0 ? Math.max(0, 1 - mistakes / n) : 1;
}

/** "No mistakes", "1 mistake", "3 mistakes". */
export function mistakesLabel(n: number): string {
  if (n <= 0) return 'No mistakes';
  return n === 1 ? '1 mistake' : `${n} mistakes`;
}

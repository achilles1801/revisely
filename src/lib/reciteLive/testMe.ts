// "Test me" is one spot test at a time (Majd, Nov 23 2026: "when people spot test they always recite one verse or give
// them one verse and then the person starts from that one verse and continues ... there should only be one spot test at
// a time"; before, Nov 15, five places in a row).
//
// One verse at random in what the account has memorized, or in one juz of it. The page is hidden but for that verse, and
// the reciter carries on from it: a Mark mistakes take that stops by itself about the chosen length further on, at the
// end of an ayah. The start is given, so there's no search of the page: the checker looks only in that verse and the one
// after it (`startBy`), so reciting the verse first or carrying on straight after it both work.

import { type AyahKey, ayahOf, nextAyah, suraOf } from '../ayahKeys';
import { getJuzForPage } from '../quranData';
import type { QuranWords } from '../recite/quranWords';
import type { TakeSpan } from './span';
import { furthestWord, type LiveState } from './state';
import { reachedEnd, reachedWord } from './takeEnough';
import { DEFAULT_TEST_LENGTH, type TestLength } from './testLength';
import { t } from '../../i18n';

/** Starts looked at for one with room for the whole length, before settling for the longest of them. */
const MAX_DRAWS = 60;

/** One spot test: the take's span, the verse shown before it starts, where it ends and the length it was set to. */
export interface SpotTest {
  span: TakeSpan;
  /** The words shown on the hidden page: the whole starting verse. */
  cue: number[];
  /** Its last word: the take stops by itself once it's decided. */
  last: number;
  pages: TestLength;
}

/** The juz an ayah is in (every juz of the 1405 print starts on a page of its own). */
const juzOf = (words: QuranWords, key: AyahKey) => getJuzForPage(words.pageOf(words.verseFirstWord(suraOf(key), ayahOf(key))));

/** A test can start at `key` when the next ayah of its surah is memorized too (and in `juz`, when given). */
function canStart(words: QuranWords, key: AyahKey, held: ReadonlySet<AyahKey>, juz: number | null): boolean {
  const n = nextAyah(key);
  if (n == null || suraOf(n) !== suraOf(key) || !held.has(n)) return false;
  return juz == null || (juzOf(words, key) === juz && juzOf(words, n) === juz);
}

/** The word about `pages` pages on from `w`: just before the same place on the page that far ahead. */
export function wordPagesOn(words: QuranWords, w: number, pages: number): number {
  const page = words.pageOf(w);
  const [p0, p1] = words.pageRange(page);
  const at = page + (w - p0) / (p1 - p0) + pages;
  const target = Math.floor(at);
  if (target > words.pageOf(words.count - 1)) return words.count - 1;
  const [q0, q1] = words.pageRange(target);
  return Math.max(w, q0 + Math.round((at - target) * (q1 - q0)) - 1);
}

/** The test from `key`, and whether what's memorized holds its whole length. */
function testAt(
  words: QuranWords,
  key: AyahKey,
  pages: TestLength,
  held: ReadonlySet<AyahKey>,
  juz: number | null,
): { test: SpotTest; fits: boolean } {
  const [first, afterVerse] = words.verseRange(suraOf(key), ayahOf(key));
  const target = wordPagesOn(words, first, pages);
  const endOf = (k: AyahKey) => words.verseRange(suraOf(k), ayahOf(k))[1] - 1;
  const next = nextAyah(key) as AyahKey; // canStart: there is one
  let to = next;
  while (endOf(to) < target) {
    const n = nextAyah(to);
    if (n == null || !held.has(n) || (juz != null && juzOf(words, n) !== juz)) break;
    to = n;
  }
  const last = endOf(to);
  return {
    test: {
      span: { from: [suraOf(key), ayahOf(key)], startBy: [suraOf(next), ayahOf(next)], to: [suraOf(to), ayahOf(to)] },
      cue: Array.from({ length: afterVerse - first }, (_, i) => first + i),
      last,
      pages,
    },
    fits: last >= target,
  };
}

/** The ayahs a test can start in: memorized ones (in `juz`, when given) with the next ayah of the surah to carry on to. */
export function testStarts(memorized: readonly AyahKey[], words: QuranWords, juz: number | null = null): AyahKey[] {
  const held = new Set(memorized);
  return memorized.filter((k) => canStart(words, k, held, juz));
}

/** The juz a test can be given, each with how many ayahs it could start in, in order. */
export function testJuz(memorized: readonly AyahKey[], words: QuranWords): { juz: number; starts: number }[] {
  const held = new Set(memorized);
  const counts = new Map<number, number>();
  for (const k of testStarts(memorized, words)) {
    const j = juzOf(words, k);
    if (canStart(words, k, held, j)) counts.set(j, (counts.get(j) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([juz, starts]) => ({ juz, starts }));
}

/**
 * One test at random among the starts: one with room for the whole length when there is one, otherwise the longest of
 * those looked at (little memorized: it ends where what's memorized does). Null when it can't start anywhere.
 */
export function pickTest(
  memorized: readonly AyahKey[],
  words: QuranWords,
  opts: { juz?: number | null; pages?: TestLength; random?: () => number } = {},
): SpotTest | null {
  const random = opts.random ?? Math.random;
  const pages = opts.pages ?? DEFAULT_TEST_LENGTH;
  const juz = opts.juz ?? null;
  const held = new Set(memorized);
  const pool = testStarts(memorized, words, juz);
  let best: SpotTest | null = null;
  for (let draw = 0; draw < MAX_DRAWS && pool.length > 0; draw++) {
    const i = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    const key = pool.splice(i, 1)[0];
    const { test, fits } = testAt(words, key, pages, held, juz);
    if (fits) return test;
    if (!best || test.last - test.cue[0] > best.last - best.cue[0]) best = test;
  }
  return best;
}

/** Whether a finished take reached the test's end (its last word, or a moment before: the cursor runs behind the voice). */
export function testFinished(words: QuranWords, test: Pick<SpotTest, 'last'>, state: LiveState): boolean {
  const reached = reachedWord(furthestWord(state), state.final?.marks ?? Object.values(state.marks));
  if (reached == null) return false;
  const r = words.ref(test.last);
  const [a0, a1] = words.verseRange(r.sura, r.ayah);
  return reachedEnd(a0, a1, reached);
}

/** A test's length in words: "½ page", "1 page", "2 pages". */
export function testLengthLabel(pages: number): string {
  return pages === 0.5 ? t('reciteLive.test.halfPage') : t('common.pages', { count: pages });
}

/** A test in a line: "Test · 1 page · Stopped early". */
export function spotTestLine(pages: number, finished: boolean): string {
  return t('reciteLive.test.line', {
    length: testLengthLabel(pages),
    how: finished ? t('reciteLive.test.finished') : t('reciteLive.test.stoppedEarly'),
  });
}

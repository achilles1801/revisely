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

/** Lines of the 1405 print in a page: a test's length in lines is its pages times this. */
export const LINES_PER_PAGE = 15;

/** Per page: how many words each line holds (QuranWords is fixed, so kept). */
const lineCache = new WeakMap<QuranWords, Map<number, { count: Map<number, number> }>>();
function pageLines(words: QuranWords, page: number) {
  let byPage = lineCache.get(words);
  if (!byPage) lineCache.set(words, (byPage = new Map()));
  let lines = byPage.get(page);
  if (!lines) {
    const count = new Map<number, number>();
    const [p0, p1] = words.pageRange(page);
    for (let i = p0; i < p1; i++) count.set(words.lineOf(i), (count.get(words.lineOf(i)) ?? 0) + 1);
    lines = { count };
    byPage.set(page, lines);
  }
  return lines;
}

/**
 * Lines of ayat from the start of word `from` to the end of word `to` (RECITE-8): a whole line is 1, part of one its
 * share of the line's words. Surah names and the basmala above a surah are no line of ayat, so they never count.
 */
export function linesRecited(words: QuranWords, from: number, to: number): number {
  let total = 0;
  let i = from;
  while (i <= to) {
    const page = words.pageOf(i);
    const line = words.lineOf(i);
    const n = pageLines(words, page).count.get(line) ?? 1;
    let j = i;
    while (j + 1 <= to && words.pageOf(j + 1) === page && words.lineOf(j + 1) === line) j++;
    total += (j - i + 1) / n;
    i = j + 1;
  }
  return total;
}

/**
 * The test from `key`, and whether it holds its whole length (RECITE-8; Majd, Nov 25 2026: "should always finish the
 * surah if i'm at the end of it already, we need to do proper math"). What's counted is what's recited from memory: the
 * lines of ayat after the verse shown, `pages` × 15 of them. It ends at the end of the ayah that count is reached in,
 * then a surah's end wins within a third of that length either side (to the line above: 3 lines for half a page):
 * near the end it finishes the surah, just past it it doesn't start the next. Memorized ayahs only, in the juz picked, and at least the ayah after the one shown.
 */
function testAt(
  words: QuranWords,
  key: AyahKey,
  pages: TestLength,
  held: ReadonlySet<AyahKey>,
  juz: number | null,
): { test: SpotTest; fits: boolean } {
  const [first, afterVerse] = words.verseRange(suraOf(key), ayahOf(key));
  const endOf = (k: AyahKey) => words.verseRange(suraOf(k), ayahOf(k))[1] - 1;
  const goal = pages * LINES_PER_PAGE;
  const lines = (k: AyahKey) => linesRecited(words, afterVerse, endOf(k));
  const ok = (n: AyahKey | null): n is AyahKey => n != null && held.has(n) && (juz == null || juzOf(words, n) === juz);
  const next = nextAyah(key) as AyahKey; // canStart: there is one
  // The ayahs it may run through, up to a third of the length past the goal, each with its lines so far.
  const path: { k: AyahKey; at: number }[] = [{ k: next, at: lines(next) }];
  while (path[path.length - 1].at < goal + Math.ceil(goal / 3)) {
    const n = nextAyah(path[path.length - 1].k);
    if (!ok(n)) break;
    path.push({ k: n, at: lines(n) });
  }
  // The ayah the goal is reached in (or the last there is).
  const reachedAt = path.findIndex((p) => p.at >= goal);
  const natural = reachedAt === -1 ? path.length - 1 : reachedAt;
  // A third of the length, to the line above: 3 lines for half a page, 5 for a page.
  const near = Math.ceil(goal / 3);
  // A surah's end within a third of the length of that end, either side: the nearest wins.
  let end = natural;
  let snapped = false;
  let best = Infinity;
  path.forEach((p, i) => {
    const n = nextAyah(p.k);
    const lastOfSurah = n == null || suraOf(n) !== suraOf(p.k);
    const off = Math.abs(p.at - path[natural].at);
    if (lastOfSurah && off <= near && off < best) {
      best = off;
      end = i;
      snapped = true;
    }
  });
  const to = path[end].k;
  return {
    test: {
      span: { from: [suraOf(key), ayahOf(key)], startBy: [suraOf(next), ayahOf(next)], to: [suraOf(to), ayahOf(to)] },
      cue: Array.from({ length: afterVerse - first }, (_, i) => first + i),
      last: endOf(to),
      pages,
    },
    // Its length, or near enough that a surah's end took its place.
    fits: path[end].at >= goal - (snapped ? near : 0),
  };
}

/** How far into a test the reciter is, 0 to 1, in lines of ayat recited from memory (its progress line). */
export function testProgress(words: QuranWords, test: Pick<SpotTest, 'cue' | 'last'>, reached: number | null): number {
  const from = test.cue[test.cue.length - 1] + 1;
  if (reached == null || reached < from) return 0;
  const all = linesRecited(words, from, test.last);
  return all <= 0 ? 1 : Math.min(1, linesRecited(words, from, Math.min(reached, test.last)) / all);
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

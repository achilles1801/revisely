// "Test me" (Majd, Nov 15 2026: approved, "random within all memorized pages, with an optional juz pick"; Tarteel's
// Test, checked word by word).
//
// Five places at random in what the account has memorized, or in one juz of it. At each, the page is hidden but for the
// ayah's first two words, and the reciter carries on: a Mark mistakes take over that ayah and the two after it (those
// memorized, in the same surah), which stops by itself at the end. Then a summary: how many were continued cleanly, and
// what each one found. The start is given, so there's no search of the page: the checker looks only in the first ayah
// (`startBy`), so beginning again at its first word or carrying on after the two shown both work.

import { ayahKey, type AyahKey, ayahOf, ayahsBetween, nextAyah, suraOf } from '../ayahKeys';
import { describeAyahs } from '../passages';
import { getJuzForPage } from '../quranData';
import type { QuranWords } from '../recite/quranWords';
import type { Mark } from './contract';
import type { TakeSpan } from './span';
import { furthestWord, LiveState, mistakeCount } from './state';

/** Places in one test. */
export const TEST_PLACES = 5;
/** Ayahs checked at each place: the one it starts in and the next two. */
export const TEST_AYAHS = 3;
/** Words shown at the start of each place. */
export const CUE_WORDS = 2;
/** A place starts only in an ayah with words to carry on after the cue. */
const MIN_WORDS = CUE_WORDS + 2;

/** One place of a test: the take's span, and the words shown before it starts. */
export interface TestPlace {
  span: TakeSpan;
  /** The words shown on the hidden page (the first ayah's first two). */
  cue: number[];
  /** Its last word: the take stops by itself once it's decided. */
  last: number;
}

/** The juz an ayah is in (every juz of the 1405 print starts on a page of its own). */
const juzOf = (words: QuranWords, key: AyahKey) => getJuzForPage(words.pageOf(words.verseFirstWord(suraOf(key), ayahOf(key))));

/** The place starting at `key`: that ayah and the memorized ayahs after it in its surah, three at most. */
function placeAt(words: QuranWords, key: AyahKey, memorized: ReadonlySet<AyahKey>): TestPlace {
  let to = key;
  for (let i = 1; i < TEST_AYAHS; i++) {
    const n = nextAyah(to);
    if (n == null || suraOf(n) !== suraOf(key) || !memorized.has(n)) break;
    to = n;
  }
  const [first] = words.verseRange(suraOf(key), ayahOf(key));
  const end = words.verseRange(suraOf(to), ayahOf(to))[1] - 1;
  const cue = Array.from({ length: CUE_WORDS }, (_, i) => first + i);
  const at: [number, number] = [suraOf(key), ayahOf(key)];
  return { span: { from: at, startBy: at, to: [suraOf(to), ayahOf(to)] }, cue, last: end };
}

/** The ayahs a test can start in: memorized ones (in `juz`, when given) long enough to carry on after the cue. */
export function testStarts(memorized: readonly AyahKey[], words: QuranWords, juz: number | null = null): AyahKey[] {
  return memorized.filter((k) => {
    const [from, to] = words.verseRange(suraOf(k), ayahOf(k));
    return to - from >= MIN_WORDS && (juz == null || juzOf(words, k) === juz);
  });
}

/** The juz a test can be given, each with how many ayahs it could start in, in order. */
export function testJuz(memorized: readonly AyahKey[], words: QuranWords): { juz: number; starts: number }[] {
  const counts = new Map<number, number>();
  for (const k of testStarts(memorized, words)) {
    const j = juzOf(words, k);
    counts.set(j, (counts.get(j) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([juz, starts]) => ({ juz, starts }));
}

/**
 * Up to five places at random among the starts, none overlapping another (two places never share an ayah), in the
 * order they were drawn. Fewer when there's less memorized.
 */
export function testPlaces(
  memorized: readonly AyahKey[],
  words: QuranWords,
  opts: { juz?: number | null; places?: number; random?: () => number } = {},
): TestPlace[] {
  const random = opts.random ?? Math.random;
  const want = opts.places ?? TEST_PLACES;
  const held = new Set(memorized);
  const pool = testStarts(memorized, words, opts.juz ?? null);
  const used = new Set<AyahKey>();
  const out: TestPlace[] = [];
  while (out.length < want && pool.length > 0) {
    const i = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    const key = pool.splice(i, 1)[0];
    if (used.has(key)) continue;
    const place = placeAt(words, key, held);
    const ayahs = ayahsBetween(key, ayahKey(place.span.to![0], place.span.to![1]));
    if (ayahs.some((k) => used.has(k))) continue;
    for (const k of ayahs) used.add(k);
    out.push(place);
  }
  return out;
}

/** How a place went. */
export type TestOutcome =
  /** Carried on to the end with no mistake. */
  | 'clean'
  /** Mistakes on the way (its marks say which). */
  | 'mistakes'
  /** To the end with no mistake, but with words peeked (not recalled). */
  | 'helped'
  /** Stopped before the end, with no mistake. */
  | 'unfinished'
  /** No start was ever found: nothing recited from there. */
  | 'missed';

export interface TestResult {
  place: TestPlace;
  outcome: TestOutcome;
  /** The take's marks (tajweed notes and "not clear" included; they don't count against it). */
  marks: Mark[];
  /** Words peeked (shown by hand) at the place. */
  peeked: number;
}

/** A finished take's outcome at its place, with the words peeked there. */
export function testResult(place: TestPlace, state: LiveState, peeked = 0): TestResult {
  const marks = Object.values(state.marks).sort((a, b) => a.w - b.w);
  if (state.start == null) return { place, outcome: 'missed', marks: [], peeked };
  const mistakes = mistakeCount(state);
  if (mistakes > 0) return { place, outcome: 'mistakes', marks, peeked };
  const reached = (furthestWord(state) ?? -1) >= place.last;
  return { place, outcome: !reached ? 'unfinished' : peeked > 0 ? 'helped' : 'clean', marks, peeked };
}

/** Where a place is: "Al-Baqarah, ayahs 142–144". */
export function testPlaceName(place: TestPlace): string {
  const { from, to } = place.span;
  return describeAyahs(ayahsBetween(ayahKey(from[0], from[1]), ayahKey(to![0], to![1])), { wholeJuz: false });
}

/** "3 of 5 continued cleanly". */
export function testHeadline(results: readonly TestResult[]): string {
  const clean = results.filter((r) => r.outcome === 'clean').length;
  if (results.length > 1 && clean === results.length) return `All ${clean} continued cleanly`;
  return `${clean} of ${results.length} continued cleanly`;
}

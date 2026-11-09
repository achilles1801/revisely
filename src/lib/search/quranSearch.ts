// Finding ayat from a few of their words, typed or heard (voice search, testers).
//
// The words are compared the way recite mode compares what it hears with the mushaf
// (lib/recite/arabic: bare letters, one alef, no hamza seats), against every word of the
// Qur'an (lib/recite/quranWords). The query is lined up with the text as a whole phrase:
// it may start anywhere, even mid-ayah, and run on into the next ayah; a word that was
// misheard, left out or added costs some of the score instead of ruling the ayah out.
// Speech recognition gets a letter wrong now and then (تلوته heard as تلوتو), so a
// near-miss still counts, for less than the word itself.
//
// Common words (الله, من, في) count for less than rare ones: a phrase found with a rare
// word missing is a worse match than one missing a "من".

import { editDistance, splitWords } from '../recite/arabic';
import type { QuranWords } from '../recite/quranWords';

export interface VerseHit {
  /** The ayah the match starts in. */
  sura: number;
  ayah: number;
  /** The ayah it ends in: the same, or a later one when the phrase runs on. */
  last: { sura: number; ayah: number };
  /** The words matched, [from, to) in QuranWords numbering (may run into the next ayah). */
  from: number;
  to: number;
  /** How much of the query was found, 0..1 (1: every word, as said). */
  score: number;
}

export interface TextSearchResult {
  hits: VerseHit[];
  /** Matches found, before the list was cut to `limit`. */
  total: number;
  /** The words searched for, normalised, after a leading isti'adha or basmala was set aside. */
  words: string[];
}

/** Words beyond this are not searched (a long recitation: its start says where it is). */
const MAX_QUERY_WORDS = 24;
/** A word printed as one is said as at most this many (يا ابن ام). */
const MAX_PARTS = 3;
/** A word heard with one letter wrong counts for this much of the word. */
const NEAR_ONE = 0.7;
/** Two letters wrong, in a long word. */
const NEAR_TWO = 0.55;
/** The word with or without a leading و or ف. */
const CONJUNCTION = 0.9;
/** Costs, as shares of the query word's weight (or a flat cost for a skipped Qur'an word). */
const SUBSTITUTE = 0.4;
const UNMATCHED = 0.5;
const SKIPPED = 0.35;
/** Matches found with at least this share of a query of one or two words, or of longer ones. */
const MIN_SHORT = 0.65;
const MIN_LONG = 0.55;
/** A match this good counts as the phrase itself; others then show only if nearly as good. */
const EXACT = 0.98;
const CLOSE_TO_EXACT = 0.9;
/** Otherwise matches this close to the best one show too. */
const CLOSE = 0.2;

interface Index {
  /** Normalised standard spelling per distinct word. */
  key: string[];
  /** The Uthmani spelling where it differs, else null. */
  alt: (string | null)[];
  /** Without hamzas. */
  loose: string[];
  /** How often the distinct word occurs. */
  freq: Int32Array;
  /** Distinct word of every word of the Qur'an. */
  wordVocab: Int32Array;
  /** Words printed as one but said as two or three (يا أيها): "يا ايها" → those distinct words. */
  joined: Map<string, number[]>;
  /** How many words each distinct word is said as (1 for most). */
  partCount: Int8Array;
  /** Verse of each word, as sura × 1000 + ayah. */
  verseOf: Int32Array;
  /** Which letters each distinct word has (one bit a letter), to rule out far words quickly. */
  keyMask: Int32Array;
  altMask: Int32Array;
}

/** The letters of a word as bits. One edit changes at most two bits, so words whose bits
 *  differ in more than four places are more than two edits apart. */
function letterMask(word: string): number {
  let mask = 0;
  for (let i = 0; i < word.length; i++) mask |= 1 << ((word.charCodeAt(i) - 0x0621) & 31);
  return mask;
}

function bitCount(n: number): number {
  let x = n - ((n >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

const indexes = new WeakMap<QuranWords, Index>();

function buildIndex(words: QuranWords): Index {
  const ids = new Map<string, number>();
  const key: string[] = [];
  const alt: (string | null)[] = [];
  const loose: string[] = [];
  const counts: number[] = [];
  const wordVocab = new Int32Array(words.count);
  const verseOf = new Int32Array(words.count);
  const joined = new Map<string, number[]>();
  const partCount: number[] = [];
  for (let i = 0; i < words.count; i++) {
    const [k, a = null] = words.keys(i);
    const l = words.looseKey(i);
    const id = `${k}|${a ?? ''}|${l}`;
    let v = ids.get(id);
    if (v === undefined) {
      v = key.length;
      ids.set(id, v);
      key.push(k);
      alt.push(a);
      loose.push(l);
      counts.push(0);
      partCount.push(1);
    }
    counts[v]++;
    wordVocab[i] = v;
    const ref = words.ref(i);
    verseOf[i] = ref.sura * 1000 + ref.ayah;
    const parts = words.parts(i);
    if (parts && parts.length > 1 && parts.length <= MAX_PARTS) {
      const said = parts.join(' ');
      const list = joined.get(said) ?? [];
      if (!list.includes(v)) list.push(v);
      joined.set(said, list);
      partCount[v] = parts.length;
    }
  }
  return {
    key,
    alt,
    loose,
    freq: Int32Array.from(counts),
    wordVocab,
    joined,
    partCount: Int8Array.from(partCount),
    verseOf,
    keyMask: Int32Array.from(key, letterMask),
    altMask: Int32Array.from(alt, (a) => (a ? letterMask(a) : 0)),
  };
}

function indexFor(words: QuranWords): Index {
  let index = indexes.get(words);
  if (!index) {
    index = buildIndex(words);
    indexes.set(words, index);
  }
  return index;
}

interface QueryWord {
  key: string;
  loose: string;
  alike: string | null;
}

const ISTIADHA = ['اعوذ', 'بالله', 'من', 'الشيطان', 'الرجيم'];
const BASMALA = ['بسم', 'الله', 'الرحمن', 'الرحيم'];

/** How many of `prefix`'s words start `list`, in order (0 when fewer than `least`). */
function leading(list: QueryWord[], prefix: string[], least: number): number {
  let n = 0;
  while (n < prefix.length && n < list.length && list[n].key === prefix[n]) n++;
  return n >= least ? n : 0;
}

/**
 * Every word heard, as words to look for. Words said apart that are printed as one (يا أيها)
 * stay apart here: the line-up matches them with the printed word together. Joining them
 * here would also join them where the text has them apart (نذير مبين is one word in 71:2
 * and two everywhere else).
 */
function heardWords(text: string): QueryWord[] {
  const split = splitWords(text);
  // Room for an opening and the query said twice; anything past that is never searched.
  return split.keys
    .slice(0, ISTIADHA.length + BASMALA.length + 2 * MAX_QUERY_WORDS)
    .map((key, j) => ({ key, loose: split.loose[j], alike: split.alike[j] }));
}

/** The words with a leading isti'adha or basmala set aside, as many as are searched. */
function withoutOpening(heard: QueryWord[]): QueryWord[] {
  let list = heard;
  // "A'udhu billahi min ash-shaytan ir-rajim" before reciting isn't in the Qur'an.
  const istiadha = leading(list, ISTIADHA, 3);
  if (istiadha && list.length - istiadha >= 1) list = list.slice(istiadha);
  // The basmala before an ayah: search for the ayah (the basmala alone is still found).
  const basmala = leading(list, BASMALA, 4);
  if (basmala && list.length - basmala >= 2) list = list.slice(basmala);
  return list.slice(0, MAX_QUERY_WORDS);
}

/** The query as words to look for, a leading isti'adha or basmala set aside. */
export function queryWords(text: string): QueryWord[] {
  return withoutOpening(heardWords(text));
}

/** One word is the other with a و or ف in front ("and", "so"): often dropped or added when
 *  starting mid-ayah. */
function conjunctionOnly(a: string, b: string): boolean {
  if (a.length === b.length + 1) return (a[0] === 'و' || a[0] === 'ف') && a.slice(1) === b;
  if (b.length === a.length + 1) return (b[0] === 'و' || b[0] === 'ف') && b.slice(1) === a;
  return false;
}

/** How near two words are, from how many letters differ (0 when too far). */
function nearness(q: string, qMask: number, k: string, kMask: number): number {
  if (conjunctionOnly(q, k)) return CONJUNCTION;
  if (q.length < 3 || Math.abs(q.length - k.length) > 2 || bitCount(qMask ^ kMask) > 4) return 0;
  const d = editDistance(q, k, 2);
  const len = Math.max(q.length, k.length);
  if (d === 1 && len >= 4) return NEAR_ONE;
  if (d === 2 && len >= 7) return NEAR_TWO;
  return 0;
}

/** How well a query word matches each distinct word of the Qur'an (0: not at all, 1: exactly). */
function similarities(index: Index, q: QueryWord): Float32Array {
  const n = index.key.length;
  const out = new Float32Array(n);
  const qMask = letterMask(q.key);
  for (let v = 0; v < n; v++) {
    const k = index.key[v];
    const a = index.alt[v];
    if (q.key === k || q.key === a || q.loose === index.loose[v] || (q.alike != null && (q.alike === k || q.alike === a))) {
      out[v] = 1;
      continue;
    }
    let s = nearness(q.key, qMask, k, index.keyMask[v]);
    if (a && s < NEAR_ONE) s = Math.max(s, nearness(q.key, qMask, a, index.altMask[v]));
    out[v] = s;
  }
  return out;
}

/** A word's weight: rare words count fully, the commonest about a third. */
function weightOf(index: Index, sims: Float32Array): number {
  let exact = 0;
  let near = 0;
  for (let v = 0; v < sims.length; v++) {
    if (sims[v] === 1) exact += index.freq[v];
    else if (sims[v] > 0) near += index.freq[v];
  }
  const freq = exact || near;
  if (!freq) return 0.6;
  return Math.min(1, Math.max(0.35, 1.35 - 0.25 * Math.log10(1 + freq)));
}

/** The least share of the query a match must have, by query length. */
function minimumScore(n: number): number {
  return n <= 2 ? MIN_SHORT : MIN_LONG;
}

/** Two query words that are the same word (heard twice), or near enough when `near`. */
function sameWord(a: QueryWord, b: QueryWord, near: boolean): boolean {
  if (a.key === b.key || a.loose === b.loose) return true;
  if (!near) return false;
  return conjunctionOnly(a.key, b.key) || nearness(a.key, letterMask(a.key), b.key, letterMask(b.key)) >= NEAR_ONE;
}

/**
 * A phrase said again straight after itself, kept once. Speech recognition sometimes
 * repeats itself ("إياك نعبد وإياك نعبد وإياك نعبد…"), and reciters repeat a phrase to
 * get it right; the ayah is found from the phrase once.
 */
export function withoutRepeats<T extends QueryWord>(list: T[]): T[] {
  let out = list.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let p = 1; p <= Math.floor(out.length / 2) && !changed; p++) {
      for (let s = 0; s + 2 * p <= out.length; s++) {
        let same = true;
        // A phrase said again may be heard a little differently the second time. One word
        // must be the very same word: neighbours a letter apart are common in the text
        // (إنما أنا, 22:49).
        for (let k = 0; k < p && same; k++) same = sameWord(out[s + k], out[s + p + k], p > 1);
        // One word said twice is kept twice when it is short (لا لا, a real repetition in the text).
        if (same && (p > 1 || out[s].key.length >= 4)) {
          out = [...out.slice(0, s + p), ...out.slice(s + 2 * p)];
          changed = true;
          break;
        }
      }
    }
  }
  return out;
}

interface Found {
  start: number;
  end: number;
  /** Share of the query found, 0..1. */
  score: number;
}

/** The query lined up with the whole text: the matches good enough to show, best first, and
 *  which distinct words match some query word (`matches`). */
function align(words: QuranWords, index: Index, query: QueryWord[]): { found: Found[]; matches: Uint8Array } {
  const m = query.length;
  const V = index.key.length;
  const sim = new Float32Array(m * V);
  const weight = new Float32Array(m);
  let total = 0;
  for (let j = 0; j < m; j++) {
    const s = similarities(index, query[j]);
    sim.set(s, j * V);
    weight[j] = weightOf(index, s);
    total += weight[j];
  }

  // Each query word in turn is lined up with the text: the query must be used whole,
  // the text may be entered anywhere. Columns are positions in the Qur'an; score[j] is
  // the best line-up of the first j query words ending there, start[j] where it began.
  const N = words.count;
  let prev = new Float32Array(m + 1);
  let cur = new Float32Array(m + 1);
  let prevStart = new Int32Array(m + 1);
  let curStart = new Int32Array(m + 1);
  const floor = minimumScore(m) * total;
  // Distinct words that match some query word; the rest only cost.
  const matches = new Uint8Array(V);
  for (let j = 0; j < m; j++) for (let v = 0; v < V; v++) if (sim[j * V + v] > 0) matches[v] = 1;
  // Words printed as one that the query says as two or three (يا أيها): bit j of
  // joinedEnds[v] when query words j - partCount[v] … j - 1 together are word v.
  const joinedEnds = new Int32Array(V);
  for (let j = 2; j <= m; j++) {
    for (let k = 2; k <= Math.min(MAX_PARTS, j); k++) {
      const said = query.slice(j - k, j).map((w) => w.key).join(' ');
      for (const v of index.joined.get(said) ?? []) {
        if (index.partCount[v] !== k) continue;
        joinedEnds[v] |= 1 << j;
        matches[v] = 1;
      }
    }
  }
  // Weight of the first j query words.
  const before = new Float32Array(m + 1);
  for (let j = 1; j <= m; j++) before[j] = before[j - 1] + weight[j - 1];
  // The most the rest of the query can still add, after j words.
  const rest = new Float32Array(m + 1);
  for (let j = m - 1; j >= 0; j--) rest[j] = rest[j + 1] + weight[j];
  // Where no line-up can reach the floor any more, the scores are as good as "j words
  // substituted just now" (settled): stretches of the text that match nothing then
  // leave them so and are passed over without work.
  const settled = new Float32Array(m + 1);
  for (let j = 1; j <= m; j++) settled[j] = settled[j - 1] - SUBSTITUTE * weight[j - 1];
  let isSettled = false;
  const found: Found[] = [];
  for (let j = 1; j <= m; j++) {
    prev[j] = prev[j - 1] - UNMATCHED * weight[j - 1];
    prevStart[j] = 0;
  }
  for (let i = 1; i <= N; i++) {
    const v = index.wordVocab[i - 1];
    if (isSettled) {
      if (!matches[v]) continue;
      for (let j = 0; j <= m; j++) {
        prev[j] = settled[j];
        prevStart[j] = Math.max(0, i - 1 - j);
      }
      isSettled = false;
    }
    cur[0] = 0;
    curStart[0] = i;
    let alive = false;
    const ends = joinedEnds[v];
    for (let j = 1; j <= m; j++) {
      const w = weight[j - 1];
      const s = sim[(j - 1) * V + v];
      let best = prev[j - 1] + (s > 0 ? w * s : -SUBSTITUTE * w);
      let from = prevStart[j - 1];
      // Two or three query words that are this one printed word, together.
      if (ends & (1 << j)) {
        const k = index.partCount[v];
        const together = prev[j - k] + before[j] - before[j - k];
        if (together > best) {
          best = together;
          from = prevStart[j - k];
        }
      }
      // A query word not in the text (added, or misheard beyond recognition).
      const unmatched = cur[j - 1] - UNMATCHED * w;
      if (unmatched > best) {
        best = unmatched;
        from = curStart[j - 1];
      }
      // A word of the text not heard (left out, or missed by recognition).
      const skipped = prev[j] - SKIPPED;
      if (skipped > best) {
        best = skipped;
        from = prevStart[j];
      }
      cur[j] = best;
      curStart[j] = from;
      if (best + rest[j] >= floor) alive = true;
    }
    if (cur[m] >= floor) found.push({ start: curStart[m], end: i, score: Math.min(1, cur[m] / total) });
    [prev, cur] = [cur, prev];
    [prevStart, curStart] = [curStart, prevStart];
    if (!alive && i >= m) isSettled = true;
  }

  // The best end of each match (one phrase is found at several ends as words are
  // skipped after it); then the best overall, and those close to it.
  found.sort((a, b) => b.score - a.score || a.start - b.start);
  const taken: Found[] = [];
  for (const f of found) {
    if (taken.some((t) => f.start < t.end && t.start < f.end)) continue;
    taken.push(f);
  }
  const best = taken.length ? taken[0].score : 0;
  const keep = best >= EXACT ? CLOSE_TO_EXACT : Math.max(minimumScore(m), best - CLOSE);
  const kept = taken.filter((t) => t.score >= keep - 1e-6);
  kept.sort((a, b) => {
    const exactA = a.score >= EXACT ? 1 : 0;
    const exactB = b.score >= EXACT ? 1 : 0;
    return exactB - exactA || b.score - a.score || a.start - b.start;
  });
  return { found: kept, matches };
}

/**
 * Ayat that hold `text` (Arabic, as typed or as speech recognition wrote it), best first,
 * then in mushaf order. Each match is reported once, at the ayah it starts in; a phrase
 * that runs on into the next ayah (or more) says where it ends (`last`).
 *
 * When nothing is found, the first or last word is left out and it looks again: speech
 * recognition often gets the word cut off at either end wrong.
 */
export function searchText(words: QuranWords, text: string, limit = 50): TextSearchResult {
  const index = indexFor(words);
  const heard = heardWords(text);
  const said = withoutOpening(heard);
  if (said.length === 0) return { hits: [], total: 0, words: [] };
  // Repeats are folded after the opening is set aside, and before: a basmala and the ayah
  // after it, said twice, leave the second basmala in the middle of what's left, which then
  // no longer looks like a repeat (the Fatihah from its start, said twice). The fewer words
  // left is searched.
  const after = withoutRepeats(said);
  const before = withoutOpening(withoutRepeats(heard));
  const once = before.length < after.length ? before : after;
  // Words said twice that the text itself has twice (ليلة القدر ليلة القدر, 97:2–3; لم يلد
  // ولم يولد, 112:3) are found as said; a repeat that isn't in the text is searched once.
  if (once.length < said.length) {
    const asSaid = align(words, index, said);
    if (asSaid.found.length > 0 && asSaid.found[0].score >= EXACT) return resultOf(index, said, asSaid, 1, limit);
  }
  const m = once.length;
  const tries: QueryWord[][] = [once];
  if (m >= 3) tries.push(once.slice(0, -1), once.slice(1));
  if (m >= 4) tries.push(once.slice(1, -1));
  for (const q of tries) {
    const aligned = align(words, index, q);
    if (aligned.found.length === 0) continue;
    // A shorter query found the place; its score still counts the words left out.
    return resultOf(index, q, aligned, q === once ? 1 : q.length / m, limit);
  }
  return { hits: [], total: 0, words: once.map((w) => w.key) };
}

/** The matches as ayat: where each starts and ends, from the first word matched to the last. */
function resultOf(
  index: Index,
  query: QueryWord[],
  { found, matches }: { found: Found[]; matches: Uint8Array },
  scale: number,
  limit: number,
): TextSearchResult {
  const hits = found.slice(0, limit).map((t): VerseHit => {
    // The line-up may begin or end on a word that didn't match: the match is the words between.
    let first = t.start;
    while (first < t.end - 1 && !matches[index.wordVocab[first]]) first++;
    let last = t.end - 1;
    while (last > first && !matches[index.wordVocab[last]]) last--;
    const verse = index.verseOf[first];
    const end = index.verseOf[last];
    return {
      sura: Math.floor(verse / 1000),
      ayah: verse % 1000,
      last: { sura: Math.floor(end / 1000), ayah: end % 1000 },
      from: first,
      to: last + 1,
      score: t.score * scale,
    };
  });
  return { hits, total: found.length, words: query.map((w) => w.key) };
}

/** Which words of [from, to) were matched, for highlighting (by QuranWords number). */
export function matchedWords(words: QuranWords, hit: VerseHit, query: string[]): Set<number> {
  const index = indexFor(words);
  const set = new Set<number>();
  const keys = new Set(query);
  // Words printed as one that the query said apart (يا أيها).
  const joined = new Set<number>();
  for (let k = 2; k <= MAX_PARTS; k++) {
    for (let j = 0; j + k <= query.length; j++) for (const v of index.joined.get(query.slice(j, j + k).join(' ')) ?? []) joined.add(v);
  }
  for (let i = hit.from; i < hit.to; i++) {
    const v = index.wordVocab[i];
    const k = index.key[v];
    const a = index.alt[v];
    if (keys.has(k) || (a && keys.has(a)) || joined.has(v)) {
      set.add(i);
      continue;
    }
    for (const q of query) {
      if (q.length >= 3 && Math.abs(q.length - k.length) <= 1 && editDistance(q, k, 1) <= 1 && Math.max(q.length, k.length) >= 4) {
        set.add(i);
        break;
      }
    }
  }
  return set;
}

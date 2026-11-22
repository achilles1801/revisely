// "Your recitation" on a mark's card plays the phrase the mistake is in (pure; Revisely Dev, RECITE-10). Majd, Nov 21
// 2026: "the playback should be 'smart' it should know based on where and what the mistake is, what exactly and how
// much of the recording they need to playback in order to benefit". Before, it was the mark's second alone (0.6 s before
// to 0.4 s after), which cut the word out of what was said around it.
//
// - The phrase: from the word after the last pause mark before the mistake (or the ayah's start) to the next word
//   that carries one, the mistake's own included (or the ayah's end). Every pause mark ends a phrase but ۙ (don't stop).
//   Never past its ayah.
// - A short ayah (SHORT_WORDS words or fewer, or SHORT_SECONDS or less in the take) plays whole.
// - At most MAX_SECONDS: a longer phrase is the mistake with WORDS_BEFORE words before and WORDS_AFTER after it.
// - The times are when the cursor first reached each word, which it does about AT_LAG after the word starts
//   (recite-contract.md, `at`). The clip starts LEAD before the phrase's first word and ends TAIL after its last (the
//   word after it reached, or the take's end).
// - A skipped word: the phrase around where it should have been, from the word before it at least (so the jump is
//   heard); a whole phrase skipped, across where it should have been. An extra word: the phrase of the word it came after (the clip ends when the cursor reached the word after, so
//   what was added is in it).
//
// The pause marks are src/data/quranWaqf.json (scripts/build-quran-waqf.py, from Tanzil's Uthmani text).

import type { QuranWords } from '../recite/quranWords';
import type { Mark } from './contract';

export const SHORT_WORDS = 12;
export const SHORT_SECONDS = 8;
export const MAX_SECONDS = 15;
export const WORDS_BEFORE = 4;
export const WORDS_AFTER = 3;
/** The cursor reaches a word about this long after it starts (the lab's median). */
export const AT_LAG = 0.45;
/** Before the phrase's first word starts, and after its last ends. */
export const LEAD = 0.3;
export const TAIL = 0.5;
/** How far past the phrase to look for a word the cursor reached (the next one may have been skipped). */
const LOOK_AHEAD = 4;
/** Around a phrase the cursor never reached: how far to look for a word it did, and how long a side with none is. */
const LOOK_AROUND = 40;
const AROUND = 2;

interface WaqfFile {
  kinds: string;
  stops: number[];
}

/** The pause mark that is not a stop: ۙ (don't stop here). */
const NO_STOP = 'ۙ';

let marks: Map<number, string> | null = null;

/** The pause mark after word `w` (ۖ ۗ ۚ ۛ ۘ ۙ ۜ), or null. */
export function pauseAfter(w: number): string | null {
  if (!marks) {
    const file = require('../../data/quranWaqf.json') as WaqfFile;
    marks = new Map();
    for (let i = 0; i + 1 < file.stops.length; i += 2) marks.set(file.stops[i], file.kinds[file.stops[i + 1]]);
  }
  return marks.get(w) ?? null;
}

/** Whether a phrase ends at word `w`: it carries a pause mark that allows a stop. */
export const endsPhrase = (w: number): boolean => {
  const m = pauseAfter(w);
  return m != null && m !== NO_STOP;
};

/** The phrase word `w` is in, as its first and last word: within its ayah, between pause marks. */
export function phraseOf(words: QuranWords, w: number): [number, number] {
  const r = words.ref(w);
  const [a0, a1] = words.verseRange(r.sura, r.ayah);
  let first = a0;
  for (let i = w - 1; i >= a0; i--) {
    if (endsPhrase(i)) {
      first = i + 1;
      break;
    }
  }
  let last = a1 - 1;
  for (let i = w; i < a1; i++) {
    if (endsPhrase(i)) {
      last = i;
      break;
    }
  }
  return [first, last];
}

/** Seconds of the take from words [first, last]: the first time the cursor reached in them to when it reached past them. */
function span(first: number, last: number, timeOf: (w: number) => number | null, takeEnd: number): [number, number] | null {
  let start: number | null = null;
  for (let i = first; i <= last && start == null; i++) start = timeOf(i);
  if (start == null) return null;
  let next: number | null = null;
  for (let i = last + 1; i <= last + LOOK_AHEAD && next == null; i++) next = timeOf(i);
  const from = Math.max(0, start - AT_LAG - LEAD);
  const to = Math.min(takeEnd, next != null ? next - AT_LAG + TAIL : takeEnd);
  return to > from ? [from, to] : null;
}

/**
 * The part of the take "Your recitation" plays for mark `m`, in seconds: the phrase the mistake is in (whole for a short
 * ayah), at most MAX_SECONDS. `timeOf` is when the cursor first reached a word, `takeEnd` how much of the take is held.
 * When the cursor never reached the phrase: the mark's own second, when it has one, as before, else across where it
 * should have been. Null when the cursor reached nothing near it.
 */
export function clipRange(
  words: QuranWords,
  m: Mark,
  timeOf: (w: number) => number | null,
  takeEnd: number,
): [number, number] | null {
  const own: [number, number] | null = m.t ? [Math.max(0, m.t[0] - 0.6), Math.min(takeEnd, m.t[1] + 0.4)] : null;
  const r = words.ref(m.w);
  const [a0, a1] = words.verseRange(r.sura, r.ayah);
  const ayah = span(a0, a1 - 1, timeOf, takeEnd);
  let range: [number, number] | null;
  // The ayah's own length in the take (its clip less the room before and after).
  const recited = ayah ? ayah[1] - ayah[0] - LEAD - TAIL : Infinity;
  if (ayah && (a1 - a0 <= SHORT_WORDS || recited <= SHORT_SECONDS) && ayah[1] - ayah[0] <= MAX_SECONDS) range = ayah;
  else {
    const [first, last] = phraseOf(words, m.w);
    range = span(first, last, timeOf, takeEnd);
    if (range && range[1] - range[0] > MAX_SECONDS) {
      range = span(Math.max(first, m.w - WORDS_BEFORE), Math.min(last, m.w + WORDS_AFTER), timeOf, takeEnd);
    }
  }
  // Still too long (words the cursor never reached in between), or the mistake isn't in it (the reciter started the
  // ayah again: the times are when the cursor first reached each word): around the mark's own second.
  if (!range || range[1] - range[0] > MAX_SECONDS || (m.t && (m.t[0] < range[0] || m.t[1] > range[1]))) {
    if (own) return own;
    if (range && range[1] - range[0] > MAX_SECONDS) {
      const at = momentOf(m.w, timeOf) ?? range[0];
      return [Math.max(range[0], at - MAX_SECONDS / 2), Math.min(range[1], at + MAX_SECONDS / 2)];
    }
  }
  if (!range) return across(m.w, timeOf, takeEnd);
  // A skipped word the clip would start after (the first of its phrase or ayah): from the last word reached before it,
  // so the jump over it is heard.
  if (timeOf(m.w) == null) {
    const [prev] = heardAround(m.w, timeOf);
    const from = prev != null ? Math.max(0, prev - AT_LAG - LEAD) : null;
    if (from != null && from < range[0]) range = [from, Math.min(range[1], from + MAX_SECONDS)];
  }
  return range;
}

/** The nearest words either side of `w` the cursor reached: their times (null for a side with none). */
function heardAround(w: number, timeOf: (w: number) => number | null): [number | null, number | null] {
  let prev: number | null = null;
  let next: number | null = null;
  for (let i = w - 1; i >= Math.max(0, w - LOOK_AROUND) && prev == null; i--) prev = timeOf(i);
  for (let i = w + 1; i <= w + LOOK_AROUND && next == null; i++) next = timeOf(i);
  return [prev, next];
}

/** When word `w` was said: when the cursor reached it, or (skipped) halfway between the words reached either side. */
function momentOf(w: number, timeOf: (w: number) => number | null): number | null {
  const own = timeOf(w);
  if (own != null) return own;
  const [prev, next] = heardAround(w, timeOf);
  return prev != null && next != null ? (prev + next) / 2 : prev ?? next;
}

/**
 * A phrase the cursor never reached (a skipped ayah, Alif Lam Mim): across where it should have been, from the last word
 * it reached before to the first after (or the 2 s on the side it has), the end kept when that is too long.
 */
function across(w: number, timeOf: (w: number) => number | null, takeEnd: number): [number, number] | null {
  const [prev, next] = heardAround(w, timeOf);
  if (prev == null && next == null) return null;
  const end = Math.min(takeEnd, next != null ? next - AT_LAG + TAIL : prev! + AROUND);
  const start = Math.max(0, prev != null ? prev - AT_LAG - LEAD : next! - AT_LAG - LEAD - AROUND, end - MAX_SECONDS);
  return end > start ? [start, end] : null;
}

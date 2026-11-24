// The bottom line from the checker's `word` frames (RECITE-29; Majd, Nov 24 2026: "It should just be exactly what is that
// user saying", "the word is only getting written down in the text when the word finishes"). Pure, but for the switch.
//
// Each frame is one visit to a word on the checker's path, so a word said twice is two entries and going back shows as
// said. The line is in the order said: by each visit's first sample, never by its id (the path can add an earlier
// visit late: a, a + 2, then a + 1).

import type { LiveEvent, Mark } from './contract';

/**
 * Whether takes ask for `word` frames. Off for everyone until the checker's frames are on Dev and the lead has seen the
 * bars (recite-word-frame-spec.md); with it off the start frame is as it was and the bar is RECITE-28's.
 */
let lineOn = false;
export const wordLineOn = (): boolean => lineOn;
/** Tests turn it on (and off again with no argument). */
export function setWordLineForTests(on = false): void {
  lineOn = on;
}

/** One visit to a word, as the checker sent it. */
export interface WordVisit {
  w: number;
  /** Its id within `epoch` (for `unword`). */
  v: number;
  /** Its first and last sound, in samples of the take's audio. */
  s: number;
  e: number;
  /** Which connection's numbering `v` is in: another instance's re-check counts from 0 again. */
  epoch: number;
  /** Not heard as the page's word: not written until `settled` or a mark names it. */
  sub: boolean;
  /** `said` has passed it since it came, with no mark needed. */
  settled: boolean;
}

/** The same word over any of the same samples is the same visit (its edges move, and a resume sends it again). */
const sameVisit = (x: WordVisit, w: number, s: number, e: number) => x.w === w && x.s <= e && s <= x.e;

/** The line with this visit in its place, by first sample. */
export function withVisit(visits: readonly WordVisit[], e: Extract<LiveEvent, { type: 'word' }>, epoch: number): WordVisit[] {
  const had = visits.find((x) => sameVisit(x, e.w, e.s, e.e));
  const entry: WordVisit = { w: e.w, v: e.v, s: e.s, e: e.e, epoch, sub: e.sub === true, settled: had?.settled ?? false };
  const rest = had ? visits.filter((x) => x !== had) : [...visits];
  const at = rest.findIndex((x) => x.s > entry.s);
  if (at < 0) rest.push(entry);
  else rest.splice(at, 0, entry);
  return rest;
}

/** Without visit `v` of this connection (a visit from before a re-check is final). */
export const withoutVisit = (visits: readonly WordVisit[], v: number, epoch: number): WordVisit[] =>
  visits.filter((x) => !(x.epoch === epoch && x.v === v));

/** `said` reached `upTo`: a held visit up to there was passed unmarked, unless a mark names it. */
export function settledUpTo(visits: readonly WordVisit[], upTo: number): readonly WordVisit[] {
  if (!visits.some((x) => x.sub && !x.settled && x.w <= upTo)) return visits;
  return visits.map((x) => (x.sub && !x.settled && x.w <= upTo ? { ...x, settled: true } : x));
}

/**
 * Each mark's visit: the one its time falls in (a word said twice has two), or else the word's latest. Marks on a word
 * with no visit aren't on the line.
 */
export function marksByVisit(visits: readonly WordVisit[], marks: readonly Mark[], sampleRate: number): Map<WordVisit, Mark[]> {
  const out = new Map<WordVisit, Mark[]>();
  for (const m of marks) {
    const same = visits.filter((x) => x.w === m.w);
    if (same.length === 0) continue;
    const at = m.t ? same.find((x) => x.s / sampleRate <= m.t![1] && m.t![0] <= x.e / sampleRate) : undefined;
    const visit = at ?? same[same.length - 1];
    out.set(visit, [...(out.get(visit) ?? []), m]);
  }
  return out;
}

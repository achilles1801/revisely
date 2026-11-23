// What's new 1.0.5, card 1 as a moment (components/whatsNew/ReciteMoment; the orchestrator's yes, Nov 17 2026): a take
// on Al-Mulk 1–2 plays by itself. The reader listens, the page follows the reciter word by word, its marks land as the
// reciter passes their words (a wrong word, a haraka slip, and a tajweed note where Strict is offered), the score falls
// by what counts (never the tajweed note: RECITE-2), then the card's words. This is its clock (pure): what shows at any moment.

import { countsAsMistake, type Mark } from '../reciteLive/contract';

/** Listening before the reciter is found (RECITE-1: nothing shows until then). */
export const LISTEN_MS = 900;
/** One word recited. */
export const WORD_MS = 230;
/** The last word to the card's words. */
export const END_PAUSE_MS = 1100;
/** Each counted mistake's share of the score in the moment (an example: it ends at 94%). */
export const MISTAKE_POINTS = 3;

export type MomentCaption = 'listening' | 'follows' | 'marks';

export interface MomentFrame {
  /** The word being said; null while it listens. */
  cursor: number | null;
  /** The marks landed so far. */
  marks: Mark[];
  /** The score shown, in percent. */
  score: number;
  caption: MomentCaption;
  /** The take is over: the card's words and Next show. */
  ended: boolean;
}

export interface MomentTake {
  /** The words in the order recited. */
  order: number[];
  marks: Mark[];
}

/** How long the moment plays before its words. */
export const momentLength = (take: MomentTake): number => LISTEN_MS + take.order.length * WORD_MS + END_PAUSE_MS;

/** What shows `t` ms in (and at its end from then on: Skip, Reduce Motion and VoiceOver go straight there). */
export function momentAt(t: number, take: MomentTake): MomentFrame {
  if (t < LISTEN_MS) return { cursor: null, marks: [], score: 100, caption: 'listening', ended: false };
  const at = Math.min(take.order.length - 1, Math.floor((t - LISTEN_MS) / WORD_MS));
  const passed = new Set(take.order.slice(0, at + 1));
  const marks = take.marks.filter((m) => passed.has(m.w));
  const score = 100 - MISTAKE_POINTS * marks.filter(countsAsMistake).length;
  return {
    cursor: take.order[at],
    marks,
    score,
    caption: marks.length > 0 ? 'marks' : 'follows',
    ended: t >= momentLength(take),
  };
}

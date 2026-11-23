// A take's record from its live state once the checker's final answer is in (pure).

import type { QuranWords } from '../recite/quranWords';
import { pageAccuracy } from '../reciteLive/score';
import { furthestWord, LiveState, marksInOrder, mistakeCount, removedMarks } from '../reciteLive/state';
import { countsAsMistake, isUnclear } from '../reciteLive/contract';
import type { WhereAnswer } from '../reciteLive/where';
import { MAX_LINKS, MAX_MARKS, MAX_PASSED, MAX_PEEKED, MAX_REMOVED, TakeLevel, TakeRecord } from './record';

export interface TakeContext {
  id: string;
  createdAt: number;
  rev: number;
  day: string;
  level: TakeLevel;
  hidden: boolean;
  secs: number;
  recordingId: string | null;
  /** When the take reached a word (seconds into it), for the words that had a remembered mistake. */
  timeOf: (w: number) => number | null;
  /** Those words. */
  openWords: (from: number, to: number) => number[];
  /** A recitation longer than the checker's cap: its takes, each one's id and first word (RECITE-22). */
  links?: Array<{ take: string | null; from: number }> | null;
  /** The words shown by hand during the take (RMEM-8): kept for its summary later. */
  peeked?: ReadonlySet<number> | null;
  /** The take ran on the phone's engine. */
  ranWhere?: WhereAnswer | null;
}

/**
 * The record of a finished take with Mark mistakes, or null when there's nothing to remember: no final answer yet, or
 * the checker never found where the reciter started (nothing was recited that it could place).
 */
export function recordFromTake(state: LiveState, words: QuranWords, ctx: TakeContext): TakeRecord | null {
  if (state.status !== 'done' || !state.final) return null;
  const from = state.start ?? state.final.start ?? null;
  if (from == null) return null;
  const marks = marksInOrder(state);
  const markEnd = marks.reduce((x, m) => Math.max(x, m.w), from);
  const to = Math.max(furthestWord(state) ?? from, markEnd, from);
  const mistakes = mistakeCount(state);
  const unclear = state.score?.unclear ?? marks.filter(isUnclear).length;
  const tajweed = state.score?.tajweed ?? marks.filter((m) => !countsAsMistake(m)).length;
  const passed: Array<{ w: number; t: number }> = [];
  for (const w of ctx.openWords(from, to)) {
    const t = ctx.timeOf(w);
    if (t != null) passed.push({ w, t: Math.round(t * 100) / 100 });
  }
  return {
    id: ctx.id,
    kind: 'take',
    take: state.take,
    createdAt: ctx.createdAt,
    rev: ctx.rev,
    day: ctx.day,
    level: ctx.level,
    hidden: ctx.hidden,
    from,
    to,
    secs: Math.round(ctx.secs),
    mistakes,
    tajweed,
    unclear,
    accuracy: pageAccuracy(words, mistakes, from, to),
    marks: marks.slice(0, MAX_MARKS),
    passed: passed.slice(0, MAX_PASSED),
    recordingId: ctx.recordingId,
    // No final answer came (lib/reciteLive/state `settleUnfinished`): what the take found before it.
    ...(state.final.unfinished ? { unfinished: true } : {}),
    ...(ctx.ranWhere ? { ranOn: ctx.ranWhere.on, ranWhy: ctx.ranWhere.why } : {}),
    ...(ctx.links && ctx.links.length > 1 ? { links: ctx.links.slice(0, MAX_LINKS) } : {}),
    // What its summary showed, for when it is opened again (RMEM-8): the words peeked, and the marks called Not a
    // mistake, so they can still be put back.
    ...peekedOf(ctx.peeked),
    ...removedOf(state),
  };
}

function peekedOf(peeked: ReadonlySet<number> | null | undefined): { peeked?: number[] } {
  if (!peeked || peeked.size === 0) return {};
  return { peeked: [...peeked].sort((a, b) => a - b).slice(0, MAX_PEEKED) };
}

function removedOf(state: LiveState): { removed?: TakeRecord['removed'] } {
  const removed = removedMarks(state);
  return removed.length ? { removed: removed.slice(0, MAX_REMOVED) } : {};
}

/** Whether two versions of a take's record say the same (its version stamp aside): nothing to write again. */
export function sameTake(a: TakeRecord | null, b: TakeRecord | null): boolean {
  if (!a || !b) return a === b;
  return JSON.stringify({ ...a, rev: 0 }) === JSON.stringify({ ...b, rev: 0 });
}

// A take's record from its live state once the checker's final answer is in (pure).

import type { QuranWords } from '../recite/quranWords';
import { pageAccuracy } from '../reciteLive/score';
import { furthestWord, LiveState, marksInOrder, mistakeCount } from '../reciteLive/state';
import { countsAsMistake, isUnclear } from '../reciteLive/contract';
import { MAX_MARKS, MAX_PASSED, TakeLevel, TakeRecord } from './record';

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
  };
}

/** Whether two versions of a take's record say the same (its version stamp aside): nothing to write again. */
export function sameTake(a: TakeRecord | null, b: TakeRecord | null): boolean {
  if (!a || !b) return a === b;
  return JSON.stringify({ ...a, rev: 0 }) === JSON.stringify({ ...b, rev: 0 });
}

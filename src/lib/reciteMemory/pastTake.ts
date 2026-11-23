// A finished take's summary opened again from its record (pure; RMEM-8, Revisely Dev). Majd, Nov 22 2026: "make that take
// card clickable and have it open that days summary popup sheet". What the summary needs that the record holds, and
// Not a mistake and Put back on a kept take.

import type { QuranWords } from '../recite/quranWords';
import { countsAsMistake, isUnclear, type Mark } from '../reciteLive/contract';
import { formatAccuracy, pageAccuracy, scoreLevel, type ScoreLevel } from '../reciteLive/score';
import { clearedBy } from './memory';
import { comparableTakes, passageTakes, progressLine } from './progress';
import { MAX_REMOVED, type MemoryRecord, type TakeRecord } from './record';
import { takeWhen } from './describe';
import { t } from '../../i18n';

/**
 * A take kept without its final answer whose audio is all there is (RECITE-12) was never checked: no checker's take id
 * and no marks. Its summary shows no score.
 */
export function wasChecked(take: TakeRecord): boolean {
  return !(take.unfinished && take.take == null && take.marks.length === 0);
}

/** The score pill as the summary showed it: by the page, with its colour; none for a take never checked. */
export function pastScore(take: TakeRecord): { text: string; level: ScoreLevel } | null {
  return wasChecked(take) ? { text: formatAccuracy(take.accuracy), level: scoreLevel(take.accuracy) } : null;
}

/** When the take was, for the summary's head: "Yesterday, 9:41 PM", with "page hidden" when it was. */
export function pastWhen(take: TakeRecord, now: number): string {
  return [takeWhen(take.createdAt, now, true), take.hidden ? t('reciteMemory.rows.pageHidden') : null].filter(Boolean).join(' · '); // i18n-ignore (the rows' separator)
}

/**
 * Its summary's memory as it stood when the take ended: the words it cleared, and the passage's trend over the takes up
 * to and including it (a later take of the passage isn't this take's progress). `sameStretch`: only the takes of the same
 * stretch count (RMEM-7).
 */
export function pastMemory(
  records: readonly MemoryRecord[],
  take: TakeRecord,
  words: QuranWords,
  now: number,
  sameStretch: boolean,
): { cleared: string[]; trend: number[]; line: string | null } {
  const upTo = records.filter((r) => r.id === take.id || r.createdAt <= take.createdAt);
  const here = passageTakes(upTo, take.from, take.to);
  const takes = sameStretch ? comparableTakes(here, take.from, take.to) : here;
  return {
    cleared: clearedBy(records, take).map((m) => words.uthmani(m.w)),
    trend: takes.map((x) => x.accuracy),
    line: progressLine(takes, now),
  };
}

const KIND_ORDER: Record<Mark['kind'], number> = { word: 0, skipped: 1, added: 2, harakat: 3, letter: 4, tajweed: 5 };
/** Mushaf order, a word's own marks before a tajweed note on it (as a take's record keeps them). */
const inOrder = (a: Mark, b: Mark) => a.w - b.w || KIND_ORDER[a.kind] - KIND_ORDER[b.kind];

/** What one mark adds to a take's counts: a mistake (Not clear never), a tajweed note, a Not clear. */
function counts(m: Mark): { mistakes: number; tajweed: number; unclear: number } {
  const unclear = isUnclear(m);
  return { mistakes: countsAsMistake(m) && !unclear ? 1 : 0, tajweed: m.kind === 'tajweed' ? 1 : 0, unclear: unclear ? 1 : 0 };
}

/**
 * Not a mistake on a kept take's mark (its card, shown on the page): the take without it, its counts and score with it,
 * and the mark listed apart so its summary can put it back. Null when the take has no such mark.
 */
export function withoutMark(take: TakeRecord, id: string, words: QuranWords, now: number): TakeRecord | null {
  const m = take.marks.find((x) => x.id === id);
  if (!m) return null;
  const c = counts(m);
  const mistakes = Math.max(0, take.mistakes - c.mistakes);
  return {
    ...take,
    marks: take.marks.filter((x) => x.id !== id),
    removed: [...(take.removed ?? []).filter((x) => x.id !== id), m].sort(inOrder).slice(-MAX_REMOVED),
    mistakes,
    tajweed: Math.max(0, take.tajweed - c.tajweed),
    unclear: Math.max(0, take.unclear - c.unclear),
    accuracy: pageAccuracy(words, mistakes, take.from, take.to),
    rev: now,
  };
}

/** Put back from a kept take's summary: the mark is the take's again, counted as it was. Null when it isn't listed. */
export function withMarkBack(take: TakeRecord, id: string, words: QuranWords, now: number): TakeRecord | null {
  const m = take.removed?.find((x) => x.id === id);
  if (!m) return null;
  const c = counts(m);
  const mistakes = take.mistakes + c.mistakes;
  const removed = (take.removed ?? []).filter((x) => x.id !== id);
  const next: TakeRecord = {
    ...take,
    marks: [...take.marks.filter((x) => x.id !== id), m].sort(inOrder),
    mistakes,
    tajweed: take.tajweed + c.tajweed,
    unclear: take.unclear + c.unclear,
    accuracy: pageAccuracy(words, mistakes, take.from, take.to),
    rev: now,
  };
  if (removed.length) next.removed = removed;
  else delete next.removed;
  return next;
}

// What a user's recitation shows over time (pure; Revisely Dev): the figures behind Insights' Recitation section and
// Revo's summary, from the takes Recite memory keeps on the account (lib/reciteMemory). Nothing new is recorded.
//
// Only marks the checker made are counted, never anything inferred: going back to restart an ayah is never a mark, so it
// is never a mistake here either. "Not clear" (a haraka or letter heard only past the normal bar) and tajweed notes are
// counted apart, never as mistakes (recite-contract.md, the score). Words and similar-ayah slips come before harakat
// (Majd, Nov 14 2026: those are what memorizers slip on), so a passage's wrong words rank it before its harakat slips.

import { shiftDay } from '../journal';
import { countsAsMistake, GROUP_RANK, isUnclear, Mark, MarkGroup, MarkKind } from '../reciteLive/contract';
import { CLEAR_AFTER, wordMemories, WordMemory } from '../reciteMemory/memory';
import type { ClearRecord, MemoryRecord, TakeRecord } from '../reciteMemory/record';

/** The window Insights and Revo look back over: the last 4 weeks of revision days, today included. */
export const WINDOW_DAYS = 28;
/** The weeks the score is drawn for, the current one last. */
export const WEEKS = 8;

/** Mistakes by kind, as the take's summary counts them (never Not clear, never tajweed). */
export interface MistakeKinds {
  /** A wrong word (a look-alike, a sound, replaced, out of order). */
  wrong: number;
  skipped: number;
  /** An extra word. */
  added: number;
  harakat: number;
  letter: number;
}

export const NO_KINDS: Readonly<MistakeKinds> = { wrong: 0, skipped: 0, added: 0, harakat: 0, letter: 0 };

/** Which mistake a mark counts as, or null when it isn't one (Not clear, a tajweed note). */
export function mistakeKindOf(m: Pick<Mark, 'kind' | 'sure'>): keyof MistakeKinds | null {
  if (!countsAsMistake(m) || isUnclear(m)) return null;
  switch (m.kind) {
    case 'word':
      return 'wrong';
    case 'skipped':
      return 'skipped';
    case 'added':
      return 'added';
    case 'harakat':
      return 'harakat';
    case 'letter':
      return 'letter';
    default:
      return null;
  }
}

/** The account's takes, oldest first (forgotten ones and Clear now records left out). */
export function liveTakes(records: readonly MemoryRecord[]): TakeRecord[] {
  return records
    .filter((r): r is TakeRecord => r.kind === 'take' && !r.deleted)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** The words a take recited: from the first word it placed to the furthest it reached. */
export const wordsOf = (t: Pick<TakeRecord, 'from' | 'to'>): number => Math.max(0, t.to - t.from + 1);

/**
 * The takes' score: each take's own score (by the page, as its row shows it) weighted by the words it recited, so a long
 * take counts for more than a line and the figure always lies between the scores the rows show. Null with no takes.
 */
export function meanScore(takes: readonly Pick<TakeRecord, 'from' | 'to' | 'accuracy'>[]): number | null {
  let words = 0;
  let sum = 0;
  for (const t of takes) {
    const n = wordsOf(t);
    words += n;
    sum += n * t.accuracy;
  }
  return words > 0 ? sum / words : null;
}

export interface WeekScore {
  /** The week's last revision day (the last week ends today). */
  to: string;
  takes: number;
  words: number;
  score: number | null;
}

/** The score week by week, oldest first, the last week ending `today`. */
export function weekScores(takes: readonly TakeRecord[], today: string, weeks = WEEKS): WeekScore[] {
  const out: WeekScore[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const to = shiftDay(today, -7 * i);
    const from = shiftDay(to, -6);
    const these = takes.filter((t) => t.day >= from && t.day <= to);
    out.push({ to, takes: these.length, words: these.reduce((n, t) => n + wordsOf(t), 0), score: meanScore(these) });
  }
  return out;
}

/** A word still marked on the page: its most severe open mark (a tajweed note never stands in for a wrong word). */
export interface MarkedWord {
  w: number;
  group: MarkGroup;
  kind: MarkKind;
  ayah: [number, number];
}

/** A run of neighbouring ayat with words still marked: what "keeps slipping" lists. */
export interface SlippingPassage {
  sura: number;
  /** Its first and last ayah. */
  from: number;
  to: number;
  /** The words still marked there, in mushaf order (wrong words and harakat or letter slips; tajweed apart). */
  words: MarkedWord[];
  /** How many of them are wrong, skipped or extra words. */
  wordMistakes: number;
  /** Takes that got any of them wrong, and takes that reached any of them (all time, as the word's card counts). */
  wrong: number;
  tries: number;
  /** The revision day of the latest take that recited any of them (whether or not it was a try at them). */
  lastDay: string;
}

/** A slip into a similar ayah (the checker's `into`): where it happened and where the reciter went on. */
export interface SimilarSlip {
  /** The ayah being recited. */
  from: [number, number];
  /** The ayah gone on with, or whose ending was used (`ending`). */
  into: [number, number];
  ending: boolean;
  /** Times in the window. */
  times: number;
  lastDay: string;
  /** Other ayat with the same words as far as was heard (the latest time). */
  also: number;
}

export interface ClearedWord {
  w: number;
  group: MarkGroup;
  /** The revision day it cleared. */
  day: string;
  /** By Clear now, not by being said right on CLEAR_AFTER days. */
  byHand: boolean;
}

export interface RecitationInsights {
  /** The window: revision days `from`..`today`. */
  from: string;
  today: string;
  takes: number;
  /** Revision days with a take. */
  days: number;
  secs: number;
  /** Words recited (each take's from–to, added up). */
  words: number;
  /** Mistakes by kind, and their total. */
  kinds: MistakeKinds;
  mistakes: number;
  /** Not clear: never counted as mistakes. */
  unclear: number;
  /** Tajweed notes, from Strict takes only. */
  tajweed: number;
  strictTakes: number;
  /** The window's score, and the 4 weeks before it (for "up from"). */
  score: number | null;
  earlierScore: number | null;
  weeks: WeekScore[];
  /** Words still marked on the page now (wrong words and slips), and tajweed notes still marked. */
  stillMarked: number;
  stillMarkedTajweed: number;
  /** Words that cleared in the window, latest first. */
  cleared: ClearedWord[];
  /** Passages with words still marked, the most slipped first. */
  slipping: SlippingPassage[];
  /** Slips into similar ayat in the window, the most often first. */
  similar: SimilarSlip[];
  /** The latest take (any time), null with none. */
  last: TakeRecord | null;
}

const latest = (a: string, b: string) => (a > b ? a : b);

/** The day a cleared memory cleared, by Clear now or by its CLEAR_AFTER right days (null if it never opened). */
function clearedOn(m: WordMemory, clears: readonly ClearRecord[]): ClearedWord | null {
  if (m.open) return null;
  const lastWrong = [...m.attempts].reverse().find((a) => !a.right);
  if (!lastWrong) return null;
  if (m.clearedByHand) {
    const clear = clears
      .filter((c) => c.w === m.w && c.group === m.group && c.createdAt > lastWrong.take.createdAt)
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    return clear ? { w: m.w, group: m.group, day: clear.day, byHand: true } : null;
  }
  const days = new Set<string>();
  for (const a of m.attempts.slice(m.attempts.indexOf(lastWrong) + 1)) {
    if (!a.right) break;
    days.add(a.take.day);
    if (days.size >= CLEAR_AFTER) return { w: m.w, group: m.group, day: a.take.day, byHand: false };
  }
  return null;
}

/** The words still marked, one a word, its most severe open group other than tajweed. */
function markedWords(memories: Map<string, WordMemory>): { words: MarkedWord[]; byWord: Map<number, WordMemory[]> } {
  const best = new Map<number, WordMemory>();
  const byWord = new Map<number, WordMemory[]>();
  for (const m of memories.values()) {
    if (!m.open || m.group === 'tajweed' || !m.lastMark) continue;
    const held = best.get(m.w);
    if (!held || GROUP_RANK[m.group] > GROUP_RANK[held.group]) best.set(m.w, m);
    byWord.set(m.w, [...(byWord.get(m.w) ?? []), m]);
  }
  const words = [...best.values()]
    .map((m) => ({ w: m.w, group: m.group, kind: (m.lastMark as Mark).kind, ayah: (m.lastMark as Mark).ayah }))
    .sort((a, b) => a.w - b.w);
  return { words, byWord };
}

/** Every word still marked on the page (wrong words and slips; tajweed apart), in mushaf order. */
export function stillMarkedWords(records: readonly MemoryRecord[]): MarkedWord[] {
  return markedWords(wordMemories(records)).words;
}

/** Words still marked, gathered into runs of neighbouring ayat of one surah, the most slipped first. */
export function slippingPassages(memories: Map<string, WordMemory>): SlippingPassage[] {
  const { words, byWord } = markedWords(memories);
  const runs: MarkedWord[][] = [];
  for (const w of words) {
    const run = runs[runs.length - 1];
    const tail = run?.[run.length - 1];
    if (tail && tail.ayah[0] === w.ayah[0] && w.ayah[1] <= tail.ayah[1] + 1) run.push(w);
    else runs.push([w]);
  }
  return runs
    .map((run) => {
      const wrong = new Set<string>();
      const tried = new Set<string>();
      let lastDay = '';
      for (const w of run) {
        for (const m of byWord.get(w.w) ?? []) {
          for (const a of m.attempts) {
            tried.add(a.take.id);
            if (!a.right) wrong.add(a.take.id);
            lastDay = latest(lastDay, a.take.day);
          }
        }
      }
      return {
        sura: run[0].ayah[0],
        from: run[0].ayah[1],
        to: run[run.length - 1].ayah[1],
        words: run,
        wordMistakes: run.filter((w) => w.group === 'word').length,
        wrong: wrong.size,
        tries: tried.size,
        lastDay,
      };
    })
    .sort(
      (a, b) =>
        b.wrong - a.wrong ||
        b.wordMistakes - a.wordMistakes ||
        b.words.length - a.words.length ||
        b.lastDay.localeCompare(a.lastDay) ||
        a.sura - b.sura ||
        a.from - b.from,
    );
}

/** The slips into similar ayat among some takes, grouped by where they went, the most often first. */
export function similarSlips(takes: readonly TakeRecord[]): SimilarSlip[] {
  const byPair = new Map<string, SimilarSlip>();
  for (const t of takes) {
    for (const m of t.marks) {
      if (!m.into) continue;
      const ending = m.into.ending === true;
      const key = `${m.ayah[0]}:${m.ayah[1]}>${m.into.ayah[0]}:${m.into.ayah[1]}${ending ? 'e' : ''}`;
      const held = byPair.get(key);
      const also = m.into.also?.length ?? 0;
      if (!held) byPair.set(key, { from: m.ayah, into: m.into.ayah, ending, times: 1, lastDay: t.day, also });
      else {
        held.times += 1;
        if (t.day >= held.lastDay) {
          held.lastDay = t.day;
          held.also = also;
        }
      }
    }
  }
  return [...byPair.values()].sort(
    (a, b) => b.times - a.times || b.lastDay.localeCompare(a.lastDay) || a.from[0] - b.from[0] || a.from[1] - b.from[1],
  );
}

/** Mistakes by kind, Not clear and tajweed notes in some takes, from their marks. */
export function countMarks(takes: readonly TakeRecord[]): { kinds: MistakeKinds; mistakes: number; unclear: number; tajweed: number } {
  const kinds: MistakeKinds = { ...NO_KINDS };
  let unclear = 0;
  let tajweed = 0;
  for (const t of takes) {
    for (const m of t.marks) {
      const kind = mistakeKindOf(m);
      if (kind) kinds[kind] += 1;
      else if (isUnclear(m)) unclear += 1;
      else if (m.kind === 'tajweed' && t.level === 'strict') tajweed += 1;
    }
  }
  const mistakes = kinds.wrong + kinds.skipped + kinds.added + kinds.harakat + kinds.letter;
  return { kinds, mistakes, unclear, tajweed };
}

/** Everything Insights' Recitation section and Revo's summary show, over the window ending `today`. */
export function recitationInsights(records: readonly MemoryRecord[], today: string, windowDays = WINDOW_DAYS): RecitationInsights {
  const takes = liveTakes(records);
  const from = shiftDay(today, -(windowDays - 1));
  const before = shiftDay(from, -windowDays);
  const these = takes.filter((t) => t.day >= from && t.day <= today);
  const earlier = takes.filter((t) => t.day >= before && t.day < from);
  const memories = wordMemories(records);
  const clears = records.filter((r): r is ClearRecord => r.kind === 'clear' && !r.deleted);
  const counted = countMarks(these);
  const cleared: ClearedWord[] = [];
  const clearedWords = new Set<number>();
  let stillMarkedTajweed = 0;
  for (const m of memories.values()) {
    if (m.open && m.group === 'tajweed') stillMarkedTajweed += 1;
    const c = clearedOn(m, clears);
    // A word counts once, even when it cleared in two groups.
    if (c && c.day >= from && c.day <= today && !clearedWords.has(c.w)) {
      clearedWords.add(c.w);
      cleared.push(c);
    }
  }
  cleared.sort((a, b) => b.day.localeCompare(a.day) || a.w - b.w);
  // "Last recited": the latest take over any of a passage's words, a take that heard them only as Not clear included.
  const slipping = slippingPassages(memories).map((p) => {
    let lastDay = p.lastDay;
    for (const t of takes) if (t.day > lastDay && p.words.some((w) => t.from <= w.w && w.w <= t.to)) lastDay = t.day;
    return lastDay === p.lastDay ? p : { ...p, lastDay };
  });
  return {
    from,
    today,
    takes: these.length,
    days: new Set(these.map((t) => t.day)).size,
    secs: these.reduce((n, t) => n + t.secs, 0),
    words: these.reduce((n, t) => n + wordsOf(t), 0),
    ...counted,
    strictTakes: these.filter((t) => t.level === 'strict').length,
    score: meanScore(these),
    earlierScore: meanScore(earlier),
    weeks: weekScores(takes, today),
    stillMarked: slipping.reduce((n, p) => n + p.words.length, 0),
    stillMarkedTajweed,
    cleared,
    slipping,
    similar: similarSlips(these),
    last: takes[takes.length - 1] ?? null,
  };
}

/** What Recite found in some words (a surah's, a juz's, some pages'): for a passage Revo is asked about. */
export interface PassageRecitation {
  /** Takes that recited any of it, and the latest of them. */
  takes: number;
  last: TakeRecord | null;
  /** Words still marked there (wrong words and slips), and slips into similar ayat from there in the window. */
  stillMarked: MarkedWord[];
  similar: SimilarSlip[];
}

/** What Recite found in words `from`..`to` (inclusive), over the window ending `today` for the similar-ayah slips. */
export function passageRecitation(
  records: readonly MemoryRecord[],
  from: number,
  to: number,
  today: string,
  windowDays = WINDOW_DAYS,
): PassageRecitation {
  const takes = liveTakes(records).filter((t) => t.from <= to && t.to >= from);
  const start = shiftDay(today, -(windowDays - 1));
  const { words } = markedWords(wordMemories(records));
  const inside = takes.filter((t) => t.day >= start && t.day <= today);
  return {
    takes: takes.length,
    last: takes[takes.length - 1] ?? null,
    stillMarked: words.filter((w) => w.w >= from && w.w <= to),
    similar: similarSlips(inside.map((t) => ({ ...t, marks: t.marks.filter((m) => m.w >= from && m.w <= to) }))),
  };
}

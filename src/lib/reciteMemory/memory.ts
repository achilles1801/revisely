// Each word's remembered mistakes, from the account's takes (pure).
//
// A word is marked when a take with Mark mistakes finds it: a wrong, skipped or added word (the word group); a harakat
// or letter slip, sure or "Not clear" (slip: Majd, Nov 20 2026, "yes (a) is fine": a Not clear stays amber on the page
// after the take, remembered like a slip until said clearly, and never counted in a score); a tajweed note at Strict
// (tajweed). Never a mark called Not a mistake (those aren't in the record), never a word before where the take started.
//
// Every take that reached the word and checked its group is an attempt at it, right or wrong. The mark clears after
// CLEAR_AFTER right takes in a row on as many different revision days (Majd, Nov 15 2026: two right takes on two
// days): right once, straight after seeing the mistake, is short-term memory; right again on another day means it
// stuck. Wrong again starts the count over, and a take that heard the word's harakat only as "Not clear" hasn't said it
// clearly: it counts as wrong. "Clear now" clears it at once. Words & harakat never clears a tajweed note (it didn't
// check one).

import { countsAsMistake, GROUP_RANK, isCorrected, Mark, MarkGroup, markGroup } from '../reciteLive/contract';
import type { ClearRecord, MemoryRecord, TakeRecord } from './record';

/** Right takes in a row, each on a revision day of its own, that clear a remembered mistake. */
export const CLEAR_AFTER = 2;

/**
 * Whether a mark is remembered on the page: every mark the summary lists, Not clear included (RMEM-2), but a word
 * corrected straight away, which the reciter fixed themself and isn't a word to fix (RECITE-33).
 */
export function remembers(m: Mark): boolean {
  return (countsAsMistake(m) || m.kind === 'tajweed') && !isCorrected(m);
}

/** Whether a take checked a group: words and harakat always, tajweed only at Strict. */
export function checks(take: TakeRecord, group: MarkGroup): boolean {
  return group !== 'tajweed' || take.level === 'strict';
}

export interface Attempt {
  take: TakeRecord;
  right: boolean;
  /** The take's mark on the word (a wrong try). */
  mark: Mark | null;
  /** Seconds into the take when it reached the word, when known (the mark's, or `passed`). */
  t: number | null;
}

export interface WordMemory {
  w: number;
  group: MarkGroup;
  /** Oldest first. */
  attempts: Attempt[];
  /** Still marked on the page. */
  open: boolean;
  /** Revision days with a right take since the last wrong one (0 while open with none). */
  rightDays: number;
  /** Right takes still needed, on days of their own (0 once cleared). */
  needed: number;
  /** The latest wrong try's mark (what the page and the card show). */
  lastMark: Mark | null;
  /** Cleared by hand ("Clear now") since the last wrong try. */
  clearedByHand: boolean;
}

const key = (w: number, g: MarkGroup) => `${w}|${g}`;

/** The live records, oldest first (forgotten ones left out). */
function live(records: readonly MemoryRecord[]) {
  const takes: TakeRecord[] = [];
  const clears: ClearRecord[] = [];
  for (const r of records) {
    if (r.deleted) continue;
    if (r.kind === 'take') takes.push(r);
    else clears.push(r);
  }
  takes.sort((a, b) => a.createdAt - b.createdAt);
  clears.sort((a, b) => a.createdAt - b.createdAt);
  return { takes, clears };
}

function timeAt(take: TakeRecord, w: number, mark: Mark | null): number | null {
  if (mark?.t) return mark.t[0];
  return take.passed.find((p) => p.w === w)?.t ?? null;
}

/**
 * Every word with a remembered mistake, open or cleared, per group. A word can carry more than one group (a wrong
 * word and a tajweed note on it); the page shows the most severe open one (`openOnPage`).
 */
export function wordMemories(records: readonly MemoryRecord[]): Map<string, WordMemory> {
  const { takes, clears } = live(records);
  const out = new Map<string, WordMemory>();
  // The words and groups ever marked.
  const marked = new Map<string, { w: number; group: MarkGroup }>();
  for (const t of takes) for (const m of t.marks) if (remembers(m)) marked.set(key(m.w, markGroup(m)), { w: m.w, group: markGroup(m) });
  for (const { w, group } of marked.values()) {
    type Event = { at: number; take?: TakeRecord; clear?: ClearRecord };
    const events: Event[] = [];
    for (const t of takes) if (t.from <= w && w <= t.to && checks(t, group)) events.push({ at: t.createdAt, take: t });
    for (const c of clears) if (c.w === w && c.group === group) events.push({ at: c.createdAt, clear: c });
    events.sort((a, b) => a.at - b.at);
    const attempts: Attempt[] = [];
    let open = false;
    let days = new Set<string>();
    let lastMark: Mark | null = null;
    let clearedByHand = false;
    for (const e of events) {
      if (e.clear) {
        if (open) clearedByHand = true;
        open = false;
        days = new Set();
        continue;
      }
      const take = e.take as TakeRecord;
      const marks = take.marks.filter((m) => m.w === w && markGroup(m) === group);
      const wrong = marks.find(remembers) ?? null;
      attempts.push({ take, right: !wrong, mark: wrong, t: timeAt(take, w, wrong) });
      if (wrong) {
        open = true;
        days = new Set();
        lastMark = wrong;
        clearedByHand = false;
      } else if (open) {
        days.add(take.day);
        if (days.size >= CLEAR_AFTER) open = false;
      }
    }
    const rightDays = open ? days.size : 0;
    out.set(key(w, group), {
      w,
      group,
      attempts,
      open,
      rightDays,
      needed: open ? CLEAR_AFTER - days.size : 0,
      lastMark,
      clearedByHand,
    });
  }
  return out;
}

/** The open ones on words from..to-1 (a page's range), one a word: its most severe group. */
export function openInRange(memories: Map<string, WordMemory>, from: number, to: number): WordMemory[] {
  const best = new Map<number, WordMemory>();
  for (const m of memories.values()) {
    if (!m.open || m.w < from || m.w >= to) continue;
    const held = best.get(m.w);
    if (!held || GROUP_RANK[m.group] > GROUP_RANK[held.group]) best.set(m.w, m);
  }
  return [...best.values()].sort((a, b) => a.w - b.w);
}

/** A word's memory to show on its card: its most severe open group, or else its most severe one. */
export function memoryOfWord(memories: Map<string, WordMemory>, w: number): WordMemory | null {
  let pick: WordMemory | null = null;
  for (const m of memories.values()) {
    if (m.w !== w) continue;
    if (!pick || (m.open && !pick.open) || (m.open === pick.open && GROUP_RANK[m.group] > GROUP_RANK[pick.group])) pick = m;
  }
  return pick;
}

/** Words a take cleared: open before it, cleared by it (its summary's "cleared from the page"). */
export function clearedBy(records: readonly MemoryRecord[], take: TakeRecord): WordMemory[] {
  const before = wordMemories(records.filter((r) => r.id !== take.id && r.createdAt < take.createdAt));
  const after = wordMemories(records);
  const out: WordMemory[] = [];
  for (const [k, m] of after) if (!m.open && before.get(k)?.open && m.attempts[m.attempts.length - 1]?.take.id === take.id) out.push(m);
  return out.sort((a, b) => a.w - b.w);
}

/** The words with an open mark in [from, to], so a take can note when it reached each (▶ on a right try). */
export function openWordsBetween(records: readonly MemoryRecord[], from: number, to: number): number[] {
  return openInRange(wordMemories(records), from, to + 1).map((m) => m.w);
}

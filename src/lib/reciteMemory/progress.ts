// A passage's progress over the takes of it (pure): which takes count, the trend, and how to say it.

import type { MemoryRecord, TakeRecord } from './record';
import { takeWhen } from './describe';
import { formatAccuracy } from '../reciteLive/score';

/**
 * The takes that count for a passage (words `from`..`to`): those covering at least half of it, oldest first. A take of
 * the whole page counts for a passage on it, and a take of the passage's first lines alone doesn't.
 */
export function passageTakes(records: readonly MemoryRecord[], from: number, to: number): TakeRecord[] {
  const length = to - from + 1;
  if (length <= 0) return [];
  return records
    // A take kept without its final answer (RECITE-11) isn't a point on a passage's progress: its end wasn't checked.
    .filter((r): r is TakeRecord => r.kind === 'take' && !r.deleted && !r.unfinished)
    .filter((t) => Math.min(to, t.to) - Math.max(from, t.from) + 1 >= length / 2)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** "Up from 95.1% on Mon 2 Nov · 6 takes", "Down from 98.3% yesterday · 2 takes", "The same as …"; null with fewer than two. */
export function progressLine(takes: readonly TakeRecord[], now: number): string | null {
  if (takes.length < 2) return null;
  const first = takes[0];
  const last = takes[takes.length - 1];
  const a = formatAccuracy(first.accuracy);
  const b = formatAccuracy(last.accuracy);
  const when = takeWhen(first.createdAt, now);
  // "earlier today", "yesterday", "on Mon 2 Nov".
  const on = when.startsWith('Today') ? 'earlier today' : when.startsWith('Yesterday') ? 'yesterday' : `on ${when}`;
  const lead = b === a ? `The same as ${on}` : last.accuracy > first.accuracy ? `Up from ${a} ${on}` : `Down from ${a} ${on}`;
  return `${lead} · ${takes.length} takes`;
}

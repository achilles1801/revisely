// A passage's progress over the takes of it (pure): which takes count, the trend, and how to say it.

import type { MemoryRecord, TakeRecord } from './record';
import { takeDaysAgo, takeWhen } from './describe';
import { formatAccuracy } from '../reciteLive/score';
import { t } from '../../i18n';

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
  const days = takeDaysAgo(first.createdAt, now);
  // "earlier today", "yesterday", "on Mon 2 Nov".
  const on =
    days === 0
      ? t('reciteMemory.earlierToday')
      : days === 1
        ? t('reciteMemory.yesterday')
        : t('reciteMemory.onDate', { date: takeWhen(first.createdAt, now) });
  const lead =
    b === a
      ? t('reciteMemory.sameAs', { on })
      : last.accuracy > first.accuracy
        ? t('reciteMemory.upFrom', { from: a, on })
        : t('reciteMemory.downFrom', { from: a, on });
  return t('reciteMemory.progress', { lead, count: takes.length });
}

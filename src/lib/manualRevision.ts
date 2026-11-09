// A Revised item added by hand (Activity's Revised add sheet, d6): pages the user revised
// outside a session, counted for today. Its strength is written to each page's weakness rating
// (the same field a session's ratings write), not to the item.

import type { RevisionItem } from './revisionItems';

/** The strength choice → the page weakness rating it writes (ACT-8: 1–2 weak, 3 moderate, 4–5 strong). */
export const STRENGTH_RATING = { weak: 2, moderate: 3, strong: 4 } as const;
export type Strength = keyof typeof STRENGTH_RATING;

/** A page range typed as From and To: integers 1–604, From not after To. Null when not a range. */
export function parsePageRange(from: string, to: string, total = 604): { from: number; to: number } | null {
  const f = Number(from.trim());
  const t = Number(to.trim());
  if (!Number.isInteger(f) || !Number.isInteger(t)) return null;
  if (f < 1 || t > total || f > t) return null;
  return { from: f, to: t };
}

export function pagesInRange(range: { from: number; to: number }): number[] {
  return Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from + i);
}

/**
 * The id of a manual item: made once per add, on the phone, so the outbox sending it again writes the
 * same item. The random part keeps two adds in the same millisecond apart (they overwrote each other).
 */
export function manualRevisionId(day: string, now: number, random: () => number = Math.random): string {
  return `manual-${day}-${now}-${Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0')}`;
}

/** The Revised item for a manual add: counts for `day`, carries no plan assignment, no skips. */
export function manualRevisionItem(input: {
  uid: string;
  day: string;
  now: number;
  pages: number[];
  minutes: number | null;
}): RevisionItem {
  return {
    id: manualRevisionId(input.day, input.now),
    uid: input.uid,
    day: input.day,
    occurredAt: input.now,
    countsFor: input.day,
    source: 'manual',
    pages: [...input.pages].sort((a, b) => a - b),
    skipped: [],
    assigned: [],
    minutes: input.minutes,
    recordings: [],
  };
}

/** Whether a Revised item was added by hand (its id, as manualRevisionId makes it). */
export function isManualRevisionId(id: string): boolean {
  return id.startsWith('manual-');
}

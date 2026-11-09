// The account's memorization items as this phone sees them: the server's, with the changes still
// waiting here laid over them (marks merged as the server merges them, deletes taken out). Deleting
// an item reads them (ACT-7): the ayahs another item holds stay memorized.

import { ayahsOfPages, sortedAyahs } from '../ayahKeys';
import type { OutboxEntry } from './ops';

export interface MemorizationItem {
  id: string;
  day: string;
  pages: number[];
  verses?: number[];
}

/**
 * `server` with `waiting` laid over it. A waiting unmark is left out: it only takes ayahs off, and
 * counting them as still held keeps a page memorized rather than taking off one that isn't this
 * item's.
 */
export function memorizationItemsWithWaiting(server: readonly MemorizationItem[], waiting: readonly OutboxEntry[]): MemorizationItem[] {
  const byId = new Map(server.map((m) => [m.id, m] as const));
  for (const { op } of waiting) {
    if (op.kind === 'memorization.mark') {
      // Ids come from the day (firestoreService.addMemorizationPages), and so does the merge.
      const prev = byId.get(op.day);
      const pages = [...new Set([...(prev?.pages ?? []), ...op.pages])].sort((a, b) => a - b);
      const byAyah = (op.verses && op.verses.length > 0) || (prev?.verses && prev.verses.length > 0);
      const verses = byAyah
        ? sortedAyahs([...(prev?.verses ?? []), ...(op.verses ?? []), ...(op.verses && op.verses.length > 0 ? [] : ayahsOfPages(op.pages))])
        : undefined;
      byId.set(op.day, { id: op.day, day: op.day, pages, ...(verses ? { verses } : {}) });
    } else if (op.kind === 'memorization.delete') {
      byId.delete(op.id);
    }
  }
  return [...byId.values()];
}

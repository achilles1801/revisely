// One Activity day's items with the changes still waiting in the outbox laid over them (ACT-13).
// An add from the day's + goes to the outbox first; the day shows it at once, online or not, the way
// the daily log shows a note still waiting (overlayJournal). Pure: the screens pass what they read.

import { readItemFor } from '../readItems';
import type { OutboxEntry, OutboxOp } from './ops';

export interface DayItems {
  revisions: { id: string; day: string; countsFor: string; pages: number[]; skipped: number[]; assigned: number[]; minutes: number | null }[];
  memorized: { id: string; day: string; pages: number[]; minutes?: number | null }[];
  reads: { id: string; day: string; pages: number[]; minutes: number | null; occurredAt: number | null }[];
  doneAhead: { fromDay: string; pages: number[] }[];
}

/**
 * Whether a change can alter what `day` shows in Activity: its items, its notes or its timed reads.
 * A change whose day can't be told from the change itself (a timed read's pages, pages un-memorized)
 * counts for every day.
 */
export function touchesDay(op: OutboxOp, day: string): boolean {
  switch (op.kind) {
    case 'revision.add':
      return op.item.day === day || op.item.countsFor === day;
    case 'revision.delete':
    case 'memorization.mark':
    case 'memorization.delete':
      return op.day === day;
    case 'memorization.unmark':
    case 'reading.pages':
    case 'reading.delete':
      return true;
    case 'reading.add':
      return op.session.date === day;
    case 'session.add':
      return op.date === day || Object.keys(op.ahead ?? {}).includes(day);
    case 'session.edit':
    case 'session.delete':
    case 'session.assigned':
      return op.id === day;
    case 'journal.entry.add':
    case 'journal.entry.edit':
    case 'journal.entry.delete':
    case 'journal.delete':
      return op.date === day;
    case 'journal.save':
      return op.entry.date === day;
    default:
      return false;
  }
}

/** The ids of the waiting changes that touch `day`, in order: when it changes, the day reloads. */
export function dayChangesKey(entries: readonly OutboxEntry[], day: string): string {
  return entries
    .filter((e) => touchesDay(e.op, day))
    .map((e) => e.id)
    .join(',');
}

/**
 * `items` (what the server gave for `day`) with the waiting changes laid over them, oldest first:
 * a Revised item added by hand (or deleted), pages memorized (merged into the day's item, as the server merges
 * them), a memorization removed, pages un-memorized, and timed reads added, edited or deleted.
 */
export function overlayDayItems(items: DayItems, entries: readonly OutboxEntry[], day: string, uid: string): DayItems {
  let { revisions, memorized, reads } = items;
  for (const e of entries) {
    const op = e.op;
    if (op.kind === 'revision.add' && op.item.day === day) {
      const { id, countsFor, pages, skipped, assigned, minutes } = op.item;
      revisions = [...revisions.filter((r) => r.id !== id), { id, day, countsFor, pages, skipped, assigned, minutes }];
    } else if (op.kind === 'revision.delete' && op.day === day) {
      revisions = revisions.filter((r) => r.id !== op.id);
    } else if (op.kind === 'memorization.mark' && op.day === day) {
      const prev = memorized.find((m) => m.id === day);
      const pages = [...new Set([...(prev?.pages ?? []), ...op.pages])].sort((a, b) => a - b);
      const added = typeof op.minutes === 'number' && op.minutes > 0 ? op.minutes : 0;
      const had = prev?.minutes ?? null;
      const minutes = added > 0 ? (had ?? 0) + added : had;
      memorized = [...memorized.filter((m) => m.id !== day), { id: day, day, pages, minutes }];
    } else if (op.kind === 'memorization.delete' && op.day === day) {
      memorized = memorized.filter((m) => m.id !== op.id);
    } else if (op.kind === 'memorization.unmark') {
      const drop = new Set(op.pages);
      memorized = memorized
        .map((m) => ({ ...m, pages: m.pages.filter((p) => !drop.has(p)) }))
        .filter((m) => m.pages.length > 0);
    } else if (op.kind === 'reading.add' && op.session.date === day) {
      const r = readItemFor(op.id, uid, op.session);
      reads = [...reads.filter((x) => x.id !== op.id), { id: r.id, day: r.day, pages: r.pages, minutes: r.minutes, occurredAt: r.occurredAt }];
    } else if (op.kind === 'reading.pages') {
      reads = reads.map((x) => (x.id === op.id ? { ...x, pages: op.pages } : x));
    } else if (op.kind === 'reading.delete') {
      reads = reads.filter((x) => x.id !== op.id);
    }
  }
  return revisions === items.revisions && memorized === items.memorized && reads === items.reads ? items : { ...items, revisions, memorized, reads };
}

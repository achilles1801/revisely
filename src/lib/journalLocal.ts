// The daily log's local-first writes (Activity spec, C1). A note or a revised portion
// is saved on the phone at once, and stays laid over the server's copy of the day
// until that copy shows it. What is compared is the note's id and its content, so the
// order in which reads answer never removes a change the server hasn't yet shown.

import type { JournalEntry } from '../types';
import type { OutboxEntry, OutboxOp } from './offline/ops';

/** The note a change of `date`'s log is about, or null for any other change. */
export function journalNoteIdOf(op: OutboxOp, date: string): string | null {
  if (op.kind === 'journal.entry.add' || op.kind === 'journal.entry.edit') return op.date === date ? op.entry.id : null;
  if (op.kind === 'journal.entry.delete') return op.date === date ? op.id : null;
  return null;
}

/** Whether the server's copy of the day already shows a written change. */
export function journalChangeShown(e: OutboxEntry, day: JournalEntry | null): boolean {
  const op = e.op;
  const notes = day?.entries ?? [];
  if (op.kind === 'journal.entry.add' || op.kind === 'journal.entry.edit') {
    const n = notes.find((x) => x.id === op.entry.id);
    return n != null && n.text === op.entry.text && n.minutes === op.entry.minutes && n.kind === op.entry.kind;
  }
  if (op.kind === 'journal.entry.delete') return !notes.some((x) => x.id === op.id);
  return true;
}

/** The written changes the server's copy doesn't show yet: they stay laid over it. */
export function unshownChanges(day: JournalEntry | null, changes: OutboxEntry[]): OutboxEntry[] {
  return changes.filter((e) => !journalChangeShown(e, day));
}

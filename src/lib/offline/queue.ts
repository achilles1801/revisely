// Saving a change from anywhere in the app: into the signed-in account's
// outbox (on the phone), then to the server when it can be reached. The
// account is the one AppProvider shows (setCurrentAccount).
//
// The reading timer's sessions and the daily log are read straight from
// Firestore by their screens; `withPending…` lays the changes still waiting
// over what was read, so a session timed offline shows at once.

import type { JournalEntry, ReadingSession } from '../../types';
import { enqueue, pendingEntries } from './outbox';
import type { OutboxEntry, OutboxOp } from './ops';
import { requestFlush } from './sync';

let account: string | null = null;

export function setCurrentAccount(uid: string | null): void {
  account = uid;
}

export function currentAccount(): string | null {
  return account;
}

export async function queueChange(op: OutboxOp, at = Date.now()): Promise<OutboxEntry> {
  const uid = account;
  if (!uid) throw new Error('User not authenticated');
  const entry = await enqueue(uid, op, at);
  requestFlush(uid);
  return entry;
}

/** Reading sessions with the changes still waiting (newest first); `date` keeps one day's. */
export function withPendingReadings(
  list: ReadingSession[],
  opts: { date?: string; uid?: string | null } = {},
): ReadingSession[] {
  let out = list;
  for (const e of pendingEntries(opts.uid === undefined ? account : opts.uid)) {
    const op = e.op;
    if (op.kind === 'reading.add') {
      if (opts.date && op.session.date !== opts.date) continue;
      const s: ReadingSession = { id: op.id, ...op.session };
      out = out.some((r) => r.id === op.id) ? out.map((r) => (r.id === op.id ? s : r)) : [s, ...out];
    } else if (op.kind === 'reading.pages') {
      out = out.map((r) => (r.id === op.id ? { ...r, pages: op.pages } : r));
    } else if (op.kind === 'reading.delete') {
      out = out.filter((r) => r.id !== op.id);
    }
  }
  return out === list ? list : [...out].sort((a, b) => b.startedAt - a.startedAt);
}

/** The day's log with a change still waiting: the entry, null if deleted, undefined if none waits. */
export function pendingJournalEntry(date: string, uid: string | null = account): JournalEntry | null | undefined {
  let result: JournalEntry | null | undefined;
  for (const e of pendingEntries(uid)) {
    const op = e.op;
    if (op.kind === 'journal.save' && op.entry.date === date) result = { ...op.entry, updatedAt: e.at };
    else if (op.kind === 'journal.delete' && op.date === date) result = null;
  }
  return result;
}

/** Daily log entries with the changes still waiting (newest first). */
export function withPendingJournal(list: JournalEntry[], uid: string | null = account): JournalEntry[] {
  let out = list;
  for (const e of pendingEntries(uid)) {
    const op = e.op;
    if (op.kind === 'journal.save') {
      const entry: JournalEntry = { ...op.entry, updatedAt: e.at };
      out = out.some((j) => j.date === entry.date)
        ? out.map((j) => (j.date === entry.date ? entry : j))
        : [...out, entry];
    } else if (op.kind === 'journal.delete') {
      out = out.filter((j) => j.date !== op.date);
    }
  }
  return out === list ? list : [...out].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Seconds of app use still waiting to be added on the server. */
export function pendingUsageSeconds(uid: string | null = account): number {
  return pendingEntries(uid).reduce((sum, e) => sum + (e.op.kind === 'usage' ? e.op.seconds : 0), 0);
}

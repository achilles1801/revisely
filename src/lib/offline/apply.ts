// How each outbox change reaches the server (sync.ts calls this, oldest first).

import * as firestoreService from '../../services/firestoreService';
import type { OutboxEntry } from './ops';
import { applySessionEdit, mergeSessionAdd, pageUpdateData, sessionUpdateData } from './ops';

/** A document id like Firestore's own (20 letters and digits), made on the phone. */
export function autoId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 20; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

export async function applyEntry(uid: string, entry: OutboxEntry): Promise<void> {
  const op = entry.op;
  switch (op.kind) {
    case 'user':
      return firestoreService.applyUserFields(op.fields, uid);
    case 'pages':
      return firestoreService.applyPageUpdates(
        op.pages.map((p) => ({ pageNumber: p.pageNumber, data: pageUpdateData(p) })),
        uid,
      );
    case 'session.add':
      return firestoreService.mergeSessionOnServer(
        op.date,
        (existing) => mergeSessionAdd(existing, op, entry.at),
        sessionUpdateData,
        uid,
      );
    case 'session.edit':
      return firestoreService.mergeSessionOnServer(
        op.id,
        (existing) => applySessionEdit(existing, op),
        (s) => ({
          pagesRevised: s.pagesRevised,
          pagesSkipped: s.pagesSkipped,
          durationMinutes: s.durationMinutes,
          weaknessUpdates: s.weaknessUpdates,
        }),
        uid,
      );
    case 'session.delete':
      return firestoreService.deleteSession(op.id, uid);
    case 'reading.add':
      return firestoreService.putReadingSession(op.id, op.session, entry.at, uid);
    case 'reading.pages':
      return firestoreService.updateReadingSessionPages(op.id, op.pages, uid);
    case 'reading.delete':
      return firestoreService.deleteReadingSession(op.id, uid);
    case 'journal.save':
      return firestoreService.saveJournalEntry({ ...op.entry }, op.isNew, uid);
    case 'journal.delete':
      return firestoreService.deleteJournalEntry(op.date, uid);
    case 'usage':
      return firestoreService.addAppUsageSeconds(op.seconds, uid);
  }
}

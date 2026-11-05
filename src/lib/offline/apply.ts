// How each outbox change reaches the server (sync.ts calls this, oldest first).

import * as firestoreService from '../../services/firestoreService';
import type { FirestoreSession } from '../../types/firestore';
import { logger } from '../logger';
import { revisionItemsFor } from '../revisionItems';
import type { OutboxEntry } from './ops';
import { applySessionEdit, mergeSessionAdd, pageUpdateData, sessionUpdateData } from './ops';
import { readItemFor } from '../readItems';

/** A document id like Firestore's own (20 letters and digits), made on the phone. */
export function autoId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 20; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

/** A Read item beside its session (C2 dual write): best effort, like the revision items. */
async function mirrorReadItem(uid: string, write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch (err) {
    logger.warn('Read item was not written for a session', err);
  }
}

/**
 * Dual write (Activity spec, section 7): the day's Revised items beside the
 * session. Best effort: the session is already saved, and the backfill brings
 * back any item that didn't get written, so a failure here must not hold the
 * change in the outbox.
 */
async function mirrorRevisionItems(uid: string, day: string, session: FirestoreSession | null): Promise<void> {
  try {
    await firestoreService.replaceRevisionItems(day, session ? revisionItemsFor(session, uid) : [], uid);
  } catch (err) {
    logger.warn('Activity items were not written for a session', err);
  }
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
    case 'session.add': {
      const session = await firestoreService.mergeSessionOnServer(
        op.date,
        (existing) => mergeSessionAdd(existing, op, entry.at),
        sessionUpdateData,
        uid,
      );
      return mirrorRevisionItems(uid, op.date, session);
    }
    case 'session.edit': {
      const session = await firestoreService.mergeSessionOnServer(
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
      return mirrorRevisionItems(uid, op.id, session);
    }
    case 'session.delete':
      await firestoreService.deleteSession(op.id, uid);
      return mirrorRevisionItems(uid, op.id, null);
    case 'memorization.delete':
      return firestoreService.deleteMemorizationItem(op.id, uid);
    case 'memorization.mark':
      return firestoreService.addMemorizationPages(op.day, op.pages, op.at, uid);
    case 'memorization.unmark':
      return firestoreService.removeMemorizationPages(op.pages, uid);
    case 'reading.add':
      await firestoreService.putReadingSession(op.id, op.session, entry.at, uid);
      return mirrorReadItem(uid, () => firestoreService.setReadItem(readItemFor(op.id, uid, op.session), uid));
    case 'reading.pages':
      await firestoreService.updateReadingSessionPages(op.id, op.pages, uid);
      return mirrorReadItem(uid, () => firestoreService.patchReadItemPages(op.id, op.pages, uid));
    case 'reading.delete':
      await firestoreService.deleteReadingSession(op.id, uid);
      return mirrorReadItem(uid, () => firestoreService.deleteReadItem(op.id, uid));
    case 'journal.entry.add':
    case 'journal.entry.edit':
      return firestoreService.applyJournalNote(op.date, { kind: 'put', note: { ...op.entry } }, uid);
    case 'journal.entry.delete':
      return firestoreService.applyJournalNote(op.date, { kind: 'delete', id: op.id }, uid);
    case 'journal.save':
      return firestoreService.saveJournalEntry({ ...op.entry }, op.isNew, uid);
    case 'journal.delete':
      return firestoreService.deleteJournalEntry(op.date, uid);
    case 'usage':
      return firestoreService.addAppUsageSeconds(op.seconds, uid);
  }
}

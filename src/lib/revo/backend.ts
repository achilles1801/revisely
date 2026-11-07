// Where Revo's data comes from. The real one: the revo* Cloud Functions for everything that
// calls the model or deletes in bulk, and the account's own Firestore documents (read live,
// with the few changes the rules allow: thumbs, an action's state, deleting a memory item).
// An E2E build uses an in-memory stand-in instead (lib/e2e/revoFake), since the flows have no
// functions emulator and no model.

import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { callFunction } from '../../services/firestoreService';
import type {
  RevoAskResult,
  RevoAttachment,
  RevoChat,
  RevoContext,
  RevoMemoryItem,
  RevoMessage,
  RevoRefusal,
  RevoSettings,
} from './types';

export interface RevoBackend {
  watchSettings(uid: string, cb: (s: RevoSettings) => void): () => void;
  /** Questions asked on `day` (the stored day may be another). */
  watchUsage(uid: string, cb: (u: { day: string; count: number }) => void): () => void;
  watchChats(uid: string, cb: (chats: RevoChat[]) => void): () => void;
  watchMessages(uid: string, chatId: string, cb: (messages: RevoMessage[]) => void): () => void;
  watchMemory(uid: string, cb: (items: RevoMemoryItem[]) => void): () => void;
  ask(input: { chatId: string | null; day: string; question: string; context: RevoContext; attach: RevoAttachment | null }): Promise<RevoAskResult>;
  dayInReview(input: { day: string; context: RevoContext }): Promise<{ chatId: string } | null>;
  setOptions(input: Partial<RevoSettings>): Promise<RevoSettings>;
  clear(what: 'memory' | 'history'): Promise<void>;
  setFeedback(uid: string, chatId: string, messageId: string, feedback: 'up' | 'down' | null): Promise<void>;
  setActionState(uid: string, chatId: string, messageId: string, state: 'added' | 'dismissed'): Promise<void>;
  deleteMemory(uid: string, id: string): Promise<void>;
}

/** A question the server refused, and why (the sheet says it in its own words). */
export class RevoError extends Error {
  constructor(
    readonly refusal: RevoRefusal,
    message: string,
  ) {
    super(message);
  }
}

/** The callable's error as a refusal. */
export function refusalOf(err: unknown): RevoError {
  const e = err as { message?: string; code?: string; details?: { reason?: string } } | null;
  const message = e?.message ?? 'Revo is unavailable. Try again.';
  if (e?.code === 'RESOURCE_EXHAUSTED') return new RevoError(e.details?.reason === 'monthly' ? 'monthly' : 'daily', message);
  if (e?.code === 'PERMISSION_DENIED') return new RevoError('off', message);
  if (e?.code === 'INVALID_ARGUMENT' && /date/i.test(message)) return new RevoError('clock', message);
  return new RevoError('unavailable', message);
}

function signedIn() {
  const user = auth.currentUser;
  if (!user) throw new RevoError('off', 'Sign in to use Revo.');
  return user;
}

async function call<T>(name: string, data: Record<string, unknown>): Promise<T> {
  try {
    return (await callFunction(signedIn(), name, data)) as T;
  } catch (err) {
    if (err instanceof RevoError) throw err;
    throw refusalOf(err);
  }
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const firebaseRevo: RevoBackend = {
  watchSettings(uid, cb) {
    return onSnapshot(
      doc(db, 'coachSettings', uid),
      (snap) => cb({ optIn: snap.get('optIn') === true, memoryOn: snap.get('memoryOn') !== false }),
      () => cb({ optIn: false, memoryOn: true }),
    );
  },
  watchUsage(uid, cb) {
    return onSnapshot(
      doc(db, 'revoUsage', uid),
      (snap) => cb({ day: String(snap.get('day') ?? ''), count: num(snap.get('count')) }),
      () => cb({ day: '', count: 0 }),
    );
  },
  watchChats(uid, cb) {
    const q = query(collection(db, 'users', uid, 'revoChats'), orderBy('updatedAt', 'desc'), limit(200));
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Omit<RevoChat, 'id'>), id: d.id }))),
      () => cb([]),
    );
  },
  watchMessages(uid, chatId, cb) {
    const q = query(collection(db, 'users', uid, 'revoChats', chatId, 'messages'), orderBy('at', 'asc'), limit(200));
    return onSnapshot(
      q,
      (snap) =>
        cb(
          snap.docs.map((d) => {
            // attachData (the attachment itself) stays out of the screen's state.
            const { attachData: _a, uid: _u, ...m } = d.data() as RevoMessage & { attachData?: unknown; uid?: string };
            return { ...m, id: d.id };
          }),
        ),
      () => cb([]),
    );
  },
  watchMemory(uid, cb) {
    const q = query(collection(db, 'users', uid, 'revoMemory'), orderBy('at', 'desc'), limit(50));
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Omit<RevoMemoryItem, 'id'>), id: d.id }))),
      () => cb([]),
    );
  },
  ask(input) {
    return call<RevoAskResult>('revoAsk', input as unknown as Record<string, unknown>);
  },
  async dayInReview(input) {
    const out = await call<{ chat?: { id: string }; chatId?: string; none?: boolean }>('revoDayInReview', input as unknown as Record<string, unknown>);
    if (!out || out.none) return null;
    const chatId = out.chat?.id ?? out.chatId;
    return chatId ? { chatId } : null;
  },
  setOptions(input) {
    return call<RevoSettings>('revoSetOptions', input);
  },
  async clear(what) {
    await call('revoClear', { what });
  },
  async setFeedback(uid, chatId, messageId, feedback) {
    await updateDoc(doc(db, 'users', uid, 'revoChats', chatId, 'messages', messageId), { feedback });
  },
  async setActionState(uid, chatId, messageId, state) {
    await updateDoc(doc(db, 'users', uid, 'revoChats', chatId, 'messages', messageId), { actionState: state });
    if (state === 'added') await updateDoc(doc(db, 'users', uid, 'revoChats', chatId), { meta: 'plan added' });
  },
  async deleteMemory(uid, id) {
    await deleteDoc(doc(db, 'users', uid, 'revoMemory', id));
  },
};

/** The backend for this build: E2E builds use the in-memory stand-in. */
export function revoBackend(): RevoBackend {
  if (process.env.EXPO_PUBLIC_E2E === '1') return require('../e2e/revoFake').revoFake as RevoBackend;
  return testBackend ?? firebaseRevo;
}

let testBackend: RevoBackend | null = null;
/** Tests: use this backend instead. */
export function __setRevoBackendForTests(b: RevoBackend | null): void {
  testBackend = b;
}

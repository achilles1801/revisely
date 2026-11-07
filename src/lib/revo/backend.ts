// Where Revo's data comes from. The real one: the revo* Cloud Functions for everything that
// calls the model or deletes in bulk, and the account's own Firestore documents (read live,
// with the few changes the rules allow: thumbs, an action's state, deleting a memory item).
// E2E builds use the same, against the functions emulator (lib/e2e/functions, TESTING.md).

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
import { knownOffline } from '../networkState';
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
  /** One attachment goes as `attach`; several (at most REVO_MAX_ATTACHMENTS) as `attachments`. */
  ask(input: { chatId: string | null; day: string; question: string; context: RevoContext; attach: RevoAttachment | null; attachments?: RevoAttachment[] }): Promise<RevoAskResult>;
  dayInReview(input: { day: string; context: RevoContext }): Promise<{ chatId: string } | null>;
  setOptions(input: Partial<RevoSettings>): Promise<RevoSettings>;
  clear(what: 'memory' | 'history'): Promise<void>;
  setFeedback(uid: string, chatId: string, messageId: string, feedback: 'up' | 'down' | null): Promise<void>;
  setActionState(uid: string, chatId: string, messageId: string, state: 'added' | 'dismissed'): Promise<void>;
  deleteMemory(uid: string, id: string): Promise<void>;
}

/** A question the server refused, or that couldn't be asked, and why (the sheet says it in its own words). */
export class RevoError extends Error {
  constructor(
    readonly refusal: RevoRefusal,
    message: string,
  ) {
    super(message);
  }
}

export const REVO_MESSAGES = {
  unavailable: 'Revo couldn’t answer. Try again.',
  offline: 'You’re offline. Revo needs the internet.',
  signIn: 'Revo couldn’t check your sign-in. Try again.',
} as const;

/** A failure of the connection itself (fetch, or Auth refreshing the token), not an answer. */
function isNetworkFailure(err: unknown): boolean {
  const e = err as { message?: unknown; code?: unknown } | null;
  if (e?.code === 'auth/network-request-failed') return true;
  return typeof e?.message === 'string' && /network request failed|failed to fetch|network error/i.test(e.message);
}

/**
 * The callable's error as a refusal. A callable error carries its status (`code`) and our own
 * server's words, which the sheet may show; anything else (no status) gets the sheet's own.
 */
export function refusalOf(err: unknown): RevoError {
  if (err instanceof RevoError) return err;
  const e = err as { message?: string; code?: string; details?: { reason?: string } } | null;
  // No status means no answer from the server: offline when the connection failed or NetInfo says so.
  if (isNetworkFailure(err) || (typeof e?.code !== 'string' && knownOffline())) return new RevoError('offline', REVO_MESSAGES.offline);
  const fromServer = typeof e?.code === 'string' && typeof e?.message === 'string' && e.message.length > 0 && e.message.length <= 160;
  const message = fromServer ? e!.message! : REVO_MESSAGES.unavailable;
  switch (e?.code) {
    case 'RESOURCE_EXHAUSTED':
      return new RevoError(e.details?.reason === 'monthly' ? 'monthly' : 'daily', message);
    case 'PERMISSION_DENIED':
      return new RevoError('off', message);
    case 'NOT_FOUND':
      return new RevoError('gone', message);
    case 'INVALID_ARGUMENT':
      return e.details?.reason === 'clock' || /date|clock/i.test(message) ? new RevoError('clock', message) : new RevoError('unavailable', REVO_MESSAGES.unavailable);
    case 'UNAUTHENTICATED':
      return new RevoError('unavailable', REVO_MESSAGES.signIn);
    case 'UNAVAILABLE':
    case 'INTERNAL':
    case 'DEADLINE_EXCEEDED':
      return new RevoError('unavailable', message);
    default:
      return new RevoError('unavailable', REVO_MESSAGES.unavailable);
  }
}

function signedIn() {
  const user = auth.currentUser;
  if (!user) throw new RevoError('off', 'Sign in to use Revo.');
  return user;
}

/** What a callable answered: the protocol sends it as `{ result }` (REACT-NATIVE-10 read the envelope as the answer). */
export function callableResult(out: unknown): unknown {
  return out !== null && typeof out === 'object' && 'result' in out ? (out as { result: unknown }).result : undefined;
}

async function call(name: string, data: Record<string, unknown>): Promise<unknown> {
  let out: unknown;
  try {
    out = await callFunction(signedIn(), name, data);
  } catch (err) {
    throw refusalOf(err);
  }
  return callableResult(out);
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isMessage = (v: unknown): v is RevoMessage => {
  const m = v as Partial<RevoMessage> | null;
  return !!m && typeof m === 'object' && isStr(m.id) && (m.role === 'user' || m.role === 'revo') && isStr(m.text) && typeof m.at === 'number';
};

/** revoAsk's answer, if it is one: the chat, and the question and reply as stored. */
export function askResultOf(v: unknown): RevoAskResult | null {
  const r = v as Partial<RevoAskResult> | null;
  if (!r || typeof r !== 'object' || !isStr(r.chatId) || r.chatId === '') return null;
  if (!isMessage(r.question) || !isMessage(r.reply)) return null;
  return {
    chatId: r.chatId,
    title: isStr(r.title) ? r.title : '',
    question: r.question,
    reply: r.reply,
    remainingToday: typeof r.remainingToday === 'number' ? r.remainingToday : 0,
    cached: r.cached === true,
  };
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const firebaseRevo: RevoBackend = {
  watchSettings(uid, cb) {
    return onSnapshot(
      doc(db, 'coachSettings', uid),
      // Revo's own switch (functions/src/revo/admin.ts REVO_ON); `optIn` is the Ask coach's.
      (snap) => cb({ optIn: snap.get('revoOn') === true, memoryOn: snap.get('memoryOn') !== false }),
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
            // The attachments themselves (attachData, attachList) stay out of the screen's state.
            const { attachData: _a, attachList: _l, uid: _u, ...m } = d.data() as RevoMessage & { attachData?: unknown; attachList?: unknown; uid?: string };
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
  async ask(input) {
    const result = askResultOf(await call('revoAsk', input as unknown as Record<string, unknown>));
    if (!result) throw new RevoError('unavailable', REVO_MESSAGES.unavailable);
    return result;
  },
  async dayInReview(input) {
    const out = (await call('revoDayInReview', input as unknown as Record<string, unknown>)) as { chat?: { id?: unknown }; chatId?: unknown; none?: boolean } | null;
    if (!out || typeof out !== 'object' || out.none) return null;
    const chatId = out.chat?.id ?? out.chatId;
    return isStr(chatId) ? { chatId } : null;
  },
  async setOptions(input) {
    const out = (await call('revoSetOptions', input)) as Partial<RevoSettings> | null;
    return { optIn: out?.optIn === true, memoryOn: out?.memoryOn !== false };
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

/** The backend for this build: the functions and Firestore (E2E builds too, against the emulators). */
export function revoBackend(): RevoBackend {
  return testBackend ?? firebaseRevo;
}

let testBackend: RevoBackend | null = null;
/** Tests: use this backend instead. */
export function __setRevoBackendForTests(b: RevoBackend | null): void {
  testBackend = b;
}

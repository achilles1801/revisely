/**
 * Revo's Firestore store (firebase-admin). Only these functions write Revo's documents; the
 * rules let the owner read them and change only a few fields (firestore.rules).
 *   users/{uid}.previewTester                      read: the tester gate
 *   config/app.revo                                read: who has Revo (release.ts, REVO-37), at most once a minute
 *   config/coach, coachLedgerDay/{day}             read: the daily cap and the day's spend (REVO-4)
 *   users/{uid}.smartTrackingEnabled               read: whether Revo speaks of ratings (REVO-36)
 *   coachSettings/{uid}                            revoOn (Revo's own switch, settings.ts), memoryOn; optIn is the Ask coach's
 *   revoUsage/{uid}                                { uid, day, count }: questions on that revision day
 *   users/{uid}/revoChats/{chatId}                 { uid, kind, title, day, createdAt, updatedAt, turns, meta? }
 *   users/{uid}/revoChats/{chatId}/messages/{id}   the message, uid, and on a user message the attachments (attachData: one; attachList: several)
 *   users/{uid}/revoMemory/{id}                    { uid, text, source, day, chatId, at }
 *   revoAnswers/{uid}__{sha256}                    a cached first answer (server only)
 *   coachLedger, coachLedgerDay                    the Ask coach's ledger, shared (coach/admin.ts)
 */
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { adminCoachStore, coachCaps, spentOn } from '../coach/admin';
import type { RevoStore } from './handler';
import { RevoRelease, revoReleaseOf } from './release';
import { REVO_ON, revoSettingsOf } from './settings';
import type { CachedAnswer, RevoChat, RevoMemoryItem, StoredMessage } from './types';

const chatsOf = (db: Firestore, uid: string) => db.collection(`users/${uid}/revoChats`);

/** How long a read of config/app's release is used before reading it again (a change applies within this). */
const RELEASE_CACHE_MS = 60_000;
let releaseCache: { value: RevoRelease; until: number } | null = null;

/** config/app.revo, read at most once a minute (every call in the emulator, where tests flip it). */
export async function revoRelease(db: Firestore): Promise<RevoRelease> {
  if (releaseCache && Date.now() < releaseCache.until) return releaseCache.value;
  const value = revoReleaseOf((await db.doc('config/app').get()).get('revo'));
  if (process.env.FUNCTIONS_EMULATOR !== 'true') releaseCache = { value, until: Date.now() + RELEASE_CACHE_MS };
  return value;
}
const memoryOf = (db: Firestore, uid: string) => db.collection(`users/${uid}/revoMemory`);

/** The account's cached answers deleted. Returns how many. */
export async function deleteRevoAnswers(db: Firestore, uid: string): Promise<number> {
  let n = 0;
  for (;;) {
    const snap = await db.collection('revoAnswers').where('uid', '==', uid).limit(400).get();
    if (snap.empty) return n;
    const batch = db.batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
    n += snap.size;
  }
}

/** Every chat (with its messages) deleted, and the cached answers. Returns how many chats. */
export async function deleteRevoHistory(db: Firestore, uid: string): Promise<number> {
  const chats = chatsOf(db, uid);
  const n = (await chats.listDocuments()).length;
  await db.recursiveDelete(chats);
  await deleteRevoAnswers(db, uid);
  return n;
}

/** Every memory item deleted. Returns how many. */
export async function deleteRevoMemory(db: Firestore, uid: string): Promise<number> {
  const memory = memoryOf(db, uid);
  const n = (await memory.listDocuments()).length;
  await db.recursiveDelete(memory);
  return n;
}

/** All of an account's Revo data, for account deletion (with its daily count) or a reset (without). */
export async function deleteRevoData(db: Firestore, uid: string, opts: { usage: boolean }): Promise<void> {
  await deleteRevoHistory(db, uid);
  await deleteRevoMemory(db, uid);
  if (opts.usage) await db.doc(`revoUsage/${uid}`).delete();
}

function chatFields(chat: RevoChat, uid: string): Record<string, unknown> {
  const { id: _id, meta, ...rest } = chat;
  return { ...rest, uid, ...(meta !== undefined ? { meta } : {}) };
}

function asChat(id: string, d: Record<string, unknown>): RevoChat {
  const chat: RevoChat = {
    id,
    kind: d.kind === 'review' ? 'review' : 'chat',
    title: typeof d.title === 'string' ? d.title : '',
    day: typeof d.day === 'string' ? d.day : '',
    createdAt: typeof d.createdAt === 'number' ? d.createdAt : 0,
    updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : 0,
    turns: typeof d.turns === 'number' ? d.turns : 0,
  };
  if (typeof d.meta === 'string') chat.meta = d.meta;
  return chat;
}

function asMessage(id: string, d: Record<string, unknown>): StoredMessage {
  return { ...(d as unknown as StoredMessage), id };
}

export function adminRevoStore(db: Firestore): RevoStore {
  const coach = adminCoachStore(db);
  const usageRef = (uid: string) => db.doc(`revoUsage/${uid}`);
  const settingsRef = (uid: string) => db.doc(`coachSettings/${uid}`);
  const answerRef = (uid: string, key: string) => db.doc(`revoAnswers/${uid}__${key}`);
  const messagesOf = (uid: string, chatId: string) => chatsOf(db, uid).doc(chatId).collection('messages');

  return {
    release: () => revoRelease(db),
    async isPreviewTester(uid) {
      const snap = await db.doc(`users/${uid}`).get();
      return snap.exists && snap.get('previewTester') === true;
    },
    // As the app reads it (AppContext: `smartTrackingEnabled ?? false`): off unless turned on.
    async smartTracking(uid) {
      const snap = await db.doc(`users/${uid}`).get();
      return snap.exists && snap.get('smartTrackingEnabled') === true;
    },
    async getSettings(uid) {
      const snap = await settingsRef(uid).get();
      return revoSettingsOf((f) => snap.get(f));
    },
    async setSettings(uid, patch) {
      const fields: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (patch.optIn !== undefined) fields[REVO_ON] = patch.optIn;
      if (patch.memoryOn !== undefined) fields.memoryOn = patch.memoryOn;
      await settingsRef(uid).set(fields, { merge: true });
      const snap = await settingsRef(uid).get();
      return revoSettingsOf((f) => snap.get(f));
    },
    async getUsage(uid) {
      const snap = await usageRef(uid).get();
      const day = snap.get('day');
      return typeof day === 'string' ? { day, count: (snap.get('count') as number | undefined) ?? 0 } : null;
    },
    async reserveQuestion(uid, day, limit) {
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(usageRef(uid));
        const stored = snap.get('day');
        if (typeof stored === 'string' && day < stored) return { ok: false as const, reason: 'behind' as const };
        const count = stored === day ? ((snap.get('count') as number | undefined) ?? 0) : 0;
        if (count >= limit) return { ok: false as const, reason: 'daily' as const };
        tx.set(usageRef(uid), { uid, day, count: count + 1 });
        return { ok: true as const, count: count + 1 };
      });
    },
    async releaseQuestion(uid, day) {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(usageRef(uid));
        const count = (snap.get('count') as number | undefined) ?? 0;
        if (snap.get('day') === day && count > 0) tx.set(usageRef(uid), { uid, day, count: count - 1 });
      });
    },
    reserveSpend: (month, amount, cap) => coach.reserveSpend(month, amount, cap),
    monthlyCapUsd: () => coach.monthlyCapUsd!(),
    dailyCapUsd: async () => (await coachCaps(db)).daily,
    spentOn: (day) => spentOn(db, day),
    settleSpend: (month, reserved, actual, usage, day) => coach.settleSpend(month, reserved, actual, usage, day),
    async getChat(uid, chatId) {
      const snap = await chatsOf(db, uid).doc(chatId).get();
      return snap.exists ? asChat(snap.id, snap.data() as Record<string, unknown>) : null;
    },
    async getMessage(uid, chatId, id) {
      const snap = await messagesOf(uid, chatId).doc(id).get();
      return snap.exists ? asMessage(snap.id, snap.data() as Record<string, unknown>) : null;
    },
    async lastMessages(uid, chatId, n) {
      const snap = await messagesOf(uid, chatId).orderBy('at', 'desc').limit(n).get();
      return snap.docs.map((d) => asMessage(d.id, d.data())).reverse();
    },
    async saveTurn(uid, chat, messages) {
      const batch = db.batch();
      // meta is left as it is (the owner may have set it).
      const { meta: _meta, ...fields } = chatFields(chat, uid);
      batch.set(chatsOf(db, uid).doc(chat.id), fields, { merge: true });
      for (const m of messages) batch.set(messagesOf(uid, chat.id).doc(m.id), m);
      await batch.commit();
    },
    async createReview(uid, chat, message) {
      const ref = chatsOf(db, uid).doc(chat.id);
      return db.runTransaction(async (tx) => {
        if ((await tx.get(ref)).exists) return false;
        tx.set(ref, chatFields(chat, uid));
        tx.set(ref.collection('messages').doc(message.id), message);
        return true;
      });
    },
    async getAnswer(uid, key) {
      const snap = await answerRef(uid, key).get();
      const title = snap.get('title');
      const reply = snap.get('reply') as CachedAnswer['reply'] | undefined;
      return typeof title === 'string' && reply && typeof reply.text === 'string' ? { title, reply } : null;
    },
    async setAnswer(uid, key, day, answer) {
      await answerRef(uid, key).set({ uid, day, title: answer.title, reply: answer.reply, createdAt: FieldValue.serverTimestamp() });
    },
    async listMemory(uid, limit) {
      const snap = await memoryOf(db, uid).orderBy('at', 'desc').limit(limit).get();
      return snap.docs.map((d) => ({ ...(d.data() as Omit<RevoMemoryItem, 'id'>), id: d.id }));
    },
    async changeMemory(uid, add, removeIds) {
      const batch = db.batch();
      for (const { id, ...item } of add) batch.set(memoryOf(db, uid).doc(id), item);
      for (const id of removeIds) batch.delete(memoryOf(db, uid).doc(id));
      await batch.commit();
    },
    deleteHistory: (uid) => deleteRevoHistory(db, uid),
    deleteMemory: (uid) => deleteRevoMemory(db, uid),
    newId: () => db.collection('revoChats').doc().id,
  };
}

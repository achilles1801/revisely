import { assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { getTestEnv, cleanupTestEnv } from './setup';

// Revo (functions/src/revo): the functions write everything; the owner reads their own and
// changes only a chat's meta, a reply's feedback and action state, and deletes memory items.
const ALICE = 'alice';
const BOB = 'bob';

const chat = { uid: ALICE, kind: 'chat', title: 'Weak pages', day: '2026-11-06', createdAt: 1, updatedAt: 2, turns: 1 };
const reply = { id: 'm2', uid: ALICE, role: 'revo', text: 'Revise page 12 first.', at: 2, action: { kind: 'openPage', title: 'Open page 12', detail: '', page: 12 } };
const question = {
  id: 'm1',
  uid: ALICE,
  role: 'user',
  text: 'What about Tuesday?',
  at: 1,
  attach: { kind: 'note', label: 'Tuesday’s note' },
  attachData: { kind: 'note', label: 'Tuesday’s note', day: '2026-11-04', text: 'Hard day' },
};
const memoryItem = { uid: ALICE, text: 'Revises after Fajr', source: 'chat', day: '2026-11-06', chatId: 'c1', at: 3 };

describe('Revo: chats, messages, memory, settings and usage', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await getTestEnv();
  });
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `users/${ALICE}`), { uid: ALICE, createdAt: 'x', updatedAt: 'x', dailyPageCapacity: 20, previewTester: true });
      await setDoc(doc(db, `users/${ALICE}/revoChats/c1`), chat);
      await setDoc(doc(db, `users/${ALICE}/revoChats/c1/messages/m1`), question);
      await setDoc(doc(db, `users/${ALICE}/revoChats/c1/messages/m2`), reply);
      await setDoc(doc(db, `users/${ALICE}/revoMemory/k1`), memoryItem);
      await setDoc(doc(db, `coachSettings/${ALICE}`), { optIn: true, memoryOn: true });
      await setDoc(doc(db, `revoUsage/${ALICE}`), { uid: ALICE, day: '2026-11-06', count: 3 });
      await setDoc(doc(db, `revoAnswers/${ALICE}__abc`), { uid: ALICE, day: '2026-11-06', title: 't', reply: { text: 'x' } });
    });
  });
  afterEach(async () => {
    await env.clearFirestore();
  });
  afterAll(async () => {
    await cleanupTestEnv();
  });

  it('[REVO-10] the owner reads their chats, messages (with the attachment), memory, settings and usage', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(getDoc(doc(alice, `users/${ALICE}/revoChats/c1`)));
    await assertSucceeds(getDocs(collection(alice, `users/${ALICE}/revoChats`)));
    await assertSucceeds(getDoc(doc(alice, `users/${ALICE}/revoChats/c1/messages/m1`)));
    await assertSucceeds(getDocs(collection(alice, `users/${ALICE}/revoChats/c1/messages`)));
    await assertSucceeds(getDocs(collection(alice, `users/${ALICE}/revoMemory`)));
    await assertSucceeds(getDoc(doc(alice, `coachSettings/${ALICE}`)));
    await assertSucceeds(getDoc(doc(alice, `revoUsage/${ALICE}`)));
  });

  it('[REVO-10] nobody else reads them, signed in or not', async () => {
    for (const other of [env.authenticatedContext(BOB).firestore(), env.unauthenticatedContext().firestore()]) {
      await assertFails(getDoc(doc(other, `users/${ALICE}/revoChats/c1`)));
      await assertFails(getDocs(collection(other, `users/${ALICE}/revoChats`)));
      await assertFails(getDoc(doc(other, `users/${ALICE}/revoChats/c1/messages/m1`)));
      await assertFails(getDocs(collection(other, `users/${ALICE}/revoMemory`)));
      await assertFails(getDoc(doc(other, `users/${ALICE}/revoMemory/k1`)));
      await assertFails(getDoc(doc(other, `coachSettings/${ALICE}`)));
      await assertFails(getDoc(doc(other, `revoUsage/${ALICE}`)));
    }
  });

  it('[REVO-1] settings and usage: only a get of one’s own, and no writes (no opting in or refilling the day from the app)', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(getDocs(collection(alice, 'coachSettings')));
    await assertFails(getDocs(query(collection(alice, 'revoUsage'), where('uid', '==', ALICE))));
    await assertFails(setDoc(doc(alice, `coachSettings/${ALICE}`), { optIn: true, memoryOn: true }));
    await assertFails(updateDoc(doc(alice, `coachSettings/${ALICE}`), { memoryOn: false }));
    await assertFails(deleteDoc(doc(alice, `coachSettings/${ALICE}`)));
    await assertFails(setDoc(doc(alice, `revoUsage/${ALICE}`), { uid: ALICE, day: '2026-11-06', count: 0 }));
    await assertFails(updateDoc(doc(alice, `revoUsage/${ALICE}`), { count: 0 }));
    await assertFails(deleteDoc(doc(alice, `revoUsage/${ALICE}`)));
    const bob = env.authenticatedContext(BOB).firestore();
    await assertFails(setDoc(doc(bob, `coachSettings/${BOB}`), { optIn: true }));
  });

  it('[REVO-5] cached answers are the server’s only', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(getDoc(doc(alice, `revoAnswers/${ALICE}__abc`)));
    await assertFails(getDocs(query(collection(alice, 'revoAnswers'), where('uid', '==', ALICE))));
    await assertFails(setDoc(doc(alice, `revoAnswers/${ALICE}__def`), { uid: ALICE, day: '2026-11-06', title: 't', reply: { text: 'x' } }));
    await assertFails(deleteDoc(doc(alice, `revoAnswers/${ALICE}__abc`)));
  });

  it('[REVO-10] nothing is created from the app: chats, messages and memory', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(setDoc(doc(alice, `users/${ALICE}/revoChats/c2`), chat));
    await assertFails(setDoc(doc(alice, `users/${ALICE}/revoChats/c1/messages/m3`), { ...reply, id: 'm3' }));
    await assertFails(setDoc(doc(alice, `users/${ALICE}/revoChats/c2/messages/m1`), question));
    await assertFails(setDoc(doc(alice, `users/${ALICE}/revoMemory/k2`), memoryItem));
  });

  it('[REVO-7] a chat: the owner may only mark its plan added', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    const c = doc(alice, `users/${ALICE}/revoChats/c1`);
    await assertSucceeds(updateDoc(c, { meta: 'plan added' }));
    await assertFails(updateDoc(c, { meta: 'anything else' }));
    await assertFails(updateDoc(c, { meta: deleteField() }));
    await assertFails(updateDoc(c, { title: 'Renamed' }));
    await assertFails(updateDoc(c, { meta: 'plan added', turns: 0 }));
    await assertFails(deleteDoc(c));
    await assertFails(updateDoc(doc(env.authenticatedContext(BOB).firestore(), `users/${ALICE}/revoChats/c1`), { meta: 'plan added' }));
  });

  it('[REVO-7] a message: the owner may only rate it (up, down or none) and mark its action added or dismissed', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    const m = doc(alice, `users/${ALICE}/revoChats/c1/messages/m2`);
    await assertSucceeds(updateDoc(m, { feedback: 'up' }));
    await assertSucceeds(updateDoc(m, { feedback: 'down' }));
    await assertSucceeds(updateDoc(m, { feedback: null }));
    await assertSucceeds(updateDoc(m, { actionState: 'added' }));
    await assertSucceeds(updateDoc(m, { actionState: 'dismissed', feedback: 'up' }));
    await assertFails(updateDoc(m, { feedback: 'meh' }));
    await assertFails(updateDoc(m, { actionState: 'done' }));
    await assertFails(updateDoc(m, { actionState: deleteField() }));
    await assertFails(updateDoc(m, { text: 'Edited' }));
    await assertFails(updateDoc(m, { feedback: 'up', text: 'Edited' }));
    await assertFails(updateDoc(doc(alice, `users/${ALICE}/revoChats/c1/messages/m1`), { attachData: { kind: 'note' } }));
    await assertFails(deleteDoc(m));
    await assertFails(updateDoc(doc(env.authenticatedContext(BOB).firestore(), `users/${ALICE}/revoChats/c1/messages/m2`), { feedback: 'up' }));
  });

  it('[REVO-8] a memory item: the owner deletes it, nobody changes it, nobody else deletes it', async () => {
    const bob = env.authenticatedContext(BOB).firestore();
    await assertFails(deleteDoc(doc(bob, `users/${ALICE}/revoMemory/k1`)));
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(updateDoc(doc(alice, `users/${ALICE}/revoMemory/k1`), { text: 'Something else' }));
    await assertSucceeds(deleteDoc(doc(alice, `users/${ALICE}/revoMemory/k1`)));
  });
});

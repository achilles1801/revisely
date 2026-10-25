import { assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { getTestEnv, cleanupTestEnv } from './setup';

const ALICE = 'alice';
const BOB = 'bob';

const recording = (extra: Record<string, unknown> = {}) => ({
  kind: 'revision',
  day: '2026-10-25',
  createdAt: 1793000000000,
  durationMs: 61000,
  pageMarks: [{ atMs: 0, page: 3 }],
  segments: [{ fileName: '1793000000000-ab12cd-0.m4a', durationMs: 61000, sizeBytes: 730000 }],
  updatedAt: new Date(),
  ...extra,
});

describe('recording backup: users/{uid}/recordings', () => {
  let env: RulesTestEnvironment;
  const userDoc = (extra: Record<string, unknown> = {}) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${ALICE}`), {
        uid: ALICE,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        dailyPageCapacity: 20,
        ...extra,
      });
    });
  beforeAll(async () => {
    env = await getTestEnv();
  });
  beforeEach(async () => {
    await userDoc();
  });
  afterEach(async () => {
    await env.clearFirestore();
  });
  afterAll(async () => {
    await cleanupTestEnv();
  });

  it('the owner writes, reads and deletes a recording record', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    const r = doc(alice, `users/${ALICE}/recordings/rec-1`);
    await assertSucceeds(setDoc(r, recording()));
    await assertSucceeds(getDoc(r));
    await assertSucceeds(updateDoc(r, { durationMs: 70000, updatedAt: new Date() }));
    await assertSucceeds(deleteDoc(r));
  });

  it('nobody else can read or write it', async () => {
    const bob = env.authenticatedContext(BOB).firestore();
    await assertFails(setDoc(doc(bob, `users/${ALICE}/recordings/rec-1`), recording()));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${ALICE}/recordings/rec-1`), recording());
    });
    await assertFails(getDoc(doc(bob, `users/${ALICE}/recordings/rec-1`)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `users/${ALICE}/recordings/rec-1`)));
  });

  it('a deleted recording leaves a tombstone (deletedAt, the server time, nothing else)', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    const r = doc(alice, `users/${ALICE}/recordings/rec-3`);
    await assertSucceeds(setDoc(r, recording()));
    await assertFails(setDoc(r, { deletedAt: new Date(0) }));
    await assertFails(setDoc(r, { deletedAt: serverTimestamp(), note: 'x' }));
    await assertSucceeds(setDoc(r, { deletedAt: serverTimestamp() }));
    const bob = env.authenticatedContext(BOB).firestore();
    await assertFails(setDoc(doc(bob, `users/${ALICE}/recordings/rec-3`), { deletedAt: serverTimestamp() }));
  });

  it('a tombstone is permanent: never written over, never deleted', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    const r = doc(alice, `users/${ALICE}/recordings/rec-4`);
    await assertSucceeds(setDoc(r, { deletedAt: serverTimestamp() }));
    await assertFails(setDoc(r, recording()));
    await assertFails(deleteDoc(r));
    await assertSucceeds(getDoc(r));
  });

  it('records are written only while the account’s backup is on; tombstones always', async () => {
    await userDoc({ recordingBackup: false });
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(setDoc(doc(alice, `users/${ALICE}/recordings/rec-5`), recording()));
    await assertSucceeds(setDoc(doc(alice, `users/${ALICE}/recordings/rec-6`), { deletedAt: serverTimestamp() }));
    await userDoc({ recordingBackup: true });
    await assertSucceeds(setDoc(doc(alice, `users/${ALICE}/recordings/rec-5`), recording()));
  });

  it('refuses malformed records (unknown fields, bad kind, no segments)', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    const r = doc(alice, `users/${ALICE}/recordings/rec-2`);
    await assertFails(setDoc(r, recording({ isAdmin: true })));
    await assertFails(setDoc(r, recording({ kind: 'podcast' })));
    await assertFails(setDoc(r, recording({ segments: [] })));
    await assertFails(setDoc(r, recording({ day: 'yesterday' })));
  });

  it('the user can turn backup and mobile-data backup on and off', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(updateDoc(doc(alice, `users/${ALICE}`), { recordingBackup: false, recordingBackupCellular: true }));
  });
});

describe('recording backup: Storage recordings/{uid}/', () => {
  let env: RulesTestEnvironment;
  const audio = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
  beforeAll(async () => {
    env = await getTestEnv();
  });
  afterEach(async () => {
    await env.clearStorage();
  });
  afterAll(async () => {
    await cleanupTestEnv();
  });

  it('the owner uploads, downloads and deletes their audio', async () => {
    const storage = env.authenticatedContext(ALICE).storage();
    const r = ref(storage, `recordings/${ALICE}/rec-1-0.m4a`);
    await assertSucceeds(uploadBytes(r, audio, { contentType: 'audio/mp4' }));
    await assertSucceeds(getBytes(r));
    await assertSucceeds(deleteObject(r));
  });

  it('nobody else can read, overwrite or delete it, signed in or not', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `recordings/${ALICE}/rec-1-0.m4a`), audio, { contentType: 'audio/mp4' });
    });
    const bob = env.authenticatedContext(BOB).storage();
    await assertFails(getBytes(ref(bob, `recordings/${ALICE}/rec-1-0.m4a`)));
    await assertFails(uploadBytes(ref(bob, `recordings/${ALICE}/rec-1-0.m4a`), audio, { contentType: 'audio/mp4' }));
    await assertFails(deleteObject(ref(bob, `recordings/${ALICE}/rec-1-0.m4a`)));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), `recordings/${ALICE}/rec-1-0.m4a`)));
  });

  it('a file is never overwritten, even by its owner', async () => {
    const storage = env.authenticatedContext(ALICE).storage();
    const r = ref(storage, `recordings/${ALICE}/rec-9-0.m4a`);
    await assertSucceeds(uploadBytes(r, audio, { contentType: 'audio/mp4' }));
    await assertFails(uploadBytes(r, new Uint8Array([1, 2, 3]), { contentType: 'audio/mp4' }));
    // Deleted, the name can be used again (backup turned back on after deleting it).
    await assertSucceeds(deleteObject(r));
    await assertSucceeds(uploadBytes(r, audio, { contentType: 'audio/mp4' }));
  });

  it('only audio is accepted', async () => {
    const storage = env.authenticatedContext(ALICE).storage();
    await assertFails(uploadBytes(ref(storage, `recordings/${ALICE}/x.png`), audio, { contentType: 'image/png' }));
  });

  it('everything outside the known paths stays closed', async () => {
    const storage = env.authenticatedContext(ALICE).storage();
    await assertFails(uploadBytes(ref(storage, `other/${ALICE}/x.m4a`), audio, { contentType: 'audio/mp4' }));
  });
});

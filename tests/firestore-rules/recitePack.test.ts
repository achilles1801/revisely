import { assertFails, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import { getTestEnv, cleanupTestEnv } from './setup';

// Recite's pack for the phone (functions recitePack): the key and the limits are the function's alone. A client that
// could read recitePackKeys would have the pack's key, and one that could write recitePackLimits could lift its limit.
const DOCS: [string, Record<string, unknown>][] = [
  ['recitePacks/current', { packId: 'v7m-1', apps: [], claim: 'onDeviceBench' }],
  ['recitePackKeys/v7m-1', { key: 'AAAA' }],
  ['recitePackLimits/alice', { day: '2026-11-23', calls: 6, keys: ['k'] }],
];

describe('recitePack’s documents', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await getTestEnv();
  });

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      for (const [path, data] of DOCS) await setDoc(doc(ctx.firestore(), path), data);
    });
  });

  afterEach(async () => {
    await env.clearFirestore();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  it.each(DOCS)('%s: no client reads, writes or deletes it, its own account included', async (path) => {
    const clients = [
      env.authenticatedContext('alice', { onDeviceBench: true }).firestore(),
      env.authenticatedContext('bob').firestore(),
      env.unauthenticatedContext().firestore(),
    ];
    for (const db of clients) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { calls: 0 }));
      await assertFails(deleteDoc(doc(db, path)));
    }
  });
});

describe('the sealed pack in Storage', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await getTestEnv();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  it('no client reads, writes or deletes it, the bench’s claim included', async () => {
    const path = 'packs/recite/v7m-1/core.rcpk';
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), path), new Uint8Array([1, 2, 3]));
    });
    const clients = [
      env.authenticatedContext('alice', { onDeviceBench: true }).storage(),
      env.authenticatedContext('bob').storage(),
      env.unauthenticatedContext().storage(),
    ];
    for (const storage of clients) {
      await assertFails(getBytes(ref(storage, path)));
      await assertFails(uploadBytes(ref(storage, 'packs/recite/v7m-1/new.rcpk'), new Uint8Array([1])));
      await assertFails(deleteObject(ref(storage, path)));
    }
  });
});

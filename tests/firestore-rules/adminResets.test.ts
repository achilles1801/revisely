import { assertFails, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import { getTestEnv, cleanupTestEnv } from './setup';

// adminResets/<uid>: how often each account reset (functions resetMyData).
// Only the function writes it; a client could otherwise lift its own limit.
describe('adminResets (tester reset log)', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await getTestEnv();
  });

  afterEach(async () => {
    await env.clearFirestore();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'adminResets/alice'), { day: '2026-11-05', attempts: 3, lastDoneAt: 1 });
    });
  });

  it('the account cannot read its own log', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(getDoc(doc(alice, 'adminResets/alice')));
  });

  it('the account cannot reset, lower or delete its own log', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(alice, 'adminResets/alice'), { attempts: 0, lastDoneAt: null }));
    await assertFails(deleteDoc(doc(alice, 'adminResets/alice')));
  });

  it('no one else can read or write it, signed in or not', async () => {
    const bob = env.authenticatedContext('bob').firestore();
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(bob, 'adminResets/alice')));
    await assertFails(setDoc(doc(bob, 'adminResets/bob'), { attempts: 0 }));
    await assertFails(getDoc(doc(anon, 'adminResets/alice')));
  });
});

// Storage backups/tester-resets/<uid>/…: the backup taken before a tester reset.
describe('tester reset backups in Storage', () => {
  let env: RulesTestEnvironment;
  const path = 'backups/tester-resets/alice/2026-11-05T06-00-00-000Z/firestore.json';
  const json = new TextEncoder().encode('{"docs":[]}');

  beforeAll(async () => {
    env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), path), json, { contentType: 'application/json' });
    });
  });

  afterAll(async () => {
    await env.clearStorage();
    await cleanupTestEnv();
  });

  it('the account itself cannot read, replace or delete its backup', async () => {
    const alice = env.authenticatedContext('alice').storage();
    await assertFails(getBytes(ref(alice, path)));
    await assertFails(uploadBytes(ref(alice, path), json, { contentType: 'application/json' }));
    await assertFails(deleteObject(ref(alice, path)));
  });

  it('no one else can, signed in or not, nor write a backup of their own', async () => {
    await assertFails(getBytes(ref(env.authenticatedContext('bob').storage(), path)));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), path)));
    await assertFails(
      uploadBytes(ref(env.authenticatedContext('bob').storage(), 'backups/tester-resets/bob/x.json'), json, {
        contentType: 'application/json',
      }),
    );
  });
});

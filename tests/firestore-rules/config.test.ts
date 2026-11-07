import { assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getTestEnv, cleanupTestEnv } from './setup';

// config/app: read by every install, signed in or not; written only by the
// admin SDK (functions/scripts/set-app-config.js), which rules don't apply to.
describe('config/app', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await getTestEnv();
  });

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'config/app'), {
        minSupported: { ios: '1.0.3', android: '1.0.3' },
        latest: { android: '1.0.3' },
      });
    });
  });

  afterEach(async () => {
    await env.clearFirestore();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  it('anyone can read it, signed in or not', async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'config/app')));
    await assertSucceeds(getDoc(doc(env.authenticatedContext('alice').firestore(), 'config/app')));
  });

  it('reading it before it exists is allowed (no document, no error)', async () => {
    await env.clearFirestore();
    const snap = await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'config/app')));
    expect(snap.exists()).toBe(false);
  });

  it('no client can write it', async () => {
    for (const db of [env.unauthenticatedContext().firestore(), env.authenticatedContext('alice').firestore()]) {
      const ref = doc(db, 'config/app');
      await assertFails(setDoc(ref, { minSupported: { ios: '9.9.9' } }));
      await assertFails(updateDoc(ref, { 'latest.android': '9.9.9' }));
      await assertFails(deleteDoc(ref));
    }
  });

  it('other config documents stay closed', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'config/other')));
    await assertFails(getDoc(doc(env.authenticatedContext('alice').firestore(), 'config/other')));
    await assertFails(setDoc(doc(env.authenticatedContext('alice').firestore(), 'config/other'), { a: 1 }));
  });
});

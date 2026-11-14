import { assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { getTestEnv, cleanupTestEnv } from './setup';

// Revisely Premium and the support program (functions/src/support): the owner may read
// their own entitlements and application; nobody writes them from a client, and the
// program's link codes and limits are closed to everyone.
describe('Premium and the support program', () => {
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
      const db = ctx.firestore();
      const grant = { source: 'support', grantedAt: new Date(), until: null };
      await setDoc(doc(db, 'entitlements/alice'), { premium: grant, grants: { support: grant } });
      await setDoc(doc(db, 'supportApplications/alice'), { uid: 'alice', status: 'pending', createdAt: new Date(), count: 1 });
      await setDoc(doc(db, 'supportCodes/abc123'), { uid: 'alice', expiresAt: new Date() });
      await setDoc(doc(db, 'supportLimits/alice'), { day: '2026-11-14', links: 1, applies: 1 });
    });
  });

  it('the owner can get and listen to their own entitlements and application', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(alice, 'entitlements/alice')));
    await assertSucceeds(getDoc(doc(alice, 'supportApplications/alice')));
    await assertSucceeds(
      new Promise<void>((resolve, reject) => {
        const stop = onSnapshot(
          doc(alice, 'entitlements/alice'),
          () => {
            stop();
            resolve();
          },
          reject,
        );
      }),
    );
  });

  it('the owner cannot give themselves Premium, or apply or decide from a client', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    const forever = { source: 'purchase', grantedAt: new Date(), until: null };
    await assertFails(setDoc(doc(alice, 'entitlements/alice'), { premium: forever }));
    await assertFails(updateDoc(doc(alice, 'entitlements/alice'), { 'premium.until': null }));
    await assertFails(deleteDoc(doc(alice, 'entitlements/alice')));
    await assertFails(setDoc(doc(alice, 'entitlements/carol'), { premium: forever }));
    await assertFails(updateDoc(doc(alice, 'supportApplications/alice'), { status: 'approved' }));
    await assertFails(setDoc(doc(alice, 'supportApplications/dave'), { uid: 'dave', status: 'pending' }));
    await assertFails(deleteDoc(doc(alice, 'supportApplications/alice')));
  });

  it("no one reads another account's entitlements or application, or lists them", async () => {
    const bob = env.authenticatedContext('bob').firestore();
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(bob, 'entitlements/alice')));
    await assertFails(getDoc(doc(bob, 'supportApplications/alice')));
    await assertFails(getDoc(doc(anon, 'entitlements/alice')));
    await assertFails(getDocs(collection(bob, 'supportApplications')));
    await assertFails(getDocs(collection(env.authenticatedContext('alice').firestore(), 'entitlements')));
  });

  it('link codes and limits are closed, to the account itself too', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(getDoc(doc(alice, 'supportCodes/abc123')));
    await assertFails(setDoc(doc(alice, 'supportCodes/mine'), { uid: 'alice', expiresAt: new Date(2100, 0) }));
    await assertFails(getDoc(doc(alice, 'supportLimits/alice')));
    await assertFails(setDoc(doc(alice, 'supportLimits/alice'), { day: '2026-11-14', links: 0, applies: 0 }));
  });
});

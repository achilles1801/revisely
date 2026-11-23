import { assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
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
    // Early access (PREM-1) is given by the functions only: a phone can't add or keep its own early grant.
    const early = { source: 'early', grantedAt: new Date(), until: null };
    await assertFails(setDoc(doc(alice, 'entitlements/alice'), { premium: early, grants: { early } }));
    await assertFails(updateDoc(doc(alice, 'entitlements/alice'), { 'grants.early': early }));
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

  it('the console audit log (decisions, role changes), invites and access requests are closed to everyone, staff included', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'supportDecisions/d1'), { uid: 'alice', action: 'approve', note: 'internal' });
      await setDoc(doc(db, 'consoleAudit/a1'), { kind: 'role', uid: 'staff', to: 'owner' });
      await setDoc(doc(db, 'consoleInvites/new@example.com'), { email: 'new@example.com', role: 'labeller', status: 'pending' });
      await setDoc(doc(db, 'consoleRequests/alice'), { uid: 'alice', email: 'alice@example.com', status: 'pending' });
    });
    const alice = env.authenticatedContext('alice').firestore();
    const owner = env.authenticatedContext('staff', { role: 'owner', admin: true }).firestore();
    for (const db of [alice, owner, env.unauthenticatedContext().firestore()]) {
      await assertFails(getDoc(doc(db, 'supportDecisions/d1')));
      await assertFails(getDocs(collection(db, 'supportDecisions')));
      await assertFails(setDoc(doc(db, 'supportDecisions/d2'), { uid: 'alice', action: 'approve' }));
      await assertFails(getDoc(doc(db, 'consoleAudit/a1')));
      await assertFails(setDoc(doc(db, 'consoleAudit/a2'), { kind: 'role', uid: 'staff', to: 'owner' }));
      // Invites and access requests (console/invites.ts): an invite written by a client would hand out a role.
      await assertFails(getDoc(doc(db, 'consoleInvites/new@example.com')));
      await assertFails(setDoc(doc(db, 'consoleInvites/me@example.com'), { email: 'me@example.com', role: 'owner', status: 'pending' }));
      await assertFails(getDoc(doc(db, 'consoleRequests/alice')));
      await assertFails(setDoc(doc(db, 'consoleRequests/alice'), { uid: 'alice', status: 'granted' }));
    }
  });

  it('recitation clips, their audio and their labels (the console’s /label page) are closed to everyone, staff and labellers included', async () => {
    const audio = new Uint8Array([0, 1, 2, 3]);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'reciteLabelClips/c1'), { batch: 'test', status: 'open', marks: '[]' });
      await setDoc(doc(ctx.firestore(), 'reciteLabelClips/c1/labels/staff'), { by: { uid: 'staff' }, marks: {} });
      await uploadBytes(ref(ctx.storage(), 'recite-labels/test/c1.m4a'), audio, { contentType: 'audio/mp4' });
    });
    const people = [
      env.authenticatedContext('alice'),
      env.authenticatedContext('staff', { role: 'owner', admin: true }),
      env.authenticatedContext('teacher', { role: 'labeller' }),
      env.unauthenticatedContext(),
    ];
    for (const who of people) {
      const db = who.firestore();
      await assertFails(getDoc(doc(db, 'reciteLabelClips/c1')));
      await assertFails(getDocs(collection(db, 'reciteLabelClips')));
      await assertFails(setDoc(doc(db, 'reciteLabelClips/c2'), { batch: 'test', status: 'open' }));
      await assertFails(updateDoc(doc(db, 'reciteLabelClips/c1'), { status: 'done' }));
      // A labeller's own label too: labels go through the console only, which checks and logs them.
      await assertFails(getDoc(doc(db, 'reciteLabelClips/c1/labels/staff')));
      await assertFails(setDoc(doc(db, 'reciteLabelClips/c1/labels/teacher'), { by: { uid: 'teacher' }, marks: {} }));
      await assertFails(getBytes(ref(who.storage(), 'recite-labels/test/c1.m4a')));
      await assertFails(uploadBytes(ref(who.storage(), 'recite-labels/test/c2.m4a'), audio, { contentType: 'audio/mp4' }));
    }
  });

  it('the owner can read a revoked application of their own, and still not change it', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'supportApplications/alice'), { uid: 'alice', status: 'revoked', createdAt: new Date(), count: 1 });
    });
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(alice, 'supportApplications/alice')));
    await assertFails(updateDoc(doc(alice, 'supportApplications/alice'), { status: 'approved' }));
  });
});

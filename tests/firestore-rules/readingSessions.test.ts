import {
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { getTestEnv, cleanupTestEnv } from './setup';

const ALICE = 'alice';
const BOB = 'bob';

function validSession(overrides: Record<string, unknown> = {}) {
  const start = Timestamp.fromMillis(1_790_000_000_000);
  return {
    date: '2026-09-29',
    startedAt: start,
    endedAt: Timestamp.fromMillis(start.toMillis() + 3_600_000),
    durationSeconds: 3600,
    mode: 'countDown',
    targetSeconds: 3600,
    pages: [],
    pagesVisited: [45, 46],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

describe('users/{userId}/readingSessions/{id}', () => {
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

  it('owner can create, read, edit pages, and delete', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    const ref = doc(alice, `users/${ALICE}/readingSessions/s1`);
    await assertSucceeds(setDoc(ref, validSession()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, { pages: [45, 46, 47], updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(ref));
  });

  it('allows a stopwatch session with no target', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(
      setDoc(
        doc(alice, `users/${ALICE}/readingSessions/s1`),
        validSession({ mode: 'stopwatch', targetSeconds: null }),
      ),
    );
  });

  it('rejects timing edits after the fact', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    const ref = doc(alice, `users/${ALICE}/readingSessions/s1`);
    await assertSucceeds(setDoc(ref, validSession()));
    await assertFails(updateDoc(ref, { durationSeconds: 99999 }));
  });

  it('rejects bad shapes', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    const ref = doc(alice, `users/${ALICE}/readingSessions/s1`);
    await assertFails(setDoc(ref, validSession({ mode: 'turbo' })));
    await assertFails(setDoc(ref, validSession({ durationSeconds: -1 })));
    await assertFails(setDoc(ref, validSession({ isAdmin: true })));
    await assertFails(setDoc(ref, validSession({ date: 'yesterday' })));
  });

  it("other users can't read or write", async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(doc(alice, `users/${ALICE}/readingSessions/s1`), validSession()));
    const bob = env.authenticatedContext(BOB).firestore();
    await assertFails(getDoc(doc(bob, `users/${ALICE}/readingSessions/s1`)));
    await assertFails(setDoc(doc(bob, `users/${ALICE}/readingSessions/s2`), validSession()));
  });
});

describe('users/{userId}/stats/usage', () => {
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

  it('owner can accumulate seconds with increment()', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    const ref = doc(alice, `users/${ALICE}/stats/usage`);
    await assertSucceeds(
      setDoc(ref, { appSeconds: increment(30), updatedAt: serverTimestamp() }, { merge: true }),
    );
    await assertSucceeds(
      setDoc(ref, { appSeconds: increment(45), updatedAt: serverTimestamp() }, { merge: true }),
    );
    await assertSucceeds(getDoc(ref));
  });

  it('rejects decreasing the total or extra fields', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    const ref = doc(alice, `users/${ALICE}/stats/usage`);
    await assertSucceeds(setDoc(ref, { appSeconds: 100, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ref, { appSeconds: 10, updatedAt: serverTimestamp() }));
    await assertFails(
      setDoc(ref, { appSeconds: 200, updatedAt: serverTimestamp(), isAdmin: true }),
    );
  });

  it("other users can't read or write", async () => {
    const bob = env.authenticatedContext(BOB).firestore();
    await assertFails(getDoc(doc(bob, `users/${ALICE}/stats/usage`)));
    await assertFails(setDoc(doc(bob, `users/${ALICE}/stats/usage`), { appSeconds: 1 }));
  });
});

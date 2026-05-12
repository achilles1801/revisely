import {
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { getTestEnv, cleanupTestEnv } from './setup';

const ALICE = 'alice';
const BOB = 'bob';

function validPage(pageNumber: number) {
  return {
    pageNumber,
    status: 'memorized',
    weaknessRating: 4,
    totalRevisionCount: 0,
    skipCount: 0,
  };
}

describe('users/{userId}/pages/{pageId}', () => {
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

  describe('create', () => {
    it('owner can create a page where pageId matches pageNumber', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertSucceeds(setDoc(doc(alice, `users/${ALICE}/pages/1`), validPage(1)));
    });

    it('rejects when pageId does not match pageNumber', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(setDoc(doc(alice, `users/${ALICE}/pages/1`), validPage(2)));
    });

    it('rejects pageNumber below 1', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(setDoc(doc(alice, `users/${ALICE}/pages/0`), validPage(0)));
    });

    it('rejects pageNumber above 604', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(setDoc(doc(alice, `users/${ALICE}/pages/605`), validPage(605)));
    });

    it('rejects invalid status values', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const bad = { ...validPage(1), status: 'mastered' as any };
      await assertFails(setDoc(doc(alice, `users/${ALICE}/pages/1`), bad));
    });

    it('rejects weaknessRating outside 1–5', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const bad = { ...validPage(1), weaknessRating: 7 };
      await assertFails(setDoc(doc(alice, `users/${ALICE}/pages/1`), bad));
    });

    it('rejects writes by another user', async () => {
      const bob = env.authenticatedContext(BOB).firestore();
      await assertFails(setDoc(doc(bob, `users/${ALICE}/pages/1`), validPage(1)));
    });
  });

  describe('update', () => {
    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `users/${ALICE}/pages/1`), validPage(1));
      });
    });

    it('owner can update an allowlisted field', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertSucceeds(
        updateDoc(doc(alice, `users/${ALICE}/pages/1`), { weaknessRating: 2 }),
      );
    });

    it('rejects updates that change pageNumber', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(
        updateDoc(doc(alice, `users/${ALICE}/pages/1`), { pageNumber: 2 }),
      );
    });

    it('rejects writes to non-allowlisted fields', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(
        updateDoc(doc(alice, `users/${ALICE}/pages/1`), { customRanking: 99 } as any),
      );
    });
  });
});

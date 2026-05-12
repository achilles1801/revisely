import {
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getTestEnv, cleanupTestEnv } from './setup';

const ALICE = 'alice';
const BOB = 'bob';

function validUser(uid: string) {
  return {
    uid,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dailyPageCapacity: 20,
    dangerThresholdDays: 10,
    revisionMode: 'weighted',
    theme: 'dark',
    streak: 0,
    totalMemorizedPages: 0,
    totalLearningPages: 0,
  };
}

describe('users/{userId}', () => {
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

  describe('read', () => {
    it('owner can read their user doc', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `users/${ALICE}`), validUser(ALICE));
      });

      const alice = env.authenticatedContext(ALICE).firestore();
      await assertSucceeds(getDoc(doc(alice, `users/${ALICE}`)));
    });

    it('another user cannot read someone else’s user doc', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `users/${ALICE}`), validUser(ALICE));
      });

      const bob = env.authenticatedContext(BOB).firestore();
      await assertFails(getDoc(doc(bob, `users/${ALICE}`)));
    });

    it('unauthenticated requests cannot read user docs', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `users/${ALICE}`), validUser(ALICE));
      });

      const anon = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(anon, `users/${ALICE}`)));
    });
  });

  describe('create', () => {
    it('owner can create a valid user doc', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertSucceeds(setDoc(doc(alice, `users/${ALICE}`), validUser(ALICE)));
    });

    it('rejects creates where document uid does not match the auth uid', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(setDoc(doc(alice, `users/${ALICE}`), validUser(BOB)));
    });

    it('rejects creates where dailyPageCapacity is out of range', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const bad = { ...validUser(ALICE), dailyPageCapacity: 999 };
      await assertFails(setDoc(doc(alice, `users/${ALICE}`), bad));
    });

    it('rejects creates missing required fields', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const { revisionMode, ...incomplete } = validUser(ALICE);
      void revisionMode;
      await assertFails(setDoc(doc(alice, `users/${ALICE}`), incomplete));
    });

    it('rejects creates by another user against my path', async () => {
      const bob = env.authenticatedContext(BOB).firestore();
      await assertFails(setDoc(doc(bob, `users/${ALICE}`), validUser(ALICE)));
    });
  });

  describe('update', () => {
    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `users/${ALICE}`), validUser(ALICE));
      });
    });

    it('owner can update an allowlisted field (theme)', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertSucceeds(updateDoc(doc(alice, `users/${ALICE}`), { theme: 'light' }));
    });

    it('rejects writes to non-allowlisted fields (e.g., isAdmin injection)', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(updateDoc(doc(alice, `users/${ALICE}`), { isAdmin: true } as any));
    });

    it('rejects negative streak', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(updateDoc(doc(alice, `users/${ALICE}`), { streak: -1 }));
    });

    it('rejects totalMemorizedPages above 604', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(
        updateDoc(doc(alice, `users/${ALICE}`), { totalMemorizedPages: 605 }),
      );
    });

    it('rejects updates by a different user', async () => {
      const bob = env.authenticatedContext(BOB).firestore();
      await assertFails(updateDoc(doc(bob, `users/${ALICE}`), { theme: 'light' }));
    });
  });

  describe('delete', () => {
    it('owner cannot delete their account doc', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `users/${ALICE}`), validUser(ALICE));
      });
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails((await import('firebase/firestore')).deleteDoc(doc(alice, `users/${ALICE}`)));
    });
  });
});

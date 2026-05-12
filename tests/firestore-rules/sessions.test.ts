import {
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { getTestEnv, cleanupTestEnv } from './setup';

const ALICE = 'alice';
const BOB = 'bob';

function validSession(date: string) {
  return {
    id: date,
    date,
    state: 'NOT_STARTED',
    assignedPages: [1, 2, 3],
    pagesRevised: [],
    pagesSkipped: [],
  };
}

describe('users/{userId}/sessions/{sessionId}', () => {
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
    it('owner can create a session whose id matches the date', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const date = '2026-05-10';
      await assertSucceeds(
        setDoc(doc(alice, `users/${ALICE}/sessions/${date}`), validSession(date)),
      );
    });

    it('rejects when sessionId does not match the date field', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(
        setDoc(
          doc(alice, `users/${ALICE}/sessions/2026-05-10`),
          validSession('2026-05-11'),
        ),
      );
    });

    it('rejects malformed date strings', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const bad = validSession('05/10/2026');
      await assertFails(setDoc(doc(alice, `users/${ALICE}/sessions/05/10/2026`), bad));
    });

    it('rejects assignedPages above 100 entries', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const date = '2026-05-10';
      const oversized = {
        ...validSession(date),
        assignedPages: Array.from({ length: 101 }, (_, i) => i + 1),
      };
      await assertFails(setDoc(doc(alice, `users/${ALICE}/sessions/${date}`), oversized));
    });

    it('rejects writes by another user', async () => {
      const bob = env.authenticatedContext(BOB).firestore();
      const date = '2026-05-10';
      await assertFails(
        setDoc(doc(bob, `users/${ALICE}/sessions/${date}`), validSession(date)),
      );
    });
  });

  describe('update', () => {
    const DATE = '2026-05-10';

    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), `users/${ALICE}/sessions/${DATE}`),
          { ...validSession(DATE), state: 'IN_PROGRESS' },
        );
      });
    });

    it('owner can transition IN_PROGRESS → COMPLETED', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertSucceeds(
        updateDoc(doc(alice, `users/${ALICE}/sessions/${DATE}`), {
          state: 'COMPLETED',
          completionPercentage: 100,
        }),
      );
    });

    it('rejects transition COMPLETED → IN_PROGRESS', async () => {
      // First mark as completed
      await env.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), `users/${ALICE}/sessions/${DATE}`), {
          state: 'COMPLETED',
        });
      });

      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(
        updateDoc(doc(alice, `users/${ALICE}/sessions/${DATE}`), {
          state: 'IN_PROGRESS',
        }),
      );
    });

    it('rejects changing assignedPages after creation', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(
        updateDoc(doc(alice, `users/${ALICE}/sessions/${DATE}`), {
          assignedPages: [99, 100],
        }),
      );
    });

    it('rejects writes to non-allowlisted fields', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(
        updateDoc(doc(alice, `users/${ALICE}/sessions/${DATE}`), {
          adminFlag: true,
        } as any),
      );
    });

    it('rejects completionPercentage above 100', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(
        updateDoc(doc(alice, `users/${ALICE}/sessions/${DATE}`), {
          completionPercentage: 150,
        }),
      );
    });
  });
});

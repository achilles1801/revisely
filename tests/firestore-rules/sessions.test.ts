import {
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
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

    it('rejects assignedPages above 604 entries (a full mushaf)', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const date = '2026-05-10';
      const oversized = {
        ...validSession(date),
        assignedPages: Array.from({ length: 605 }, (_, i) => i + 1),
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

  // The outbox (src/lib/offline) creates a day's session with the whole
  // document, then updates it with the session's mutable fields only.
  describe('from the outbox', () => {
    const created = Timestamp.fromMillis(1_793_600_000_000);
    const full = (over: Record<string, unknown> = {}) => ({
      ...validSession('2026-11-02'),
      state: 'IN_PROGRESS',
      createdAt: created,
      updatedAt: serverTimestamp(),
      completedAt: null,
      durationMinutes: 12,
      totalAssignedPages: 3,
      pagesRevised: [1],
      weaknessUpdates: [{ pageNumber: 1, previousRating: 4, newRating: 2, changedAt: created }],
      completionPercentage: 33.33333333333333,
      ...over,
    });
    const mutable = (s: Record<string, unknown>) => ({
      state: s.state,
      pagesRevised: s.pagesRevised,
      pagesSkipped: s.pagesSkipped,
      weaknessUpdates: s.weaknessUpdates,
      durationMinutes: s.durationMinutes,
      completionPercentage: s.completionPercentage,
      assignedPages: s.assignedPages,
      totalAssignedPages: s.totalAssignedPages,
      ...(s.ahead !== undefined ? { ahead: s.ahead } : {}),
      updatedAt: serverTimestamp(),
    });

    it('creates the day with the whole document, then merges into it (twice is fine)', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const ref = doc(alice, `users/${ALICE}/sessions/2026-11-02`);
      await assertSucceeds(setDoc(ref, full()));
      const merged = full({ pagesRevised: [1, 2], durationMinutes: 15, completionPercentage: 66.66666666666666 });
      await assertSucceeds(updateDoc(ref, mutable(merged)));
      await assertSucceeds(updateDoc(ref, mutable(merged)));
      const done = full({ state: 'COMPLETED', pagesRevised: [1, 2, 3], assignedPages: [1, 2, 3, 4], totalAssignedPages: 4, completionPercentage: 75 });
      await assertSucceeds(updateDoc(ref, mutable(done)));
      await assertSucceeds(updateDoc(ref, mutable(done)));
    });

    it('an edit sets revised and skipped pages, minutes and ratings', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const ref = doc(alice, `users/${ALICE}/sessions/2026-11-02`);
      await assertSucceeds(setDoc(ref, full()));
      await assertSucceeds(
        updateDoc(ref, { pagesRevised: [2], pagesSkipped: [1], durationMinutes: null, weaknessUpdates: [], updatedAt: serverTimestamp() }),
      );
    });

    // Revising ahead (#168): pages credited to a later day, as a map from the day.
    it('writes pages revised ahead, keyed by the day they count for', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const ref = doc(alice, `users/${ALICE}/sessions/2026-11-02`);
      await assertSucceeds(setDoc(ref, full()));
      await assertSucceeds(updateDoc(ref, mutable(full({ ahead: { '2026-11-03': [4, 5] } }))));
      await assertSucceeds(updateDoc(ref, mutable(full({ ahead: {} }))));
    });

    it('rejects ahead credit that is not a map', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const ref = doc(alice, `users/${ALICE}/sessions/2026-11-02`);
      await assertSucceeds(setDoc(ref, full()));
      await assertFails(updateDoc(ref, mutable(full({ ahead: [4, 5] }))));
    });

    it('creates a session with pages revised ahead, and rejects a list there too', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertSucceeds(setDoc(doc(alice, `users/${ALICE}/sessions/2026-11-02`), full({ ahead: { '2026-11-03': [4] } })));
      await assertFails(setDoc(doc(alice, `users/${ALICE}/sessions/2026-11-04`), { ...validSession('2026-11-04'), ahead: [4] }));
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

    it('rejects replacing assignedPages', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(
        updateDoc(doc(alice, `users/${ALICE}/sessions/${DATE}`), {
          assignedPages: [99, 100],
        }),
      );
    });

    it('allows assignedPages to shrink to some of them (the day’s end moved to the next day)', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertSucceeds(
        updateDoc(doc(alice, `users/${ALICE}/sessions/${DATE}`), {
          assignedPages: [1, 2],
          totalAssignedPages: 2,
        }),
      );
    });

    it('rejects dropping some assigned pages and adding others in one write', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(
        updateDoc(doc(alice, `users/${ALICE}/sessions/${DATE}`), {
          assignedPages: [1, 2, 40],
          totalAssignedPages: 3,
        }),
      );
    });

    it('rejects another user shrinking the assigned pages', async () => {
      const bob = env.authenticatedContext(BOB).firestore();
      await assertFails(
        updateDoc(doc(bob, `users/${ALICE}/sessions/${DATE}`), {
          assignedPages: [1],
          totalAssignedPages: 1,
        }),
      );
    });

    it('allows assignedPages to grow (pages carried into the day)', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertSucceeds(
        updateDoc(doc(alice, `users/${ALICE}/sessions/${DATE}`), {
          assignedPages: [1, 2, 3, 40, 41],
          totalAssignedPages: 5,
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

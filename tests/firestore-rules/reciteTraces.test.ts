import { assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { getTestEnv, cleanupTestEnv } from './setup';

// Recite's turn traces (lib/reciteLive/turnTrace; Revisely Dev, J6): each live take's trail of frames and page turns,
// numbers only, written once by the owner when the take ends. Nobody else reads or writes it.
const ALICE = 'alice';
const BOB = 'bob';
const path = (uid: string, id: string) => `users/${uid}/reciteTraces/${id}`;

function trace(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    take: '20261126-012723-903951',
    app: '1.0.5 (27) dev f809a0bc',
    at: 1_764_120_443_000,
    steps: ['0.0 start check page 341', '7.2 locked 43849 page t7', '7.2 apply 9 place 43852 said 43851 listening'],
    stall: 0,
    cut: 0,
    ...over,
  };
}

describe("Recite's turn traces: users/<uid>/reciteTraces", () => {
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

  it('the owner writes a take’s trail, reads it back and deletes it', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(doc(alice, path(ALICE, 't1')), trace()));
    await assertSucceeds(setDoc(doc(alice, path(ALICE, 't2')), trace({ take: null, stall: 3200, cut: 12 })));
    await assertSucceeds(getDoc(doc(alice, path(ALICE, 't1'))));
    await assertSucceeds(deleteDoc(doc(alice, path(ALICE, 't1'))));
  });

  it('nobody else reads or writes it, and signed out nobody does', async () => {
    const bob = env.authenticatedContext(BOB).firestore();
    await assertFails(setDoc(doc(bob, path(ALICE, 't1')), trace()));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path(ALICE, 't1')), trace());
    });
    await assertFails(getDoc(doc(bob, path(ALICE, 't1'))));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path(ALICE, 't1'))));
  });

  it('only its own fields, in their shapes', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(setDoc(doc(alice, path(ALICE, 't1')), trace({ audio: 'x' })));
    await assertFails(setDoc(doc(alice, path(ALICE, 't1')), trace({ v: 2 })));
    await assertFails(setDoc(doc(alice, path(ALICE, 't1')), trace({ steps: 'all' })));
    await assertFails(setDoc(doc(alice, path(ALICE, 't1')), trace({ steps: Array.from({ length: 801 }, (_, i) => `${i}`) })));
    await assertFails(setDoc(doc(alice, path(ALICE, 't1')), trace({ stall: -1 })));
    await assertFails(setDoc(doc(alice, path(ALICE, 't1')), trace({ take: 'x'.repeat(101) })));
    const { cut: _cut, ...withoutCut } = trace();
    await assertFails(setDoc(doc(alice, path(ALICE, 't1')), withoutCut));
  });
});

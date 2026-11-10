import { assertFails, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getTestEnv, cleanupTestEnv } from './setup';

describe('default deny on unmatched paths', () => {
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

  it('rejects reads to an undefined collection', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(getDoc(doc(alice, 'admin/anything')));
  });

  it('rejects writes to an undefined collection', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(alice, 'admin/anything'), { a: 1 }));
  });
  // The owner's metrics console (functions/src/metrics): server-only, even for an account with the
  // console's admin claim, which no rule reads.
  for (const path of ['adminMetrics/totals', 'adminMetrics/alarms', 'config/admin']) {
    it(`keeps ${path} closed to every client, the console's admin included`, async () => {
      for (const ctx of [env.authenticatedContext('alice'), env.authenticatedContext('owner', { admin: true }), env.unauthenticatedContext()]) {
        const db = ctx.firestore();
        await assertFails(getDoc(doc(db, path)));
        await assertFails(setDoc(doc(db, path), { conversations: true }));
      }
    });
  }
});

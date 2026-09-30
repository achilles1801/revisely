import {
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getTestEnv, cleanupTestEnv } from './setup';

const ALICE = 'alice';
const BOB = 'bob';
const DAY = '2026-09-23';

function validEntry(date: string = DAY) {
  return {
    date,
    memorization: '1/2 p3',
    memorizationMinutes: 20,
    revision: '4p Maryam',
    revisionMinutes: 10,
    notes: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

describe('users/{userId}/journal/{day}', () => {
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

  it('owner can create, read, update, and delete an entry', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    const ref = doc(alice, `users/${ALICE}/journal/${DAY}`);
    await assertSucceeds(setDoc(ref, validEntry()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(
      setDoc(ref, { ...validEntry(), notes: 'Struggled with ayah 12' }, { merge: true }),
    );
    await assertSucceeds(deleteDoc(ref));
  });

  it('allows blank minutes (null)', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(
      setDoc(doc(alice, `users/${ALICE}/journal/${DAY}`), {
        ...validEntry(),
        memorizationMinutes: null,
      }),
    );
  });

  it('rejects when the doc id does not match the date', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(
      setDoc(doc(alice, `users/${ALICE}/journal/2026-09-24`), validEntry(DAY)),
    );
  });

  it('rejects unknown fields', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(
      setDoc(doc(alice, `users/${ALICE}/journal/${DAY}`), {
        ...validEntry(),
        isAdmin: true,
      }),
    );
  });

  it('rejects negative, fractional, or over-a-day minutes', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    const ref = doc(alice, `users/${ALICE}/journal/${DAY}`);
    await assertFails(setDoc(ref, { ...validEntry(), revisionMinutes: -1 }));
    await assertFails(setDoc(ref, { ...validEntry(), revisionMinutes: 2.5 }));
    await assertFails(setDoc(ref, { ...validEntry(), memorizationMinutes: 1441 }));
  });

  it('rejects oversized text', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    const ref = doc(alice, `users/${ALICE}/journal/${DAY}`);
    await assertFails(setDoc(ref, { ...validEntry(), revision: 'x'.repeat(201) }));
    await assertFails(setDoc(ref, { ...validEntry(), notes: 'x'.repeat(5001) }));
  });

  it("other users cannot read or write someone's journal", async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(doc(alice, `users/${ALICE}/journal/${DAY}`), validEntry()));

    const bob = env.authenticatedContext(BOB).firestore();
    await assertFails(getDoc(doc(bob, `users/${ALICE}/journal/${DAY}`)));
    await assertFails(setDoc(doc(bob, `users/${ALICE}/journal/${DAY}`), validEntry()));
    await assertFails(deleteDoc(doc(bob, `users/${ALICE}/journal/${DAY}`)));
  });
});

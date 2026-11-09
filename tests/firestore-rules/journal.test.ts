import {
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
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

function validNote(over: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    uid: ALICE,
    day: DAY,
    at: 1_700_000_000_000,
    kind: 'revision',
    text: '5p Maryam',
    minutes: 10,
    ...over,
  };
}

describe('users/{userId}/journal/{day}/entries/{entryId}', () => {
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

  const noteRef = (db: ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>, id = 'n1', day = DAY) =>
    doc(db, `users/${ALICE}/journal/${day}/entries/${id}`);

  it('the owner can write, read and delete a note, with no day document above it', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(noteRef(alice), validNote()));
    await assertSucceeds(getDoc(noteRef(alice)));
    await assertSucceeds(setDoc(noteRef(alice), validNote({ text: 'Edited' })));
    await assertSucceeds(deleteDoc(noteRef(alice)));
  });

  it('every kind of note is accepted, with or without minutes', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(noteRef(alice, 'm'), validNote({ id: 'm', kind: 'memorization', minutes: null })));
    await assertSucceeds(setDoc(noteRef(alice, 'r'), validNote({ id: 'r', kind: 'revision' })));
    await assertSucceeds(setDoc(noteRef(alice, 'x'), validNote({ id: 'x', kind: 'note', text: '', minutes: null })));
  });

  it('rejects a note whose id, uid or day does not match its path or the owner', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(setDoc(noteRef(alice), validNote({ id: 'other' })));
    await assertFails(setDoc(noteRef(alice), validNote({ uid: 'bob' })));
    await assertFails(setDoc(noteRef(alice), validNote({ day: '2026-09-24' })));
  });

  it('rejects an unknown kind, a missing field, extra fields, and a non-integer time', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(setDoc(noteRef(alice), validNote({ kind: 'prayer' })));
    const withoutMinutes: Record<string, unknown> = validNote();
    delete withoutMinutes.minutes;
    await assertFails(setDoc(noteRef(alice), withoutMinutes));
    await assertFails(setDoc(noteRef(alice), validNote({ isAdmin: true })));
    await assertFails(setDoc(noteRef(alice), validNote({ at: 1.5 })));
    await assertFails(setDoc(noteRef(alice), validNote({ at: 0 })));
  });

  it('caps the text: 200 for memorization and revision, 5000 typed for a note (5500 stored)', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(noteRef(alice, 'a'), validNote({ id: 'a', text: 'x'.repeat(200) })));
    await assertFails(setDoc(noteRef(alice, 'b'), validNote({ id: 'b', text: 'x'.repeat(201) })));
    await assertSucceeds(setDoc(noteRef(alice, 'c'), validNote({ id: 'c', kind: 'note', text: 'x'.repeat(5500) })));
    await assertFails(setDoc(noteRef(alice, 'd'), validNote({ id: 'd', kind: 'note', text: 'x'.repeat(5501) })));
  });

  it('minutes are a whole number from 0 to a day, or none', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(setDoc(noteRef(alice), validNote({ minutes: -1 })));
    await assertFails(setDoc(noteRef(alice), validNote({ minutes: 2.5 })));
    await assertFails(setDoc(noteRef(alice), validNote({ minutes: 1441 })));
    await assertSucceeds(setDoc(noteRef(alice), validNote({ minutes: 1440 })));
  });

  it("other users cannot read, write or delete someone's notes", async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(noteRef(alice), validNote()));
    const bob = env.authenticatedContext(BOB).firestore();
    await assertFails(getDoc(noteRef(bob)));
    await assertFails(setDoc(noteRef(bob), validNote({ uid: BOB })));
    await assertFails(deleteDoc(noteRef(bob)));
  });

  it("the account's notes read as one query on uid, and only the owner's", async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(noteRef(alice, 'n1'), validNote({ id: 'n1' })));
    await assertSucceeds(setDoc(noteRef(alice, 'n2', '2026-09-24'), validNote({ id: 'n2', day: '2026-09-24' })));
    const mine = await assertSucceeds(
      getDocs(query(collectionGroup(alice, 'entries'), where('uid', '==', ALICE))),
    );
    expect(mine.size).toBe(2);

    const bob = env.authenticatedContext(BOB).firestore();
    await assertFails(getDocs(query(collectionGroup(bob, 'entries'), where('uid', '==', ALICE))));
    await assertFails(getDocs(collectionGroup(bob, 'entries')));
    const bobsOwn = await assertSucceeds(getDocs(query(collectionGroup(bob, 'entries'), where('uid', '==', BOB))));
    expect(bobsOwn.size).toBe(0);
  });
});

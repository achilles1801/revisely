import {
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getTestEnv, cleanupTestEnv } from './setup';

const ALICE = 'alice';
const BOB = 'bob';
const DAY = '2026-11-04';
const AT = 1793800000000;

function revision(id: string = 'session-2026-11-04', extra: object = {}) {
  return {
    id,
    uid: ALICE,
    day: DAY,
    occurredAt: AT,
    countsFor: DAY,
    source: 'session',
    pages: [549, 550, 551],
    skipped: [552],
    ratings: { 549: 'strong' },
    assigned: [549, 550, 551, 552],
    minutes: 12,
    recordings: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...extra,
  };
}

function memorization(id: string = 'mem-1', extra: object = {}) {
  return {
    id,
    uid: ALICE,
    day: DAY,
    occurredAt: AT,
    source: 'manual',
    pages: [604],
    minutes: null,
    recordings: [],
    ...extra,
  };
}

function read(id: string = 'read-1', extra: object = {}) {
  return {
    id,
    uid: ALICE,
    day: DAY,
    occurredAt: AT,
    source: 'auto',
    pages: [1, 2],
    minutes: 8,
    recordings: ['rec-1'],
    readingSessionId: 'rs-1',
    ...extra,
  };
}

describe('users/{userId}/revisions|memorizations|reads/{id} (Activity items)', () => {
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

  describe('revisions', () => {
    it('owner can create, read, update and delete an item', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const ref = doc(alice, `users/${ALICE}/revisions/session-2026-11-04`);
      await assertSucceeds(setDoc(ref, revision()));
      await assertSucceeds(getDoc(ref));
      await assertSucceeds(setDoc(ref, revision('session-2026-11-04', { minutes: 15 })));
      await assertSucceeds(deleteDoc(ref));
    });

    it('a manual item can count for a later day', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertSucceeds(
        setDoc(
          doc(alice, `users/${ALICE}/revisions/manual-1`),
          revision('manual-1', { source: 'manual', countsFor: '2026-11-06' }),
        ),
      );
    });

    it('other users cannot read or write it', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const bob = env.authenticatedContext(BOB).firestore();
      const ref = `users/${ALICE}/revisions/session-2026-11-04`;
      await assertSucceeds(setDoc(doc(alice, ref), revision()));
      await assertFails(getDoc(doc(bob, ref)));
      await assertFails(setDoc(doc(bob, ref), revision()));
      await assertFails(deleteDoc(doc(bob, ref)));
    });

    it('rejects an unknown field', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(
        setDoc(doc(alice, `users/${ALICE}/revisions/session-2026-11-04`), revision('session-2026-11-04', { ahead: {} })),
      );
    });

    it('rejects an id that differs from the path', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(setDoc(doc(alice, `users/${ALICE}/revisions/other`), revision('session-2026-11-04')));
    });

    it('rejects a uid that is not the owner', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(
        setDoc(doc(alice, `users/${ALICE}/revisions/session-2026-11-04`), revision('session-2026-11-04', { uid: BOB })),
      );
    });

    it('rejects a bad countsFor or source', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const ref = doc(alice, `users/${ALICE}/revisions/session-2026-11-04`);
      await assertFails(setDoc(ref, revision('session-2026-11-04', { countsFor: '04/11/2026' })));
      await assertFails(setDoc(ref, revision('session-2026-11-04', { source: 'import' })));
    });

    it('rejects more pages than the mushaf has', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const tooMany = Array.from({ length: 605 }, (_, i) => i + 1);
      await assertFails(
        setDoc(doc(alice, `users/${ALICE}/revisions/session-2026-11-04`), revision('session-2026-11-04', { pages: tooMany })),
      );
    });

    it('rejects minutes outside a day', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(
        setDoc(doc(alice, `users/${ALICE}/revisions/session-2026-11-04`), revision('session-2026-11-04', { minutes: 1441 })),
      );
    });
  });

  describe('memorizations', () => {
    it('owner can create, read, update and delete an item', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const ref = doc(alice, `users/${ALICE}/memorizations/mem-1`);
      await assertSucceeds(setDoc(ref, memorization()));
      await assertSucceeds(getDoc(ref));
      await assertSucceeds(setDoc(ref, memorization('mem-1', { minutes: 20 })));
      await assertSucceeds(deleteDoc(ref));
    });

    it('other users cannot read or write it', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const bob = env.authenticatedContext(BOB).firestore();
      const ref = `users/${ALICE}/memorizations/mem-1`;
      await assertSucceeds(setDoc(doc(alice, ref), memorization()));
      await assertFails(getDoc(doc(bob, ref)));
      await assertFails(setDoc(doc(bob, ref), memorization()));
    });

    it('rejects a source other than auto or manual', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(
        setDoc(doc(alice, `users/${ALICE}/memorizations/mem-1`), memorization('mem-1', { source: 'session' })),
      );
    });

    it('rejects a memorization without minutes', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const withoutMinutes: Record<string, unknown> = memorization();
      delete withoutMinutes.minutes;
      await assertFails(setDoc(doc(alice, `users/${ALICE}/memorizations/mem-1`), withoutMinutes));
    });
  });

  describe('reads', () => {
    it('owner can create, read, update and delete an item', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const ref = doc(alice, `users/${ALICE}/reads/read-1`);
      await assertSucceeds(setDoc(ref, read()));
      await assertSucceeds(getDoc(ref));
      await assertSucceeds(setDoc(ref, read('read-1', { minutes: null })));
      await assertSucceeds(deleteDoc(ref));
    });

    it('a manual item needs no reading session', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const manual: Record<string, unknown> = read('read-2', { source: 'manual' });
      delete manual.readingSessionId;
      await assertSucceeds(setDoc(doc(alice, `users/${ALICE}/reads/read-2`), manual));
    });

    it('other users cannot read or write it', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      const bob = env.authenticatedContext(BOB).firestore();
      const ref = `users/${ALICE}/reads/read-1`;
      await assertSucceeds(setDoc(doc(alice, ref), read()));
      await assertFails(getDoc(doc(bob, ref)));
      await assertFails(deleteDoc(doc(bob, ref)));
    });

    it('rejects a reading session id that is too long', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(
        setDoc(doc(alice, `users/${ALICE}/reads/read-1`), read('read-1', { readingSessionId: 'x'.repeat(61) })),
      );
    });
  });

  describe('journal note tag', () => {
    const note = (extra: object = {}) => ({
      id: 'n1',
      uid: ALICE,
      day: DAY,
      at: AT,
      kind: 'note',
      text: 'Revised with Ali',
      minutes: null,
      ...extra,
    });

    it('a note without a tag is still accepted', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertSucceeds(setDoc(doc(alice, `users/${ALICE}/journal/${DAY}/entries/n1`), note()));
    });

    it('a note can carry the id of an item as its tag', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertSucceeds(
        setDoc(doc(alice, `users/${ALICE}/journal/${DAY}/entries/n1`), note({ tag: 'session-2026-11-04' })),
      );
    });

    it('a tag that is not a string is rejected', async () => {
      const alice = env.authenticatedContext(ALICE).firestore();
      await assertFails(
        setDoc(doc(alice, `users/${ALICE}/journal/${DAY}/entries/n1`), note({ tag: 42 })),
      );
    });
  });
});

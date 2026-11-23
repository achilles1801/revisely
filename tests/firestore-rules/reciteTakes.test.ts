import { assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { getTestEnv, cleanupTestEnv } from './setup';

// Recite's memory (lib/reciteMemory; Revisely Dev): each take with Mark mistakes, and each word cleared by hand,
// written whole by the owner with the server's time. Text only; nobody else reads or writes it.
const ALICE = 'alice';
const BOB = 'bob';
const path = (uid: string, id: string) => `users/${uid}/reciteTakes/${id}`;

const mark = { id: '31453:word:lookalike', w: 31453, sura: 12, ayah: 88, kind: 'word', sure: 'clear', detail: 'lookalike', heard: 'ٱلْمُحْسِنِينَ', heardExact: true, t0: 41.2, t1: 42 };

function take(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    kind: 'take',
    take: 'take-abc',
    createdAt: 1_763_200_000_000,
    rev: 1_763_200_100_000,
    day: '2026-11-15',
    level: 'words',
    hidden: false,
    from: 31413,
    to: 31458,
    secs: 102,
    mistakes: 1,
    tajweed: 0,
    unclear: 0,
    accuracy: 0.9919,
    marks: [mark],
    passed: [{ w: 31440, t: 20.5 }],
    recordingId: 'rec-1',
    deleted: false,
    updatedAt: serverTimestamp(),
    ...over,
  };
}

const clear = (over: Record<string, unknown> = {}) => ({
  v: 1,
  kind: 'clear',
  createdAt: 1_763_200_200_000,
  rev: 1_763_200_200_000,
  day: '2026-11-15',
  w: 31453,
  group: 'word',
  deleted: false,
  updatedAt: serverTimestamp(),
  ...over,
});

describe("Recite's memory: users/<uid>/reciteTakes", () => {
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

  it('the owner writes a take whole, writes it again, reads it back and queries it by time', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(doc(alice, path(ALICE, 't1')), take()));
    await assertSucceeds(setDoc(doc(alice, path(ALICE, 't1')), take({ rev: 1_763_200_300_000, marks: [], mistakes: 0, accuracy: 1 })));
    await assertSucceeds(getDoc(doc(alice, path(ALICE, 't1'))));
    await assertSucceeds(getDocs(query(collection(alice, `users/${ALICE}/reciteTakes`), where('updatedAt', '>', new Date(0)))));
  });

  it('a take without a recording or the checker’s id, a forgotten one, and a word cleared by hand', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(doc(alice, path(ALICE, 't2')), take({ take: null, recordingId: null, level: 'strict', hidden: true })));
    await assertSucceeds(setDoc(doc(alice, path(ALICE, 't2')), take({ deleted: true })));
    await assertSucceeds(setDoc(doc(alice, path(ALICE, 'c1')), clear()));
    await assertSucceeds(deleteDoc(doc(alice, path(ALICE, 'c1'))));
  });

  it('a take kept without its final answer says so (unfinished: true), and only as true', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(doc(alice, path(ALICE, 't3')), take({ unfinished: true })));
    // Its final answer came after all: written again without it.
    await assertSucceeds(setDoc(doc(alice, path(ALICE, 't3')), take({ rev: 1_763_200_300_000 })));
    await assertFails(setDoc(doc(alice, path(ALICE, 't4')), take({ unfinished: false })));
    await assertFails(setDoc(doc(alice, path(ALICE, 't4')), take({ unfinished: 'yes' })));
  });

  it('a take says where it ran and why, from the closed lists (ONDEV-4)', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(doc(alice, path(ALICE, 'p1')), take({ ranOn: 'phone' })));
    await assertSucceeds(setDoc(doc(alice, path(ALICE, 'p2')), take({ ranOn: 'server', ranWhy: 'no-pack' })));
    for (const why of ['forced', 'pin', 'config', 'self-check', 'lacks', 'slow', 'no-speed', 'demoted', 'refused', 'replay']) {
      await assertSucceeds(setDoc(doc(alice, path(ALICE, `w-${why}`)), take({ ranOn: 'server', ranWhy: why })));
    }
    await assertFails(setDoc(doc(alice, path(ALICE, 'p3')), take({ ranOn: 'mars' })));
    await assertFails(setDoc(doc(alice, path(ALICE, 'p3')), take({ ranOn: true })));
    await assertFails(setDoc(doc(alice, path(ALICE, 'p3')), take({ ranOn: 'server', ranWhy: 'because' })));
  });

  it('a recitation longer than the checker’s cap keeps its takes (links: 2 to 20), and nothing else in their place', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    const links = [
      { take: 'take-a', from: 48707 },
      { take: 'take-b', from: 49310 },
      { take: null, from: 49902 },
    ];
    await assertSucceeds(setDoc(doc(alice, path(ALICE, 't5')), take({ links })));
    await assertFails(setDoc(doc(alice, path(ALICE, 't6')), take({ links: [links[0]] })));
    await assertFails(setDoc(doc(alice, path(ALICE, 't6')), take({ links: Array.from({ length: 21 }, (_, i) => ({ take: `t${i}`, from: 48707 + i })) })));
    await assertFails(setDoc(doc(alice, path(ALICE, 't6')), take({ links: 'take-a,take-b' })));
  });

  it('a take keeps the words peeked (1 to 300) and the marks called Not a mistake (1 to 100), for its summary later', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    const removed = [{ ...mark, id: '31450:harakat:fatha', w: 31450, kind: 'harakat' }];
    await assertSucceeds(setDoc(doc(alice, path(ALICE, 't7')), take({ peeked: [31420, 31421], removed })));
    // Neither is needed: a take kept before them, or with nothing peeked or removed, is as it was.
    await assertSucceeds(setDoc(doc(alice, path(ALICE, 't8')), take()));
    await assertFails(setDoc(doc(alice, path(ALICE, 't9')), take({ peeked: [] })));
    await assertFails(setDoc(doc(alice, path(ALICE, 't9')), take({ peeked: Array.from({ length: 301 }, (_, i) => 31000 + i) })));
    await assertFails(setDoc(doc(alice, path(ALICE, 't9')), take({ peeked: '31420' })));
    await assertFails(setDoc(doc(alice, path(ALICE, 't9')), take({ removed: [] })));
    await assertFails(setDoc(doc(alice, path(ALICE, 't9')), take({ removed: Array.from({ length: 101 }, (_, i) => ({ ...mark, id: `m${i}` })) })));
    await assertFails(setDoc(doc(alice, path(ALICE, 't9')), take({ removed: mark })));
  });

  it('nobody else reads or writes them, signed in or not', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path(ALICE, 't1')), { ...take(), updatedAt: new Date() });
    });
    for (const other of [env.authenticatedContext(BOB).firestore(), env.unauthenticatedContext().firestore()]) {
      await assertFails(getDoc(doc(other, path(ALICE, 't1'))));
      await assertFails(setDoc(doc(other, path(ALICE, 't3')), take()));
      await assertFails(deleteDoc(doc(other, path(ALICE, 't1'))));
    }
  });

  it('refuses a record that isn’t one: the client’s own time, a field it doesn’t know, a bad level or range', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    const bad: Array<Record<string, unknown>> = [
      take({ updatedAt: new Date() }),
      take({ audio: 'base64…' }),
      take({ level: 'expert' }),
      take({ from: 200, to: 100 }),
      take({ accuracy: 1.5 }),
      take({ marks: Array.from({ length: 401 }, () => mark) }),
      take({ v: 2 }),
      take({ day: '15 Nov' }),
      take({ kind: 'note' }),
      clear({ group: 'colour' }),
      clear({ marks: [] }),
    ];
    for (const d of bad) await assertFails(setDoc(doc(alice, path(ALICE, 'bad')), d));
    const missing = take();
    delete missing.marks;
    await assertFails(setDoc(doc(alice, path(ALICE, 'bad')), missing));
  });
});

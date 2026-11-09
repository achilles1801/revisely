// The write path of a day's log: a note is written in a transaction, and a
// day still in its single block moves that block into its first entry.
import { Timestamp } from 'firebase/firestore';

const mockTx = { get: jest.fn(), set: jest.fn(), delete: jest.fn(), update: jest.fn() };
jest.mock('firebase/firestore', () => {
  const ref = (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === 'string').join('/') });
  return {
    doc: (...parts: unknown[]) => ref(...parts.slice(1)),
    collection: jest.fn(),
    collectionGroup: jest.fn(),
    query: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    where: jest.fn(),
    getDoc: jest.fn(),
    getDocs: jest.fn(),
    setDoc: jest.fn(),
    updateDoc: jest.fn(),
    deleteDoc: jest.fn(),
    addDoc: jest.fn(),
    writeBatch: jest.fn(),
    getDocFromServer: jest.fn(),
    getDocsFromServer: jest.fn(),
    addDocFromServer: jest.fn(),
    Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
    serverTimestamp: jest.fn(),
    runTransaction: jest.fn(async (_db: unknown, fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx)),
    deleteField: jest.fn(),
    increment: jest.fn(),
    onSnapshot: jest.fn(),
  };
});
jest.mock('../../lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } } }));
jest.mock('../../lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import { applyJournalNote } from '../firestoreService';
import type { JournalNote } from '../../types';

const DAY = '2026-11-02';
const note: JournalNote = { id: 'n1', at: 1_700_000_000_000, kind: 'revision', text: '5p Maryam', minutes: 10 };
const block = (over: Record<string, unknown> = {}) => ({
  date: DAY,
  memorization: '',
  memorizationMinutes: null,
  revision: '',
  revisionMinutes: null,
  notes: '',
  createdAt: Timestamp.fromMillis(1_699_999_000_000),
  ...over,
});
const snap = (data: unknown) => ({ exists: () => data != null, data: () => data });

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.get.mockResolvedValue(snap(null));
});

describe('applyJournalNote', () => {
  it('a day with no block writes just the note, under the day', async () => {
    await applyJournalNote(DAY, { kind: 'put', note }, 'u1');
    expect(mockTx.set).toHaveBeenCalledTimes(1);
    const [ref, data] = mockTx.set.mock.calls[0];
    expect(ref.path).toBe(`users/u1/journal/${DAY}/entries/n1`);
    expect(data).toEqual({ id: 'n1', uid: 'u1', day: DAY, at: note.at, kind: 'revision', text: '5p Maryam', minutes: 10 });
    expect(mockTx.delete).not.toHaveBeenCalled();
  });

  it("a day still in its block moves the block into entries/legacy, clears the block, then writes the note", async () => {
    mockTx.get.mockResolvedValue(snap(block({ memorization: '1/2 p3', memorizationMinutes: 20 })));
    await applyJournalNote(DAY, { kind: 'put', note }, 'u1');
    const writes = mockTx.set.mock.calls;
    expect(writes[0][0].path).toBe(`users/u1/journal/${DAY}/entries/legacy`);
    expect(writes[0][1]).toMatchObject({ id: 'legacy', kind: 'memorization', text: '1/2 p3', minutes: 20, at: 1_699_999_000_000 });
    expect(writes[1][0].path).toBe(`users/u1/journal/${DAY}`);
    expect(writes[1][1]).toMatchObject({ memorization: '', memorizationMinutes: null, notes: '' });
    expect(writes[2][0].path).toBe(`users/u1/journal/${DAY}/entries/n1`);
  });

  it('deleting the block itself migrates nothing: it clears the block and deletes nothing else', async () => {
    mockTx.get.mockResolvedValue(snap(block({ notes: 'Tired' })));
    await applyJournalNote(DAY, { kind: 'delete', id: 'legacy' }, 'u1');
    expect(mockTx.set.mock.calls.map((c) => c[0].path)).toEqual([`users/u1/journal/${DAY}`]);
    expect(mockTx.delete).toHaveBeenCalledWith(expect.objectContaining({ path: `users/u1/journal/${DAY}/entries/legacy` }));
  });

  it('a delete of a note on a migrated day only deletes that note', async () => {
    await applyJournalNote(DAY, { kind: 'delete', id: 'n1' }, 'u1');
    expect(mockTx.set).not.toHaveBeenCalled();
    expect(mockTx.delete).toHaveBeenCalledWith(expect.objectContaining({ path: `users/u1/journal/${DAY}/entries/n1` }));
  });
});

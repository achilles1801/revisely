// A new account's 604 pages (ONBOARD-1, ONBOARD-2): both batches go to the
// phone's view at once, and missing pages are created without replacing any.
type Commit = { resolve: () => void; reject: (e: unknown) => void; pages: number[] };
const mockCommits: Commit[] = [];
const mockTx = { get: jest.fn(), set: jest.fn() };

jest.mock('firebase/firestore', () => {
  const ref = (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === 'string').join('/') });
  return {
    doc: (...parts: unknown[]) => ref(...parts.slice(1)),
    collection: (...parts: unknown[]) => ref(...parts.slice(1)),
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
    writeBatch: jest.fn(() => {
      const pages: number[] = [];
      return {
        set: (_ref: unknown, data: { pageNumber: number }) => pages.push(data.pageNumber),
        // A commit is acknowledged only when the test says so (a slow server).
        commit: () =>
          new Promise<void>((resolve, reject) => {
            mockCommits.push({ resolve, reject, pages });
          }),
      };
    }),
    getDocFromServer: jest.fn(),
    getDocsFromServer: jest.fn(),
    Timestamp: { now: () => ({ toMillis: () => 0 }), fromMillis: (ms: number) => ({ toMillis: () => ms }) },
    serverTimestamp: jest.fn(),
    runTransaction: jest.fn(async (_db: unknown, fn: (tx: typeof mockTx) => Promise<number>) => fn(mockTx)),
    deleteField: jest.fn(),
    increment: jest.fn(),
    onSnapshot: jest.fn(),
  };
});
jest.mock('../../lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } } }));
jest.mock('../../lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), log: jest.fn() } }));

import { getDocsFromServer } from 'firebase/firestore';
import { createMissingPages, initializeAllPages, isInitializingPages } from '../firestoreService';

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

beforeEach(() => {
  mockCommits.length = 0;
  jest.clearAllMocks();
});

describe('initializeAllPages', () => {
  it('[ONBOARD-1] commits both batches at once: the second does not wait for the first to be acknowledged', async () => {
    const done = initializeAllPages('u1');
    await Promise.resolve();
    // Both commits have been made (each puts its pages on the phone at once),
    // though the server hasn't acknowledged either.
    expect(mockCommits.map((c) => c.pages.length)).toEqual([450, 154]);
    expect(mockCommits.flatMap((c) => c.pages)).toEqual(range(1, 604));
    expect(isInitializingPages('u1')).toBe(true);
    mockCommits.forEach((c) => c.resolve());
    await done;
    expect(isInitializingPages('u1')).toBe(false);
  });

  it('a failed commit still clears the flag and fails the call (ONBOARD-2 creates what is missing later)', async () => {
    const done = initializeAllPages('u1');
    await Promise.resolve();
    mockCommits[0].resolve();
    mockCommits[1].reject(new Error('unavailable'));
    await expect(done).rejects.toThrow('unavailable');
    expect(isInitializingPages('u1')).toBe(false);
  });
});

describe('createMissingPages', () => {
  it('[ONBOARD-2] creates only the pages the server lacks, and never one written meanwhile', async () => {
    (getDocsFromServer as jest.Mock).mockResolvedValue({
      docs: range(1, 450).map((p) => ({ data: () => ({ pageNumber: p }) })),
    });
    // Page 500 is written by someone else between the read and the transaction.
    mockTx.get.mockImplementation(async (ref: { path: string }) => ({ exists: () => ref.path.endsWith('/pages/500') }));
    const created = await createMissingPages('u1');
    const setPages = mockTx.set.mock.calls.map(([, data]) => (data as { pageNumber: number }).pageNumber);
    expect(setPages).toEqual(range(451, 604).filter((p) => p !== 500));
    expect(created).toBe(153);
    for (const [, data] of mockTx.set.mock.calls) {
      expect(data).toMatchObject({ status: 'not_memorized', dateMemorized: null, totalRevisionCount: 0 });
    }
  });

  it('a complete account writes nothing', async () => {
    (getDocsFromServer as jest.Mock).mockResolvedValue({
      docs: range(1, 604).map((p) => ({ data: () => ({ pageNumber: p }) })),
    });
    expect(await createMissingPages('u1')).toBe(0);
    expect(mockTx.set).not.toHaveBeenCalled();
  });
});

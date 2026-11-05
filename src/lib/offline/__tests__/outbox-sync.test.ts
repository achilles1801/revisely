// The outbox survives the app closing, and sync sends it in order, once each,
// only for the signed-in account; offline it waits and tries again later; a
// change the server refuses for good is dropped (not retried forever).
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  enqueue,
  loadOutbox,
  pendingEntries,
  resetOutboxForTests,
  clearOutbox,
} from '../outbox';
import {
  configureSync,
  requestFlush,
  resetSyncForTests,
  settleSync,
  onApplied,
  classifyError,
  holdSync,
  releaseSync,
  isSyncHeld,
} from '../sync';
import type { OutboxEntry } from '../ops';

jest.mock('../../logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const { logger } = jest.requireMock('../../logger');

const offline = () => Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' });
const usage = (seconds: number) => ({ kind: 'usage' as const, seconds });

/** The app closing: everything in memory goes; what's on the phone stays. */
function restartApp() {
  resetOutboxForTests();
  resetSyncForTests();
}

let signedIn: string | null = 'u1';
const apply = jest.fn<Promise<void>, [string, OutboxEntry]>();
const configure = () =>
  configureSync({ currentUid: () => signedIn, isDeleting: () => false, apply: (...a) => apply(...a) });

beforeEach(async () => {
  jest.useRealTimers();
  await AsyncStorage.clear();
  restartApp();
  signedIn = 'u1';
  apply.mockReset();
  apply.mockResolvedValue(undefined);
  logger.error.mockClear();
  configure();
});

describe('the outbox', () => {
  it('is kept on the phone: after a restart the same changes are there, in order', async () => {
    await enqueue('u1', usage(10));
    await enqueue('u1', usage(20));
    restartApp();
    expect(pendingEntries('u1')).toEqual([]);
    const back = await loadOutbox('u1');
    expect(back.map((e) => e.op)).toEqual([usage(10), usage(20)]);
  });

  it('a change made while the stored queue is still loading is not lost', async () => {
    await enqueue('u1', usage(1));
    restartApp();
    const [a, b] = await Promise.all([loadOutbox('u1'), enqueue('u1', usage(2))]);
    expect(a.length).toBeGreaterThan(0);
    expect(pendingEntries('u1').map((e) => e.op)).toEqual([usage(1), usage(2)]);
    expect(b.op).toEqual(usage(2));
  });

  it('a stored queue that can’t be read is never written over; the next read gets it', async () => {
    await enqueue('u1', usage(1));
    restartApp();
    const storage = AsyncStorage as unknown as { getItem: typeof AsyncStorage.getItem };
    const getItem = storage.getItem;
    storage.getItem = () => Promise.reject(new Error('Row too big to fit into CursorWindow'));
    try {
      await expect(enqueue('u1', usage(2))).rejects.toThrow('CursorWindow');
    } finally {
      storage.getItem = getItem;
    }
    expect((await loadOutbox('u1')).map((e) => e.op)).toEqual([usage(1)]);
    await enqueue('u1', usage(2));
    restartApp();
    expect((await loadOutbox('u1')).map((e) => e.op)).toEqual([usage(1), usage(2)]);
  });

  it('a damaged queue is kept aside, not lost', async () => {
    await AsyncStorage.setItem('@revisely_outbox:v1:u1', '{damaged');
    expect(await loadOutbox('u1')).toEqual([]);
    const keys = await AsyncStorage.getAllKeys();
    const aside = keys.find((k) => k.startsWith('@revisely_outbox_damaged:v1:u1:'));
    expect(aside).toBeTruthy();
    expect(await AsyncStorage.getItem(aside!)).toBe('{damaged');
  });

  it('accounts are kept apart', async () => {
    await enqueue('u1', usage(1));
    await enqueue('u2', usage(2));
    expect(pendingEntries('u1').map((e) => e.op)).toEqual([usage(1)]);
    await clearOutbox('u2');
    restartApp();
    expect((await loadOutbox('u2')).length).toBe(0);
    expect((await loadOutbox('u1')).length).toBe(1);
  });
});

describe('sync', () => {
  it('sends oldest first, each once, and crosses each off after the app has folded it in', async () => {
    const seen: string[] = [];
    onApplied((_uid, e) => {
      seen.push(`applied ${(e.op as { seconds: number }).seconds} with ${pendingEntries('u1').length} left`);
    });
    await enqueue('u1', usage(1));
    await enqueue('u1', usage(2));
    requestFlush('u1');
    await settleSync('u1');
    expect(apply.mock.calls.map(([, e]) => e.op)).toEqual([usage(1), usage(2)]);
    // Folded into what's shown while still in the outbox: the change never blinks out.
    expect(seen).toEqual(['applied 1 with 2 left', 'applied 2 with 1 left']);
    expect(pendingEntries('u1')).toEqual([]);
    restartApp();
    expect(await loadOutbox('u1')).toEqual([]);
  });

  it('offline: keeps everything, tries again later, and sends it all once back online', async () => {
    jest.useFakeTimers();
    let online = false;
    apply.mockImplementation(async () => {
      if (!online) throw offline();
    });
    await enqueue('u1', usage(1));
    await enqueue('u1', usage(2));
    requestFlush('u1');
    await settleSync('u1');
    expect(apply).toHaveBeenCalledTimes(1);
    expect(pendingEntries('u1')).toHaveLength(2);
    online = true;
    await jest.advanceTimersByTimeAsync(2_000);
    await settleSync('u1');
    expect(pendingEntries('u1')).toHaveLength(0);
    // Each change reached the server once.
    expect(apply.mock.calls.slice(1).map(([, e]) => e.op)).toEqual([usage(1), usage(2)]);
  });

  it('the app closed after the server took a change but before crossing it off: only that one is sent again', async () => {
    await enqueue('u1', usage(1));
    await enqueue('u1', usage(2));
    // The server takes the first change, then the app is killed.
    apply.mockImplementationOnce(async () => {
      restartApp();
      throw new Error('killed');
    });
    requestFlush('u1');
    await new Promise((r) => setTimeout(r, 0));
    configure();
    await loadOutbox('u1');
    expect(pendingEntries('u1').map((e) => e.op)).toEqual([usage(1), usage(2)]);
    requestFlush('u1');
    await settleSync('u1');
    expect(pendingEntries('u1')).toEqual([]);
  });

  it('nothing is sent for an account that isn’t signed in (a lapsed sign-in); it goes once it is', async () => {
    signedIn = null;
    await enqueue('u1', usage(5));
    requestFlush('u1');
    await settleSync('u1');
    expect(apply).not.toHaveBeenCalled();
    signedIn = 'u2';
    requestFlush('u1');
    await settleSync('u1');
    expect(apply).not.toHaveBeenCalled();
    signedIn = 'u1';
    requestFlush('u1');
    await settleSync('u1');
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('refused by the rules: dropped and reported (kind only, no contents), the rest still goes', async () => {
    apply.mockRejectedValueOnce(Object.assign(new Error('bad'), { code: 'invalid-argument' }));
    await enqueue('u1', usage(1));
    await enqueue('u1', usage(2));
    requestFlush('u1');
    await settleSync('u1');
    expect(pendingEntries('u1')).toEqual([]);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), expect.anything(), { kind: 'usage', failure: 'refused', failures: 1 });
  });

  it('"permission denied" while the server otherwise works (the rules refusing it): a few tries, then dropped', async () => {
    jest.useFakeTimers();
    apply.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    configureSync({ currentUid: () => signedIn, isDeleting: () => false, apply: (...a) => apply(...a), probe: async () => true });
    await enqueue('u1', usage(1));
    requestFlush('u1');
    for (let i = 0; i < 6; i++) {
      await settleSync('u1');
      await jest.advanceTimersByTimeAsync(60_000);
    }
    await settleSync('u1');
    expect(apply).toHaveBeenCalledTimes(3);
    expect(pendingEntries('u1')).toEqual([]);
  });

  it('"permission denied" while no server read works either (App Check, a sign-in out of date): kept, however long', async () => {
    jest.useFakeTimers();
    apply.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    configureSync({ currentUid: () => signedIn, isDeleting: () => false, apply: (...a) => apply(...a), probe: async () => false });
    await enqueue('u1', usage(1));
    requestFlush('u1');
    for (let i = 0; i < 12; i++) {
      await settleSync('u1');
      await jest.advanceTimersByTimeAsync(60_000);
    }
    expect(apply.mock.calls.length).toBeGreaterThan(5);
    expect(pendingEntries('u1')).toHaveLength(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('an error that isn’t Firestore’s (a bug) is reported and dropped after a few tries, so it can’t hold up the rest', async () => {
    jest.useFakeTimers();
    apply.mockImplementation(async (_uid, e) => {
      if ((e.op as { seconds: number }).seconds === 1) throw new TypeError("Cannot read properties of undefined (reading 'includes')");
    });
    await enqueue('u1', usage(1));
    await enqueue('u1', usage(2));
    requestFlush('u1');
    for (let i = 0; i < 8; i++) {
      await settleSync('u1');
      await jest.advanceTimersByTimeAsync(60_000);
    }
    await settleSync('u1');
    expect(pendingEntries('u1')).toEqual([]);
    expect(apply.mock.calls.filter(([, e]) => (e.op as { seconds: number }).seconds === 1)).toHaveLength(5);
    expect(apply.mock.calls.at(-1)![1].op).toEqual(usage(2));
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), expect.anything(), { kind: 'usage', failure: 'bug', failures: 5 });
  });

  it('classifies Firestore errors', () => {
    expect(classifyError(offline())).toBe('later');
    expect(classifyError(new TypeError('Network request failed'))).toBe('later');
    expect(classifyError(new TypeError('x is undefined'))).toBe('bug');
    expect(classifyError({ code: 'deadline-exceeded' })).toBe('later');
    expect(classifyError({ code: 'permission-denied' })).toBe('permission');
    expect(classifyError({ code: 'not-found' })).toBe('refused');
  });
});

describe('held changes (testers: Load test scenario → Offline queue)', () => {
  it('nothing is sent while held; releasing sends them, in order', async () => {
    holdSync('u1');
    expect(isSyncHeld('u1')).toBe(true);
    await enqueue('u1', usage(1));
    await enqueue('u1', usage(2));
    requestFlush('u1');
    await settleSync('u1');
    expect(apply).not.toHaveBeenCalled();
    expect(pendingEntries('u1')).toHaveLength(2);

    releaseSync('u1');
    await settleSync('u1');
    expect(isSyncHeld('u1')).toBe(false);
    expect(apply.mock.calls.map(([, e]) => e.op)).toEqual([usage(1), usage(2)]);
    expect(pendingEntries('u1')).toEqual([]);
  });

  it('the hold ends with the app: after a restart the changes go', async () => {
    holdSync('u1');
    await enqueue('u1', usage(3));
    restartApp();
    configure();
    await loadOutbox('u1');
    requestFlush('u1');
    await settleSync('u1');
    expect(apply.mock.calls.map(([, e]) => e.op)).toEqual([usage(3)]);
  });
});

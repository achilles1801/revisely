// The app offline: it opens from the copy on the phone, never waits forever,
// never writes defaults over an account it can't see, and every change made
// offline reaches the server once when the connection is back.
import React from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Timestamp } from 'firebase/firestore';
import type { FirestorePage, FirestoreSession, FirestoreUser } from '../../types/firestore';
import type { OutboxEntry } from '../../lib/offline/ops';

// ---- the signed-in account (AuthContext) and Firebase Auth's current user
const mockAuth: { firebaseUser: { uid: string } | null; provisionalUid: string | null } = {
  firebaseUser: { uid: 'u1' },
  provisionalUid: null,
};
jest.mock('../AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: mockAuth.firebaseUser }),
}));

// ---- Firestore's listeners: the test plays the server (or its absence)
type Cb<T> = (data: T, meta: { fromCache: boolean }) => void;
const mockListeners: {
  user?: Cb<FirestoreUser | null>;
  pages?: Cb<FirestorePage[]>;
  sessions?: Cb<FirestoreSession[]>;
  userError?: (e: unknown) => void;
  subscribed: number;
} = { subscribed: 0 };
const mockService = {
  createUser: jest.fn(async () => undefined),
  initializeAllPages: jest.fn(async () => undefined),
  userDocExistsOnServer: jest.fn(async () => true),
  pagesExistOnServer: jest.fn(async () => true),
  getUserFromServer: jest.fn(),
  getAllPagesFromServer: jest.fn(),
  getRecentSessionsFromServer: jest.fn(),
};
jest.mock('../../services/firestoreService', () => {
  const actual = jest.requireActual('../../services/firestoreService');
  return {
    userUpdateFields: actual.userUpdateFields,
    isDeletingAccount: () => false,
    isResettingAccount: () => false,
    subscribeToUser: (cb: never, _uid: string, onError: never) => {
      mockListeners.user = cb;
      mockListeners.userError = onError;
      mockListeners.subscribed += 1;
      return () => {};
    },
    subscribeToPages: (cb: never) => {
      mockListeners.pages = cb;
      return () => {};
    },
    subscribeToSessions: (cb: never) => {
      mockListeners.sessions = cb;
      return () => {};
    },
    createUser: (...a: unknown[]) => mockService.createUser(...(a as [])),
    initializeAllPages: (...a: unknown[]) => mockService.initializeAllPages(...(a as [])),
    userDocExistsOnServer: (...a: unknown[]) => mockService.userDocExistsOnServer(...(a as [])),
    pagesExistOnServer: (...a: unknown[]) => mockService.pagesExistOnServer(...(a as [])),
    getUserFromServer: (...a: unknown[]) => mockService.getUserFromServer(...(a as [])),
    getAllPagesFromServer: (...a: unknown[]) => mockService.getAllPagesFromServer(...(a as [])),
    getRecentSessionsFromServer: (...a: unknown[]) => mockService.getRecentSessionsFromServer(...(a as [])),
  };
});

// ---- the server the outbox writes to: refuses to answer while offline
const mockServer = { online: false, applied: [] as { uid: string; entry: OutboxEntry }[] };
jest.mock('../../lib/offline/apply', () => ({
  applyEntry: async (uid: string, entry: OutboxEntry) => {
    if (!mockServer.online) {
      throw Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' });
    }
    mockServer.applied.push({ uid, entry });
  },
}));

// ---- the network as NetInfo sees it
const mockNet: { listener?: (s: { isConnected: boolean; isInternetReachable: boolean }) => void } = {};
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: (l: never) => {
      mockNet.listener = l;
      return () => {};
    },
  },
}));

jest.mock('../../lib/firebase', () => ({ db: {}, updateAuthDisplayName: jest.fn(async () => undefined) }));
jest.mock('../../lib/notifications', () => ({ scheduleDailyReminder: jest.fn(async () => undefined) }));
jest.mock('../../lib/updateChannel', () => ({ applyUpdateChannel: jest.fn(() => null) }));
jest.mock('../../lib/recordings', () => ({ deleteRecordings: jest.fn(async () => undefined), isRevisionRecordingOf: () => () => false }));
jest.mock('@sentry/react-native', () => ({ setTag: jest.fn() }));
jest.mock('../../lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { AppProvider, useApp, SERVER_WAIT_MS } from '../AppContext';
import { writeAccountPart, readAccount } from '../../lib/offline/accountCache';
import { enqueue, loadOutbox, resetOutboxForTests } from '../../lib/offline/outbox';
import { resetSyncForTests, settleSync } from '../../lib/offline/sync';

// ---- an account
const ts = (iso: string) => Timestamp.fromMillis(new Date(iso).getTime());
const fsUser: FirestoreUser = {
  uid: 'u1',
  email: 'a@example.com',
  displayName: 'Asiyah',
  createdAt: ts('2026-09-01T00:00:00Z'),
  updatedAt: ts('2026-11-01T00:00:00Z'),
  lastActiveAt: ts('2026-11-01T00:00:00Z'),
  onboardingComplete: true,
  dailyPageCapacity: 20,
  notifications: { enabled: false, reminderTime: '08:00' },
  scheduleAnchorDate: '2026-09-01T00:00:00.000Z',
} as unknown as FirestoreUser;
const fsPages: FirestorePage[] = Array.from({ length: 604 }, (_, i) => ({
  pageNumber: i + 1,
  status: i < 40 ? 'memorized' : 'not_memorized',
  dateMemorized: null,
  lastRevisedAt: null,
  weaknessRating: 4,
  totalRevisionCount: 0,
  skipCount: 0,
  updatedAt: ts('2026-11-01T00:00:00Z'),
})) as FirestorePage[];
const yesterday: FirestoreSession = {
  id: '2026-11-01',
  date: '2026-11-01',
  state: 'COMPLETED',
  createdAt: ts('2026-11-01T08:00:00Z'),
  updatedAt: ts('2026-11-01T08:30:00Z'),
  completedAt: null,
  durationMinutes: 25,
  assignedPages: [1, 2],
  totalAssignedPages: 2,
  pagesRevised: [1, 2],
  pagesSkipped: [],
  weaknessUpdates: [],
  completionPercentage: 100,
};

async function keepCopyOnPhone() {
  await writeAccountPart('u1', 'user', fsUser);
  await writeAccountPart('u1', 'pages', fsPages);
  await writeAccountPart('u1', 'sessions', [yesterday]);
}

let app: ReturnType<typeof useApp>;
function Probe() {
  app = useApp();
  return <Text>{app.loading ? 'loading' : 'ready'}</Text>;
}
const view = () => render(<AppProvider><Probe /></AppProvider>);
const settle = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});
const goOffline = () => act(() => mockNet.listener?.({ isConnected: false, isInternetReachable: false }));
const goOnline = async () => {
  mockServer.online = true;
  await act(async () => mockNet.listener?.({ isConnected: true, isInternetReachable: true }));
  await act(async () => settleSync('u1'));
};

afterEach(() => {
  // Retry timers of a run that waited for the network.
  resetSyncForTests();
});

beforeEach(async () => {
  jest.useRealTimers();
  await AsyncStorage.clear();
  resetOutboxForTests();
  resetSyncForTests();
  mockAuth.firebaseUser = { uid: 'u1' };
  mockAuth.provisionalUid = null;
  mockServer.online = false;
  mockServer.applied = [];
  Object.values(mockService).forEach((f) => f.mockClear());
  delete mockListeners.user;
  delete mockListeners.pages;
  delete mockListeners.sessions;
  delete mockListeners.userError;
  mockListeners.subscribed = 0;
});

describe('cold start offline', () => {
  it('with a copy on the phone: Home at once, from the copy, and "offline"', async () => {
    await keepCopyOnPhone();
    view();
    await settle();
    expect(app.loading).toBe(false);
    expect(app.connectionNeeded).toBe(false);
    expect(app.onboardingComplete).toBe(true);
    expect(app.user?.name).toBe('Asiyah');
    expect(app.pages).toHaveLength(604);
    expect(app.logs.map((l) => l.id)).toEqual(['2026-11-01']);

    // Firestore's memory answers (empty: nothing cached on a cold start).
    act(() => {
      mockListeners.user!(null, { fromCache: true });
      mockListeners.pages!([], { fromCache: true });
      mockListeners.sessions!([], { fromCache: true });
    });
    expect(app.offline).toBe(true);
    // The empty answer changes nothing, and writes nothing (the old bug: blank
    // pages over real progress when the phone came back online).
    expect(app.pages.filter((p) => p.status === 'memorized')).toHaveLength(40);
    expect(app.logs).toHaveLength(1);
    expect(mockService.createUser).not.toHaveBeenCalled();
    expect(mockService.initializeAllPages).not.toHaveBeenCalled();
    expect(app.pendingChanges).toBe(0);
  });

  it('first launch offline (no copy): "Connect to the internet to set up", never onboarding or defaults; then it carries on', async () => {
    view();
    await settle();
    expect(app.loading).toBe(true);
    act(() => mockListeners.user!(null, { fromCache: true }));
    expect(app.connectionNeeded).toBe(true);
    expect(app.loading).toBe(false);
    expect(app.onboardingComplete).toBe(false);
    expect(mockService.createUser).not.toHaveBeenCalled();
    expect(mockService.initializeAllPages).not.toHaveBeenCalled();

    // The connection comes back and the server answers.
    act(() => {
      mockListeners.user!(fsUser, { fromCache: false });
      mockListeners.pages!(fsPages, { fromCache: false });
      mockListeners.sessions!([yesterday], { fromCache: false });
    });
    expect(app.connectionNeeded).toBe(false);
    expect(app.loading).toBe(false);
    expect(app.onboardingComplete).toBe(true);
    // And the copy is kept for next time.
    await waitFor(async () => expect(await readAccount('u1')).not.toBeNull());
  });

  it('no copy and no answer (a slow network): the connect screen after a few seconds, not an endless spinner', async () => {
    jest.useFakeTimers();
    view();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    expect(app.loading).toBe(true);
    expect(app.connectionNeeded).toBe(false);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(SERVER_WAIT_MS);
    });
    expect(app.connectionNeeded).toBe(true);
    // NetInfo saying "offline" shows it at once, too (checked in the next test).
  });

  it('NetInfo offline with no copy: the connect screen straight away', async () => {
    view();
    await settle();
    goOffline();
    expect(app.connectionNeeded).toBe(true);
  });
});

describe('changes made offline', () => {
  const today = '2026-11-02';

  async function reviseOffline() {
    await keepCopyOnPhone();
    const r = view();
    await settle();
    goOffline();
    // A revision session: two pages marked done, then finished.
    const updated = app.pages.map((p) =>
      p.pageNumber === 3 || p.pageNumber === 4
        ? { ...p, lastRevisedDate: '2026-11-02T09:00:00.000Z', totalRevisionCount: 1 }
        : p,
    );
    await act(async () => {
      await app.updatePages(updated, [3, 4]);
      await app.addLog({
        date: today,
        assignedPages: [3, 4, 5],
        pagesRevised: [3, 4],
        pagesSkipped: [],
        weaknessUpdates: [{ page: 4, rating: 2 }],
        durationMinutes: 12,
      });
    });
    return r;
  }

  it('are saved on the phone and shown at once, without waiting for the server', async () => {
    await reviseOffline();
    expect(app.pendingChanges).toBe(2);
    expect(app.pages[2].lastRevisedDate).toBe('2026-11-02T09:00:00.000Z');
    expect(app.logs[0]).toMatchObject({ id: today, pagesRevised: [3, 4], durationMinutes: 12 });
    expect(mockServer.applied).toEqual([]);
  });

  it('survive the app being closed offline', async () => {
    const r = await reviseOffline();
    r.unmount();
    // A new launch, still offline.
    resetOutboxForTests();
    resetSyncForTests();
    view();
    await settle();
    expect(app.loading).toBe(false);
    expect(app.pendingChanges).toBe(2);
    expect(app.logs[0]).toMatchObject({ id: today, pagesRevised: [3, 4] });
    expect(app.pages[3].totalRevisionCount).toBe(1);
  });

  it('going online mid-session: everything reaches the server once, in order, and later changes go straight away', async () => {
    await reviseOffline();
    await goOnline();
    expect(mockServer.applied.map((a) => a.entry.op.kind)).toEqual(['pages', 'session.add']);
    expect(app.pendingChanges).toBe(0);
    // Still shown while the server's snapshot is on its way.
    expect(app.logs[0]).toMatchObject({ id: today, pagesRevised: [3, 4] });
    // The next page of the same session, now online.
    await act(async () => {
      await app.addLog({ date: today, assignedPages: [3, 4, 5], pagesRevised: [5], pagesSkipped: [], weaknessUpdates: [], durationMinutes: 3 });
    });
    await act(async () => settleSync('u1'));
    expect(mockServer.applied.map((a) => a.entry.op.kind)).toEqual(['pages', 'session.add', 'session.add']);
    // No change was sent twice.
    const ids = mockServer.applied.map((a) => a.entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(app.logs[0].pagesRevised).toEqual([3, 4, 5]);
    expect(app.logs[0].durationMinutes).toBe(15);
    expect(await loadOutbox('u1')).toEqual([]);
  });

  it('nothing is rebuilt from the copy alone: the self-heal waits for the server’s pages and sessions', async () => {
    await keepCopyOnPhone();
    view();
    await settle();
    // The copy's pages say nothing was revised although yesterday's session
    // revised pages 1 and 2: online this is healed, but not from the copy.
    expect(app.pendingChanges).toBe(0);
    act(() => {
      mockListeners.pages!(fsPages, { fromCache: false });
      mockListeners.sessions!([yesterday], { fromCache: false });
    });
    await settle();
    expect(app.pendingChanges).toBe(1);
  });

  it('pages already healed are not rewritten (they were, unchanged, on every launch)', async () => {
    const healed = fsPages.map((p) =>
      p.pageNumber <= 2 ? { ...p, lastRevisedAt: ts('2026-11-01T00:00:00Z'), totalRevisionCount: 1 } : p,
    );
    view();
    await settle();
    act(() => {
      mockListeners.user!(fsUser, { fromCache: false });
      mockListeners.pages!(healed, { fromCache: false });
      mockListeners.sessions!([yesterday], { fromCache: false });
    });
    await settle();
    expect(app.pendingChanges).toBe(0);
  });

  it('pull to refresh offline keeps what is shown', async () => {
    await keepCopyOnPhone();
    view();
    await settle();
    goOffline();
    await act(async () => {
      await app.loadData();
    });
    expect(app.pages).toHaveLength(604);
    expect(app.logs).toHaveLength(1);
    expect(app.error).toBeNull();
  });
});

describe('the review’s cases', () => {
  it('a save built on an older copy sends only what it changes (another phone’s newer plan stays)', async () => {
    await keepCopyOnPhone();
    view();
    await settle();
    goOffline();
    await act(async () => {
      await app.saveUser({ ...app.user!, reciter: 'minshawi' });
    });
    mockServer.online = true;
    await act(async () => {
      mockNet.listener?.({ isConnected: true, isInternetReachable: true });
      await settleSync('u1');
    });
    expect(mockServer.applied.map((a) => a.entry.op)).toEqual([{ kind: 'user', fields: { reciter: 'minshawi' } }]);
  });

  it('a page change sends only the fields that changed (not status or the memorized date)', async () => {
    await keepCopyOnPhone();
    view();
    await settle();
    goOffline();
    const updated = app.pages.map((p) => (p.pageNumber === 3 ? { ...p, totalRevisionCount: 1 } : p));
    await act(async () => {
      await app.updatePages(updated, [3]);
    });
    expect(app.pendingChanges).toBe(1);
    await goOnline();
    expect(mockServer.applied[0].entry.op).toEqual({ kind: 'pages', pages: [{ pageNumber: 3, totalRevisionCount: 1 }] });
  });

  it('a change the server took is in the copy on the phone before it leaves the outbox', async () => {
    await keepCopyOnPhone();
    view();
    await settle();
    goOffline();
    await act(async () => {
      await app.addLog({ date: '2026-11-02', assignedPages: [3], pagesRevised: [3], pagesSkipped: [], weaknessUpdates: [], durationMinutes: 4 });
    });
    await goOnline();
    // No snapshot has come (the listener didn't fire), and the copy has it anyway.
    const copy = await readAccount('u1');
    expect(copy!.sessions.map((x) => x.id)).toContain('2026-11-02');
    expect(await loadOutbox('u1')).toEqual([]);
  });

  it('a listener that ends in an error is subscribed again (after a pause)', async () => {
    jest.useFakeTimers();
    await keepCopyOnPhone();
    view();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10);
    });
    expect(mockListeners.subscribed).toBe(1);
    act(() => mockListeners.userError!(Object.assign(new Error('denied'), { code: 'permission-denied' })));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    expect(mockListeners.subscribed).toBe(2);
    // The data stayed on screen meanwhile.
    expect(app.pages).toHaveLength(604);
  });

  it('"Try again" subscribes again at once', async () => {
    view();
    await settle();
    act(() => mockListeners.user!(null, { fromCache: true }));
    expect(app.connectionNeeded).toBe(true);
    const before = mockListeners.subscribed;
    act(() => app.retryConnection());
    await settle();
    expect(mockListeners.subscribed).toBe(before + 1);
  });
});

describe('a sign-in that lapsed offline', () => {
  it('while Firebase Auth checks it, the saved account’s copy shows and changes wait; nothing is sent until it is confirmed', async () => {
    await keepCopyOnPhone();
    mockAuth.firebaseUser = null;
    mockAuth.provisionalUid = 'u1';
    mockServer.online = true;
    const r = view();
    await settle();
    expect(app.loading).toBe(false);
    expect(app.onboardingComplete).toBe(true);
    await act(async () => {
      await app.saveUser({ ...app.user!, dailyPageCapacity: 10 });
    });
    expect(app.user?.dailyPageCapacity).toBe(10);
    await act(async () => settleSync('u1'));
    expect(mockServer.applied).toEqual([]);

    // Auth comes back: the sign-in is no longer valid. The app shows sign-in;
    // the change stays on the phone for this account.
    mockAuth.provisionalUid = null;
    r.rerender(<AppProvider><Probe /></AppProvider>);
    await settle();
    expect(app.isAuthenticated).toBe(false);
    expect(app.user).toBeNull();
    resetOutboxForTests();
    expect((await loadOutbox('u1')).map((e) => e.op.kind)).toEqual(['user']);

    // Signing in again as the same account sends it.
    mockAuth.firebaseUser = { uid: 'u1' };
    r.rerender(<AppProvider><Probe /></AppProvider>);
    await settle();
    await act(async () => settleSync('u1'));
    expect(mockServer.applied.map((a) => a.entry.op)).toEqual([
      { kind: 'user', fields: expect.objectContaining({ dailyPageCapacity: 10 }) },
    ]);
  });

  it('Auth keeps an expired sign-in offline (it can’t check it): Home from the copy, changes wait, and go once online', async () => {
    await keepCopyOnPhone();
    view();
    await settle();
    goOffline();
    await act(async () => {
      await app.completeOnboarding();
    });
    await act(async () => settleSync('u1'));
    expect(mockServer.applied).toEqual([]);
    expect(app.pendingChanges).toBe(1);
    await goOnline();
    expect(mockServer.applied).toHaveLength(1);
    expect(app.pendingChanges).toBe(0);
  });
});

describe('an account reset on the server (functions/scripts/reset-account.js)', () => {
  const resetAt = Date.parse('2026-11-02T23:00:00Z');
  const resetUser = {
    ...fsUser,
    onboardingComplete: false,
    createdAt: Timestamp.fromMillis(resetAt),
    dataResetAt: Timestamp.fromMillis(resetAt),
  } as FirestoreUser;
  const newPages = fsPages.map((p) => ({ ...p, status: 'not_memorized' })) as FirestorePage[];
  const oldChange: OutboxEntry['op'] = { kind: 'pages', pages: [{ pageNumber: 3, totalRevisionCount: 7 }] };

  afterEach(() => mockService.getUserFromServer.mockReset());

  it('a cold start after it: nothing from before is sent, the old copy goes, and the account starts at onboarding', async () => {
    await keepCopyOnPhone();
    await enqueue('u1', oldChange, resetAt - 60_000);
    await enqueue('u1', { kind: 'user', fields: { onboardingComplete: true } }, resetAt - 60_000);
    resetOutboxForTests();
    mockServer.online = true;
    mockService.getUserFromServer.mockResolvedValue(resetUser);
    view();
    await settle();
    await act(async () => settleSync('u1'));

    // The outbox checked the server before sending, and dropped the old changes.
    expect(mockService.getUserFromServer).toHaveBeenCalledWith('u1');
    expect(mockServer.applied).toEqual([]);
    expect(app.pendingChanges).toBe(0);
    resetOutboxForTests();
    expect(await loadOutbox('u1')).toEqual([]);
    // The copy's pages and sessions are gone, on screen and on the phone.
    expect(app.loading).toBe(true);
    expect(app.logs).toEqual([]);
    expect(await readAccount('u1')).toBeNull();

    // The server's snapshots: onboarding, with the new pages.
    act(() => {
      mockListeners.user!(resetUser, { fromCache: false });
      mockListeners.pages!(newPages, { fromCache: false });
      mockListeners.sessions!([], { fromCache: false });
    });
    expect(app.loading).toBe(false);
    expect(app.onboardingComplete).toBe(false);
    expect(app.pages.filter((p) => p.status === 'memorized')).toHaveLength(0);
  });

  it('while the app is open: changes waiting from before it are dropped; changes after it are sent', async () => {
    await keepCopyOnPhone();
    view();
    await settle();
    act(() => {
      mockListeners.user!(fsUser, { fromCache: false });
      mockListeners.pages!(fsPages, { fromCache: false });
      mockListeners.sessions!([yesterday], { fromCache: false });
    });
    await settle();
    goOffline();
    const updated = app.pages.map((p) => (p.pageNumber === 3 ? { ...p, totalRevisionCount: 7 } : p));
    await act(async () => {
      await app.updatePages(updated, [3]);
    });
    // The change, and the start-up self-heal's (yesterday's pages).
    expect(app.pendingChanges).toBe(2);

    // The admin resets it; the listener hears.
    await act(async () => {
      mockListeners.user!(resetUser, { fromCache: false });
      mockListeners.pages!(newPages, { fromCache: false });
      mockListeners.sessions!([], { fromCache: false });
    });
    await settle();
    expect(app.pendingChanges).toBe(0);
    await goOnline();
    expect(mockServer.applied).toEqual([]);

    // A change made now belongs to the new account and goes.
    await act(async () => {
      await app.completeOnboarding();
    });
    await act(async () => settleSync('u1'));
    expect(mockServer.applied.map((a) => a.entry.op)).toEqual([{ kind: 'user', fields: { onboardingComplete: true } }]);
  });

  it('signed out since (no copy): only the changes made before the reset are dropped', async () => {
    await enqueue('u1', oldChange, resetAt - 60_000);
    await enqueue('u1', { kind: 'usage', seconds: 30 }, resetAt + 60_000);
    resetOutboxForTests();
    mockServer.online = true;
    mockService.getUserFromServer.mockResolvedValue(resetUser);
    view();
    await settle();
    await act(async () => settleSync('u1'));
    expect(mockServer.applied.map((a) => a.entry.op)).toEqual([{ kind: 'usage', seconds: 30 }]);
  });

  it('a copy made after the reset: nothing is dropped', async () => {
    await writeAccountPart('u1', 'user', resetUser);
    await writeAccountPart('u1', 'pages', newPages);
    await enqueue('u1', oldChange, resetAt + 60_000);
    resetOutboxForTests();
    mockServer.online = true;
    mockService.getUserFromServer.mockResolvedValue(resetUser);
    view();
    await settle();
    await act(async () => settleSync('u1'));
    expect(mockServer.applied.map((a) => a.entry.op)).toEqual([oldChange]);
    expect(await readAccount('u1')).not.toBeNull();
  });

  it('nothing is sent until the check can be made', async () => {
    await keepCopyOnPhone();
    await enqueue('u1', oldChange, resetAt - 60_000);
    resetOutboxForTests();
    mockServer.online = true;
    mockService.getUserFromServer.mockRejectedValue(
      Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' }),
    );
    view();
    await settle();
    await act(async () => settleSync('u1'));
    expect(mockServer.applied).toEqual([]);
    expect(app.pendingChanges).toBe(1);

    // The server can be read again, and has no reset: the change goes.
    mockService.getUserFromServer.mockResolvedValue(fsUser);
    goOffline();
    await goOnline();
    expect(mockServer.applied.map((a) => a.entry.op)).toEqual([oldChange]);
  });
});

describe('online, as before', () => {
  it('a missing user document is created only once the server confirms it is missing', async () => {
    mockService.userDocExistsOnServer.mockResolvedValueOnce(false);
    view();
    await settle();
    act(() => mockListeners.user!(null, { fromCache: true }));
    expect(mockService.userDocExistsOnServer).not.toHaveBeenCalled();
    act(() => mockListeners.user!(null, { fromCache: false }));
    await settle();
    expect(mockService.userDocExistsOnServer).toHaveBeenCalledWith('u1');
    expect(mockService.createUser).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }));
  });
});

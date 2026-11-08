// Delete account always ends (BEHAVIOUR.md ACCOUNT-3). The real AuthContext and
// the real firestoreService.deleteAccount / callFunction; Firebase Auth, the
// network (fetch) and the phone's storage are stood in. Before the fix the
// call to deleteUserAccount had no time limit and neither had the steps after
// it, so a lost answer (seen on Android in E2E, Nov 7 2026: the server had
// deleted the account in a second) or a stalled sign-out left the spinner up
// for good, with neither "Account deleted" nor an error.
import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type MockUser = { uid: string; getIdToken: jest.Mock; reload: jest.Mock };
const mockAuth: { currentUser: MockUser | null; cb?: (u: unknown) => void } = { currentUser: null };
jest.mock('../../lib/firebase', () => ({
  get auth() {
    return mockAuth;
  },
  db: { app: { options: { projectId: 'demo-revisely' } } },
  subscribeToAuthChanges: (cb: any) => {
    mockAuth.cb = cb;
    cb(mockAuth.currentUser);
    return () => {};
  },
  logoutUser: jest.fn(async () => {
    mockAuth.currentUser = null;
    mockAuth.cb?.(null);
  }),
  registerUser: jest.fn(),
  loginUser: jest.fn(),
  resetPassword: jest.fn(),
  signInWithGoogleCredential: jest.fn(),
  signInWithAppleCredential: jest.fn(),
}));
jest.mock('firebase/auth', () => ({ getAuth: () => mockAuth }));
jest.mock('../../lib/appCheck', () => ({ getAppCheckToken: async () => 'app-check-token' }));
jest.mock('expo-constants', () => ({ expoConfig: { extra: { firebase: { apiKey: 'KEY' } } } }));
jest.mock('../../lib/googleAuth', () => ({ signOutGoogle: jest.fn(async () => undefined) }));
jest.mock('../../lib/sentry', () => ({ identifyUser: jest.fn() }));
jest.mock('../../lib/recordings', () => ({
  deleteAllRecordings: jest.fn(async () => undefined),
  forgetCloudDeletes: jest.fn(async () => undefined),
}));
jest.mock('../../lib/recordingBackupController', () => ({
  discardStoppedBackup: jest.fn(),
  resumeBackup: jest.fn(),
  stopBackup: jest.fn(async () => undefined),
}));
jest.mock('../../lib/offline/accountCache', () => ({
  ...jest.requireActual('../../lib/offline/accountCache'),
  clearAccount: jest.fn(async () => undefined),
}));

import { AuthProvider, useAuth } from '../AuthContext';
import * as firebase from '../../lib/firebase';
import * as accountCache from '../../lib/offline/accountCache';
import * as backup from '../../lib/recordingBackupController';
import { isDeletingAccount } from '../../services/firestoreService';

const fb = firebase as jest.Mocked<typeof firebase>;

let auth: ReturnType<typeof useAuth>;
function Probe() {
  auth = useAuth();
  return <Text>{auth.firebaseUser?.uid ?? 'signed out'}</Text>;
}

const DELETE_URL = 'https://us-central1-demo-revisely.cloudfunctions.net/deleteUserAccount';
const answered = (status: number, body: unknown) =>
  ({ ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body }) as unknown as Response;
/** The server got the request; its answer never arrives (React Native's fetch fails only when aborted). */
const lostAnswer = (_url: string, init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new TypeError('Aborted')));
  });
const authError = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });
// What the JS SDK says for an account the server deleted: the token and lookup
// endpoints answer USER_NOT_FOUND, which it maps to user-token-expired.
const ACCOUNT_DELETED = 'auth/user-token-expired';
const never = () => new Promise<never>(() => {});

let fetchMock: jest.Mock;
let outcome: { state: 'pending' | 'resolved' | 'rejected'; error?: any };

async function signedIn() {
  mockAuth.currentUser = {
    uid: 'u1',
    getIdToken: jest.fn(async () => 'id-token'),
    reload: jest.fn(async () => undefined),
  };
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {});
  expect(auth.firebaseUser?.uid).toBe('u1');
  expect(auth.isLoading).toBe(false);
}

/** Taps Delete: the spinner is up (isLoading) until deleteAccount settles. */
async function startDelete() {
  outcome = { state: 'pending' };
  await act(async () => {
    auth.deleteAccount().then(
      () => (outcome = { state: 'resolved' }),
      (error) => (outcome = { state: 'rejected', error }),
    );
  });
}

/** Still waiting: the spinner is up. */
function spinning() {
  expect(outcome.state).toBe('pending');
  expect(auth.isLoading).toBe(true);
}

async function wait(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  await AsyncStorage.clear();
  fetchMock = jest.fn(async () => answered(200, { result: { ok: true } }));
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => jest.useRealTimers());

describe('[ACCOUNT-3] Delete account always ends', () => {
  it("the server's answer is lost and the account is gone: after 30 s, Account deleted and signed out", async () => {
    await signedIn();
    fetchMock.mockImplementation(lostAnswer);
    // Auth: this account no longer exists (the server deleted it).
    mockAuth.currentUser!.reload.mockRejectedValue(authError(ACCOUNT_DELETED));
    await startDelete();
    expect(fetchMock).toHaveBeenCalledWith(DELETE_URL, expect.objectContaining({ method: 'POST' }));

    await wait(29_000);
    spinning();
    await wait(1_500);
    expect(outcome.state).toBe('resolved');
    // The request was given up on, not left open.
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    expect(auth.isLoading).toBe(false);
    expect(auth.firebaseUser).toBeNull();
    expect(fb.logoutUser).toHaveBeenCalled();
    expect(accountCache.clearAccount).toHaveBeenCalledWith('u1');
    expect(backup.discardStoppedBackup).toHaveBeenCalled();
    expect(backup.resumeBackup).not.toHaveBeenCalled();
  });

  it('the answer is lost and the account is still there: a clear error, still signed in, nothing left half done', async () => {
    await signedIn();
    fetchMock.mockImplementation(lostAnswer);
    await startDelete();
    spinning();
    await wait(30_500);
    expect(outcome.state).toBe('rejected');
    expect(outcome.error.code).toBe('deadline-exceeded');
    expect(outcome.error.message).toMatch(/didn't answer in time.*try again/i);
    expect(auth.isLoading).toBe(false);
    expect(auth.firebaseUser?.uid).toBe('u1');
    expect(fb.logoutUser).not.toHaveBeenCalled();
    expect(backup.resumeBackup).toHaveBeenCalled();
    expect(isDeletingAccount('u1')).toBe(false);
  });

  it("the answer is lost and Auth can't be reached either: the error after 40 s at most", async () => {
    await signedIn();
    fetchMock.mockImplementation(lostAnswer);
    mockAuth.currentUser!.reload.mockImplementation(never);
    await startDelete();
    await wait(39_000);
    spinning();
    await wait(1_500);
    expect(outcome.state).toBe('rejected');
    expect(outcome.error.code).toBe('deadline-exceeded');
    expect(auth.isLoading).toBe(false);
    expect(auth.firebaseUser?.uid).toBe('u1');
  });

  it('tried again after the server had already deleted it: Account deleted, no second call', async () => {
    await signedIn();
    // A fresh ID token can't be had for a deleted account.
    mockAuth.currentUser!.getIdToken.mockRejectedValue(authError(ACCOUNT_DELETED));
    mockAuth.currentUser!.reload.mockRejectedValue(authError(ACCOUNT_DELETED));
    await startDelete();
    await wait(0);
    expect(outcome.state).toBe('resolved');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(auth.firebaseUser).toBeNull();
  });

  it('sign-out stalls after the server deleted the account: the spinner ends within seconds, signed out', async () => {
    await signedIn();
    fb.logoutUser.mockImplementationOnce(never);
    await startDelete();
    spinning();
    await wait(5_500);
    expect(outcome.state).toBe('resolved');
    expect(auth.isLoading).toBe(false);
    expect(auth.firebaseUser).toBeNull();
  });

  it("deleting the phone's copy stalls: the spinner still ends, signed out", async () => {
    await signedIn();
    (accountCache.clearAccount as jest.Mock).mockImplementationOnce(never);
    await startDelete();
    spinning();
    await wait(5_500);
    expect(outcome.state).toBe('resolved');
    expect(fb.logoutUser).toHaveBeenCalled();
    expect(auth.isLoading).toBe(false);
    expect(auth.firebaseUser).toBeNull();
  });

  it('stopping the backup stalls: the delete still goes ahead, and ends', async () => {
    await signedIn();
    (backup.stopBackup as jest.Mock).mockImplementationOnce(never);
    await startDelete();
    spinning();
    await wait(12_500);
    expect(fetchMock).toHaveBeenCalledWith(DELETE_URL, expect.anything());
    expect(outcome.state).toBe('resolved');
    expect(auth.isLoading).toBe(false);
  });

  it('the server refuses (App Check): its error, at once, still signed in', async () => {
    await signedIn();
    fetchMock.mockResolvedValue(answered(401, { error: { status: 'UNAUTHENTICATED', message: 'Unauthenticated' } }));
    await startDelete();
    await wait(0);
    expect(outcome.state).toBe('rejected');
    expect(outcome.error.message).toBe('Unauthenticated');
    expect(auth.isLoading).toBe(false);
    expect(auth.firebaseUser?.uid).toBe('u1');
    expect(backup.resumeBackup).toHaveBeenCalled();
  });
});

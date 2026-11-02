// Firebase Auth checks its saved sign-in with the server at launch; on a weak
// connection that takes up to 30 s. Meanwhile the app opens with the account
// it saved, and signing out deletes the account's copy but keeps its unsent
// changes for the next sign-in.
import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockAuthChanges: { cb?: (u: unknown) => void } = {};
const mockCurrent: { user: { uid: string } | null } = { user: null };
jest.mock('../../lib/firebase', () => ({
  subscribeToAuthChanges: (cb: never) => {
    mockAuthChanges.cb = cb;
    return () => {};
  },
  logoutUser: jest.fn(async () => undefined),
  registerUser: jest.fn(),
  loginUser: jest.fn(),
  resetPassword: jest.fn(),
  signInWithGoogleCredential: jest.fn(),
  signInWithAppleCredential: jest.fn(),
}));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: mockCurrent.user }) }));
jest.mock('expo-constants', () => ({ expoConfig: { extra: { firebase: { apiKey: 'KEY' } } } }));
jest.mock('../../services/firestoreService', () => ({}));
jest.mock('../../lib/googleAuth', () => ({ signOutGoogle: jest.fn(async () => undefined) }));
jest.mock('../../lib/sentry', () => ({ identifyUser: jest.fn() }));
jest.mock('../../lib/recordings', () => ({ deleteAllRecordings: jest.fn(), forgetCloudDeletes: jest.fn() }));
jest.mock('../../lib/recordingBackupController', () => ({
  discardStoppedBackup: jest.fn(),
  resumeBackup: jest.fn(),
  stopBackup: jest.fn(async () => undefined),
}));

import { AuthProvider, useAuth, AUTH_GRACE_MS } from '../AuthContext';
import { readAccount, writeAccountPart } from '../../lib/offline/accountCache';
import { enqueue, loadOutbox, resetOutboxForTests } from '../../lib/offline/outbox';

let auth: ReturnType<typeof useAuth>;
function Probe() {
  auth = useAuth();
  return <Text>{auth.provisionalUid ?? '-'}</Text>;
}

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
  resetOutboxForTests();
  mockCurrent.user = null;
});
afterEach(() => jest.useRealTimers());

it('Auth slow to answer: after a moment the saved account shows; when Auth answers, it takes over', async () => {
  await AsyncStorage.setItem('firebase:authUser:KEY:[DEFAULT]', JSON.stringify({ uid: 'u1', email: 'a@example.com' }));
  render(<AuthProvider><Probe /></AuthProvider>);
  expect(auth.provisionalUid).toBeNull();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(AUTH_GRACE_MS);
  });
  expect(auth.provisionalUid).toBe('u1');
  expect(auth.isAuthenticated).toBe(false);
  // Auth: the sign-in is no longer valid.
  act(() => mockAuthChanges.cb!(null));
  expect(auth.provisionalUid).toBeNull();
  expect(auth.isLoading).toBe(false);
});

it('Auth answering in time, or nothing saved: no stand-in account', async () => {
  render(<AuthProvider><Probe /></AuthProvider>);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(AUTH_GRACE_MS * 2);
  });
  expect(auth.provisionalUid).toBeNull();
  await AsyncStorage.setItem('firebase:authUser:KEY:[DEFAULT]', JSON.stringify({ uid: 'u1' }));
  act(() => mockAuthChanges.cb!({ uid: 'u1' }));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(AUTH_GRACE_MS * 2);
  });
  expect(auth.provisionalUid).toBeNull();
});

it('signing out deletes the copy of the account on this phone, but keeps its unsent changes', async () => {
  jest.useRealTimers();
  mockCurrent.user = { uid: 'u1' };
  await writeAccountPart('u1', 'user', { uid: 'u1' });
  await writeAccountPart('u1', 'pages', [{ pageNumber: 1 }]);
  await enqueue('u1', { kind: 'usage', seconds: 30 });
  render(<AuthProvider><Probe /></AuthProvider>);
  act(() => mockAuthChanges.cb!({ uid: 'u1' }));
  expect(await readAccount('u1')).not.toBeNull();
  await act(async () => {
    await auth.signOutUser();
  });
  expect(await readAccount('u1')).toBeNull();
  resetOutboxForTests();
  expect((await loadOutbox('u1')).map((e) => e.op.kind)).toEqual(['usage']);
});

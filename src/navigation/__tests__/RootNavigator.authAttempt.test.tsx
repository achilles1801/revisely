// A sign-in or sign-up that fails keeps what the user typed (BEHAVIOUR.md ACCOUNT-2).
// The real AuthProvider, RootNavigator and AuthScreen together; only Firebase
// and the native sign-in sheets are stood in. Before the fix, an attempt set the
// launch-time `isLoading`, RootNavigator swapped the sign-in screen for its
// spinner, and a failure mounted it again from scratch: back on "Sign in", every
// field empty, only the error left.
import React from 'react';
import { Platform } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{name}</Text> };
});
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-apple-authentication', () => {
  const { Pressable } = require('react-native');
  return {
    isAvailableAsync: jest.fn(async () => true),
    AppleAuthenticationButton: (props: object) => <Pressable {...props} />,
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
    AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
  };
});
jest.mock('../../lib/googleAuth', () => ({
  signInWithGoogle: jest.fn(async () => ({ idToken: 'google-id-token' })),
  signOutGoogle: jest.fn(async () => undefined),
  isGoogleAuthAvailable: true,
  statusCodes: { SIGN_IN_CANCELLED: 'cancelled' },
  isErrorWithCode: () => false,
}));
jest.mock('../../lib/appleAuth', () => ({
  signInWithApple: jest.fn(async () => ({ identityToken: 'apple-token', rawNonce: 'nonce', fullName: null })),
}));

// Firebase Auth: answers at launch with "signed out"; each call waits for the test.
const mockAuthChanges: { cb?: (u: unknown) => void } = {};
jest.mock('../../lib/firebase', () => ({
  subscribeToAuthChanges: (cb: any) => {
    mockAuthChanges.cb = cb;
    cb(null);
    return () => {};
  },
  registerUser: jest.fn(),
  loginUser: jest.fn(),
  resetPassword: jest.fn(),
  logoutUser: jest.fn(async () => undefined),
  signInWithGoogleCredential: jest.fn(),
  signInWithAppleCredential: jest.fn(),
}));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: null }) }));
jest.mock('expo-constants', () => ({ expoConfig: { extra: { firebase: { apiKey: 'KEY' } } } }));
jest.mock('../../services/firestoreService', () => ({ getUser: jest.fn(), createUser: jest.fn() }));
jest.mock('../../lib/sentry', () => ({ identifyUser: jest.fn() }));
jest.mock('../../lib/recordings', () => ({ deleteAllRecordings: jest.fn(), forgetCloudDeletes: jest.fn() }));
jest.mock('../../lib/recordingBackupController', () => ({
  discardStoppedBackup: jest.fn(),
  resumeBackup: jest.fn(),
  stopBackup: jest.fn(async () => undefined),
}));

// Past the sign-in screen: the account's own screens are not under test here.
const mockApp = { loading: false, onboardingComplete: false, connectionNeeded: false };
jest.mock('../../context/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../MainNavigator', () => {
  const { Text } = require('react-native');
  return { MainNavigator: () => <Text>main</Text> };
});
jest.mock('../OnboardingNavigator', () => {
  const { Text } = require('react-native');
  return { OnboardingNavigator: () => <Text>onboarding</Text> };
});

import { RootNavigator } from '../RootNavigator';
import { AuthProvider } from '../../context/AuthContext';
import { DesignProvider } from '../../design/DesignContext';
import { ThemeProvider } from '../../context/ThemeContext';
import * as firebase from '../../lib/firebase';
import * as firestoreService from '../../services/firestoreService';
import * as googleAuth from '../../lib/googleAuth';

const fb = firebase as jest.Mocked<typeof firebase>;
const store = firestoreService as jest.Mocked<typeof firestoreService>;

/** A promise the test settles. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const authError = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

async function show() {
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
  expect(screen.getByTestId('auth')).toBeTruthy();
}

const valueOf = (id: string) => screen.getByTestId(id).props.value;
const title = () => screen.getByTestId('auth-title').props.children;
const errorText = () => screen.getByTestId('auth-error-text').props.children;
const submitState = () => screen.getByTestId('auth-submit').props.accessibilityState;

/** The sign-in screen is the same one throughout: no spinner took its place. */
function stillOnTheForm() {
  expect(screen.queryByTestId('root-loading')).toBeNull();
  expect(screen.getByTestId('auth')).toBeTruthy();
}

async function fillSignUp() {
  fireEvent.press(screen.getByTestId('auth-switch-mode'));
  expect(title()).toBe('Create account');
  fireEvent.changeText(screen.getByTestId('auth-name'), 'Maryam');
  fireEvent.changeText(screen.getByTestId('auth-email'), 'maryam@example.com');
  fireEvent.changeText(screen.getByTestId('auth-password'), 'secret-pass');
  fireEvent.changeText(screen.getByTestId('auth-confirm-password'), 'secret-pass');
}

async function fillSignIn() {
  fireEvent.changeText(screen.getByTestId('auth-email'), 'maryam@example.com');
  fireEvent.changeText(screen.getByTestId('auth-password'), 'wrong-pass');
}

const realOS = Platform.OS;
afterEach(() => {
  Platform.OS = realOS;
});

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockApp.loading = false;
  mockApp.onboardingComplete = false;
});

describe.each(['ios', 'android'] as const)('[ACCOUNT-2] on %s', (os) => {
  beforeEach(() => {
    Platform.OS = os;
  });

  it('a sign-up that fails ("already registered") keeps the mode, the name, the email and the password', async () => {
    await show();
    await fillSignUp();
    const attempt = deferred<never>();
    fb.registerUser.mockReturnValue(attempt.promise);

    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-submit'));
    });
    // In progress: on the button, with the form still there.
    stillOnTheForm();
    expect(submitState()).toMatchObject({ busy: true, disabled: true });
    expect(fb.registerUser).toHaveBeenCalledWith('maryam@example.com', 'secret-pass', 'Maryam');

    await act(async () => {
      attempt.reject(authError('auth/email-already-in-use'));
    });
    stillOnTheForm();
    expect(title()).toBe('Create account');
    expect(valueOf('auth-name')).toBe('Maryam');
    expect(valueOf('auth-email')).toBe('maryam@example.com');
    expect(valueOf('auth-password')).toBe('secret-pass');
    expect(valueOf('auth-confirm-password')).toBe('secret-pass');
    expect(errorText()).toBe('This email is already registered');
    expect(submitState()).toMatchObject({ busy: false, disabled: false });
  });

  it('a sign-in that fails (wrong password) keeps the email and the password', async () => {
    await show();
    await fillSignIn();
    const attempt = deferred<never>();
    fb.loginUser.mockReturnValue(attempt.promise);

    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-submit'));
    });
    stillOnTheForm();
    expect(submitState()).toMatchObject({ busy: true, disabled: true });

    await act(async () => {
      attempt.reject(authError('auth/invalid-credential'));
    });
    stillOnTheForm();
    expect(title()).toBe('Welcome back');
    expect(valueOf('auth-email')).toBe('maryam@example.com');
    expect(valueOf('auth-password')).toBe('wrong-pass');
    expect(errorText()).toBe('Invalid email or password');
  });

  it('Google refused by Firebase: the form stays, with the friendly error (not the raw one)', async () => {
    await show();
    await fillSignIn();
    const attempt = deferred<never>();
    fb.signInWithGoogleCredential.mockReturnValue(attempt.promise);

    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-google'));
    });
    stillOnTheForm();
    expect(screen.getByTestId('auth-google').props.accessibilityState).toMatchObject({ busy: true });

    await act(async () => {
      attempt.reject(authError('auth/user-disabled'));
    });
    stillOnTheForm();
    expect(valueOf('auth-email')).toBe('maryam@example.com');
    expect(errorText()).toBe('This account has been disabled');
  });

  it("Google's own sheet failing shows its message, and the form stays", async () => {
    await show();
    await fillSignIn();
    (googleAuth.signInWithGoogle as jest.Mock).mockRejectedValueOnce(new Error('Google Play services are not available'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-google'));
    });
    stillOnTheForm();
    expect(valueOf('auth-email')).toBe('maryam@example.com');
    expect(errorText()).toBe('Google Play services are not available');
    expect(fb.signInWithGoogleCredential).not.toHaveBeenCalled();
  });

  it('Apple refused by Firebase: the form stays, with the friendly error', async () => {
    await show();
    await fillSignUp();
    const attempt = deferred<never>();
    fb.signInWithAppleCredential.mockReturnValue(attempt.promise);

    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-apple'));
    });
    stillOnTheForm();

    await act(async () => {
      attempt.reject(authError('auth/network-request-failed'));
    });
    stillOnTheForm();
    expect(title()).toBe('Create account');
    expect(valueOf('auth-name')).toBe('Maryam');
    expect(errorText()).toBe('Network error. Please check your connection');
  });

  it('a password reset that fails keeps the email, and shows on the button while it runs', async () => {
    await show();
    fireEvent.press(screen.getByTestId('auth-forgot'));
    expect(title()).toBe('Reset password');
    fireEvent.changeText(screen.getByTestId('auth-email'), 'nobody@example.com');
    const attempt = deferred<void>();
    fb.resetPassword.mockReturnValue(attempt.promise);

    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-submit'));
    });
    stillOnTheForm();
    expect(submitState()).toMatchObject({ busy: true, disabled: true });

    await act(async () => {
      attempt.reject(authError('auth/user-not-found'));
    });
    expect(title()).toBe('Reset password');
    expect(valueOf('auth-email')).toBe('nobody@example.com');
    expect(errorText()).toBe('No account found with this email');
    expect(submitState()).toMatchObject({ busy: false, disabled: false });
  });

  it('a sign-up that works: the form until Firebase signs the account in, then the account (onboarding), as before', async () => {
    await show();
    await fillSignUp();
    const user = { uid: 'u1', email: 'maryam@example.com', displayName: 'Maryam', photoURL: null };
    const registered = deferred<typeof user>();
    fb.registerUser.mockReturnValue(registered.promise as never);
    const lookup = deferred<null>();
    store.getUser.mockReturnValue(lookup.promise as never);
    store.createUser.mockResolvedValue({} as never);

    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-submit'));
    });
    stillOnTheForm();
    expect(submitState()).toMatchObject({ busy: true });

    // Firebase signs the new account in: the app takes over (AppContext's own
    // loading covers the account until it has loaded; here it has).
    await act(async () => {
      registered.resolve(user);
      mockAuthChanges.cb!(user);
    });
    expect(screen.queryByTestId('auth')).toBeNull();
    expect(screen.getByText('onboarding')).toBeTruthy();

    // Sign-up still creates the account's documents.
    await act(async () => {
      lookup.resolve(null);
    });
    expect(store.createUser).toHaveBeenCalledWith({ uid: 'u1', email: 'maryam@example.com', displayName: 'Maryam' });
    expect(screen.getByText('onboarding')).toBeTruthy();
  });
});

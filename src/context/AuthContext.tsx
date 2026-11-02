import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  FirebaseUser,
  registerUser,
  loginUser,
  logoutUser,
  resetPassword,
  subscribeToAuthChanges,
  signInWithGoogleCredential,
  signInWithAppleCredential,
} from '../lib/firebase';
import { getAuth } from 'firebase/auth';
import * as firestoreService from '../services/firestoreService';
import { signOutGoogle } from '../lib/googleAuth';
import { identifyUser } from '../lib/sentry';
import { logger } from '../lib/logger';
import { deleteAllRecordings, forgetCloudDeletes } from '../lib/recordings';
import { discardStoppedBackup, resumeBackup, stopBackup } from '../lib/recordingBackupController';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { clearAccount } from '../lib/offline/accountCache';
import { clearOutbox } from '../lib/offline/outbox';

/**
 * How long Firebase Auth may take to check its saved sign-in before the app
 * opens with the account it saved. Offline it answers at once, but on a weak
 * connection it waits for the server (up to 30 s) before it says anything.
 */
export const AUTH_GRACE_MS = 1_500;

/**
 * The uid of the sign-in Firebase Auth saved on this phone (its own
 * AsyncStorage entry), or null. Only to show that account's copy while Auth
 * checks it: nothing is sent for it until Auth confirms the sign-in.
 */
export async function savedSignInUid(): Promise<string | null> {
  const apiKey = Constants.expoConfig?.extra?.firebase?.apiKey;
  if (!apiKey) return null;
  try {
    const raw = await AsyncStorage.getItem(`firebase:authUser:${apiKey}:[DEFAULT]`);
    const uid = raw ? (JSON.parse(raw) as { uid?: unknown }).uid : null;
    return typeof uid === 'string' && uid.length > 0 ? uid : null;
  } catch {
    return null;
  }
}

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /**
   * While Firebase Auth is still checking its saved sign-in (a weak
   * connection), the uid it saved: the app shows that account's copy meanwhile.
   */
  provisionalUid: string | null;
  error: string | null;
  // Auth actions
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signInWithApple: (
    identityToken: string,
    rawNonce: string,
    fullName?: { givenName?: string | null; familyName?: string | null },
  ) => Promise<void>;
  signOutUser: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [provisionalUid, setProvisionalUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let answered = false;
    const unsubscribe = subscribeToAuthChanges((user) => {
      answered = true;
      setFirebaseUser(user);
      setProvisionalUid(null);
      identifyUser(user?.uid ?? null);
      setIsLoading(false);
    });
    const grace = setTimeout(() => {
      if (answered) return;
      savedSignInUid().then((uid) => {
        if (!answered && uid) setProvisionalUid(uid);
      });
    }, AUTH_GRACE_MS);
    return () => {
      clearTimeout(grace);
      unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, name?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const user = await registerUser(email, password, name);

      // Initialize user in Firestore with all 604 pages
      try {
        const existingUser = await firestoreService.getUser(user.uid);
        if (!existingUser) {
          await firestoreService.createUser({
            uid: user.uid,
            email: user.email,
            displayName: name || user.displayName,
          });
          logger.log('New user initialized in Firestore with 604 pages');
        }
      } catch (firestoreErr) {
        logger.error('Failed to initialize Firestore user:', firestoreErr);
        // Don't throw - auth succeeded, Firestore init can be retried
      }
    } catch (err: any) {
      setError(getErrorMessage(err.code));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const user = await loginUser(email, password);

      // Ensure user exists in Firestore (for users who signed up before Firestore integration)
      try {
        const existingUser = await firestoreService.getUser(user.uid);
        if (!existingUser) {
          await firestoreService.createUser({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
          });
          logger.log('Existing auth user initialized in Firestore');
        }
      } catch (firestoreErr) {
        logger.error('Failed to check/create Firestore user:', firestoreErr);
      }
    } catch (err: any) {
      setError(getErrorMessage(err.code));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogle = async (idToken: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const user = await signInWithGoogleCredential(idToken);

      // Initialize user in Firestore if needed
      try {
        const existingUser = await firestoreService.getUser(user.uid);
        if (!existingUser) {
          await firestoreService.createUser({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
          });
          logger.log('Google user initialized in Firestore');
        }
      } catch (firestoreErr) {
        logger.error('Failed to initialize Google user in Firestore:', firestoreErr);
      }
    } catch (err: any) {
      setError(getErrorMessage(err.code));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithApple = async (
    identityToken: string,
    rawNonce: string,
    fullName?: { givenName?: string | null; familyName?: string | null },
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const user = await signInWithAppleCredential(identityToken, rawNonce);

      // Apple only sends fullName on the FIRST sign-in. Use it to seed displayName.
      const displayName =
        user.displayName ||
        [fullName?.givenName, fullName?.familyName].filter(Boolean).join(' ') ||
        null;

      try {
        const existingUser = await firestoreService.getUser(user.uid);
        if (!existingUser) {
          await firestoreService.createUser({
            uid: user.uid,
            email: user.email,
            displayName,
            photoURL: user.photoURL,
          });
        }
      } catch (firestoreErr) {
        logger.error('Failed to initialize Apple user in Firestore:', firestoreErr);
      }
    } catch (err: any) {
      setError(getErrorMessage(err.code));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteAccount = async () => {
    setIsLoading(true);
    setError(null);
    const uid = getAuth().currentUser?.uid;
    // No upload may land after the server deletes the backup.
    await stopBackup();
    try {
      await firestoreService.deleteAccount();
      discardStoppedBackup();
      // The account is gone: so are its copy and its unsent changes here.
      if (uid) {
        await Promise.all([clearAccount(uid), clearOutbox(uid)]).catch((err) =>
          logger.warn('Could not delete the account copy', err),
        );
      }
      // The server deleted the account's backup; this removes the recordings on
      // this phone, and the backup deletions still queued here.
      if (uid) {
        deleteAllRecordings(uid)
          .then(() => forgetCloudDeletes(uid))
          .catch((err) => logger.warn('Could not delete recordings', err));
      }
      // signOutUser is implicit — Firebase Auth user is gone, onAuthStateChanged
      // fires with null. We sign out locally to be sure.
      try {
        await logoutUser();
      } catch {
        // Already signed out by the delete call.
      }
    } catch (err: any) {
      resumeBackup();
      setError(getErrorMessage(err.code) || err?.message || 'Failed to delete account.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signOutUser = async () => {
    setIsLoading(true);
    setError(null);
    // Recordings deleted on this phone are deleted from the backup first (a
    // queue left here would only run when this account signs in here again).
    await stopBackup({ flushDeletes: true });
    const uid = getAuth().currentUser?.uid;
    try {
      await logoutUser();
      // The copy of the account on this phone goes; changes not yet sent stay
      // (they go when this account signs in here again).
      if (uid) await clearAccount(uid);
      // Clear the native Google session too so the next sign-in shows the
      // account chooser instead of silently picking the previous account.
      await signOutGoogle();
      discardStoppedBackup();
    } catch (err: any) {
      resumeBackup();
      setError(getErrorMessage(err.code));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const sendPasswordReset = async (email: string) => {
    setError(null);
    try {
      await resetPassword(email);
    } catch (err: any) {
      setError(getErrorMessage(err.code));
      throw err;
    }
  };

  const clearError = () => {
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        isAuthenticated: !!firebaseUser,
        isLoading,
        provisionalUid,
        error,
        signUp,
        signIn,
        signInWithGoogle,
        signInWithApple,
        signOutUser,
        deleteAccount,
        sendPasswordReset,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

function getErrorMessage(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered';
    case 'auth/invalid-email':
      return 'Invalid email address';
    case 'auth/operation-not-allowed':
      return 'Email/password accounts are not enabled';
    case 'auth/weak-password':
      return 'Password is too weak';
    case 'auth/user-disabled':
      return 'This account has been disabled';
    case 'auth/user-not-found':
      return 'No account found with this email';
    case 'auth/wrong-password':
      return 'Incorrect password';
    case 'auth/invalid-credential':
      return 'Invalid email or password';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection';
    default:
      return 'An error occurred. Please try again';
  }
}

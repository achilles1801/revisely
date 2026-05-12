import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  auth,
  FirebaseUser,
  registerUser,
  loginUser,
  logoutUser,
  resetPassword,
  subscribeToAuthChanges,
  signInWithGoogleCredential,
  signInWithAppleCredential,
} from '../lib/firebase';
import * as firestoreService from '../services/firestoreService';
import { identifyUser } from '../lib/sentry';
import { User, UserPage, RevisionLog } from '../types';
import { logger } from '../lib/logger';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((user) => {
      setFirebaseUser(user);
      identifyUser(user?.uid ?? null);
      setIsLoading(false);
    });
    return unsubscribe;
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
    try {
      await firestoreService.deleteAccount();
      // signOutUser is implicit — Firebase Auth user is gone, onAuthStateChanged
      // fires with null. We sign out locally to be sure.
      try {
        await logoutUser();
      } catch {
        // Already signed out by the delete call.
      }
    } catch (err: any) {
      setError(getErrorMessage(err.code) || err?.message || 'Failed to delete account.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signOutUser = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await logoutUser();
    } catch (err: any) {
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

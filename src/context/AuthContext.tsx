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
} from '../lib/firebase';
import * as firestoreService from '../services/firestoreService';
import { User, UserPage, RevisionLog } from '../types';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isOfflineMode: boolean;
  // Auth actions
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  continueOffline: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((user) => {
      setFirebaseUser(user);
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  const signUp = async (email: string, password: string, name?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const user = await registerUser(email, password, name);
      setIsOfflineMode(false);

      // Initialize user in Firestore with all 604 pages
      try {
        const existingUser = await firestoreService.getUser(user.uid);
        if (!existingUser) {
          await firestoreService.createUser({
            uid: user.uid,
            email: user.email,
            displayName: name || user.displayName,
          });
          console.log('New user initialized in Firestore with 604 pages');
        }
      } catch (firestoreErr) {
        console.error('Failed to initialize Firestore user:', firestoreErr);
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
      setIsOfflineMode(false);

      // Ensure user exists in Firestore (for users who signed up before Firestore integration)
      try {
        const existingUser = await firestoreService.getUser(user.uid);
        if (!existingUser) {
          await firestoreService.createUser({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
          });
          console.log('Existing auth user initialized in Firestore');
        }
      } catch (firestoreErr) {
        console.error('Failed to check/create Firestore user:', firestoreErr);
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
      setIsOfflineMode(false);

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
          console.log('Google user initialized in Firestore');
        }
      } catch (firestoreErr) {
        console.error('Failed to initialize Google user in Firestore:', firestoreErr);
      }
    } catch (err: any) {
      setError(getErrorMessage(err.code));
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

  const continueOffline = () => {
    setIsOfflineMode(true);
    setIsLoading(false);
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
        isOfflineMode,
        signUp,
        signIn,
        signInWithGoogle,
        signOutUser,
        sendPasswordReset,
        continueOffline,
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

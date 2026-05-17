import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  // @ts-expect-error — getReactNativePersistence is exported from firebase/auth at runtime
  // but is missing from the published TypeScript types as of firebase 12.x.
  getReactNativePersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  sendPasswordResetEmail,
  updateProfile,
  Auth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  addDoc,
  serverTimestamp,
  enableIndexedDbPersistence,
} from 'firebase/firestore';
import Constants from 'expo-constants';
import { User, UserPage, RevisionLog } from '../types';

// Firebase configuration from environment variables
const extra = Constants.expoConfig?.extra;
const firebaseConfig = {
  apiKey: extra?.firebase?.apiKey,
  authDomain: extra?.firebase?.authDomain,
  projectId: extra?.firebase?.projectId,
  storageBucket: extra?.firebase?.storageBucket,
  messagingSenderId: extra?.firebase?.messagingSenderId,
  appId: extra?.firebase?.appId,
  measurementId: extra?.firebase?.measurementId,
};

// Initialize Firebase only if not already initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Auth with AsyncStorage persistence so users stay logged in across
// app restarts. initializeAuth throws if called twice (e.g. on Fast Refresh),
// so fall back to getAuth on the second call.
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

// Initialize Firestore with offline persistence
const db = getFirestore(app);

// Enable offline persistence for mobile
// This allows the app to work offline and sync when back online
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs open, persistence can only be enabled in one tab at a time
    logger.warn('Firestore persistence failed: Multiple tabs open');
  } else if (err.code === 'unimplemented') {
    // The current browser doesn't support persistence
    logger.warn('Firestore persistence not supported in this browser');
  }
});

export { auth, db };
export type { FirebaseUser };

// Auth functions
export async function registerUser(email: string, password: string, displayName?: string) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(userCredential.user, { displayName });
  }
  return userCredential.user;
}

export async function loginUser(email: string, password: string) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

export async function logoutUser() {
  await signOut(auth);
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email);
}

export async function signInWithGoogleCredential(idToken: string) {
  const credential = GoogleAuthProvider.credential(idToken);
  const userCredential = await signInWithCredential(auth, credential);
  return userCredential.user;
}

export async function signInWithAppleCredential(
  identityToken: string,
  rawNonce: string,
) {
  const provider = new OAuthProvider('apple.com');
  const credential = provider.credential({ idToken: identityToken, rawNonce });
  const userCredential = await signInWithCredential(auth, credential);
  return userCredential.user;
}

/**
 * Update the signed-in user's Firebase Auth displayName.
 * Keeps `auth.currentUser.displayName` in sync with what we write to Firestore
 * — otherwise screens that fall back to `firebaseUser.displayName` (e.g. the
 * dashboard greeting) keep showing the original sign-up name forever.
 */
export async function updateAuthDisplayName(displayName: string | null): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  await updateProfile(user, { displayName });
}

export function subscribeToAuthChanges(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}

// Firestore data functions
export async function saveUserToFirestore(userId: string, userData: User) {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, {
    ...userData,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function getUserFromFirestore(userId: string): Promise<User | null> {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    return userSnap.data() as User;
  }
  return null;
}

export async function savePagesToFirestore(userId: string, pages: UserPage[]) {
  const pagesRef = doc(db, 'users', userId, 'data', 'pages');
  await setDoc(pagesRef, {
    pages,
    updatedAt: serverTimestamp(),
  });
}

export async function getPagesFromFirestore(userId: string): Promise<UserPage[]> {
  const pagesRef = doc(db, 'users', userId, 'data', 'pages');
  const pagesSnap = await getDoc(pagesRef);
  if (pagesSnap.exists()) {
    return pagesSnap.data().pages as UserPage[];
  }
  return [];
}

export async function addLogToFirestore(userId: string, log: RevisionLog) {
  const logsRef = collection(db, 'users', userId, 'logs');
  await addDoc(logsRef, {
    ...log,
    createdAt: serverTimestamp(),
  });
}

export async function getLogsFromFirestore(userId: string, maxLogs = 100): Promise<RevisionLog[]> {
  const logsRef = collection(db, 'users', userId, 'logs');
  const q = query(logsRef, orderBy('createdAt', 'desc'), limit(maxLogs));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => docSnap.data() as RevisionLog);
}

export async function syncDataToFirestore(
  userId: string,
  user: User,
  pages: UserPage[],
  logs: RevisionLog[]
) {
  await Promise.all([
    saveUserToFirestore(userId, user),
    savePagesToFirestore(userId, pages),
    ...logs.slice(0, 10).map(log => addLogToFirestore(userId, log)),
  ]);
}

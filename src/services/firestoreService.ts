/**
 * Firestore Service
 *
 * CRUD operations actually called from the app. Pruned in Phase 8 — all the
 * weighted-mode / danger-zone / stats helpers that had no consumers were
 * removed along with their supporting types.
 *
 * Key Design Decisions:
 * 1. Pages stored as individual documents for granular queries and updates
 * 2. Batch writes used at end of session to minimize write operations
 * 3. Sessions stored by date string as document ID for uniqueness
 */

import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  orderBy,
  limit,
  writeBatch,
  Timestamp,
  serverTimestamp,
  deleteField,
  DocumentReference,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import {
  FirestoreUser,
  FirestorePage,
  FirestoreSession,
  CreateUserInput,
  UpdateUserInput,
  UpdatePageInput,
  BatchPageUpdate,
  CreateSessionInput,
  UpdateSessionInput,
  TOTAL_QURAN_PAGES,
  DEFAULT_USER_SETTINGS,
  DEFAULT_WEAKNESS_RATING,
} from '../types/firestore';
import { db, auth } from '../lib/firebase';
import { logger } from '../lib/logger';

// ============================================================================
// REFERENCE HELPERS
// ============================================================================

function getCurrentUserId(): string {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  return user.uid;
}

function getUserRef(userId?: string): DocumentReference {
  return doc(db, 'users', userId || getCurrentUserId());
}

function getPageRef(pageNumber: number, userId?: string): DocumentReference {
  const uid = userId || getCurrentUserId();
  return doc(db, 'users', uid, 'pages', pageNumber.toString());
}

function getPagesCollectionRef(userId?: string) {
  const uid = userId || getCurrentUserId();
  return collection(db, 'users', uid, 'pages');
}

function getSessionsCollectionRef(userId?: string) {
  const uid = userId || getCurrentUserId();
  return collection(db, 'users', uid, 'sessions');
}

function getSessionRef(sessionId: string, userId?: string): DocumentReference {
  const uid = userId || getCurrentUserId();
  return doc(db, 'users', uid, 'sessions', sessionId);
}

// ============================================================================
// USER OPERATIONS
// ============================================================================

/**
 * Create a new user document with default settings and initialize all 604
 * page documents.
 */
export async function createUser(input: CreateUserInput): Promise<FirestoreUser> {
  const now = Timestamp.now();

  const userData: FirestoreUser = {
    uid: input.uid,
    displayName: input.displayName ?? null,
    email: input.email ?? null,
    photoURL: input.photoURL ?? null,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
    dailyPageCapacity: input.dailyPageCapacity ?? DEFAULT_USER_SETTINGS.dailyPageCapacity,
    smartTrackingEnabled: input.smartTrackingEnabled ?? DEFAULT_USER_SETTINGS.smartTrackingEnabled,
    hasSeenSmartTrackingPreview: input.hasSeenSmartTrackingPreview ?? DEFAULT_USER_SETTINGS.hasSeenSmartTrackingPreview,
    theme: input.theme ?? DEFAULT_USER_SETTINGS.theme,
    notifications: {
      enabled: input.notifications?.enabled ?? DEFAULT_USER_SETTINGS.notificationsEnabled,
      reminderTime: input.notifications?.reminderTime ?? DEFAULT_USER_SETTINGS.reminderTime,
    },
    currentMemorizationJuz: null,
    currentMemorizationPage: null,
    currentKhatamPage: 1,
    customPlan: null,
    streak: 0,
    lastRevisionDate: null,
    totalMemorizedPages: 0,
    totalLearningPages: 0,
    totalSessionsCompleted: 0,
    totalPagesRevisedAllTime: 0,
    onboardingComplete: false,
    memorizedSurahs: [],
    fajrBoundaryEnabled: false,
    locationCoords: null,
    fajrCalculationMethod: 'NorthAmerica',
    scheduleAnchorDate: new Date().toISOString(),
  };

  await setDoc(getUserRef(input.uid), userData);
  await initializeAllPages(input.uid);

  return userData;
}

/**
 * Initialize all 604 page documents with default values.
 * Uses multiple batches to stay under Firestore's 500-op limit.
 */
export async function initializeAllPages(userId: string): Promise<void> {
  const BATCH_SIZE = 450;
  const now = Timestamp.now();

  for (let batchStart = 1; batchStart <= TOTAL_QURAN_PAGES; batchStart += BATCH_SIZE) {
    const batch = writeBatch(db);
    const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, TOTAL_QURAN_PAGES);

    for (let pageNumber = batchStart; pageNumber <= batchEnd; pageNumber++) {
      const pageData: FirestorePage = {
        pageNumber,
        status: 'not_memorized',
        dateMemorized: null,
        lastRevisedAt: null,
        weaknessRating: DEFAULT_WEAKNESS_RATING,
        totalRevisionCount: 0,
        skipCount: 0,
        updatedAt: now,
      };
      batch.set(getPageRef(pageNumber, userId), pageData);
    }

    await batch.commit();
  }
}

export async function getUser(userId?: string): Promise<FirestoreUser | null> {
  const snapshot = await getDoc(getUserRef(userId));
  return snapshot.exists() ? (snapshot.data() as FirestoreUser) : null;
}

export async function updateUser(updates: UpdateUserInput, userId?: string): Promise<void> {
  const updateData: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    lastActiveAt: serverTimestamp(),
    // Cleanup: evict fields removed in Phase 1 / 6 / 8 from any legacy user
    // doc. No-ops on fresh docs; cleans up old ones the first time anything
    // updates the user (e.g. settings change, onboarding replay).
    dangerThresholdDays: deleteField(),
    revisionMode: deleteField(),
    activeDays: deleteField(),
    'notifications.dangerAlertEnabled': deleteField(),
    'notifications.dayStartHour': deleteField(),
  };

  if (updates.displayName !== undefined) updateData.displayName = updates.displayName;
  if (updates.dailyPageCapacity !== undefined) updateData.dailyPageCapacity = updates.dailyPageCapacity;
  if (updates.scheduleMode !== undefined) updateData.scheduleMode = updates.scheduleMode;
  if (updates.dailyJuzCount !== undefined) updateData.dailyJuzCount = updates.dailyJuzCount;
  if (updates.smartTrackingEnabled !== undefined) updateData.smartTrackingEnabled = updates.smartTrackingEnabled;
  if (updates.hasSeenSmartTrackingPreview !== undefined) updateData.hasSeenSmartTrackingPreview = updates.hasSeenSmartTrackingPreview;
  if (updates.theme !== undefined) updateData.theme = updates.theme;
  if (updates.currentMemorizationJuz !== undefined) updateData.currentMemorizationJuz = updates.currentMemorizationJuz;
  if (updates.currentMemorizationPage !== undefined) updateData.currentMemorizationPage = updates.currentMemorizationPage;
  if (updates.currentKhatamPage !== undefined) updateData.currentKhatamPage = updates.currentKhatamPage;
  if (updates.customPlan !== undefined) updateData.customPlan = updates.customPlan;
  if (updates.onboardingComplete !== undefined) updateData.onboardingComplete = updates.onboardingComplete;
  if (updates.totalMemorizedPages !== undefined) updateData.totalMemorizedPages = updates.totalMemorizedPages;
  if (updates.streak !== undefined) updateData.streak = updates.streak;
  if (updates.lastRevisionDate !== undefined) updateData.lastRevisionDate = updates.lastRevisionDate;
  if (updates.memorizedSurahs !== undefined) updateData.memorizedSurahs = updates.memorizedSurahs;
  if (updates.fajrBoundaryEnabled !== undefined) updateData.fajrBoundaryEnabled = updates.fajrBoundaryEnabled;
  if (updates.locationCoords !== undefined) updateData.locationCoords = updates.locationCoords;
  if (updates.fajrCalculationMethod !== undefined) updateData.fajrCalculationMethod = updates.fajrCalculationMethod;
  if (updates.scheduleAnchorDate !== undefined) updateData.scheduleAnchorDate = updates.scheduleAnchorDate;

  if (updates.notifications) {
    if (updates.notifications.enabled !== undefined) {
      updateData['notifications.enabled'] = updates.notifications.enabled;
    }
    if (updates.notifications.reminderTime !== undefined) {
      updateData['notifications.reminderTime'] = updates.notifications.reminderTime;
    }
  }

  await updateDoc(getUserRef(userId), updateData);
}

export function subscribeToUser(
  callback: (user: FirestoreUser | null) => void,
  userId?: string,
): Unsubscribe {
  return onSnapshot(getUserRef(userId), (snapshot) => {
    callback(snapshot.exists() ? (snapshot.data() as FirestoreUser) : null);
  });
}

// ============================================================================
// PAGE OPERATIONS
// ============================================================================

/** All 604 pages sorted by page number. */
export async function getAllPages(userId?: string): Promise<FirestorePage[]> {
  const q = query(getPagesCollectionRef(userId), orderBy('pageNumber', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as FirestorePage);
}

export async function updatePage(
  pageNumber: number,
  updates: UpdatePageInput,
  userId?: string,
): Promise<void> {
  const updateData: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.dateMemorized !== undefined) updateData.dateMemorized = updates.dateMemorized;
  if (updates.lastRevisedAt !== undefined) updateData.lastRevisedAt = updates.lastRevisedAt;
  if (updates.weaknessRating !== undefined) updateData.weaknessRating = updates.weaknessRating;
  if (updates.totalRevisionCount !== undefined) updateData.totalRevisionCount = updates.totalRevisionCount;
  if (updates.skipCount !== undefined) updateData.skipCount = updates.skipCount;

  await updateDoc(getPageRef(pageNumber, userId), updateData);
}

/**
 * Batch update multiple pages — the primary write operation used at the end
 * of a revision session. Chunks at 450 ops to stay under Firestore's limit.
 */
export async function batchUpdatePages(
  updates: BatchPageUpdate[],
  userId?: string,
): Promise<void> {
  if (updates.length === 0) return;

  const uid = userId || getCurrentUserId();
  const BATCH_SIZE = 450;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const slice = updates.slice(i, i + BATCH_SIZE);

    for (const { pageNumber, updates: pageUpdates } of slice) {
      const updateData: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (pageUpdates.status !== undefined) updateData.status = pageUpdates.status;
      if (pageUpdates.dateMemorized !== undefined) updateData.dateMemorized = pageUpdates.dateMemorized;
      if (pageUpdates.lastRevisedAt !== undefined) updateData.lastRevisedAt = pageUpdates.lastRevisedAt;
      if (pageUpdates.weaknessRating !== undefined) updateData.weaknessRating = pageUpdates.weaknessRating;
      if (pageUpdates.totalRevisionCount !== undefined) updateData.totalRevisionCount = pageUpdates.totalRevisionCount;
      if (pageUpdates.skipCount !== undefined) updateData.skipCount = pageUpdates.skipCount;
      batch.update(getPageRef(pageNumber, uid), updateData);
    }

    try {
      await batch.commit();
    } catch (error) {
      logger.error('[batchUpdatePages] Batch commit failed', error, {
        batchIndex: i,
        count: slice.length,
      });
      throw error;
    }
  }
}

export function subscribeToPages(
  callback: (pages: FirestorePage[]) => void,
  userId?: string,
): Unsubscribe {
  const q = query(getPagesCollectionRef(userId), orderBy('pageNumber', 'asc'));
  return onSnapshot(
    q,
    (snapshot) => callback(snapshot.docs.map((d) => d.data() as FirestorePage)),
    (error) => logger.error('subscribeToPages failed', error),
  );
}

// ============================================================================
// SESSION OPERATIONS
// ============================================================================

/** Create a new session keyed by date for uniqueness. */
export async function createSession(
  input: CreateSessionInput,
  userId?: string,
): Promise<FirestoreSession> {
  const now = Timestamp.now();
  const sessionId = input.date;

  const sessionData: FirestoreSession = {
    id: sessionId,
    date: input.date,
    state: 'NOT_STARTED',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    durationMinutes: null,
    assignedPages: input.assignedPages,
    totalAssignedPages: input.assignedPages.length,
    pagesRevised: [],
    pagesSkipped: [],
    weaknessUpdates: [],
    completionPercentage: 0,
  };

  await setDoc(getSessionRef(sessionId, userId), sessionData);
  return sessionData;
}

export async function getSession(
  sessionId: string,
  userId?: string,
): Promise<FirestoreSession | null> {
  const snapshot = await getDoc(getSessionRef(sessionId, userId));
  return snapshot.exists() ? (snapshot.data() as FirestoreSession) : null;
}

export async function updateSession(
  sessionId: string,
  updates: UpdateSessionInput,
  userId?: string,
): Promise<void> {
  const updateData: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (updates.state !== undefined) updateData.state = updates.state;
  if (updates.pagesRevised !== undefined) updateData.pagesRevised = updates.pagesRevised;
  if (updates.pagesSkipped !== undefined) updateData.pagesSkipped = updates.pagesSkipped;
  if (updates.weaknessUpdates !== undefined) updateData.weaknessUpdates = updates.weaknessUpdates;
  if (updates.completedAt !== undefined) updateData.completedAt = updates.completedAt;
  if (updates.durationMinutes !== undefined) updateData.durationMinutes = updates.durationMinutes;
  if (updates.completionPercentage !== undefined) updateData.completionPercentage = updates.completionPercentage;

  await updateDoc(getSessionRef(sessionId, userId), updateData);
}

export async function getRecentSessions(
  limitCount: number = 30,
  userId?: string,
): Promise<FirestoreSession[]> {
  const q = query(
    getSessionsCollectionRef(userId),
    orderBy('date', 'desc'),
    limit(limitCount),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as FirestoreSession);
}

export async function deleteSession(sessionId: string, userId?: string): Promise<void> {
  await deleteDoc(getSessionRef(sessionId, userId));
}

// ============================================================================
// ACCOUNT
// ============================================================================

/**
 * Permanently delete the current user's account and all associated data.
 * Calls the deleteUserAccount Cloud Function (admin SDK bypasses rules and
 * cleans up the Firebase Auth user too). Required by App Store guideline
 * 5.1.1(v).
 */
export async function deleteAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('No signed-in user.');
  const idToken = await user.getIdToken(/* forceRefresh */ true);

  let appCheckToken: string | null = null;
  try {
    const { getAppCheckToken } = await import('../lib/appCheck');
    appCheckToken = await getAppCheckToken();
  } catch {
    // App Check is best-effort — function enforces it server-side.
  }

  const projectId =
    (await import('expo-constants')).default.expoConfig?.extra?.firebase?.projectId;
  if (!projectId) throw new Error('Firebase projectId is not configured.');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  };
  if (appCheckToken) headers['X-Firebase-AppCheck'] = appCheckToken;

  const url = `https://us-central1-${projectId}.cloudfunctions.net/deleteUserAccount`;
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data: {} }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    let message = `HTTP ${resp.status}: ${text.slice(0, 200)}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error?.message) message = parsed.error.message;
    } catch {
      // keep raw
    }
    throw new Error(message);
  }
}

// ============================================================================
// FEEDBACK
// ============================================================================

/**
 * Submit user feedback to the top-level `feedback` collection. Write-only
 * from the client; the developer reads via the Firebase console.
 */
export async function submitFeedback(input: {
  message: string;
  appVersion?: string;
  platform?: string;
}): Promise<void> {
  const uid = getCurrentUserId();
  const user = auth.currentUser;
  await addDoc(collection(db, 'feedback'), {
    uid,
    email: user?.email ?? null,
    displayName: user?.displayName ?? null,
    message: input.message,
    appVersion: input.appVersion ?? null,
    platform: input.platform ?? null,
    createdAt: serverTimestamp(),
  });
}

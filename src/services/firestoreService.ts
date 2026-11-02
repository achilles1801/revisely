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
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  orderBy,
  limit,
  where,
  writeBatch,
  Timestamp,
  serverTimestamp,
  runTransaction,
  deleteField,
  increment,
  DocumentReference,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import type { BackupListing, CloudRecording } from '../lib/recordings';
import {
  FirestoreUser,
  FirestorePage,
  FirestoreSession,
  FirestoreJournalEntry,
  FirestoreReadingSession,
  FirestoreUsageStats,
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
import { JournalEntry, ReadingSession } from '../types';
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
  // Pages only where the server has none: a user document can go missing while
  // its pages (a subcollection) remain, and those hold real progress.
  if (!(await pagesExistOnServer(input.uid))) await initializeAllPages(input.uid);

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

/**
 * The user document fields for `updates`: plain values ("notifications.enabled"
 * style keys for nested ones), as kept in the outbox (lib/offline).
 */
export function userUpdateFields(updates: UpdateUserInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const keys = [
    'displayName', 'dailyPageCapacity', 'scheduleMode', 'dailyJuzCount', 'smartTrackingEnabled',
    'hasSeenSmartTrackingPreview', 'theme', 'currentMemorizationJuz', 'currentMemorizationPage',
    'currentKhatamPage', 'customPlan', 'savedPlans', 'onboardingComplete', 'totalMemorizedPages',
    'streak', 'lastRevisionDate', 'memorizedSurahs', 'fajrBoundaryEnabled', 'locationCoords',
    'fajrCalculationMethod', 'scheduleAnchorDate', 'carryOverMode', 'accent', 'carryOver',
    'scheduleShiftPages', 'translationId', 'recordingBackup', 'recordingBackupCellular', 'reciter',
  ] as const;
  for (const k of keys) {
    if (updates[k] !== undefined) fields[k] = updates[k];
  }
  if (updates.notifications) {
    if (updates.notifications.enabled !== undefined) {
      fields['notifications.enabled'] = updates.notifications.enabled;
    }
    if (updates.notifications.reminderTime !== undefined) {
      fields['notifications.reminderTime'] = updates.notifications.reminderTime;
    }
  }
  return fields;
}

/** Writes user document fields (from userUpdateFields), with the times and the legacy cleanup. */
export async function applyUserFields(fields: Record<string, unknown>, userId?: string): Promise<void> {
  await updateDoc(getUserRef(userId), {
    ...fields,
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
  });
}

export async function updateUser(updates: UpdateUserInput, userId?: string): Promise<void> {
  await applyUserFields(userUpdateFields(updates), userId);
}

/**
 * The user document as it changes. `fromCache` snapshots (the SDK's memory:
 * offline, or not yet heard from the server) come too, with metadata changes,
 * which is how the app tells it can't reach the server.
 */
export function subscribeToUser(
  callback: (user: FirestoreUser | null, meta: { fromCache: boolean }) => void,
  userId?: string,
  onError?: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    getUserRef(userId),
    { includeMetadataChanges: true },
    (snapshot) => {
      callback(snapshot.exists() ? (snapshot.data() as FirestoreUser) : null, {
        fromCache: snapshot.metadata.fromCache,
      });
    },
    (error) => {
      logger.error('subscribeToUser failed', error);
      onError?.(error);
    },
  );
}

/** The user document from the server (rejects offline). */
export async function getUserFromServer(userId: string): Promise<FirestoreUser | null> {
  const snapshot = await getDocFromServer(getUserRef(userId));
  return snapshot.exists() ? (snapshot.data() as FirestoreUser) : null;
}

/** Whether the user's document exists, asked of the server (not the local cache). */
export async function userDocExistsOnServer(userId?: string): Promise<boolean> {
  return (await getDocFromServer(getUserRef(userId))).exists();
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

/** All pages from the server (rejects offline). */
export async function getAllPagesFromServer(userId: string): Promise<FirestorePage[]> {
  const q = query(getPagesCollectionRef(userId), orderBy('pageNumber', 'asc'));
  const snapshot = await getDocsFromServer(q);
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

/** Page changes from the outbox (absolute fields; times as Timestamps already). */
export async function applyPageUpdates(
  pages: { pageNumber: number; data: Record<string, unknown> }[],
  userId: string,
): Promise<void> {
  const BATCH_SIZE = 450;
  for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const { pageNumber, data } of pages.slice(i, i + BATCH_SIZE)) {
      batch.update(getPageRef(pageNumber, userId), { ...data, updatedAt: serverTimestamp() });
    }
    await batch.commit();
  }
}

export function subscribeToPages(
  callback: (pages: FirestorePage[], meta: { fromCache: boolean }) => void,
  userId?: string,
): Unsubscribe {
  const q = query(getPagesCollectionRef(userId), orderBy('pageNumber', 'asc'));
  return onSnapshot(
    q,
    (snapshot) =>
      callback(snapshot.docs.map((d) => d.data() as FirestorePage), { fromCache: snapshot.metadata.fromCache }),
    (error) => logger.error('subscribeToPages failed', error),
  );
}

/** Whether the user has any page documents, asked of the server (not the local cache). */
export async function pagesExistOnServer(userId?: string): Promise<boolean> {
  return !(await getDocsFromServer(query(getPagesCollectionRef(userId), limit(1)))).empty;
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
  if (updates.assignedPages !== undefined) updateData.assignedPages = updates.assignedPages;
  if (updates.totalAssignedPages !== undefined) updateData.totalAssignedPages = updates.totalAssignedPages;

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

/** The most recent sessions from the server (rejects offline). */
export async function getRecentSessionsFromServer(limitCount: number, userId: string): Promise<FirestoreSession[]> {
  const q = query(getSessionsCollectionRef(userId), orderBy('date', 'desc'), limit(limitCount));
  const snapshot = await getDocsFromServer(q);
  return snapshot.docs.map((d) => d.data() as FirestoreSession);
}

/** The most recent sessions (newest first) as they change. */
export function subscribeToSessions(
  callback: (sessions: FirestoreSession[], meta: { fromCache: boolean }) => void,
  userId: string,
  limitCount = 100,
): Unsubscribe {
  const q = query(getSessionsCollectionRef(userId), orderBy('date', 'desc'), limit(limitCount));
  return onSnapshot(
    q,
    (snapshot) =>
      callback(snapshot.docs.map((d) => d.data() as FirestoreSession), { fromCache: snapshot.metadata.fromCache }),
    (error) => logger.error('subscribeToSessions failed', error),
  );
}

/**
 * Merges a change into a day's session on the server: reads what is there
 * (another phone may have added to it), merges, and creates or updates it.
 * `merge` returns null to leave it alone (an edit of a session that's gone).
 */
export async function mergeSessionOnServer(
  sessionId: string,
  merge: (existing: FirestoreSession | null) => FirestoreSession | null,
  updateData: (merged: FirestoreSession) => Record<string, unknown>,
  userId: string,
): Promise<void> {
  const ref = getSessionRef(sessionId, userId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists() ? (snap.data() as FirestoreSession) : null;
    const merged = merge(existing);
    if (!merged) return;
    if (existing) tx.update(ref, { ...updateData(merged), updatedAt: serverTimestamp() });
    else tx.set(ref, { ...merged, updatedAt: serverTimestamp() });
  });
}

export async function deleteSession(sessionId: string, userId?: string): Promise<void> {
  await deleteDoc(getSessionRef(sessionId, userId));
}

// ============================================================================
// JOURNAL OPERATIONS
// ============================================================================

function getJournalRef(date: string, userId?: string): DocumentReference {
  const uid = userId || getCurrentUserId();
  return doc(db, 'users', uid, 'journal', date);
}

function journalFromFirestore(data: FirestoreJournalEntry): JournalEntry {
  return {
    date: data.date,
    memorization: data.memorization ?? '',
    memorizationMinutes: data.memorizationMinutes ?? null,
    revision: data.revision ?? '',
    revisionMinutes: data.revisionMinutes ?? null,
    notes: data.notes ?? '',
    updatedAt: data.updatedAt?.toMillis?.(),
  };
}

/** Most recent journal entries, newest first. */
export async function getJournalEntries(
  limitCount: number = 120,
  userId?: string,
): Promise<JournalEntry[]> {
  const uid = userId || getCurrentUserId();
  const q = query(
    collection(db, 'users', uid, 'journal'),
    orderBy('date', 'desc'),
    limit(limitCount),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => journalFromFirestore(d.data() as FirestoreJournalEntry));
}

export async function getJournalEntry(
  date: string,
  userId?: string,
): Promise<JournalEntry | null> {
  const snapshot = await getDoc(getJournalRef(date, userId));
  return snapshot.exists()
    ? journalFromFirestore(snapshot.data() as FirestoreJournalEntry)
    : null;
}

/** Create or overwrite the entry for `entry.date` (one entry per day). */
export async function saveJournalEntry(
  entry: JournalEntry,
  isNew: boolean,
  userId?: string,
): Promise<void> {
  const data: Record<string, unknown> = {
    date: entry.date,
    memorization: entry.memorization,
    memorizationMinutes: entry.memorizationMinutes,
    revision: entry.revision,
    revisionMinutes: entry.revisionMinutes,
    notes: entry.notes,
    updatedAt: serverTimestamp(),
  };
  if (isNew) data.createdAt = serverTimestamp();
  await setDoc(getJournalRef(entry.date, userId), data, { merge: true });
}

export async function deleteJournalEntry(date: string, userId?: string): Promise<void> {
  await deleteDoc(getJournalRef(date, userId));
}

// ============================================================================
// READING SESSIONS (reading timer)
// ============================================================================

function getReadingSessionsRef(userId?: string) {
  return collection(db, 'users', userId || getCurrentUserId(), 'readingSessions');
}

function readingSessionFromFirestore(id: string, data: FirestoreReadingSession): ReadingSession {
  return {
    id,
    date: data.date,
    startedAt: data.startedAt?.toMillis?.() ?? 0,
    endedAt: data.endedAt?.toMillis?.() ?? 0,
    durationSeconds: data.durationSeconds ?? 0,
    mode: data.mode ?? 'stopwatch',
    targetSeconds: data.targetSeconds ?? null,
    pages: data.pages ?? [],
    pagesVisited: data.pagesVisited ?? [],
  };
}

/** Most recent reading sessions, newest first. */
export async function getReadingSessions(
  limitCount: number = 500,
  userId?: string,
): Promise<ReadingSession[]> {
  const q = query(getReadingSessionsRef(userId), orderBy('startedAt', 'desc'), limit(limitCount));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) =>
    readingSessionFromFirestore(d.id, d.data() as FirestoreReadingSession),
  );
}

/** Sessions on one revision day (no ordering: sorted by the caller). */
export async function getReadingSessionsForDay(
  date: string,
  userId?: string,
): Promise<ReadingSession[]> {
  const q = query(getReadingSessionsRef(userId), where('date', '==', date));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) =>
    readingSessionFromFirestore(d.id, d.data() as FirestoreReadingSession),
  );
}

/** Save a finished session. Returns the new document id. */
export async function addReadingSession(
  session: Omit<ReadingSession, 'id'>,
  userId?: string,
): Promise<string> {
  const ref = await addDoc(getReadingSessionsRef(userId), {
    date: session.date,
    startedAt: Timestamp.fromMillis(session.startedAt),
    endedAt: Timestamp.fromMillis(session.endedAt),
    durationSeconds: session.durationSeconds,
    mode: session.mode,
    targetSeconds: session.targetSeconds,
    pages: session.pages,
    pagesVisited: session.pagesVisited,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Save a finished session under an id made on the phone, so sending it again
 * (from the outbox) writes the same document: every field but updatedAt is
 * the same, which the rules allow as an update.
 */
export async function putReadingSession(
  id: string,
  session: Omit<ReadingSession, 'id'>,
  createdAtMs: number,
  userId: string,
): Promise<void> {
  await setDoc(doc(getReadingSessionsRef(userId), id), {
    date: session.date,
    startedAt: Timestamp.fromMillis(session.startedAt),
    endedAt: Timestamp.fromMillis(session.endedAt),
    durationSeconds: Math.round(session.durationSeconds),
    mode: session.mode,
    targetSeconds: session.targetSeconds,
    pages: session.pages,
    pagesVisited: session.pagesVisited,
    createdAt: Timestamp.fromMillis(createdAtMs),
    updatedAt: serverTimestamp(),
  });
}

/** Only the page assignment is editable after the fact. */
export async function updateReadingSessionPages(
  sessionId: string,
  pages: number[],
  userId?: string,
): Promise<void> {
  await updateDoc(doc(getReadingSessionsRef(userId), sessionId), {
    pages,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteReadingSession(sessionId: string, userId?: string): Promise<void> {
  await deleteDoc(doc(getReadingSessionsRef(userId), sessionId));
}

// ============================================================================
// APP USAGE (time spent in the app)
// ============================================================================

function getUsageRef(userId?: string): DocumentReference {
  return doc(db, 'users', userId || getCurrentUserId(), 'stats', 'usage');
}

export async function getAppUsageSeconds(userId?: string): Promise<number> {
  const snapshot = await getDoc(getUsageRef(userId));
  return snapshot.exists() ? (snapshot.data() as FirestoreUsageStats).appSeconds ?? 0 : 0;
}

/** Atomically add foreground seconds to the running total. */
export async function addAppUsageSeconds(seconds: number, userId?: string): Promise<void> {
  if (seconds <= 0) return;
  await setDoc(
    getUsageRef(userId),
    { appSeconds: increment(Math.round(seconds)), updatedAt: serverTimestamp() },
    { merge: true },
  );
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
// The account being deleted: its listeners see its data vanish and must not
// recreate it (lib/userDoc).
let deletingUid: string | null = null;
export function isDeletingAccount(uid: string | undefined | null): boolean {
  return uid != null && uid === deletingUid;
}

export async function deleteAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('No signed-in user.');
  deletingUid = user.uid;
  try {
    await deleteAccountOnServer(user);
  } catch (err) {
    deletingUid = null;
    throw err;
  }
}

async function deleteAccountOnServer(user: NonNullable<typeof auth.currentUser>): Promise<void> {
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

// ============================================================================
// RECORDING BACKUP (lib/recordingBackup): what the backup holds about each
// recording, users/<uid>/recordings/<id>. The audio is in Storage.
// ============================================================================

export async function listRecordingDocs(userId: string): Promise<BackupListing> {
  const snap = await getDocsFromServer(collection(db, 'users', userId, 'recordings'));
  const live: CloudRecording[] = [];
  const deleted: BackupListing['deleted'] = [];
  const ms = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : undefined);
  for (const d of snap.docs) {
    const data = d.data() as Omit<CloudRecording, 'id' | 'updatedAt'> & { updatedAt?: unknown; deletedAt?: unknown };
    if (data.deletedAt !== undefined) {
      deleted.push({ id: d.id, at: ms(data.deletedAt) ?? 0 });
      continue;
    }
    const { updatedAt, ...rest } = data;
    live.push({ ...rest, id: d.id, updatedAt: ms(updatedAt) });
  }
  return { live, deleted };
}

/**
 * Write a recording's record, unless the recording was deleted (its record is a
 * tombstone; the rules refuse writing over one too): then 'deleted'.
 */
export async function putRecordingDoc(userId: string, rec: CloudRecording): Promise<'ok' | 'deleted'> {
  const ref = doc(db, 'users', userId, 'recordings', rec.id);
  const { id: _id, updatedAt: _u, ...data } = rec;
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists() && snap.data().deletedAt !== undefined) return 'deleted' as const;
    tx.set(ref, { ...data, updatedAt: serverTimestamp() });
    return 'ok' as const;
  });
}

/**
 * A deleted recording's record becomes a tombstone, so no phone with a copy
 * uploads it again (the rules refuse writing over one). Written even when there
 * is no record now: one may come later from a phone that still has a copy.
 */
export async function tombstoneRecordingDoc(userId: string, id: string): Promise<void> {
  // A transaction rather than a plain write: offline it fails at once instead of
  // waiting (and holding up the backup) until the connection is back.
  const ref = doc(db, 'users', userId, 'recordings', id);
  await runTransaction(db, async (tx) => {
    tx.set(ref, { deletedAt: serverTimestamp() });
  });
}

/** Delete a recording's record (the whole backup going). Tombstones stay. */
export async function deleteLiveRecordingDoc(userId: string, id: string): Promise<void> {
  const ref = doc(db, 'users', userId, 'recordings', id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().deletedAt !== undefined) return;
    tx.delete(ref);
  });
}

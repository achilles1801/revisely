/**
 * Firestore Service
 *
 * Complete CRUD operations for the Quran Revision app.
 * Optimized for minimal writes and efficient reads.
 *
 * Key Design Decisions:
 * 1. Pages stored as individual documents for granular queries and updates
 * 2. Batch writes used at end of session to minimize write operations
 * 3. Denormalized stats in user document for quick dashboard reads
 * 4. Sessions stored by date string as document ID for uniqueness
 */

import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  Timestamp,
  serverTimestamp,
  increment,
  QueryConstraint,
  DocumentReference,
  onSnapshot,
  Unsubscribe,
  Firestore,
} from 'firebase/firestore';
import { Auth } from 'firebase/auth';
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
  WeaknessUpdate,
  PageStatus,
  WeaknessRating,
  SessionState,
  PageWithUrgency,
  UserStats,
  PageQueryFilters,
  DailyAssignment,
  TOTAL_QURAN_PAGES,
  DEFAULT_USER_SETTINGS,
  DEFAULT_WEAKNESS_RATING,
  UrgencyParameters,
} from '../types/firestore';
// Import initialized Firebase instances from firebase.ts
import { db, auth } from '../lib/firebase';

/**
 * Get the current authenticated user's ID
 * @throws Error if user is not authenticated
 */
function getCurrentUserId(): string {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user.uid;
}

/**
 * Get reference to user document
 */
function getUserRef(userId?: string): DocumentReference {
  const uid = userId || getCurrentUserId();
  return doc(db, 'users', uid);
}

/**
 * Get reference to a specific page document
 */
function getPageRef(pageNumber: number, userId?: string): DocumentReference {
  const uid = userId || getCurrentUserId();
  return doc(db, 'users', uid, 'pages', pageNumber.toString());
}

/**
 * Get reference to pages collection
 */
function getPagesCollectionRef(userId?: string) {
  const uid = userId || getCurrentUserId();
  return collection(db, 'users', uid, 'pages');
}

/**
 * Get reference to sessions collection
 */
function getSessionsCollectionRef(userId?: string) {
  const uid = userId || getCurrentUserId();
  return collection(db, 'users', uid, 'sessions');
}

/**
 * Get reference to a specific session document
 */
function getSessionRef(sessionId: string, userId?: string): DocumentReference {
  const uid = userId || getCurrentUserId();
  return doc(db, 'users', uid, 'sessions', sessionId);
}

// ============================================================================
// USER OPERATIONS
// ============================================================================

/**
 * Create a new user document with default settings
 * Also initializes all 604 page documents
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
    activeDays: input.activeDays ?? [...DEFAULT_USER_SETTINGS.activeDays],
    dangerThresholdDays: input.dangerThresholdDays ?? DEFAULT_USER_SETTINGS.dangerThresholdDays,
    revisionMode: input.revisionMode ?? DEFAULT_USER_SETTINGS.revisionMode,
    theme: input.theme ?? DEFAULT_USER_SETTINGS.theme,
    notifications: {
      enabled: input.notifications?.enabled ?? DEFAULT_USER_SETTINGS.notificationsEnabled,
      reminderTime: input.notifications?.reminderTime ?? DEFAULT_USER_SETTINGS.reminderTime,
      dangerAlertEnabled: input.notifications?.dangerAlertEnabled ?? DEFAULT_USER_SETTINGS.dangerAlertEnabled,
    },
    currentMemorizationJuz: null,
    currentMemorizationPage: null,
    currentKhatamPage: 1,
    streak: 0,
    lastRevisionDate: null,
    totalMemorizedPages: 0,
    totalLearningPages: 0,
    totalSessionsCompleted: 0,
    totalPagesRevisedAllTime: 0,
    onboardingComplete: false,
  };

  // Write user document and initialize pages in a batch
  const batch = writeBatch(db);
  const userRef = getUserRef(input.uid);
  batch.set(userRef, userData);

  // Initialize all 604 pages
  // Note: Firestore batch limit is 500, so we need multiple batches
  await setDoc(userRef, userData);
  await initializeAllPages(input.uid);

  return userData;
}

/**
 * Initialize all 604 pages with default values
 * Uses multiple batches due to Firestore's 500 operation limit
 */
export async function initializeAllPages(userId: string): Promise<void> {
  const BATCH_SIZE = 450; // Stay under 500 limit
  const now = Timestamp.now();

  for (let batchStart = 1; batchStart <= TOTAL_QURAN_PAGES; batchStart += BATCH_SIZE) {
    const batch = writeBatch(db);
    const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, TOTAL_QURAN_PAGES);

    for (let pageNumber = batchStart; pageNumber <= batchEnd; pageNumber++) {
      const pageRef = getPageRef(pageNumber, userId);
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
      batch.set(pageRef, pageData);
    }

    await batch.commit();
  }
}

/**
 * Get user document by ID
 * Returns null if user doesn't exist
 */
export async function getUser(userId?: string): Promise<FirestoreUser | null> {
  const userRef = getUserRef(userId);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as FirestoreUser;
}

/**
 * Update user settings and profile
 * Uses merge to only update specified fields
 */
export async function updateUser(updates: UpdateUserInput, userId?: string): Promise<void> {
  const userRef = getUserRef(userId);

  // Build update object, handling nested notifications
  const updateData: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    lastActiveAt: serverTimestamp(),
  };

  if (updates.displayName !== undefined) updateData.displayName = updates.displayName;
  if (updates.dailyPageCapacity !== undefined) updateData.dailyPageCapacity = updates.dailyPageCapacity;
  if (updates.activeDays !== undefined) updateData.activeDays = updates.activeDays;
  if (updates.dangerThresholdDays !== undefined) updateData.dangerThresholdDays = updates.dangerThresholdDays;
  if (updates.revisionMode !== undefined) updateData.revisionMode = updates.revisionMode;
  if (updates.theme !== undefined) updateData.theme = updates.theme;
  if (updates.currentMemorizationJuz !== undefined) updateData.currentMemorizationJuz = updates.currentMemorizationJuz;
  if (updates.currentMemorizationPage !== undefined) updateData.currentMemorizationPage = updates.currentMemorizationPage;
  if (updates.currentKhatamPage !== undefined) updateData.currentKhatamPage = updates.currentKhatamPage;
  if (updates.onboardingComplete !== undefined) updateData.onboardingComplete = updates.onboardingComplete;

  // Handle nested notification updates using dot notation
  if (updates.notifications) {
    if (updates.notifications.enabled !== undefined) {
      updateData['notifications.enabled'] = updates.notifications.enabled;
    }
    if (updates.notifications.reminderTime !== undefined) {
      updateData['notifications.reminderTime'] = updates.notifications.reminderTime;
    }
    if (updates.notifications.dangerAlertEnabled !== undefined) {
      updateData['notifications.dangerAlertEnabled'] = updates.notifications.dangerAlertEnabled;
    }
  }

  await updateDoc(userRef, updateData);
}

/**
 * Update user's last active timestamp
 * Called periodically to track activity
 */
export async function updateLastActive(userId?: string): Promise<void> {
  const userRef = getUserRef(userId);
  await updateDoc(userRef, {
    lastActiveAt: serverTimestamp(),
  });
}

/**
 * Subscribe to user document changes (real-time updates)
 */
export function subscribeToUser(
  callback: (user: FirestoreUser | null) => void,
  userId?: string
): Unsubscribe {
  const userRef = getUserRef(userId);
  return onSnapshot(userRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data() as FirestoreUser);
    } else {
      callback(null);
    }
  });
}

// ============================================================================
// PAGE OPERATIONS
// ============================================================================

/**
 * Get a single page by number
 */
export async function getPage(pageNumber: number, userId?: string): Promise<FirestorePage | null> {
  const pageRef = getPageRef(pageNumber, userId);
  const snapshot = await getDoc(pageRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as FirestorePage;
}

/**
 * Get all pages for a user
 * Returns array of 604 pages sorted by page number
 */
export async function getAllPages(userId?: string): Promise<FirestorePage[]> {
  const pagesRef = getPagesCollectionRef(userId);
  const q = query(pagesRef, orderBy('pageNumber', 'asc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => doc.data() as FirestorePage);
}

/**
 * Get pages by status
 * Efficient query for getting memorized pages for revision
 */
export async function getPagesByStatus(status: PageStatus, userId?: string): Promise<FirestorePage[]> {
  const pagesRef = getPagesCollectionRef(userId);
  const q = query(pagesRef, where('status', '==', status), orderBy('pageNumber', 'asc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => doc.data() as FirestorePage);
}

/**
 * Get memorized pages sorted by last revised date (oldest first)
 * Primary query for weighted revision algorithm
 */
export async function getMemorizedPagesByLastRevised(
  limitCount?: number,
  userId?: string
): Promise<FirestorePage[]> {
  const pagesRef = getPagesCollectionRef(userId);
  const constraints: QueryConstraint[] = [
    where('status', '==', 'memorized'),
    orderBy('lastRevisedAt', 'asc'),
  ];

  if (limitCount) {
    constraints.push(limit(limitCount));
  }

  const q = query(pagesRef, ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => doc.data() as FirestorePage);
}

/**
 * Get pages with low weakness rating (1-2)
 * For identifying problem areas
 */
export async function getWeakPages(
  maxRating: WeaknessRating = 2,
  userId?: string
): Promise<FirestorePage[]> {
  const pagesRef = getPagesCollectionRef(userId);
  const q = query(
    pagesRef,
    where('status', '==', 'memorized'),
    where('weaknessRating', '<=', maxRating),
    orderBy('weaknessRating', 'asc'),
    orderBy('pageNumber', 'asc')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => doc.data() as FirestorePage);
}

/**
 * Get pages in danger zone (not revised within threshold days)
 * @param thresholdDays Number of days after which a page is "in danger"
 */
export async function getPagesInDangerZone(
  thresholdDays: number,
  userId?: string
): Promise<FirestorePage[]> {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - thresholdDays);
  const thresholdTimestamp = Timestamp.fromDate(thresholdDate);

  const pagesRef = getPagesCollectionRef(userId);
  const q = query(
    pagesRef,
    where('status', '==', 'memorized'),
    where('lastRevisedAt', '<', thresholdTimestamp),
    orderBy('lastRevisedAt', 'asc')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => doc.data() as FirestorePage);
}

/**
 * Get pages for a specific juz
 * Note: Requires knowing page ranges for each juz (static data)
 */
export async function getPagesByJuz(
  juzNumber: number,
  juzPageRanges: Record<number, { start: number; end: number }>,
  userId?: string
): Promise<FirestorePage[]> {
  const range = juzPageRanges[juzNumber];
  if (!range) {
    throw new Error(`Invalid juz number: ${juzNumber}`);
  }

  const pagesRef = getPagesCollectionRef(userId);
  const q = query(
    pagesRef,
    where('pageNumber', '>=', range.start),
    where('pageNumber', '<=', range.end),
    orderBy('pageNumber', 'asc')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => doc.data() as FirestorePage);
}

/**
 * Update a single page
 */
export async function updatePage(
  pageNumber: number,
  updates: UpdatePageInput,
  userId?: string
): Promise<void> {
  const pageRef = getPageRef(pageNumber, userId);
  const updateData: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.dateMemorized !== undefined) updateData.dateMemorized = updates.dateMemorized;
  if (updates.lastRevisedAt !== undefined) updateData.lastRevisedAt = updates.lastRevisedAt;
  if (updates.weaknessRating !== undefined) updateData.weaknessRating = updates.weaknessRating;
  if (updates.totalRevisionCount !== undefined) updateData.totalRevisionCount = updates.totalRevisionCount;
  if (updates.skipCount !== undefined) updateData.skipCount = updates.skipCount;

  await updateDoc(pageRef, updateData);
}

/**
 * Mark a page as memorized
 * Also updates user's aggregate stats
 */
export async function markPageMemorized(pageNumber: number, userId?: string): Promise<void> {
  const uid = userId || getCurrentUserId();
  const batch = writeBatch(db);
  const now = Timestamp.now();

  // Update page
  const pageRef = getPageRef(pageNumber, uid);
  batch.update(pageRef, {
    status: 'memorized',
    dateMemorized: now,
    lastRevisedAt: now,
    updatedAt: now,
  });

  // Update user stats
  const userRef = getUserRef(uid);
  batch.update(userRef, {
    totalMemorizedPages: increment(1),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

/**
 * Mark a page as learning (in progress)
 */
export async function markPageLearning(pageNumber: number, userId?: string): Promise<void> {
  const uid = userId || getCurrentUserId();
  const batch = writeBatch(db);
  const now = Timestamp.now();

  // Update page
  const pageRef = getPageRef(pageNumber, uid);
  batch.update(pageRef, {
    status: 'learning',
    updatedAt: now,
  });

  // Update user stats
  const userRef = getUserRef(uid);
  batch.update(userRef, {
    totalLearningPages: increment(1),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

/**
 * Batch update multiple pages
 * Used at end of revision session for efficiency
 * This is the primary write operation - minimizes total writes
 */
export async function batchUpdatePages(
  updates: BatchPageUpdate[],
  userId?: string
): Promise<void> {
  console.log('[batchUpdatePages] Called with', updates.length, 'updates');

  if (updates.length === 0) {
    console.log('[batchUpdatePages] No updates, returning early');
    return;
  }

  const uid = userId || getCurrentUserId();
  console.log('[batchUpdatePages] User ID:', uid);

  const BATCH_SIZE = 450;

  // Process in batches
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const batchUpdates = updates.slice(i, i + BATCH_SIZE);

    console.log('[batchUpdatePages] Processing batch', i / BATCH_SIZE + 1, 'with', batchUpdates.length, 'updates');

    for (const { pageNumber, updates: pageUpdates } of batchUpdates) {
      const pageRef = getPageRef(pageNumber, uid);
      const updateData: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };

      if (pageUpdates.status !== undefined) updateData.status = pageUpdates.status;
      if (pageUpdates.dateMemorized !== undefined) updateData.dateMemorized = pageUpdates.dateMemorized;
      if (pageUpdates.lastRevisedAt !== undefined) updateData.lastRevisedAt = pageUpdates.lastRevisedAt;
      if (pageUpdates.weaknessRating !== undefined) updateData.weaknessRating = pageUpdates.weaknessRating;
      if (pageUpdates.totalRevisionCount !== undefined) updateData.totalRevisionCount = pageUpdates.totalRevisionCount;
      if (pageUpdates.skipCount !== undefined) updateData.skipCount = pageUpdates.skipCount;

      // Log first update for debugging
      if (i === 0 && pageNumber === batchUpdates[0].pageNumber) {
        console.log('[batchUpdatePages] First update - page:', pageNumber, 'weaknessRating:', pageUpdates.weaknessRating);
      }

      batch.update(pageRef, updateData);
    }

    try {
      await batch.commit();
      console.log('[batchUpdatePages] Batch committed successfully');
    } catch (error) {
      console.error('[batchUpdatePages] Batch commit error:', error);
      throw error;
    }
  }
}

/**
 * Bulk update pages by status (e.g., mark all pages in a juz as memorized)
 */
export async function bulkUpdatePageStatus(
  pageNumbers: number[],
  status: PageStatus,
  userId?: string
): Promise<void> {
  const now = Timestamp.now();

  const updates: BatchPageUpdate[] = pageNumbers.map((pageNumber) => ({
    pageNumber,
    updates: {
      status,
      dateMemorized: status === 'memorized' ? now : null,
      lastRevisedAt: status === 'memorized' ? now : null,
    },
  }));

  await batchUpdatePages(updates, userId);

  // Update user aggregate stats
  const uid = userId || getCurrentUserId();
  const userRef = getUserRef(uid);

  if (status === 'memorized') {
    await updateDoc(userRef, {
      totalMemorizedPages: increment(pageNumbers.length),
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Subscribe to all pages (real-time updates)
 */
export function subscribeToPages(
  callback: (pages: FirestorePage[]) => void,
  userId?: string
): Unsubscribe {
  const pagesRef = getPagesCollectionRef(userId);
  const q = query(pagesRef, orderBy('pageNumber', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const pages = snapshot.docs.map((doc) => doc.data() as FirestorePage);
    callback(pages);
  }, (error) => {
    console.error('subscribeToPages error:', error);
  });
}

// ============================================================================
// SESSION OPERATIONS
// ============================================================================

/**
 * Create a new session for today
 * Uses date as document ID for uniqueness
 */
export async function createSession(input: CreateSessionInput, userId?: string): Promise<FirestoreSession> {
  const uid = userId || getCurrentUserId();
  const now = Timestamp.now();

  // Use date as document ID for uniqueness
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

  const sessionRef = getSessionRef(sessionId, uid);
  await setDoc(sessionRef, sessionData);

  return sessionData;
}

/**
 * Get session by ID (date string)
 */
export async function getSession(sessionId: string, userId?: string): Promise<FirestoreSession | null> {
  const sessionRef = getSessionRef(sessionId, userId);
  const snapshot = await getDoc(sessionRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as FirestoreSession;
}

/**
 * Get today's session
 * Returns null if no session exists for today
 */
export async function getTodaySession(userId?: string): Promise<FirestoreSession | null> {
  const today = new Date().toISOString().split('T')[0];
  return getSession(today, userId);
}

/**
 * Get or create today's session
 * Creates a new session with assigned pages if none exists
 */
export async function getOrCreateTodaySession(
  assignedPages: number[],
  userId?: string
): Promise<FirestoreSession> {
  const today = new Date().toISOString().split('T')[0];
  const existingSession = await getSession(today, userId);

  if (existingSession) {
    return existingSession;
  }

  return createSession({ date: today, assignedPages }, userId);
}

/**
 * Update session progress
 */
export async function updateSession(
  sessionId: string,
  updates: UpdateSessionInput,
  userId?: string
): Promise<void> {
  const sessionRef = getSessionRef(sessionId, userId);
  const updateData: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (updates.state !== undefined) updateData.state = updates.state;
  if (updates.pagesRevised !== undefined) updateData.pagesRevised = updates.pagesRevised;
  if (updates.pagesSkipped !== undefined) updateData.pagesSkipped = updates.pagesSkipped;
  if (updates.weaknessUpdates !== undefined) updateData.weaknessUpdates = updates.weaknessUpdates;
  if (updates.completedAt !== undefined) updateData.completedAt = updates.completedAt;
  if (updates.durationMinutes !== undefined) updateData.durationMinutes = updates.durationMinutes;
  if (updates.completionPercentage !== undefined) updateData.completionPercentage = updates.completionPercentage;

  await updateDoc(sessionRef, updateData);
}

/**
 * Mark a page as revised in the current session
 * Also updates the page's lastRevisedAt and revisionCount
 */
export async function markPageRevised(
  sessionId: string,
  pageNumber: number,
  userId?: string
): Promise<void> {
  const uid = userId || getCurrentUserId();
  const batch = writeBatch(db);
  const now = Timestamp.now();

  // Get current session to update pagesRevised array
  const session = await getSession(sessionId, uid);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Add page to revised list if not already there
  const newPagesRevised = session.pagesRevised.includes(pageNumber)
    ? session.pagesRevised
    : [...session.pagesRevised, pageNumber];

  // Remove from skipped if it was there
  const newPagesSkipped = session.pagesSkipped.filter((p) => p !== pageNumber);

  // Calculate new state
  let newState: SessionState = 'IN_PROGRESS';
  const completionPercentage = (newPagesRevised.length / session.totalAssignedPages) * 100;

  if (newPagesRevised.length >= session.totalAssignedPages) {
    newState = 'COMPLETED';
  }

  // Update session
  const sessionRef = getSessionRef(sessionId, uid);
  batch.update(sessionRef, {
    pagesRevised: newPagesRevised,
    pagesSkipped: newPagesSkipped,
    state: newState,
    completionPercentage,
    updatedAt: now,
    ...(newState === 'COMPLETED' ? { completedAt: now } : {}),
  });

  // Update page
  const pageRef = getPageRef(pageNumber, uid);
  batch.update(pageRef, {
    lastRevisedAt: now,
    totalRevisionCount: increment(1),
    skipCount: 0, // Reset skip count on successful revision
    updatedAt: now,
  });

  await batch.commit();
}

/**
 * Mark a page as skipped in the current session
 */
export async function markPageSkipped(
  sessionId: string,
  pageNumber: number,
  userId?: string
): Promise<void> {
  const uid = userId || getCurrentUserId();
  const batch = writeBatch(db);
  const now = Timestamp.now();

  // Get current session
  const session = await getSession(sessionId, uid);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Add page to skipped list if not already there
  const newPagesSkipped = session.pagesSkipped.includes(pageNumber)
    ? session.pagesSkipped
    : [...session.pagesSkipped, pageNumber];

  // Remove from revised if it was there
  const newPagesRevised = session.pagesRevised.filter((p) => p !== pageNumber);

  // Calculate new state
  const completionPercentage = (newPagesRevised.length / session.totalAssignedPages) * 100;

  // Update session
  const sessionRef = getSessionRef(sessionId, uid);
  batch.update(sessionRef, {
    pagesRevised: newPagesRevised,
    pagesSkipped: newPagesSkipped,
    completionPercentage,
    updatedAt: now,
  });

  // Update page skip count
  const pageRef = getPageRef(pageNumber, uid);
  batch.update(pageRef, {
    skipCount: increment(1),
    updatedAt: now,
  });

  await batch.commit();
}

/**
 * Complete a revision session
 * Calculates final stats and updates user aggregates
 */
export async function completeSession(
  sessionId: string,
  durationMinutes: number,
  userId?: string
): Promise<void> {
  const uid = userId || getCurrentUserId();
  const batch = writeBatch(db);
  const now = Timestamp.now();
  const today = new Date().toISOString().split('T')[0];

  // Get session
  const session = await getSession(sessionId, uid);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Calculate final metrics
  const pagesRevisedCount = session.pagesRevised.length;
  const completionPercentage = (pagesRevisedCount / session.totalAssignedPages) * 100;

  // Update session
  const sessionRef = getSessionRef(sessionId, uid);
  batch.update(sessionRef, {
    state: 'COMPLETED',
    completedAt: now,
    durationMinutes,
    completionPercentage,
    pagesSkipped: session.assignedPages.filter((p) => !session.pagesRevised.includes(p)),
    updatedAt: now,
  });

  // Update user aggregate stats
  const userRef = getUserRef(uid);
  const user = await getUser(uid);

  // Calculate streak
  let newStreak = 1;
  if (user?.lastRevisionDate) {
    const lastDate = new Date(user.lastRevisionDate);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (lastDate.toISOString().split('T')[0] === yesterday.toISOString().split('T')[0]) {
      newStreak = (user.streak || 0) + 1;
    } else if (lastDate.toISOString().split('T')[0] === today) {
      // Already revised today, keep current streak
      newStreak = user.streak || 1;
    }
  }

  batch.update(userRef, {
    streak: newStreak,
    lastRevisionDate: today,
    totalSessionsCompleted: increment(1),
    totalPagesRevisedAllTime: increment(pagesRevisedCount),
    updatedAt: now,
    lastActiveAt: now,
  });

  await batch.commit();
}

/**
 * Update weakness rating for a page during a session
 */
export async function updateWeaknessRating(
  sessionId: string,
  pageNumber: number,
  newRating: WeaknessRating,
  userId?: string
): Promise<void> {
  const uid = userId || getCurrentUserId();
  const batch = writeBatch(db);
  const now = Timestamp.now();

  // Get current page to record previous rating
  const page = await getPage(pageNumber, uid);
  if (!page) {
    throw new Error(`Page not found: ${pageNumber}`);
  }

  const previousRating = page.weaknessRating;

  // Get session to update weakness updates array
  const session = await getSession(sessionId, uid);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Add weakness update record
  const weaknessUpdate: WeaknessUpdate = {
    pageNumber,
    previousRating,
    newRating,
    changedAt: now,
  };

  // Remove any existing update for this page and add new one
  const existingUpdates = session.weaknessUpdates.filter((u) => u.pageNumber !== pageNumber);
  const newWeaknessUpdates = [...existingUpdates, weaknessUpdate];

  // Update session
  const sessionRef = getSessionRef(sessionId, uid);
  batch.update(sessionRef, {
    weaknessUpdates: newWeaknessUpdates,
    updatedAt: now,
  });

  // Update page
  const pageRef = getPageRef(pageNumber, uid);
  batch.update(pageRef, {
    weaknessRating: newRating,
    updatedAt: now,
  });

  await batch.commit();
}

/**
 * Get recent sessions (for history view)
 */
export async function getRecentSessions(
  limitCount: number = 30,
  userId?: string
): Promise<FirestoreSession[]> {
  const sessionsRef = getSessionsCollectionRef(userId);
  const q = query(sessionsRef, orderBy('date', 'desc'), limit(limitCount));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => doc.data() as FirestoreSession);
}

/**
 * Get sessions within a date range
 */
export async function getSessionsByDateRange(
  startDate: string,
  endDate: string,
  userId?: string
): Promise<FirestoreSession[]> {
  const sessionsRef = getSessionsCollectionRef(userId);
  const q = query(
    sessionsRef,
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'desc')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => doc.data() as FirestoreSession);
}

/**
 * Delete a session (for cleanup/testing)
 */
export async function deleteSession(sessionId: string, userId?: string): Promise<void> {
  const sessionRef = getSessionRef(sessionId, userId);
  await deleteDoc(sessionRef);
}

/**
 * Subscribe to today's session (real-time updates)
 */
export function subscribeToTodaySession(
  callback: (session: FirestoreSession | null) => void,
  userId?: string
): Unsubscribe {
  const today = new Date().toISOString().split('T')[0];
  const sessionRef = getSessionRef(today, userId);

  return onSnapshot(sessionRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data() as FirestoreSession);
    } else {
      callback(null);
    }
  });
}

// ============================================================================
// ALGORITHM SUPPORT FUNCTIONS
// ============================================================================

/**
 * Calculate urgency score for a page
 * Higher score = more urgent to revise
 */
export function calculateUrgencyScore(
  page: FirestorePage,
  params: UrgencyParameters,
  today: Date = new Date()
): number {
  // Skip non-memorized pages
  if (page.status !== 'memorized' || !page.lastRevisedAt) {
    return 0;
  }

  const lastRevised = page.lastRevisedAt.toDate();
  const daysSinceRevision = Math.floor(
    (today.getTime() - lastRevised.getTime()) / (1000 * 60 * 60 * 24)
  );

  // 1. Base time urgency
  const timeUrgency = (daysSinceRevision / params.dangerThresholdDays) * params.timeWeight;

  // 2. Recency multiplier (newly memorized pages need more attention)
  let recencyMultiplier = 1.0;
  if (page.dateMemorized) {
    const dateMemorized = page.dateMemorized.toDate();
    const daysSinceMemorized = Math.floor(
      (today.getTime() - dateMemorized.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceMemorized < 30) {
      recencyMultiplier = (2.0 - daysSinceMemorized / 30) * params.recencyWeight;
    }
  }

  // 3. Weakness multiplier (weak pages get priority)
  const weaknessMultiplier = ((6 - page.weaknessRating) / 5) * params.weaknessWeight;

  // 4. Skip penalty (don't keep pushing back the same pages)
  const skipPenalty = 1 + page.skipCount * params.skipPenaltyWeight;

  return timeUrgency * recencyMultiplier * (1 + weaknessMultiplier) * skipPenalty;
}

/**
 * Get pages with urgency scores for algorithm
 */
export async function getPagesWithUrgency(
  params: UrgencyParameters,
  userId?: string
): Promise<PageWithUrgency[]> {
  const pages = await getPagesByStatus('memorized', userId);
  const today = new Date();

  return pages.map((page) => {
    const urgencyScore = calculateUrgencyScore(page, params, today);
    const lastRevisedDate = page.lastRevisedAt?.toDate() || new Date(0);
    const daysSinceRevision = Math.floor(
      (today.getTime() - lastRevisedDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      ...page,
      urgencyScore,
      daysSinceRevision,
      inDangerZone: daysSinceRevision >= params.dangerThresholdDays,
    };
  });
}

/**
 * Generate daily assignment based on urgency scores
 */
export async function generateDailyAssignment(
  capacity: number,
  params: UrgencyParameters,
  juzPageRanges: Record<number, { start: number; end: number }>,
  userId?: string
): Promise<DailyAssignment> {
  const pagesWithUrgency = await getPagesWithUrgency(params, userId);

  // Sort by urgency (highest first) and take top N
  const sortedPages = pagesWithUrgency
    .filter((p) => p.urgencyScore > 0)
    .sort((a, b) => b.urgencyScore - a.urgencyScore);

  const selectedPages = sortedPages.slice(0, capacity).map((p) => p.pageNumber).sort((a, b) => a - b);

  // Group by juz
  const juzMap = new Map<number, number[]>();
  for (const pageNumber of selectedPages) {
    // Find which juz this page belongs to
    let juzNumber = 1;
    for (const [juz, range] of Object.entries(juzPageRanges)) {
      if (pageNumber >= range.start && pageNumber <= range.end) {
        juzNumber = parseInt(juz);
        break;
      }
    }

    const existing = juzMap.get(juzNumber) || [];
    existing.push(pageNumber);
    juzMap.set(juzNumber, existing);
  }

  const juzBreakdown = Array.from(juzMap.entries())
    .map(([juz, pages]) => ({ juz, pages }))
    .sort((a, b) => a.juz - b.juz);

  const today = new Date().toISOString().split('T')[0];

  return {
    date: today,
    pages: selectedPages,
    juzBreakdown,
    totalPages: selectedPages.length,
    estimatedMinutes: Math.round(selectedPages.length * 1.25), // ~1.25 min per page
  };
}

// ============================================================================
// STATS AND ANALYTICS
// ============================================================================

/**
 * Get user stats for dashboard
 */
export async function getUserStats(userId?: string): Promise<UserStats> {
  const uid = userId || getCurrentUserId();

  // Get user and pages in parallel
  const [user, pages, sessions] = await Promise.all([
    getUser(uid),
    getAllPages(uid),
    getRecentSessions(30, uid),
  ]);

  if (!user) {
    throw new Error('User not found');
  }

  const today = new Date();
  const memorizedPages = pages.filter((p) => p.status === 'memorized');
  const learningPages = pages.filter((p) => p.status === 'learning');

  // Calculate pages in danger zone
  const pagesInDangerZone = memorizedPages.filter((p) => {
    if (!p.lastRevisedAt) return false;
    const lastRevised = p.lastRevisedAt.toDate();
    const daysSinceRevision = Math.floor(
      (today.getTime() - lastRevised.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSinceRevision >= user.dangerThresholdDays;
  });

  // Find weakest pages
  const weakestPages = memorizedPages
    .filter((p) => p.weaknessRating <= 2)
    .sort((a, b) => a.weaknessRating - b.weaknessRating)
    .slice(0, 10)
    .map((p) => p.pageNumber);

  // Calculate average session duration
  const completedSessions = sessions.filter(
    (s) => s.state === 'COMPLETED' && s.durationMinutes !== null
  );
  const averageSessionDuration =
    completedSessions.length > 0
      ? completedSessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0) /
        completedSessions.length
      : 0;

  return {
    totalMemorizedPages: memorizedPages.length,
    totalLearningPages: learningPages.length,
    pagesInDangerZone: pagesInDangerZone.length,
    currentStreak: user.streak,
    totalSessionsCompleted: user.totalSessionsCompleted,
    totalPagesRevisedAllTime: user.totalPagesRevisedAllTime,
    averageSessionDuration: Math.round(averageSessionDuration),
    weakestPages,
  };
}

/**
 * Recalculate and sync user aggregate stats
 * Called periodically or when data may be out of sync
 */
export async function recalculateUserStats(userId?: string): Promise<void> {
  const uid = userId || getCurrentUserId();

  const pages = await getAllPages(uid);
  const memorizedCount = pages.filter((p) => p.status === 'memorized').length;
  const learningCount = pages.filter((p) => p.status === 'learning').length;

  const userRef = getUserRef(uid);
  await updateDoc(userRef, {
    totalMemorizedPages: memorizedCount,
    totalLearningPages: learningCount,
    updatedAt: serverTimestamp(),
  });
}

// ============================================================================
// MIGRATION HELPERS
// ============================================================================

/**
 * Migrate from legacy data structure
 * Converts array-based page storage to document-based
 */
export async function migrateFromLegacyPages(
  legacyPages: Array<{
    pageNumber: number;
    status: string;
    dateMemorized: string | null;
    lastRevisedDate: string | null;
    weaknessRating: number;
    totalRevisionCount: number;
    skipCount: number;
  }>,
  userId?: string
): Promise<void> {
  const updates: BatchPageUpdate[] = legacyPages.map((p) => ({
    pageNumber: p.pageNumber,
    updates: {
      status: p.status as PageStatus,
      dateMemorized: p.dateMemorized ? Timestamp.fromDate(new Date(p.dateMemorized)) : null,
      lastRevisedAt: p.lastRevisedDate ? Timestamp.fromDate(new Date(p.lastRevisedDate)) : null,
      weaknessRating: p.weaknessRating as WeaknessRating,
      totalRevisionCount: p.totalRevisionCount,
      skipCount: p.skipCount,
    },
  }));

  await batchUpdatePages(updates, userId);
  await recalculateUserStats(userId);
}

/**
 * Export user data (for backup/portability)
 */
export async function exportUserData(userId?: string): Promise<{
  user: FirestoreUser | null;
  pages: FirestorePage[];
  sessions: FirestoreSession[];
}> {
  const uid = userId || getCurrentUserId();

  const [user, pages, sessions] = await Promise.all([
    getUser(uid),
    getAllPages(uid),
    getRecentSessions(365, uid), // Last year of sessions
  ]);

  return { user, pages, sessions };
}

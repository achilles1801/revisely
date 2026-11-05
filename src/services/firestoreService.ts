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
  collectionGroup,
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
  Query,
  Unsubscribe,
} from 'firebase/firestore';
import type { BackupListing, CloudRecording } from '../lib/recordings';
import type { RevisionItem } from '../lib/revisionItems';
import {
  FirestoreUser,
  FirestorePage,
  FirestoreSession,
  FirestoreJournalEntry,
  FirestoreJournalNote,
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
import { JournalEntry, JournalNote, ReadingSession } from '../types';
import { journalDayFromEntries, legacyJournalNotes, LEGACY_NOTE_ID } from '../lib/journal';
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

/** Whether the user's document exists, asked of the server (not the local cache). */
export async function userDocExistsOnServer(userId?: string): Promise<boolean> {
  return (await getDocFromServer(getUserRef(userId))).exists();
}

/** The user's document from the server (not the local cache); null if there is none. */
export async function getUserFromServer(userId?: string): Promise<FirestoreUser | null> {
  const snapshot = await getDocFromServer(getUserRef(userId));
  return snapshot.exists() ? (snapshot.data() as FirestoreUser) : null;
}

/**
 * A query's documents as they change, and once more when the server confirms
 * what came from the cache (`fromCache` turning false). The app waits for the
 * server's answer (AppContext ignores cached snapshots), and without
 * `includeMetadataChanges` Firestore sends nothing when only that changes: the
 * 604 pages a sign-up writes just before listening came once, from the cache,
 * and a new account stayed on "loading" until the app was relaunched (SYNC-4,
 * fixed Nov 2026). Snapshots that change nothing but pending-write flags are
 * not passed on, so a write isn't answered twice.
 */
function onQuerySnapshot<T>(
  q: Query,
  callback: (docs: T[], meta: { fromCache: boolean }) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  let lastFromCache: boolean | null = null;
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      const fromCache = snapshot.metadata.fromCache;
      if (fromCache === lastFromCache && snapshot.docChanges().length === 0) return;
      lastFromCache = fromCache;
      callback(snapshot.docs.map((d) => d.data() as T), { fromCache });
    },
    onError,
  );
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
  onError?: (error: unknown) => void,
): Unsubscribe {
  const q = query(getPagesCollectionRef(userId), orderBy('pageNumber', 'asc'));
  return onQuerySnapshot<FirestorePage>(q, callback, (error) => {
    logger.error('subscribeToPages failed', error);
    onError?.(error);
  });
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

/** The most recent sessions (newest first) as they change. */
export function subscribeToSessions(
  callback: (sessions: FirestoreSession[], meta: { fromCache: boolean }) => void,
  userId: string,
  limitCount = 100,
  onError?: (error: unknown) => void,
): Unsubscribe {
  const q = query(getSessionsCollectionRef(userId), orderBy('date', 'desc'), limit(limitCount));
  return onQuerySnapshot<FirestoreSession>(q, callback, (error) => {
    logger.error('subscribeToSessions failed', error);
    onError?.(error);
  });
}

/**
 * Merges a change into a day's session on the server: reads what is there
 * (another phone may have added to it), merges, and creates or updates it.
 * `merge` returns null to leave it alone (an edit of a session that's gone).
 * Resolves with the session as the server now has it, or null when left alone.
 */
export async function mergeSessionOnServer(
  sessionId: string,
  merge: (existing: FirestoreSession | null) => FirestoreSession | null,
  updateData: (merged: FirestoreSession) => Record<string, unknown>,
  userId: string,
): Promise<FirestoreSession | null> {
  const ref = getSessionRef(sessionId, userId);
  let result: FirestoreSession | null = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists() ? (snap.data() as FirestoreSession) : null;
    const merged = merge(existing);
    result = merged;
    if (!merged) return;
    if (existing) tx.update(ref, { ...updateData(merged), updatedAt: serverTimestamp() });
    else tx.set(ref, { ...merged, updatedAt: serverTimestamp() });
  });
  return result;
}

export async function deleteSession(sessionId: string, userId?: string): Promise<void> {
  await deleteDoc(getSessionRef(sessionId, userId));
}

/**
 * Makes a day's Revised items (users/{uid}/revisions) exactly `items`: each is
 * written, and any other item of that day is deleted (an edit that dropped an
 * ahead credit, or a deleted session). Items of other days are not touched.
 */
export async function replaceRevisionItems(day: string, items: RevisionItem[], userId?: string): Promise<void> {
  const uid = userId || getCurrentUserId();
  const itemsRef = collection(db, 'users', uid, 'revisions');
  const existing = await getDocs(query(itemsRef, where('day', '==', day)));
  const keep = new Set(items.map((i) => i.id));
  const batch = writeBatch(db);
  for (const item of items) batch.set(doc(itemsRef, item.id), item);
  for (const d of existing.docs) if (!keep.has(d.id)) batch.delete(d.ref);
  await batch.commit();
}

// ============================================================================
// JOURNAL OPERATIONS
// ============================================================================

function getJournalRef(date: string, userId?: string): DocumentReference {
  const uid = userId || getCurrentUserId();
  return doc(db, 'users', uid, 'journal', date);
}

function getJournalNoteRef(date: string, noteId: string, userId?: string) {
  const uid = userId || getCurrentUserId();
  return doc(db, 'users', uid, 'journal', date, 'entries', noteId);
}

/** Start of a revision day in local time: the fallback when a block has no createdAt. */
function localMidnight(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** When a day's single block was first written (its one entry's time). */
function legacyBlockAt(data: FirestoreJournalEntry, date: string): number {
  return data.createdAt?.toMillis?.() ?? data.updatedAt?.toMillis?.() ?? localMidnight(date);
}

/** A day's block as the entry it reads as (none when it is empty or already moved). */
function legacyNotesOf(data: FirestoreJournalEntry, date: string): JournalNote[] {
  return legacyJournalNotes(
    {
      memorization: data.memorization ?? '',
      memorizationMinutes: data.memorizationMinutes ?? null,
      revision: data.revision ?? '',
      revisionMinutes: data.revisionMinutes ?? null,
      notes: data.notes ?? '',
    },
    legacyBlockAt(data, date),
  );
}

/** Notes read from Firestore, with a day's block as its legacy note (a note with the same id wins). */
function mergeNotes(legacy: JournalNote[], notes: JournalNote[]): JournalNote[] {
  const byId = new Map(legacy.map((n) => [n.id, n] as const));
  for (const n of notes) byId.set(n.id, n);
  return [...byId.values()];
}

function noteFromFirestore(id: string, data: FirestoreJournalNote): JournalNote {
  return { id, at: data.at, kind: data.kind, text: data.text ?? '', minutes: data.minutes ?? null, tag: data.tag ?? null };
}

function noteToFirestore(note: JournalNote, uid: string, date: string): FirestoreJournalNote {
  return {
    id: note.id,
    uid,
    day: date,
    at: note.at,
    kind: note.kind,
    text: note.text,
    minutes: note.minutes,
    ...(note.tag ? { tag: note.tag } : {}),
  };
}

/** The day summaries of one account: its day blocks and its notes, newest day first. */
function journalDaysFrom(
  dayDocs: { id: string; data: () => unknown }[],
  noteDocs: { id: string; data: () => unknown }[],
): JournalEntry[] {
  const notesByDay = new Map<string, JournalNote[]>();
  for (const d of dayDocs) {
    const legacy = legacyNotesOf(d.data() as FirestoreJournalEntry, d.id);
    if (legacy.length > 0) notesByDay.set(d.id, legacy);
  }
  for (const n of noteDocs) {
    const data = n.data() as FirestoreJournalNote;
    const list = (notesByDay.get(data.day) ?? []).filter((x) => x.id !== n.id);
    list.push(noteFromFirestore(n.id, data));
    notesByDay.set(data.day, list);
  }
  return [...notesByDay]
    .map(([date, notes]) => journalDayFromEntries(date, notes))
    .filter((day) => day.entries.length > 0)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Daily logs, newest day first: the days' summaries built from their timestamped notes. */
export async function getJournalEntries(
  limitCount: number = 400,
  userId?: string,
): Promise<JournalEntry[]> {
  const uid = userId || getCurrentUserId();
  const [dayDocs, noteDocs] = await Promise.all([
    getDocs(query(collection(db, 'users', uid, 'journal'), orderBy('date', 'desc'), limit(limitCount))),
    getDocs(query(collectionGroup(db, 'entries'), where('uid', '==', uid))),
  ]);
  return journalDaysFrom(dayDocs.docs, noteDocs.docs);
}

/** One day's log: its notes oldest first, null when it has none. */
export async function getJournalEntry(
  date: string,
  userId?: string,
): Promise<JournalEntry | null> {
  const dayRef = getJournalRef(date, userId);
  const [dayDoc, noteDocs] = await Promise.all([getDoc(dayRef), getDocs(collection(dayRef, 'entries'))]);
  const legacy = dayDoc.exists() ? legacyNotesOf(dayDoc.data() as FirestoreJournalEntry, date) : [];
  const notes = mergeNotes(
    legacy,
    noteDocs.docs.map((n) => noteFromFirestore(n.id, n.data() as FirestoreJournalNote)),
  );
  return notes.length > 0 ? journalDayFromEntries(date, notes) : null;
}

/** A change to one note in a day's log. */
export type JournalNoteChange = { kind: 'put'; note: JournalNote } | { kind: 'delete'; id: string };

const EMPTY_JOURNAL_BLOCK = {
  memorization: '',
  memorizationMinutes: null,
  revision: '',
  revisionMinutes: null,
  notes: '',
};

/**
 * Write one note of a day's log. A day still in its single block moves that
 * block into its first entry in the same transaction (the block's fields are
 * cleared, so it isn't read twice). Repeating a change gives the same result.
 */
export async function applyJournalNote(
  date: string,
  change: JournalNoteChange,
  userId?: string,
): Promise<void> {
  const uid = userId || getCurrentUserId();
  const dayRef = getJournalRef(date, uid);
  await runTransaction(db, async (tx) => {
    const daySnap = await tx.get(dayRef);
    const legacy = daySnap.exists() ? legacyNotesOf(daySnap.data() as FirestoreJournalEntry, date) : [];
    if (legacy.length > 0) {
      const deletingIt = change.kind === 'delete' && change.id === LEGACY_NOTE_ID;
      if (!deletingIt) {
        tx.set(getJournalNoteRef(date, LEGACY_NOTE_ID, uid), noteToFirestore(legacy[0], uid, date));
      }
      tx.set(dayRef, EMPTY_JOURNAL_BLOCK, { merge: true });
    }
    if (change.kind === 'delete') {
      tx.delete(getJournalNoteRef(date, change.id, uid));
    } else {
      tx.set(getJournalNoteRef(date, change.note.id, uid), noteToFirestore(change.note, uid, date));
    }
  });
}

/** Changes queued before timestamped entries: the whole day as one block. */
export async function saveJournalEntry(
  entry: Pick<JournalEntry, 'date' | 'memorization' | 'memorizationMinutes' | 'revision' | 'revisionMinutes' | 'notes'>,
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

/** Deletes a day's log: its block and every note in it. */
export async function deleteJournalEntry(date: string, userId?: string): Promise<void> {
  const dayRef = getJournalRef(date, userId);
  const notes = await getDocs(collection(dayRef, 'entries'));
  const batch = writeBatch(db);
  for (const n of notes.docs) batch.delete(n.ref);
  batch.delete(dayRef);
  await batch.commit();
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

/**
 * The Activity items of one revision day (C2): its Revised items (the day's own
 * item and the credit to later days, which names its own day) and its Memorized
 * items. Read items and notes come from their own stores for now.
 */
export async function getActivityItemsForDay(
  day: string,
  userId?: string,
): Promise<{
  revisions: { id: string; day: string; countsFor: string; pages: number[]; skipped: number[]; assigned: number[]; minutes: number | null }[];
  memorized: { id: string; day: string; pages: number[] }[];
  reads: { id: string; day: string; pages: number[]; minutes: number | null; occurredAt: number | null }[];
  /** Pages revised in an earlier session, credited to this day ("done ahead"). */
  doneAhead: { fromDay: string; pages: number[] }[];
}> {
  const uid = userId || getCurrentUserId();
  const [rev, mem, read, ahead] = await Promise.all([
    getDocs(query(collection(db, 'users', uid, 'revisions'), where('day', '==', day))),
    getDocs(query(collection(db, 'users', uid, 'memorizations'), where('day', '==', day))),
    getDocs(query(collection(db, 'users', uid, 'reads'), where('day', '==', day))),
    getDocs(query(collection(db, 'users', uid, 'revisions'), where('countsFor', '==', day))),
  ]);
  return {
    revisions: rev.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        day: x.day,
        countsFor: x.countsFor,
        pages: x.pages ?? [],
        skipped: x.skipped ?? [],
        assigned: x.assigned ?? [],
        minutes: x.minutes ?? null,
      };
    }),
    memorized: mem.docs.map((d) => ({ id: d.id, day: d.data().day, pages: d.data().pages ?? [] })),
    reads: read.docs.map((d) => ({ id: d.id, day: d.data().day, pages: d.data().pages ?? [], minutes: d.data().minutes ?? null, occurredAt: d.data().occurredAt ?? null })),
    doneAhead: ahead.docs
      .filter((d) => d.data().day !== day)
      .map((d) => ({ fromDay: d.data().day, pages: d.data().pages ?? [] })),
  };
}

/** Removes a memorization item (C4): its pages are un-marked by their own change. */
export async function deleteMemorizationItem(id: string, userId: string): Promise<void> {
  await deleteDoc(doc(collection(db, 'users', userId, 'memorizations'), id));
}

/** Writes (or replaces) a session's Read item (C2 dual write). */
export async function setReadItem(item: { id: string }, userId: string): Promise<void> {
  await setDoc(doc(collection(db, 'users', userId, 'reads'), item.id), item);
}

/** A session's pages changed: its Read item follows (best effort: none if it was never written). */
export async function patchReadItemPages(id: string, pages: number[], userId: string): Promise<void> {
  await updateDoc(doc(collection(db, 'users', userId, 'reads'), id), { pages });
}

/** A session was deleted: its Read item goes with it. */
export async function deleteReadItem(id: string, userId: string): Promise<void> {
  await deleteDoc(doc(collection(db, 'users', userId, 'reads'), id));
}

/**
 * The Activity items between two revision days, inclusive (C3: the calendar's month
 * and Insights' window). Revised and memorization items by their day; reads too.
 */
export async function getActivityItemsBetween(
  from: string,
  to: string,
  userId?: string,
): Promise<{
  revisions: { id: string; day: string; countsFor: string; pages: number[]; skipped: number[]; assigned: number[]; minutes: number | null }[];
  memorized: { id: string; day: string; pages: number[] }[];
  reads: { id: string; day: string; pages: number[]; minutes: number | null }[];
}> {
  const uid = userId || getCurrentUserId();
  const range = (c: string) =>
    getDocs(query(collection(db, 'users', uid, c), where('day', '>=', from), where('day', '<=', to)));
  const [rev, mem, read] = await Promise.all([range('revisions'), range('memorizations'), range('reads')]);
  return {
    revisions: rev.docs.map((d) => {
      const x = d.data();
      return { id: d.id, day: x.day, countsFor: x.countsFor, pages: x.pages ?? [], skipped: x.skipped ?? [], assigned: x.assigned ?? [], minutes: x.minutes ?? null };
    }),
    memorized: mem.docs.map((d) => ({ id: d.id, day: d.data().day, pages: d.data().pages ?? [] })),
    reads: read.docs.map((d) => ({ id: d.id, day: d.data().day, pages: d.data().pages ?? [], minutes: d.data().minutes ?? null })),
  };
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
  await callFunction(user, 'deleteUserAccount', {});
}

// The account whose data is being reset (Settings → Reset my data, testers):
// nothing is sent from the outbox meanwhile, and nothing missing is recreated.
let resettingUid: string | null = null;
export function isResettingAccount(uid: string | undefined | null): boolean {
  return uid != null && uid === resettingUid;
}
export function setResettingAccount(uid: string | null): void {
  resettingUid = uid;
}

/** What the server's tester reset did (functions resetMyData). */
export interface TesterResetResult {
  ok: true;
  backup: { location: string; docs: number; files: number };
  pages: number;
  deleted: Record<string, number>;
  recordings: number;
  files: number;
}

/**
 * Reset the signed-in account's data on the server (testers only; the function
 * checks previewTester itself). lib/testerReset does the phone's part.
 */
export async function resetMyDataOnServer(): Promise<TesterResetResult> {
  const user = auth.currentUser;
  if (!user) throw new Error('No signed-in user.');
  const out = (await callFunction(user, 'resetMyData', { confirm: 'RESET' })) as { result?: TesterResetResult } | null;
  if (!out?.result?.ok) throw new Error('The reset did not answer as expected.');
  return out.result;
}

/** What loadTestScenario answers (functions/src/testScenarios.ts). */
export interface TestScenarioResult extends TesterResetResult {
  scenario: string;
  /** The revision day the scenario was built around. */
  today: string;
  seeded: Record<string, number>;
  /** The reset's mark (ms). */
  resetAt: number;
  /** Changes for this phone to queue and hold (the offline-queue scenario): outbox ops. */
  outbox: Record<string, unknown>[];
}

/**
 * Reset the signed-in account and load a test scenario into it (testers only;
 * the function checks previewTester itself). lib/testScenarios does the phone's part.
 */
export async function loadTestScenarioOnServer(data: {
  scenario: string;
  context: Record<string, unknown>;
}): Promise<TestScenarioResult> {
  const user = auth.currentUser;
  if (!user) throw new Error('No signed-in user.');
  const out = (await callFunction(user, 'loadTestScenario', { confirm: 'RESET', ...data })) as {
    result?: TestScenarioResult;
  } | null;
  if (!out?.result?.ok) throw new Error('The scenario did not answer as expected.');
  return out.result;
}

/** Call one of our callable Cloud Functions with the account's ID token and App Check. */
async function callFunction(
  user: NonNullable<typeof auth.currentUser>,
  name: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  const idToken = await user.getIdToken(/* forceRefresh */ true);

  let appCheckToken: string | null = null;
  try {
    const { getAppCheckToken } = await import('../lib/appCheck');
    appCheckToken = await getAppCheckToken();
  } catch {
    // App Check is best-effort — function enforces it server-side.
  }

  // The project the app is configured with (lib/firebase, from expo config).
  const projectId = db.app.options.projectId;
  if (!projectId) throw new Error('Firebase projectId is not configured.');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  };
  if (appCheckToken) headers['X-Firebase-AppCheck'] = appCheckToken;

  const url = `https://us-central1-${projectId}.cloudfunctions.net/${name}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data }),
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
  try {
    return await resp.json();
  } catch {
    return null;
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

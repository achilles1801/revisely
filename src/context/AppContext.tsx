import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { getAuth } from 'firebase/auth';
import { User, UserPage, RevisionLog } from '../types';
import {
  FirestoreUser,
  FirestorePage,
  FirestoreSession,
  DEFAULT_WEAKNESS_RATING,
  WeaknessRating,
} from '../types/firestore';
import * as firestoreService from '../services/firestoreService';
import { updateAuthDisplayName } from '../lib/firebase';
import { generateId } from '../lib/utils';
import { recomputePagesFromLogs } from '../lib/algorithm';
import {
  customPlanFromFirestore,
  customPlanToFirestore,
  getScheduleAnchorDateFromFirestore,
  savedPlansFromFirestore,
  savedPlansToFirestore,
  timestampToISOString,
} from '../lib/schedulePersistence';
import { scheduleDailyReminder } from '../lib/notifications';
import { logger } from '../lib/logger';
import { applyUpdateChannel } from '../lib/updateChannel';
import { ensureOnServer, retryDelayMs } from '../lib/userDoc';
import * as Sentry from '@sentry/react-native';
import { deleteRecordings, isRevisionRecordingOf } from '../lib/recordings';
import { useAuth } from './AuthContext';
import { readAccount, writeAccountPart, AccountPart } from '../lib/offline/accountCache';
import { enqueue, loadOutbox, pendingEntries, subscribeOutbox } from '../lib/offline/outbox';
import { configureSync, onApplied, requestFlush } from '../lib/offline/sync';
import { applyEntry } from '../lib/offline/apply';
import {
  overlayAccount,
  overlaySessions,
  OutboxEntry,
  OutboxOp,
  PageFields,
  WeaknessChange,
} from '../lib/offline/ops';
import { restartFirestore, watchConnectivity } from '../lib/offline/connectivity';
import { setCurrentAccount } from '../lib/offline/queue';

// ============================================================================
// CONVERSION HELPERS - Convert between Firestore and local types
// ============================================================================

function firestoreUserToLocal(fsUser: FirestoreUser): User {
  return {
    id: fsUser.uid,
    createdAt: timestampToISOString(fsUser.createdAt),
    name: fsUser.displayName || undefined,
    smartTrackingEnabled: fsUser.smartTrackingEnabled ?? false,
    hasSeenSmartTrackingPreview: fsUser.hasSeenSmartTrackingPreview ?? false,
    dailyPageCapacity: fsUser.dailyPageCapacity || 20,
    scheduleMode: fsUser.scheduleMode ?? 'pages',
    dailyJuzCount: fsUser.dailyJuzCount ?? 1,
    reminderTime: fsUser.notifications?.reminderTime || '08:00',
    notificationsEnabled: fsUser.notifications?.enabled ?? true,
    currentMemorizationJuz: fsUser.currentMemorizationJuz,
    currentMemorizationPage: fsUser.currentMemorizationPage,
    currentKhatamPage: fsUser.currentKhatamPage || 1,
    customPlan: customPlanFromFirestore(fsUser.customPlan),
    savedPlans: savedPlansFromFirestore(fsUser.savedPlans),
    streak: fsUser.streak || 0,
    lastRevisionDate: fsUser.lastRevisionDate,
    memorizedSurahs: fsUser.memorizedSurahs ?? [],
    fajrBoundaryEnabled: fsUser.fajrBoundaryEnabled ?? false,
    locationCoords: fsUser.locationCoords ?? null,
    fajrCalculationMethod: fsUser.fajrCalculationMethod ?? 'NorthAmerica',
    // Legacy users predate scheduleAnchorDate — fall back to createdAt so
    // the scheduler still produces a sensible cycle for them.
    scheduleAnchorDate: getScheduleAnchorDateFromFirestore(fsUser),
    carryOverMode: fsUser.carryOverMode,
    accent: fsUser.accent,
    carryOver: fsUser.carryOver,
    scheduleShiftPages: fsUser.scheduleShiftPages,
    translationId: fsUser.translationId,
    reciter: fsUser.reciter,
    recordingBackup: fsUser.recordingBackup,
    recordingBackupCellular: fsUser.recordingBackupCellular,
    previewTester: fsUser.previewTester === true,
  };
}

function firestorePageToLocal(fsPage: FirestorePage): UserPage {
  return {
    pageNumber: fsPage.pageNumber,
    status: fsPage.status === 'learning' ? 'in_progress' : fsPage.status,
    dateMemorized: fsPage.dateMemorized ? timestampToISOString(fsPage.dateMemorized) : null,
    weaknessRating: fsPage.weaknessRating || 4,
    lastRevisedDate: fsPage.lastRevisedAt ? timestampToISOString(fsPage.lastRevisedAt) : null,
    totalRevisionCount: fsPage.totalRevisionCount || 0,
    skipCount: fsPage.skipCount || 0,
  };
}

function firestoreSessionToLog(fsSession: FirestoreSession): RevisionLog {
  return {
    id: fsSession.id,
    date: fsSession.date,
    assignedPages: fsSession.assignedPages,
    pagesRevised: fsSession.pagesRevised,
    pagesSkipped: fsSession.pagesSkipped,
    weaknessUpdates: fsSession.weaknessUpdates.map(wu => ({
      page: wu.pageNumber,
      rating: wu.newRating,
    })),
    durationMinutes: fsSession.durationMinutes,
  };
}

// ============================================================================
// CONTEXT TYPES
// ============================================================================

interface AppState {
  user: User | null;
  pages: UserPage[];
  logs: RevisionLog[];
  loading: boolean;
  onboardingComplete: boolean;
  isAuthenticated: boolean;
  error: string | null;
  /**
   * Signed in, no copy of the account on this phone yet, and the server can't
   * be reached: the first launch needs a connection (RootNavigator says so).
   */
  connectionNeeded: boolean;
  /** The server can't be reached: what's shown is the copy on this phone. */
  offline: boolean;
  /** Changes on this phone the server doesn't have yet. */
  pendingChanges: number;
}

interface AppContextType extends AppState {
  loadData: () => Promise<void>;
  /** Try the server again now (the "Connect to the internet" screen). */
  retryConnection: () => void;
  saveUser: (user: User) => Promise<void>;
  savePages: (pages: UserPage[], changedPageNumbers?: number[]) => Promise<void>;
  updatePage: (page: UserPage) => Promise<void>;
  updatePages: (pages: UserPage[], changedPageNumbers?: number[]) => Promise<void>;
  addLog: (log: Omit<RevisionLog, 'id'>) => Promise<void>;
  updateLog: (log: RevisionLog) => Promise<void>;
  deleteLog: (logId: string) => Promise<void>;
  deleteLogs: (logIds: string[]) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
  createDefaultUser: (overrides?: Partial<User>) => User;
  initializeUserInFirestore: (uid: string, email?: string | null, displayName?: string | null) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// ============================================================================
// OFFLINE-FIRST DATA
// ============================================================================
//
// What the app shows is `base` (the server's last word: from the listeners, or
// the copy kept on the phone, lib/offline/accountCache) with the outbox's
// pending changes laid over it (lib/offline/ops). Every change goes into the
// outbox first (saved on the phone) and reaches the server through
// lib/offline/sync, in order; nothing waits for the server.
//
// Only server snapshots update `base`: an offline listener fires Firestore's
// memory, which is empty on a cold start, and an empty answer from it once
// overwrote real progress (REACT-NATIVE-6). Missing data is created only when
// the server confirms it is missing (lib/userDoc).

/** Without a copy on the phone, how long to wait for the server before saying a connection is needed. */
export const SERVER_WAIT_MS = 6_000;
/** Server snapshots are saved to the phone at most this often per part. */
const CACHE_WRITE_DELAY_MS = 400;

interface Base {
  uid: string;
  /** undefined: not known yet; null: the server has none (and creating it failed). */
  user: FirestoreUser | null | undefined;
  pages: FirestorePage[] | undefined;
  sessions: FirestoreSession[] | undefined;
  /** Pages and sessions heard from the server in this run (the self-heal waits for both). */
  pagesFresh: boolean;
  sessionsFresh: boolean;
  /** The pages' creation was decided without pages arriving (offline, or it failed). */
  pagesSettled: boolean;
}

const emptyBase = (uid: string): Base => ({
  uid,
  user: undefined,
  pages: undefined,
  sessions: undefined,
  pagesFresh: false,
  sessionsFresh: false,
  pagesSettled: false,
});

/** A change the server took, folded into `base` until its snapshot arrives. */
function commitToBase(b: Base, entry: OutboxEntry): Base {
  const view = overlayAccount(
    { user: b.user ?? null, pages: b.pages ?? [], sessions: b.sessions ?? [] },
    [entry],
  );
  return {
    ...b,
    user: b.user === undefined ? undefined : view.user,
    pages: b.pages === undefined ? undefined : view.pages,
    sessions: b.sessions === undefined ? undefined : view.sessions,
  };
}

/** "2026-10-27" from a day or an ISO time (its UTC date, as the day is stored). */
const revisedDay = (s: string | null | undefined): string | null => (s ? s.slice(0, 10) : null);

const isoToMillis = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
};

function pageChange(p: UserPage): PageFields {
  return {
    pageNumber: p.pageNumber,
    status: p.status === 'in_progress' ? 'learning' : p.status,
    dateMemorized: isoToMillis(p.dateMemorized),
    lastRevisedAt: isoToMillis(p.lastRevisedDate),
    weaknessRating: p.weaknessRating as WeaknessRating,
    totalRevisionCount: p.totalRevisionCount,
    skipCount: p.skipCount,
  };
}

function weaknessChanges(updates: { page: number; rating: number }[], at: number): WeaknessChange[] {
  return updates.map((w) => ({ pageNumber: w.page, newRating: w.rating, changedAt: at }));
}

/** The user document fields saveUser writes. */
function userFields(updatedUser: User): Record<string, unknown> {
  return firestoreService.userUpdateFields({
    displayName: updatedUser.name || null,
    smartTrackingEnabled: updatedUser.smartTrackingEnabled,
    hasSeenSmartTrackingPreview: updatedUser.hasSeenSmartTrackingPreview,
    dailyPageCapacity: updatedUser.dailyPageCapacity,
    scheduleMode: updatedUser.scheduleMode,
    dailyJuzCount: updatedUser.dailyJuzCount,
    notifications: {
      enabled: updatedUser.notificationsEnabled,
      reminderTime: updatedUser.reminderTime,
    },
    currentMemorizationJuz: updatedUser.currentMemorizationJuz,
    currentMemorizationPage: updatedUser.currentMemorizationPage,
    currentKhatamPage: updatedUser.currentKhatamPage,
    customPlan: customPlanToFirestore(updatedUser.customPlan),
    savedPlans: savedPlansToFirestore(updatedUser.savedPlans),
    memorizedSurahs: updatedUser.memorizedSurahs,
    fajrBoundaryEnabled: updatedUser.fajrBoundaryEnabled,
    locationCoords: updatedUser.locationCoords,
    fajrCalculationMethod: updatedUser.fajrCalculationMethod,
    scheduleAnchorDate: updatedUser.scheduleAnchorDate,
    // Sent only once set (null clears carryOver), so saving a user who never
    // used carry-over writes nothing new.
    ...(updatedUser.carryOverMode !== undefined && { carryOverMode: updatedUser.carryOverMode }),
    ...(updatedUser.accent !== undefined && { accent: updatedUser.accent }),
    ...(updatedUser.carryOver !== undefined && { carryOver: updatedUser.carryOver }),
    ...(updatedUser.scheduleShiftPages !== undefined && {
      scheduleShiftPages: updatedUser.scheduleShiftPages,
    }),
    ...(updatedUser.translationId !== undefined && { translationId: updatedUser.translationId }),
    ...(updatedUser.reciter !== undefined && { reciter: updatedUser.reciter }),
    ...(updatedUser.recordingBackup !== undefined && { recordingBackup: updatedUser.recordingBackup }),
    ...(updatedUser.recordingBackupCellular !== undefined && {
      recordingBackupCellular: updatedUser.recordingBackupCellular,
    }),
  });
}

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

export function AppProvider({ children }: { children: ReactNode }) {
  const { firebaseUser, provisionalUid } = useAuth();
  // The account shown: the signed-in one, or (while Firebase Auth is still
  // checking its saved sign-in on a slow network) the one it saved.
  const uid = firebaseUser?.uid ?? provisionalUid ?? null;
  const signedInUid = firebaseUser?.uid ?? null;

  const [base, setBase] = useState<Base | null>(null);
  const [pending, setPending] = useState<OutboxEntry[]>([]);
  // The uid whose copy (and outbox) has been read from the phone.
  const [cacheChecked, setCacheChecked] = useState<string | null>(null);
  const [waitedOut, setWaitedOut] = useState(false);
  const [netIsOffline, setNetIsOffline] = useState(false);
  // From the user document's listener: false while Firestore can't reach the server.
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uidRef = useRef<string | null>(uid);
  uidRef.current = uid;
  const serverReachableRef = useRef<boolean | null>(null);
  serverReachableRef.current = serverReachable;

  // Guard so the initial-load self-heal runs at most once per account and run.
  const hasSelfHealedOnLoad = useRef(false);
  // Tracks which user.id we've already (re)scheduled the daily reminder for
  // this session. The OS notification scheduler is per-device, so a fresh
  // install or a new device won't have any schedule even if the Firestore
  // profile says notifications are on — this rehydrates it.
  const lastScheduledUserIdRef = useRef<string | null>(null);

  // ============================================================================
  // SYNC: the outbox reaches the server while its account is signed in
  // ============================================================================

  useEffect(() => {
    configureSync({
      currentUid: () => getAuth().currentUser?.uid ?? null,
      isDeleting: (u) => firestoreService.isDeletingAccount(u),
      apply: applyEntry,
    });
    const offApplied = onApplied((u, entry) => {
      setBase((b) => (b && b.uid === u ? commitToBase(b, entry) : b));
    });
    const offOutbox = subscribeOutbox((u) => {
      if (u === uidRef.current) setPending(pendingEntries(u));
    });
    const offNet = watchConnectivity(
      (offline) => setNetIsOffline(offline),
      () => {
        // Back online, or back in front: restart Firestore's connection if it
        // was down (it would otherwise wait out its backoff), and send.
        if (serverReachableRef.current === false) restartFirestore();
        requestFlush(getAuth().currentUser?.uid);
      },
    );
    return () => {
      offApplied();
      offOutbox();
      offNet();
      configureSync(null);
    };
  }, []);

  useEffect(() => {
    if (signedInUid) requestFlush(signedInUid);
  }, [signedInUid]);

  // ============================================================================
  // THE ACCOUNT: the copy on the phone at once, then the server's snapshots
  // ============================================================================

  const cacheTimers = useRef(new Map<AccountPart, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = cacheTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);
  const saveCopy = useCallback((forUid: string, part: AccountPart, value: unknown) => {
    const timers = cacheTimers.current;
    const t = timers.get(part);
    if (t) clearTimeout(t);
    timers.set(
      part,
      setTimeout(() => {
        timers.delete(part);
        // Only for the account still shown.
        if (uidRef.current === forUid) writeAccountPart(forUid, part, value);
      }, CACHE_WRITE_DELAY_MS),
    );
  }, []);

  useEffect(() => {
    setCurrentAccount(uid);
    if (!uid) {
      setBase(null);
      setPending([]);
      setCacheChecked(null);
      setServerReachable(null);
      hasSelfHealedOnLoad.current = false;
      lastScheduledUserIdRef.current = null;
      return;
    }

    let active = true;
    setBase(emptyBase(uid));
    setPending(pendingEntries(uid));
    setCacheChecked(null);
    setWaitedOut(false);
    setServerReachable(null);
    setError(null);
    hasSelfHealedOnLoad.current = false;
    const update = (fn: (b: Base) => Base) => setBase((b) => (b && b.uid === uid ? fn(b) : b));

    // The copy on the phone and the outbox. A server answer that came first wins.
    Promise.all([readAccount(uid), loadOutbox(uid)]).then(([cached]) => {
      if (!active) return;
      if (cached) {
        update((b) => ({
          ...b,
          user: b.user === undefined ? cached.user : b.user,
          pages: b.pages === undefined ? cached.pages : b.pages,
          sessions: b.sessions === undefined ? cached.sessions : b.sessions,
        }));
      }
      setPending(pendingEntries(uid));
      setCacheChecked(uid);
    });
    const waitTimer = setTimeout(() => active && setWaitedOut(true), SERVER_WAIT_MS);

    // Missing data is created only when the server confirms it (lib/userDoc);
    // while offline, it is asked again on a backoff until it answers.
    const timers: ReturnType<typeof setTimeout>[] = [];
    const ensuring = { user: false, pages: false };
    const ensure = (what: 'user' | 'pages', fromCache: boolean, attempt = 0) => {
      const fbUser = getAuth().currentUser;
      if (!active || !fbUser || fbUser.uid !== uid) return;
      if (ensuring[what]) return;
      ensuring[what] = true;
      ensureOnServer({
        fromCache,
        skip: () => !active || firestoreService.isDeletingAccount(fbUser.uid),
        existsOnServer: () =>
          what === 'user'
            ? firestoreService.userDocExistsOnServer(fbUser.uid)
            : firestoreService.pagesExistOnServer(fbUser.uid),
        create: () =>
          what === 'user'
            ? firestoreService.createUser({
                uid: fbUser.uid,
                email: fbUser.email,
                displayName: fbUser.displayName,
                photoURL: fbUser.photoURL,
              })
            : firestoreService.initializeAllPages(fbUser.uid),
        onLostRace: (err) => logger.warn(`User ${what} appeared while creating them`, err),
        onError: (err) =>
          logger.error(what === 'user' ? 'Failed to recreate missing user doc:' : 'Failed to initialize pages:', err),
      })
        .then((outcome) => {
          ensuring[what] = false;
          if (!active) return;
          // Created, or there after all: the listener refires with it.
          if (outcome === 'wait') {
            timers.push(setTimeout(() => ensure(what, false, attempt + 1), retryDelayMs(attempt)));
          } else if (outcome === 'failed' && what === 'user') {
            update((b) => ({ ...b, user: b.user ?? null }));
          }
          if (what === 'pages' && outcome !== 'created' && outcome !== 'exists') {
            update((b) => ({ ...b, pagesSettled: true }));
          }
        })
        .catch(() => undefined);
    };

    const unsubscribeUser = firestoreService.subscribeToUser(
      (fsUser, { fromCache }) => {
        if (!active) return;
        setServerReachable(!fromCache);
        // Firestore's memory, not the server: the copy on the phone stands.
        if (fromCache) return;
        if (fsUser) {
          update((b) => ({ ...b, user: fsUser }));
          saveCopy(uid, 'user', fsUser);
          return;
        }
        if (getAuth().currentUser?.uid !== uid) return;
        ensure('user', false);
      },
      uid,
    );

    const unsubscribePages = firestoreService.subscribeToPages((fsPages, { fromCache }) => {
      if (!active || fromCache) return;
      // No pages: create the 604 defaults, but only once the server confirms
      // there are none.
      if (fsPages.length === 0) {
        ensure('pages', false);
        return;
      }
      update((b) => ({ ...b, pages: fsPages, pagesFresh: true }));
      saveCopy(uid, 'pages', fsPages);
    }, uid);

    const unsubscribeSessions = firestoreService.subscribeToSessions((sessions, { fromCache }) => {
      if (!active || fromCache) return;
      update((b) => ({ ...b, sessions, sessionsFresh: true }));
      saveCopy(uid, 'sessions', sessions);
    }, uid);

    return () => {
      active = false;
      clearTimeout(waitTimer);
      timers.forEach(clearTimeout);
      unsubscribeUser();
      unsubscribePages();
      unsubscribeSessions();
    };
  }, [uid, saveCopy]);

  // ============================================================================
  // WHAT THE APP SHOWS
  // ============================================================================

  const forThisUid = base && base.uid === uid ? base : null;
  const view = useMemo(
    () =>
      forThisUid
        ? overlayAccount(
            { user: forThisUid.user ?? null, pages: forThisUid.pages ?? [], sessions: forThisUid.sessions ?? [] },
            pending,
          )
        : null,
    [forThisUid, pending],
  );
  const viewUser = view?.user ?? null;
  const user = useMemo(() => (viewUser ? firestoreUserToLocal(viewUser) : null), [viewUser]);
  const viewPages = view?.pages;
  const pages = useMemo(() => (viewPages ?? []).map(firestorePageToLocal), [viewPages]);
  const viewSessions = view?.sessions;
  const logs = useMemo(() => (viewSessions ?? []).map(firestoreSessionToLog), [viewSessions]);
  const onboardingComplete = viewUser?.onboardingComplete === true;

  // Latest values for the mutations, which don't re-create on every change.
  const viewRef = useRef(view);
  viewRef.current = view;
  const pagesRef = useRef<UserPage[]>(pages);
  pagesRef.current = pages;

  const userKnown = !!forThisUid && forThisUid.user !== undefined;
  const ready =
    userKnown &&
    (forThisUid!.user === null || forThisUid!.pages !== undefined || forThisUid!.pagesSettled);
  const offline = netIsOffline || serverReachable === false;
  const connectionNeeded =
    !!uid && cacheChecked === uid && !userKnown && (waitedOut || offline);
  const loading = !!uid && !connectionNeeded && (cacheChecked !== uid || !ready);

  // A tester's TestFlight install follows the preview update channel; anything
  // else production (lib/updateChannel). Decided once the account is known.
  const userId = user?.id;
  const previewTester = user?.previewTester === true;
  const signedOut = !uid;
  useEffect(() => {
    // While the account loads, nothing changes; signed out is production.
    if (!userId && !signedOut) return;
    const channel = applyUpdateChannel(!!userId && previewTester);
    if (channel) Sentry.setTag('update_channel', channel);
  }, [userId, previewTester, signedOut]);

  // ============================================================================
  // CHANGES: into the outbox (on the phone), then to the server
  // ============================================================================

  const enqueueOp = useCallback(async (op: OutboxOp, at = Date.now()) => {
    const forUid = uidRef.current;
    if (!forUid) throw new Error('User not authenticated');
    await enqueue(forUid, op, at);
    requestFlush(forUid);
  }, []);

  const retryConnection = useCallback(() => {
    setWaitedOut(false);
    restartFirestore();
    requestFlush(getAuth().currentUser?.uid);
    const forUid = uidRef.current;
    setTimeout(() => {
      if (uidRef.current === forUid) setWaitedOut(true);
    }, SERVER_WAIT_MS);
  }, []);

  // ============================================================================
  // INITIALIZE USER IN FIRESTORE
  // ============================================================================

  const initializeUserInFirestore = useCallback(async (
    uid: string,
    email?: string | null,
    displayName?: string | null
  ) => {
    try {
      // Check if user already exists
      const existingUser = await firestoreService.getUser(uid);
      if (existingUser) return;

      await firestoreService.createUser({ uid, email, displayName });
    } catch (err) {
      logger.error('Failed to initialize user in Firestore:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize user');
    }
  }, []);

  // ============================================================================
  // PAGE OPERATIONS
  // ============================================================================

  const savePages = useCallback(async (updatedPages: UserPage[], changedPageNumbers?: number[]) => {
    if (!changedPageNumbers || changedPageNumbers.length === 0) return;
    const changed = new Set(changedPageNumbers);
    const pagesToSync = updatedPages.filter((p) => changed.has(p.pageNumber));
    if (pagesToSync.length === 0) return;
    // Never on top of pages the phone doesn't have (nothing loaded yet).
    if (!viewRef.current || viewRef.current.pages.length === 0) {
      logger.warn('[savePages] No pages loaded; change not saved');
      return;
    }
    setError(null);
    await enqueueOp({ kind: 'pages', pages: pagesToSync.map(pageChange) });
  }, [enqueueOp]);

  const updatePage = useCallback(async (page: UserPage) => {
    await savePages([page], [page.pageNumber]);
  }, [savePages]);

  const updatePages = useCallback(async (updatedPages: UserPage[], changedPageNumbers?: number[]) => {
    await savePages(updatedPages, changedPageNumbers);
  }, [savePages]);

  // Re-derive per-page state (lastRevisedDate, totalRevisionCount, skipCount,
  // weaknessRating) from the canonical session logs and persist any diffs.
  // Called after every log mutation AND at the end of loadData so stale page
  // state from older app versions (or pre-recompute deletes) self-heals.
  const syncPagesFromLogs = useCallback(
    async (currentPages: UserPage[], freshLogs: RevisionLog[]) => {
      if (currentPages.length === 0) return;
      const next = recomputePagesFromLogs(currentPages, freshLogs);
      const changed = next
        .filter((p) => {
          const old = currentPages.find((c) => c.pageNumber === p.pageNumber);
          if (!old) return false;
          return (
            // The logs give a day ("2026-10-27"); the page holds a time (that
            // day's midnight UTC once healed). Comparing the strings rewrote
            // every revised page, unchanged, on every launch.
            revisedDay(old.lastRevisedDate) !== revisedDay(p.lastRevisedDate) ||
            old.totalRevisionCount !== p.totalRevisionCount ||
            old.skipCount !== p.skipCount ||
            old.weaknessRating !== p.weaknessRating
          );
        })
        .map((p) => p.pageNumber);
      if (changed.length === 0) return;
      await savePages(next, changed);
    },
    [savePages],
  );

  /** The logs once these changes are in (for the self-heal right after a change). */
  const logsWith = useCallback((ops: OutboxOp[], at: number): RevisionLog[] => {
    const v = viewRef.current;
    if (!v) return [];
    const extra: OutboxEntry[] = ops.map((op, i) => ({ id: `next-${i}`, op, at }));
    return overlaySessions(v.sessions, extra).map(firestoreSessionToLog);
  }, []);

  // Self-heal on initial load, from what the server has (never from the copy
  // on the phone, which can be older than a change made on another phone):
  // once both pages and sessions have arrived, reconcile once. Later drift is
  // handled by per-mutation recompute and pull-to-refresh (loadData).
  useEffect(() => {
    if (hasSelfHealedOnLoad.current || !forThisUid) return;
    if (!forThisUid.pagesFresh || !forThisUid.sessionsFresh) return;
    if (pages.length === 0 || logs.length === 0) return;
    hasSelfHealedOnLoad.current = true;
    syncPagesFromLogs(pages, logs).catch((err) => logger.warn('Self-heal failed', err));
  }, [forThisUid, pages, logs, syncPagesFromLogs]);

  // Rehydrate the daily reminder once per user identity per session. Settings
  // and onboarding already schedule on mutation; this only covers cold starts
  // on a device whose OS scheduler is empty (fresh install, new phone,
  // sign-in to an existing account). Gated on onboardingComplete so we don't
  // schedule against default placeholders for users still in the flow.
  useEffect(() => {
    if (!user || !onboardingComplete) return;
    if (lastScheduledUserIdRef.current === user.id) return;
    lastScheduledUserIdRef.current = user.id;
    scheduleDailyReminder(user.reminderTime, user.notificationsEnabled).catch(
      (err) => logger.error('Failed to rehydrate daily reminder:', err),
    );
  }, [user, onboardingComplete]);

  // ============================================================================
  // LOAD DATA (pull to refresh)
  // ============================================================================

  const loadData = useCallback(async () => {
    const forUid = uidRef.current;
    if (!forUid) return;
    setError(null);
    requestFlush(getAuth().currentUser?.uid);
    if (serverReachableRef.current === false) restartFirestore();
    try {
      // From the server only: offline, Firestore's memory would answer with
      // whatever it happens to hold (often nothing).
      const [fsUser, fsPages, fsSessions] = await Promise.all([
        firestoreService.getUserFromServer(forUid),
        firestoreService.getAllPagesFromServer(forUid),
        firestoreService.getRecentSessionsFromServer(100, forUid),
      ]);
      if (uidRef.current !== forUid) return;
      setBase((b) => {
        if (!b || b.uid !== forUid) return b;
        return {
          ...b,
          user: fsUser ?? b.user,
          pages: fsPages.length > 0 ? fsPages : b.pages,
          sessions: fsSessions,
          pagesFresh: b.pagesFresh || fsPages.length > 0,
          sessionsFresh: true,
        };
      });
      if (fsUser) writeAccountPart(forUid, 'user', fsUser);
      if (fsPages.length > 0) writeAccountPart(forUid, 'pages', fsPages);
      writeAccountPart(forUid, 'sessions', fsSessions);

      // Self-heal stale per-page state from prior app versions (or any data
      // that drifted from the canonical log history), with the server's data
      // and the changes still waiting on top.
      const v = overlayAccount(
        { user: fsUser, pages: fsPages, sessions: fsSessions },
        pendingEntries(forUid),
      );
      await syncPagesFromLogs(v.pages.map(firestorePageToLocal), v.sessions.map(firestoreSessionToLog));
    } catch (err) {
      // Offline: what's shown stays as it is.
      logger.log('Refresh failed; showing the copy on this phone', err);
    }
  }, [syncPagesFromLogs]);

  // ============================================================================
  // USER OPERATIONS
  // ============================================================================

  const saveUser = useCallback(async (updatedUser: User) => {
    setError(null);
    await enqueueOp({ kind: 'user', fields: userFields(updatedUser) });
    // Also sync the Firebase Auth profile so screens that fall back to
    // `firebaseUser.displayName` reflect the new name. Best-effort (it needs
    // the network): the user document is the source of truth.
    const authName = getAuth().currentUser?.displayName ?? null;
    if ((updatedUser.name ?? null) !== authName) {
      updateAuthDisplayName(updatedUser.name ?? null).catch((authErr) =>
        logger.warn('Failed to sync Firebase Auth displayName', authErr),
      );
    }
  }, [enqueueOp]);

  const createDefaultUser = useCallback((overrides?: Partial<User>): User => {
    return {
      id: generateId(),
      createdAt: new Date().toISOString(),
      smartTrackingEnabled: false,
      hasSeenSmartTrackingPreview: false,
      dailyPageCapacity: 20,
      scheduleMode: 'pages',
      dailyJuzCount: 1,
      reminderTime: '08:00',
      notificationsEnabled: true,
      currentMemorizationJuz: null,
      currentMemorizationPage: null,
      currentKhatamPage: 1,
      customPlan: null,
      savedPlans: [],
      streak: 0,
      lastRevisionDate: null,
      memorizedSurahs: [],
      fajrBoundaryEnabled: false,
      locationCoords: null,
      fajrCalculationMethod: 'NorthAmerica',
      scheduleAnchorDate: new Date().toISOString(),
      // A fresh setup starts without carry-over shifts.
      scheduleShiftPages: 0,
      carryOver: null,
      ...overrides,
    };
  }, []);

  const completeOnboarding = useCallback(async () => {
    setError(null);
    await enqueueOp({ kind: 'user', fields: { onboardingComplete: true } });
  }, [enqueueOp]);

  const resetOnboarding = useCallback(async () => {
    setError(null);
    const v = viewRef.current;
    if (!v) return;
    const at = Date.now();
    for (const s of v.sessions) await enqueueOp({ kind: 'session.delete', id: s.id }, at);
    if (v.pages.length > 0) {
      await enqueueOp(
        {
          kind: 'pages',
          pages: v.pages.map((p) => ({
            pageNumber: p.pageNumber,
            status: 'not_memorized',
            dateMemorized: null,
            lastRevisedAt: null,
            weaknessRating: DEFAULT_WEAKNESS_RATING,
            totalRevisionCount: 0,
            skipCount: 0,
          })),
        },
        at,
      );
    }
    await enqueueOp(
      {
        kind: 'user',
        fields: { onboardingComplete: false, totalMemorizedPages: 0, streak: 0, lastRevisionDate: null },
      },
      at,
    );
  }, [enqueueOp]);

  // ============================================================================
  // LOG/SESSION OPERATIONS
  // ============================================================================

  const addLog = useCallback(async (log: Omit<RevisionLog, 'id'>) => {
    setError(null);
    const at = Date.now();
    const existing = viewRef.current?.sessions.find((s) => s.id === log.date);
    await enqueueOp(
      {
        kind: 'session.add',
        date: log.date,
        assignedPages: log.assignedPages ?? [],
        pagesRevised: log.pagesRevised,
        pagesSkipped: log.pagesSkipped,
        weaknessUpdates: weaknessChanges(log.weaknessUpdates, at),
        // Minutes add up: at least what this phone knows plus this stretch.
        durationAtLeast: (existing?.durationMinutes ?? 0) + (log.durationMinutes ?? 0),
      },
      at,
    );
  }, [enqueueOp]);

  const updateLog = useCallback(async (log: RevisionLog) => {
    setError(null);
    const at = Date.now();
    const before = viewRef.current?.sessions.find((s) => s.id === log.id);
    const old = new Set(before?.pagesRevised ?? []);
    const next = new Set(log.pagesRevised);
    const op: OutboxOp = {
      kind: 'session.edit',
      id: log.id,
      addRevised: log.pagesRevised.filter((p) => !old.has(p)),
      removeRevised: [...old].filter((p) => !next.has(p)),
      pagesSkipped: log.pagesSkipped,
      durationMinutes: log.durationMinutes,
      weaknessUpdates: weaknessChanges(log.weaknessUpdates, at),
    };
    const freshLogs = logsWith([op], at);
    await enqueueOp(op, at);
    await syncPagesFromLogs(pagesRef.current, freshLogs);
  }, [enqueueOp, logsWith, syncPagesFromLogs]);

  const deleteLogs = useCallback(async (logIds: string[]) => {
    if (logIds.length === 0) return;
    setError(null);
    const at = Date.now();
    const ops: OutboxOp[] = logIds.map((id) => ({ kind: 'session.delete', id }));
    const freshLogs = logsWith(ops, at);
    for (const op of ops) await enqueueOp(op, at);
    // A session's id is its revision day; its recordings go with it. Awaited
    // so a recordings list refreshed afterwards no longer shows them.
    await deleteRecordings((r) => logIds.some((day) => isRevisionRecordingOf(day)(r))).catch((err) =>
      logger.warn('Could not delete session recordings', err),
    );
    await syncPagesFromLogs(pagesRef.current, freshLogs);
  }, [enqueueOp, logsWith, syncPagesFromLogs]);

  const deleteLog = useCallback(async (logId: string) => {
    await deleteLogs([logId]);
  }, [deleteLogs]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <AppContext.Provider
      value={{
        user: ready ? user : null,
        pages,
        logs,
        loading,
        onboardingComplete,
        isAuthenticated: !!uid,
        error,
        connectionNeeded,
        offline,
        pendingChanges: pending.length,
        loadData,
        retryConnection,
        saveUser,
        savePages,
        updatePage,
        updatePages,
        addLog,
        updateLog,
        deleteLog,
        deleteLogs,
        completeOnboarding,
        resetOnboarding,
        createDefaultUser,
        initializeUserInFirestore,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

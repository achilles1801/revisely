import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { Timestamp } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
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
import { scheduleDailyReminder } from '../lib/notifications';
import { logger } from '../lib/logger';

// ============================================================================
// CONVERSION HELPERS - Convert between Firestore and local types
// ============================================================================

// Helper to safely convert Firestore Timestamp to ISO string
function timestampToISOString(timestamp: any): string {
  if (!timestamp) return new Date().toISOString();
  // If it's a Firestore Timestamp with toDate method
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate().toISOString();
  }
  // If it's already a Date
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  // If it's a plain object with seconds (Firestore Timestamp serialized)
  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1000).toISOString();
  }
  // If it's a string, return as-is
  if (typeof timestamp === 'string') {
    return timestamp;
  }
  return new Date().toISOString();
}

function firestoreUserToLocal(fsUser: FirestoreUser): User {
  return {
    id: fsUser.uid,
    createdAt: timestampToISOString(fsUser.createdAt),
    name: fsUser.displayName || undefined,
    smartTrackingEnabled: fsUser.smartTrackingEnabled ?? false,
    hasSeenSmartTrackingPreview: fsUser.hasSeenSmartTrackingPreview ?? false,
    dailyPageCapacity: fsUser.dailyPageCapacity || 20,
    reminderTime: fsUser.notifications?.reminderTime || '08:00',
    notificationsEnabled: fsUser.notifications?.enabled ?? true,
    currentMemorizationJuz: fsUser.currentMemorizationJuz,
    currentMemorizationPage: fsUser.currentMemorizationPage,
    currentKhatamPage: fsUser.currentKhatamPage || 1,
    customPlan: fsUser.customPlan ?? null,
    streak: fsUser.streak || 0,
    lastRevisionDate: fsUser.lastRevisionDate,
    memorizedSurahs: fsUser.memorizedSurahs ?? [],
    fajrBoundaryEnabled: fsUser.fajrBoundaryEnabled ?? false,
    locationCoords: fsUser.locationCoords ?? null,
    fajrCalculationMethod: fsUser.fajrCalculationMethod ?? 'NorthAmerica',
    // Legacy users predate scheduleAnchorDate — fall back to createdAt so
    // the scheduler still produces a sensible cycle for them.
    scheduleAnchorDate:
      fsUser.scheduleAnchorDate ?? timestampToISOString(fsUser.createdAt),
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
}

interface AppContextType extends AppState {
  loadData: () => Promise<void>;
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
// PROVIDER COMPONENT
// ============================================================================

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [pages, setPages] = useState<UserPage[]>([]);
  const [logs, setLogs] = useState<RevisionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasInitialLoadCompleted = useRef(false);
  const lastSaveTimestamp = useRef(0);
  // Ref to current pages so log mutations can recompute derived state
  // without making the mutation callbacks depend on pages.
  const pagesRef = useRef<UserPage[]>([]);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  // Guard so the initial-load self-heal runs at most once per session.
  const hasSelfHealedOnLoad = useRef(false);
  // Tracks which user.id we've already (re)scheduled the daily reminder for
  // this session. The OS notification scheduler is per-device, so a fresh
  // install or a new device won't have any schedule even if the Firestore
  // profile says notifications are on — this rehydrates it.
  const lastScheduledUserIdRef = useRef<string | null>(null);

  // ============================================================================
  // AUTH LISTENER - Listen for auth state changes
  // ============================================================================

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsAuthenticated(!!firebaseUser);

      if (!firebaseUser) {
        // User logged out - clear state
        setUser(null);
        setPages([]);
        setLogs([]);
        setOnboardingComplete(false);
        hasInitialLoadCompleted.current = false;
        lastScheduledUserIdRef.current = null;
        setLoading(false);
        return;
      }

      // User logged in - data will be loaded by Firestore subscriptions
    });

    return () => unsubscribe();
  }, []);

  // ============================================================================
  // FIRESTORE SUBSCRIPTIONS - Real-time data sync
  // ============================================================================

  useEffect(() => {
    if (!isAuthenticated) return;

    setLoading(true);
    setError(null);

    // Subscribe to user document. If Firebase Auth says we're logged in but
    // the Firestore doc is missing (e.g. a dev wiped the users collection,
    // or first launch after re-creating an account), recreate the doc so
    // subsequent updates have something to land on.
    let userRecreationInFlight = false;
    const unsubscribeUser = firestoreService.subscribeToUser(async (fsUser) => {
      if (fsUser) {
        userRecreationInFlight = false;
        setUser(firestoreUserToLocal(fsUser));
        setOnboardingComplete(fsUser.onboardingComplete);
        return;
      }

      const currentAuth = getAuth();
      const fbUser = currentAuth.currentUser;
      if (fbUser && !userRecreationInFlight) {
        userRecreationInFlight = true;
        try {
          await firestoreService.createUser({
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName,
            photoURL: fbUser.photoURL,
          });
          // Subscription will refire with the new doc — fall through.
          return;
        } catch (err) {
          logger.error('Failed to recreate missing user doc:', err);
          userRecreationInFlight = false;
        }
      }
      setUser(null);
      setOnboardingComplete(false);
    });

    // Subscribe to pages
    const unsubscribePages = firestoreService.subscribeToPages(async (fsPages) => {
      // If no pages exist, initialize them
      if (fsPages.length === 0) {
        try {
          const currentAuth = getAuth();
          const uid = currentAuth.currentUser?.uid;
          if (uid) {
            await firestoreService.initializeAllPages(uid);
            // Subscription will fire again with new pages
            return;
          }
        } catch (err) {
          logger.error('Failed to initialize pages:', err);
        }
        setLoading(false);
        return;
      }

      // Only apply subscription data if it's newer than our last save
      // This prevents subscription from overwriting optimistic updates
      const now = Date.now();
      if (now - lastSaveTimestamp.current < 2000) {
        // Skip subscription update if we saved within last 2 seconds
        setLoading(false);
        return;
      }

      const localPages = fsPages.map(firestorePageToLocal);
      setPages(localPages);
      hasInitialLoadCompleted.current = true;
      setLoading(false);
    });

    // Load recent sessions (logs)
    const loadSessions = async () => {
      try {
        const sessions = await firestoreService.getRecentSessions(100);
        const localLogs = sessions.map(firestoreSessionToLog);
        setLogs(localLogs);
      } catch (err) {
        logger.error('Failed to load sessions:', err);
      }
    };
    loadSessions();

    return () => {
      unsubscribeUser();
      unsubscribePages();
    };
  }, [isAuthenticated]);

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
  // LOAD DATA (Manual refresh)
  // ============================================================================

  const loadData = useCallback(async () => {
    if (!isAuthenticated) return;

    // Only show loading on initial load to prevent navigation reset
    const isInitialLoad = !hasInitialLoadCompleted.current;
    if (isInitialLoad) {
      setLoading(true);
    }
    setError(null);

    try {
      const [fsUser, fsPages, fsSessions] = await Promise.all([
        firestoreService.getUser(),
        firestoreService.getAllPages(),
        firestoreService.getRecentSessions(100),
      ]);

      if (fsUser) {
        setUser(firestoreUserToLocal(fsUser));
        setOnboardingComplete(fsUser.onboardingComplete);
      }

      const freshPages = fsPages.map(firestorePageToLocal);
      const freshLogs = fsSessions.map(firestoreSessionToLog);
      setPages(freshPages);
      setLogs(freshLogs);
      hasInitialLoadCompleted.current = true;

      // Self-heal stale per-page state from prior app versions (or any data
      // that drifted from the canonical log history). Runs after every load /
      // pull-to-refresh; no-op when state already matches.
      await syncPagesFromLogs(freshPages, freshLogs);
    } catch (err) {
      logger.error('Error loading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  }, [isAuthenticated]);

  // ============================================================================
  // USER OPERATIONS
  // ============================================================================

  const saveUser = useCallback(async (updatedUser: User) => {
    try {
      setError(null);
      // Optimistically update local context state so other screens (e.g. the
      // Dashboard greeting) see the change immediately — don't wait for the
      // Firestore subscription to round-trip.
      setUser(updatedUser);
      await firestoreService.updateUser({
        displayName: updatedUser.name || null,
        smartTrackingEnabled: updatedUser.smartTrackingEnabled,
        hasSeenSmartTrackingPreview: updatedUser.hasSeenSmartTrackingPreview,
        dailyPageCapacity: updatedUser.dailyPageCapacity,
        notifications: {
          enabled: updatedUser.notificationsEnabled,
          reminderTime: updatedUser.reminderTime,
        },
        currentMemorizationJuz: updatedUser.currentMemorizationJuz,
        currentMemorizationPage: updatedUser.currentMemorizationPage,
        currentKhatamPage: updatedUser.currentKhatamPage,
        customPlan: updatedUser.customPlan,
        memorizedSurahs: updatedUser.memorizedSurahs,
        fajrBoundaryEnabled: updatedUser.fajrBoundaryEnabled,
        locationCoords: updatedUser.locationCoords,
        fajrCalculationMethod: updatedUser.fajrCalculationMethod,
        scheduleAnchorDate: updatedUser.scheduleAnchorDate,
      });
      // Also sync the Firebase Auth profile so screens that fall back to
      // `firebaseUser.displayName` (e.g. dashboard greeting when the Firestore
      // round-trip is mid-flight) reflect the new name. Failures here are
      // best-effort — the Firestore write is the source of truth.
      try {
        await updateAuthDisplayName(updatedUser.name ?? null);
      } catch (authErr) {
        logger.warn('Failed to sync Firebase Auth displayName', authErr);
      }
    } catch (err) {
      logger.error('Error saving user:', err);
      setError(err instanceof Error ? err.message : 'Failed to save user');
      throw err;
    }
  }, []);

  const createDefaultUser = useCallback((overrides?: Partial<User>): User => {
    return {
      id: generateId(),
      createdAt: new Date().toISOString(),
      smartTrackingEnabled: false,
      hasSeenSmartTrackingPreview: false,
      dailyPageCapacity: 20,
      reminderTime: '08:00',
      notificationsEnabled: true,
      currentMemorizationJuz: null,
      currentMemorizationPage: null,
      currentKhatamPage: 1,
      customPlan: null,
      streak: 0,
      lastRevisionDate: null,
      memorizedSurahs: [],
      fajrBoundaryEnabled: false,
      locationCoords: null,
      fajrCalculationMethod: 'NorthAmerica',
      scheduleAnchorDate: new Date().toISOString(),
      ...overrides,
    };
  }, []);

  const completeOnboarding = useCallback(async () => {
    try {
      setError(null);
      await firestoreService.updateUser({ onboardingComplete: true });
      setOnboardingComplete(true);
    } catch (err) {
      logger.error('Error completing onboarding:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete onboarding');
      throw err;
    }
  }, []);

  const resetOnboarding = useCallback(async () => {
    try {
      setError(null);

      const pageResets = pagesRef.current.map((p) => ({
        pageNumber: p.pageNumber,
        updates: {
          status: 'not_memorized' as const,
          dateMemorized: null,
          lastRevisedAt: null,
          weaknessRating: DEFAULT_WEAKNESS_RATING,
          totalRevisionCount: 0,
          skipCount: 0,
        },
      }));

      // Session deletion needs the IDs first, so kick that chain off as a
      // single promise we can race alongside the independent page/user resets.
      // Sessions, pages, and user doc are independent writes — parallelizing
      // collapses the round-trip cost from ~4 sequential to ~2.
      const sessionWipe = (async () => {
        const sessions = await firestoreService.getRecentSessions(100);
        if (sessions.length === 0) return;
        await Promise.all(
          sessions.map((s) => firestoreService.deleteSession(s.id)),
        );
      })();

      await Promise.all([
        sessionWipe,
        pageResets.length > 0
          ? firestoreService.batchUpdatePages(pageResets)
          : Promise.resolve(),
        firestoreService.updateUser({
          onboardingComplete: false,
          totalMemorizedPages: 0,
          streak: 0,
          lastRevisionDate: null,
        }),
      ]);

      // Mirror the reset locally so the UI doesn't flash stale state before
      // subscriptions catch up.
      setLogs([]);
      setPages((prev) =>
        prev.map((p) => ({
          ...p,
          status: 'not_memorized',
          dateMemorized: null,
          lastRevisedDate: null,
          weaknessRating: DEFAULT_WEAKNESS_RATING,
          totalRevisionCount: 0,
          skipCount: 0,
        })),
      );
      setOnboardingComplete(false);
    } catch (err) {
      logger.error('Error resetting onboarding:', err);
      setError(err instanceof Error ? err.message : 'Failed to reset onboarding');
      throw err;
    }
  }, []);

  // ============================================================================
  // PAGE OPERATIONS
  // ============================================================================

  const savePages = useCallback(async (updatedPages: UserPage[], changedPageNumbers?: number[]) => {
    // Update local state immediately (optimistic update)
    setPages(updatedPages);
    lastSaveTimestamp.current = Date.now();

    if (!changedPageNumbers || changedPageNumbers.length === 0) return;

    const pagesToSync = updatedPages.filter(p => changedPageNumbers.includes(p.pageNumber));
    if (pagesToSync.length === 0) return;

    // Fire-and-forget Firestore update (don't await to avoid blocking UI)
    const updates = pagesToSync.map(p => ({
      pageNumber: p.pageNumber,
      updates: {
        status: p.status === 'in_progress' ? 'learning' as const : p.status,
        dateMemorized: p.dateMemorized ? Timestamp.fromDate(new Date(p.dateMemorized)) : null,
        lastRevisedAt: p.lastRevisedDate ? Timestamp.fromDate(new Date(p.lastRevisedDate)) : null,
        weaknessRating: p.weaknessRating as WeaknessRating,
        totalRevisionCount: p.totalRevisionCount,
        skipCount: p.skipCount,
      },
    }));

    firestoreService.batchUpdatePages(updates).catch(err => {
      logger.error('[savePages] batchUpdatePages error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save pages');
    });
  }, []);

  const updatePage = useCallback(async (page: UserPage) => {
    try {
      setError(null);
      await firestoreService.updatePage(page.pageNumber, {
        status: page.status === 'in_progress' ? 'learning' as const : page.status,
        dateMemorized: page.dateMemorized ? Timestamp.fromDate(new Date(page.dateMemorized)) : null,
        lastRevisedAt: page.lastRevisedDate ? Timestamp.fromDate(new Date(page.lastRevisedDate)) : null,
        weaknessRating: page.weaknessRating as WeaknessRating,
        totalRevisionCount: page.totalRevisionCount,
        skipCount: page.skipCount,
      });
      // State will be updated by subscription
    } catch (err) {
      logger.error('Error updating page:', err);
      setError(err instanceof Error ? err.message : 'Failed to update page');
      throw err;
    }
  }, []);

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
            old.lastRevisedDate !== p.lastRevisedDate ||
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

  // Self-heal on initial load: subscriptions populate pages/logs separately,
  // so wait until both are present, then reconcile once. Subsequent drift is
  // handled by per-mutation recompute and pull-to-refresh (loadData).
  useEffect(() => {
    if (hasSelfHealedOnLoad.current) return;
    if (pages.length === 0 || logs.length === 0) return;
    hasSelfHealedOnLoad.current = true;
    syncPagesFromLogs(pages, logs);
  }, [pages, logs, syncPagesFromLogs]);

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
  // LOG/SESSION OPERATIONS
  // ============================================================================

  const addLog = useCallback(async (log: Omit<RevisionLog, 'id'>) => {
    try {
      setError(null);

      // Check if session exists for this date
      const existingSession = await firestoreService.getSession(log.date);

      // Clamp to [0, 100] — Firestore rules reject anything outside that range,
      // and we can hit Infinity/NaN if a stale session has totalAssignedPages = 0
      // or if the user revises more pages than were originally assigned.
      const safePercent = (revised: number, total: number): number => {
        if (!total || total <= 0) return revised > 0 ? 100 : 0;
        const pct = (revised / total) * 100;
        if (!Number.isFinite(pct)) return 0;
        return Math.max(0, Math.min(100, pct));
      };

      if (existingSession) {
        // Merge with existing session
        const mergedPagesRevised = [...new Set([...existingSession.pagesRevised, ...log.pagesRevised])];
        const mergedPagesSkipped = log.pagesSkipped.filter(p => !mergedPagesRevised.includes(p));

        const newWeaknessUpdates = log.weaknessUpdates.map(wu => ({
          pageNumber: wu.page,
          previousRating: 4 as WeaknessRating,
          newRating: wu.rating as WeaknessRating,
          changedAt: Timestamp.now(),
        }));

        const totalAssigned = existingSession.totalAssignedPages || mergedPagesRevised.length;

        await firestoreService.updateSession(existingSession.id, {
          pagesRevised: mergedPagesRevised,
          pagesSkipped: mergedPagesSkipped,
          durationMinutes: Math.max(1, (existingSession.durationMinutes || 0) + (log.durationMinutes || 0)),
          weaknessUpdates: [...existingSession.weaknessUpdates, ...newWeaknessUpdates],
          state: mergedPagesRevised.length >= totalAssigned ? 'COMPLETED' : 'IN_PROGRESS',
          completionPercentage: safePercent(mergedPagesRevised.length, totalAssigned),
        });
      } else {
        // Create new session
        const allPages = [...log.pagesRevised, ...log.pagesSkipped];
        await firestoreService.createSession({
          date: log.date,
          assignedPages: allPages.length > 0 ? allPages : log.pagesRevised,
        });

        // Update with progress
        if (log.pagesRevised.length > 0) {
          const session = await firestoreService.getSession(log.date);
          if (session) {
            const totalAssigned = session.totalAssignedPages || log.pagesRevised.length;
            await firestoreService.updateSession(session.id, {
              pagesRevised: log.pagesRevised,
              pagesSkipped: log.pagesSkipped,
              durationMinutes: Math.max(1, log.durationMinutes || 1),
              state: log.pagesRevised.length >= totalAssigned ? 'COMPLETED' : 'IN_PROGRESS',
              completionPercentage: safePercent(log.pagesRevised.length, totalAssigned),
              weaknessUpdates: log.weaknessUpdates.map(wu => ({
                pageNumber: wu.page,
                previousRating: 4 as WeaknessRating,
                newRating: wu.rating as WeaknessRating,
                changedAt: Timestamp.now(),
              })),
            });
          }
        }
      }

      // Refresh logs
      const sessions = await firestoreService.getRecentSessions(100);
      setLogs(sessions.map(firestoreSessionToLog));
    } catch (err) {
      logger.error('Error adding log:', err);
      setError(err instanceof Error ? err.message : 'Failed to add log');
      throw err;
    }
  }, []);

  const updateLog = useCallback(async (log: RevisionLog) => {
    try {
      setError(null);
      await firestoreService.updateSession(log.id, {
        pagesRevised: log.pagesRevised,
        pagesSkipped: log.pagesSkipped,
        durationMinutes: log.durationMinutes,
        weaknessUpdates: log.weaknessUpdates.map(wu => ({
          pageNumber: wu.page,
          previousRating: 4 as WeaknessRating,
          newRating: wu.rating as WeaknessRating,
          changedAt: Timestamp.now(),
        })),
      });

      // Refresh logs
      const sessions = await firestoreService.getRecentSessions(100);
      const freshLogs = sessions.map(firestoreSessionToLog);
      setLogs(freshLogs);
      await syncPagesFromLogs(pagesRef.current, freshLogs);
    } catch (err) {
      logger.error('Error updating log:', err);
      setError(err instanceof Error ? err.message : 'Failed to update log');
      throw err;
    }
  }, [syncPagesFromLogs]);

  const deleteLog = useCallback(async (logId: string) => {
    try {
      setError(null);
      await firestoreService.deleteSession(logId);

      // Refresh logs
      const sessions = await firestoreService.getRecentSessions(100);
      const freshLogs = sessions.map(firestoreSessionToLog);
      setLogs(freshLogs);
      await syncPagesFromLogs(pagesRef.current, freshLogs);
    } catch (err) {
      logger.error('Error deleting log:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete log');
      throw err;
    }
  }, [syncPagesFromLogs]);

  const deleteLogs = useCallback(async (logIds: string[]) => {
    if (logIds.length === 0) return;
    try {
      setError(null);
      await Promise.all(logIds.map((id) => firestoreService.deleteSession(id)));

      // Refresh logs once after all deletions
      const sessions = await firestoreService.getRecentSessions(100);
      const freshLogs = sessions.map(firestoreSessionToLog);
      setLogs(freshLogs);
      await syncPagesFromLogs(pagesRef.current, freshLogs);
    } catch (err) {
      logger.error('Error deleting logs:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete sessions');
      throw err;
    }
  }, [syncPagesFromLogs]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <AppContext.Provider
      value={{
        user,
        pages,
        logs,
        loading,
        onboardingComplete,
        isAuthenticated,
        error,
        loadData,
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

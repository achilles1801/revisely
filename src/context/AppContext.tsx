import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { Timestamp } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { User, UserPage, RevisionLog } from '../types';
import {
  FirestoreUser,
  FirestorePage,
  FirestoreSession,
  DEFAULT_USER_SETTINGS,
  DEFAULT_WEAKNESS_RATING,
  WeaknessRating,
} from '../types/firestore';
import * as firestoreService from '../services/firestoreService';
import { generateId } from '../lib/utils';

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
    mode: fsUser.revisionMode || 'weighted',
    dailyPageCapacity: fsUser.dailyPageCapacity || 20,
    activeDays: (fsUser.activeDays || [0, 1, 2, 3, 4, 5, 6]) as number[],
    reminderTime: fsUser.notifications?.reminderTime || '08:00',
    notificationsEnabled: fsUser.notifications?.enabled ?? true,
    dangerAlertEnabled: fsUser.notifications?.dangerAlertEnabled ?? true,
    dangerThresholdDays: fsUser.dangerThresholdDays || 10,
    currentMemorizationJuz: fsUser.currentMemorizationJuz,
    currentMemorizationPage: fsUser.currentMemorizationPage,
    currentKhatamPage: fsUser.currentKhatamPage || 1,
    streak: fsUser.streak || 0,
    lastRevisionDate: fsUser.lastRevisionDate,
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

function localUserToFirestore(user: User, uid: string): Partial<FirestoreUser> {
  return {
    uid,
    displayName: user.name || null,
    revisionMode: user.mode,
    dailyPageCapacity: user.dailyPageCapacity,
    activeDays: user.activeDays as (0 | 1 | 2 | 3 | 4 | 5 | 6)[],
    dangerThresholdDays: user.dangerThresholdDays,
    notifications: {
      enabled: user.notificationsEnabled,
      reminderTime: user.reminderTime,
      dangerAlertEnabled: user.dangerAlertEnabled,
    },
    currentMemorizationJuz: user.currentMemorizationJuz,
    currentMemorizationPage: user.currentMemorizationPage,
    currentKhatamPage: user.currentKhatamPage,
    streak: user.streak,
    lastRevisionDate: user.lastRevisionDate,
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
  completeOnboarding: () => Promise<void>;
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

    // Subscribe to user document
    const unsubscribeUser = firestoreService.subscribeToUser((fsUser) => {
      if (fsUser) {
        setUser(firestoreUserToLocal(fsUser));
        setOnboardingComplete(fsUser.onboardingComplete);
      } else {
        setUser(null);
        setOnboardingComplete(false);
      }
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
          console.error('Failed to initialize pages:', err);
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
        console.error('Failed to load sessions:', err);
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
      if (existingUser) {
        console.log('User already exists in Firestore');
        return;
      }

      // Create new user with all 604 pages
      await firestoreService.createUser({
        uid,
        email,
        displayName,
      });
      console.log('User initialized in Firestore with 604 pages');
    } catch (err) {
      console.error('Failed to initialize user in Firestore:', err);
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

      setPages(fsPages.map(firestorePageToLocal));
      setLogs(fsSessions.map(firestoreSessionToLog));
      hasInitialLoadCompleted.current = true;
    } catch (err) {
      console.error('Error loading data:', err);
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
      await firestoreService.updateUser({
        displayName: updatedUser.name || null,
        revisionMode: updatedUser.mode,
        dailyPageCapacity: updatedUser.dailyPageCapacity,
        activeDays: updatedUser.activeDays as (0 | 1 | 2 | 3 | 4 | 5 | 6)[],
        dangerThresholdDays: updatedUser.dangerThresholdDays,
        notifications: {
          enabled: updatedUser.notificationsEnabled,
          reminderTime: updatedUser.reminderTime,
          dangerAlertEnabled: updatedUser.dangerAlertEnabled,
        },
        currentMemorizationJuz: updatedUser.currentMemorizationJuz,
        currentMemorizationPage: updatedUser.currentMemorizationPage,
        currentKhatamPage: updatedUser.currentKhatamPage,
      });
      // State will be updated by subscription
    } catch (err) {
      console.error('Error saving user:', err);
      setError(err instanceof Error ? err.message : 'Failed to save user');
      throw err;
    }
  }, []);

  const createDefaultUser = useCallback((overrides?: Partial<User>): User => {
    return {
      id: generateId(),
      createdAt: new Date().toISOString(),
      mode: 'weighted',
      dailyPageCapacity: 20,
      activeDays: [0, 1, 2, 3, 4, 5, 6],
      reminderTime: '08:00',
      notificationsEnabled: true,
      dangerAlertEnabled: true,
      dangerThresholdDays: 10,
      currentMemorizationJuz: null,
      currentMemorizationPage: null,
      currentKhatamPage: 1,
      streak: 0,
      lastRevisionDate: null,
      ...overrides,
    };
  }, []);

  const completeOnboarding = useCallback(async () => {
    try {
      setError(null);
      await firestoreService.updateUser({ onboardingComplete: true });
      setOnboardingComplete(true);
    } catch (err) {
      console.error('Error completing onboarding:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete onboarding');
      throw err;
    }
  }, []);

  // ============================================================================
  // PAGE OPERATIONS
  // ============================================================================

  const savePages = useCallback(async (updatedPages: UserPage[], changedPageNumbers?: number[]) => {
    console.log('[savePages] Called with', updatedPages.length, 'pages, changedPageNumbers:', changedPageNumbers?.length);

    // Update local state immediately (optimistic update)
    setPages(updatedPages);
    lastSaveTimestamp.current = Date.now();

    // If no specific pages provided, skip Firestore sync
    if (!changedPageNumbers || changedPageNumbers.length === 0) {
      console.log('[savePages] No changedPageNumbers, skipping Firestore sync');
      return;
    }

    // Get only the changed pages
    const pagesToSync = updatedPages.filter(p => changedPageNumbers.includes(p.pageNumber));
    console.log('[savePages] pagesToSync count:', pagesToSync.length);

    if (pagesToSync.length === 0) {
      console.log('[savePages] No pages to sync, returning');
      return;
    }

    // Log the weakness ratings being saved
    console.log('[savePages] First page weaknessRating:', pagesToSync[0]?.weaknessRating);

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

    console.log('[savePages] Calling batchUpdatePages with', updates.length, 'updates');

    firestoreService.batchUpdatePages(updates)
      .then(() => {
        console.log('[savePages] batchUpdatePages succeeded');
      })
      .catch(err => {
        console.error('[savePages] batchUpdatePages error:', err);
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
      console.error('Error updating page:', err);
      setError(err instanceof Error ? err.message : 'Failed to update page');
      throw err;
    }
  }, []);

  const updatePages = useCallback(async (updatedPages: UserPage[], changedPageNumbers?: number[]) => {
    await savePages(updatedPages, changedPageNumbers);
  }, [savePages]);

  // ============================================================================
  // LOG/SESSION OPERATIONS
  // ============================================================================

  const addLog = useCallback(async (log: Omit<RevisionLog, 'id'>) => {
    try {
      setError(null);

      // Check if session exists for this date
      const existingSession = await firestoreService.getSession(log.date);

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

        await firestoreService.updateSession(existingSession.id, {
          pagesRevised: mergedPagesRevised,
          pagesSkipped: mergedPagesSkipped,
          durationMinutes: (existingSession.durationMinutes || 0) + (log.durationMinutes || 0),
          weaknessUpdates: [...existingSession.weaknessUpdates, ...newWeaknessUpdates],
          state: mergedPagesRevised.length >= existingSession.totalAssignedPages ? 'COMPLETED' : 'IN_PROGRESS',
          completionPercentage: (mergedPagesRevised.length / existingSession.totalAssignedPages) * 100,
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
            await firestoreService.updateSession(session.id, {
              pagesRevised: log.pagesRevised,
              pagesSkipped: log.pagesSkipped,
              durationMinutes: log.durationMinutes,
              state: log.pagesRevised.length >= session.totalAssignedPages ? 'COMPLETED' : 'IN_PROGRESS',
              completionPercentage: (log.pagesRevised.length / session.totalAssignedPages) * 100,
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
      console.error('Error adding log:', err);
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
      setLogs(sessions.map(firestoreSessionToLog));
    } catch (err) {
      console.error('Error updating log:', err);
      setError(err instanceof Error ? err.message : 'Failed to update log');
      throw err;
    }
  }, []);

  const deleteLog = useCallback(async (logId: string) => {
    try {
      setError(null);
      await firestoreService.deleteSession(logId);

      // Refresh logs
      const sessions = await firestoreService.getRecentSessions(100);
      setLogs(sessions.map(firestoreSessionToLog));
    } catch (err) {
      console.error('Error deleting log:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete log');
      throw err;
    }
  }, []);

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
        completeOnboarding,
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

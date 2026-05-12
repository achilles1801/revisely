/**
 * useFirestore Hook
 *
 * React hook that provides Firestore operations with real-time updates.
 * Bridges the gap between the new Firestore service and React components.
 *
 * Features:
 * - Real-time subscriptions to user, pages, and sessions
 * - Automatic cleanup on unmount
 * - Loading and error states
 * - Optimistic updates for better UX
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Timestamp } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  FirestoreUser,
  FirestorePage,
  FirestoreSession,
  UpdateUserInput,
  UpdatePageInput,
  BatchPageUpdate,
  CreateSessionInput,
  UpdateSessionInput,
  WeaknessRating,
  PageStatus,
  UserStats,
  DailyAssignment,
  UrgencyParameters,
  DEFAULT_USER_SETTINGS,
} from '../types/firestore';
import * as firestoreService from '../services/firestoreService';
import { logger } from '../lib/logger';

// ============================================================================
// TYPES
// ============================================================================

interface FirestoreState {
  user: FirestoreUser | null;
  pages: FirestorePage[];
  todaySession: FirestoreSession | null;
  stats: UserStats | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

interface FirestoreActions {
  // User actions
  updateUserSettings: (updates: UpdateUserInput) => Promise<void>;
  completeOnboarding: () => Promise<void>;

  // Page actions
  updatePage: (pageNumber: number, updates: UpdatePageInput) => Promise<void>;
  markPageMemorized: (pageNumber: number) => Promise<void>;
  markPageLearning: (pageNumber: number) => Promise<void>;
  bulkUpdatePages: (pageNumbers: number[], status: PageStatus) => Promise<void>;
  updateWeaknessRating: (pageNumber: number, rating: WeaknessRating) => Promise<void>;

  // Session actions
  startSession: (assignedPages: number[]) => Promise<FirestoreSession>;
  markPageRevised: (pageNumber: number) => Promise<void>;
  markPageSkipped: (pageNumber: number) => Promise<void>;
  completeSession: (durationMinutes: number) => Promise<void>;

  // Algorithm
  generateDailyAssignment: () => Promise<DailyAssignment>;
  getUrgencyParams: () => UrgencyParameters;

  // Utilities
  refreshData: () => Promise<void>;
  refreshStats: () => Promise<void>;
}

interface UseFirestoreReturn extends FirestoreState, FirestoreActions {}

// ============================================================================
// JUZ PAGE RANGES (Static Data)
// ============================================================================

const JUZ_PAGE_RANGES: Record<number, { start: number; end: number }> = {
  1: { start: 1, end: 21 },
  2: { start: 22, end: 41 },
  3: { start: 42, end: 61 },
  4: { start: 62, end: 81 },
  5: { start: 82, end: 101 },
  6: { start: 102, end: 121 },
  7: { start: 122, end: 141 },
  8: { start: 142, end: 161 },
  9: { start: 162, end: 181 },
  10: { start: 182, end: 201 },
  11: { start: 202, end: 221 },
  12: { start: 222, end: 241 },
  13: { start: 242, end: 261 },
  14: { start: 262, end: 281 },
  15: { start: 282, end: 301 },
  16: { start: 302, end: 321 },
  17: { start: 322, end: 341 },
  18: { start: 342, end: 361 },
  19: { start: 362, end: 381 },
  20: { start: 382, end: 401 },
  21: { start: 402, end: 421 },
  22: { start: 422, end: 441 },
  23: { start: 442, end: 461 },
  24: { start: 462, end: 481 },
  25: { start: 482, end: 501 },
  26: { start: 502, end: 521 },
  27: { start: 522, end: 541 },
  28: { start: 542, end: 561 },
  29: { start: 562, end: 581 },
  30: { start: 582, end: 604 },
};

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useFirestore(): UseFirestoreReturn {
  // State
  const [user, setUser] = useState<FirestoreUser | null>(null);
  const [pages, setPages] = useState<FirestorePage[]>([]);
  const [todaySession, setTodaySession] = useState<FirestoreSession | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Get urgency parameters from user settings
  const getUrgencyParams = useCallback((): UrgencyParameters => {
    return {
      dangerThresholdDays: user?.dangerThresholdDays ?? DEFAULT_USER_SETTINGS.dangerThresholdDays,
      timeWeight: 1.0,
      weaknessWeight: 1.0,
      skipPenaltyWeight: 0.2,
      recencyWeight: 1.0,
    };
  }, [user?.dangerThresholdDays]);

  // ============================================================================
  // AUTH SUBSCRIPTION
  // ============================================================================

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setIsAuthenticated(!!firebaseUser);
      if (!firebaseUser) {
        setUser(null);
        setPages([]);
        setTodaySession(null);
        setStats(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // ============================================================================
  // DATA SUBSCRIPTIONS
  // ============================================================================

  useEffect(() => {
    if (!isAuthenticated) return;

    setLoading(true);
    setError(null);

    // Subscribe to user document
    const unsubscribeUser = firestoreService.subscribeToUser((userData) => {
      setUser(userData);
    });

    // Subscribe to pages
    const unsubscribePages = firestoreService.subscribeToPages((pagesData) => {
      setPages(pagesData);
      setLoading(false);
    });

    // Subscribe to today's session
    const unsubscribeSession = firestoreService.subscribeToTodaySession((sessionData) => {
      setTodaySession(sessionData);
    });

    return () => {
      unsubscribeUser();
      unsubscribePages();
      unsubscribeSession();
    };
  }, [isAuthenticated]);

  // ============================================================================
  // USER ACTIONS
  // ============================================================================

  const updateUserSettings = useCallback(async (updates: UpdateUserInput): Promise<void> => {
    try {
      setError(null);
      await firestoreService.updateUser(updates);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update settings';
      setError(message);
      throw err;
    }
  }, []);

  const completeOnboarding = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      await firestoreService.updateUser({ onboardingComplete: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete onboarding';
      setError(message);
      throw err;
    }
  }, []);

  // ============================================================================
  // PAGE ACTIONS
  // ============================================================================

  const updatePage = useCallback(
    async (pageNumber: number, updates: UpdatePageInput): Promise<void> => {
      try {
        setError(null);
        await firestoreService.updatePage(pageNumber, updates);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update page';
        setError(message);
        throw err;
      }
    },
    []
  );

  const markPageMemorized = useCallback(async (pageNumber: number): Promise<void> => {
    try {
      setError(null);
      await firestoreService.markPageMemorized(pageNumber);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark page memorized';
      setError(message);
      throw err;
    }
  }, []);

  const markPageLearning = useCallback(async (pageNumber: number): Promise<void> => {
    try {
      setError(null);
      await firestoreService.markPageLearning(pageNumber);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark page as learning';
      setError(message);
      throw err;
    }
  }, []);

  const bulkUpdatePages = useCallback(
    async (pageNumbers: number[], status: PageStatus): Promise<void> => {
      try {
        setError(null);
        await firestoreService.bulkUpdatePageStatus(pageNumbers, status);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to bulk update pages';
        setError(message);
        throw err;
      }
    },
    []
  );

  const updateWeaknessRating = useCallback(
    async (pageNumber: number, rating: WeaknessRating): Promise<void> => {
      try {
        setError(null);

        // If we have an active session, update through session
        if (todaySession && todaySession.state !== 'COMPLETED') {
          await firestoreService.updateWeaknessRating(todaySession.id, pageNumber, rating);
        } else {
          // Direct page update
          await firestoreService.updatePage(pageNumber, { weaknessRating: rating });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update weakness rating';
        setError(message);
        throw err;
      }
    },
    [todaySession]
  );

  // ============================================================================
  // SESSION ACTIONS
  // ============================================================================

  const startSession = useCallback(
    async (assignedPages: number[]): Promise<FirestoreSession> => {
      try {
        setError(null);
        const session = await firestoreService.getOrCreateTodaySession(assignedPages);
        return session;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start session';
        setError(message);
        throw err;
      }
    },
    []
  );

  const markPageRevised = useCallback(
    async (pageNumber: number): Promise<void> => {
      if (!todaySession) {
        throw new Error('No active session');
      }

      try {
        setError(null);
        await firestoreService.markPageRevised(todaySession.id, pageNumber);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to mark page revised';
        setError(message);
        throw err;
      }
    },
    [todaySession]
  );

  const markPageSkipped = useCallback(
    async (pageNumber: number): Promise<void> => {
      if (!todaySession) {
        throw new Error('No active session');
      }

      try {
        setError(null);
        await firestoreService.markPageSkipped(todaySession.id, pageNumber);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to mark page skipped';
        setError(message);
        throw err;
      }
    },
    [todaySession]
  );

  const completeSession = useCallback(
    async (durationMinutes: number): Promise<void> => {
      if (!todaySession) {
        throw new Error('No active session');
      }

      try {
        setError(null);
        await firestoreService.completeSession(todaySession.id, durationMinutes);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to complete session';
        setError(message);
        throw err;
      }
    },
    [todaySession]
  );

  // ============================================================================
  // ALGORITHM
  // ============================================================================

  const generateDailyAssignment = useCallback(async (): Promise<DailyAssignment> => {
    try {
      setError(null);
      const capacity = user?.dailyPageCapacity ?? DEFAULT_USER_SETTINGS.dailyPageCapacity;
      const params = getUrgencyParams();
      return await firestoreService.generateDailyAssignment(capacity, params, JUZ_PAGE_RANGES);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate assignment';
      setError(message);
      throw err;
    }
  }, [user?.dailyPageCapacity, getUrgencyParams]);

  // ============================================================================
  // UTILITIES
  // ============================================================================

  const refreshData = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const [userData, pagesData, sessionData] = await Promise.all([
        firestoreService.getUser(),
        firestoreService.getAllPages(),
        firestoreService.getTodaySession(),
      ]);

      setUser(userData);
      setPages(pagesData);
      setTodaySession(sessionData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshStats = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      const userStats = await firestoreService.getUserStats();
      setStats(userStats);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh stats';
      setError(message);
    }
  }, []);

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  // Memoized page helpers
  const memorizedPages = useMemo(
    () => pages.filter((p) => p.status === 'memorized'),
    [pages]
  );

  const learningPages = useMemo(
    () => pages.filter((p) => p.status === 'learning'),
    [pages]
  );

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    // State
    user,
    pages,
    todaySession,
    stats,
    loading,
    error,
    isAuthenticated,

    // User actions
    updateUserSettings,
    completeOnboarding,

    // Page actions
    updatePage,
    markPageMemorized,
    markPageLearning,
    bulkUpdatePages,
    updateWeaknessRating,

    // Session actions
    startSession,
    markPageRevised,
    markPageSkipped,
    completeSession,

    // Algorithm
    generateDailyAssignment,
    getUrgencyParams,

    // Utilities
    refreshData,
    refreshStats,
  };
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Hook to get pages for a specific juz
 */
export function useJuzPages(juzNumber: number): {
  pages: FirestorePage[];
  loading: boolean;
} {
  const [pages, setPages] = useState<FirestorePage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPages = async () => {
      try {
        const juzPages = await firestoreService.getPagesByJuz(juzNumber, JUZ_PAGE_RANGES);
        setPages(juzPages);
      } catch (err) {
        logger.error('Failed to fetch juz pages:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPages();
  }, [juzNumber]);

  return { pages, loading };
}

/**
 * Hook to get recent sessions for history view
 */
export function useSessionHistory(limitCount: number = 30): {
  sessions: FirestoreSession[];
  loading: boolean;
} {
  const [sessions, setSessions] = useState<FirestoreSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const recentSessions = await firestoreService.getRecentSessions(limitCount);
        setSessions(recentSessions);
      } catch (err) {
        logger.error('Failed to fetch session history:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, [limitCount]);

  return { sessions, loading };
}

/**
 * Hook to get pages in danger zone
 */
export function useDangerZonePages(): {
  pages: FirestorePage[];
  loading: boolean;
} {
  const [pages, setPages] = useState<FirestorePage[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useFirestore();

  useEffect(() => {
    if (!user) return;

    const fetchPages = async () => {
      try {
        const dangerPages = await firestoreService.getPagesInDangerZone(user.dangerThresholdDays);
        setPages(dangerPages);
      } catch (err) {
        logger.error('Failed to fetch danger zone pages:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPages();
  }, [user?.dangerThresholdDays]);

  return { pages, loading };
}

export default useFirestore;

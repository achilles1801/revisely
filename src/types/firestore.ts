/**
 * Firestore Database Schema Types
 *
 * Collection Structure:
 *
 * users/{userId}                           - User profile and settings
 * users/{userId}/pages/{pageNumber}        - Individual page progress (604 documents)
 * users/{userId}/sessions/{sessionId}      - Daily revision sessions
 *
 * Design Decisions:
 * - Pages are stored as individual documents for granular updates and queries
 * - Sessions are separate documents to support historical queries
 * - Denormalized stats in user document for quick dashboard reads
 */

import { Timestamp } from 'firebase/firestore';

// ============================================================================
// ENUMS AND CONSTANTS
// ============================================================================

/** Status of a page in user's memorization journey */
export type PageStatus = 'not_memorized' | 'learning' | 'memorized';

/** User-edited schedule shape persisted on the user doc. */
export interface FirestoreCustomPlan {
  days: number[][];
  cycleStartDate: string;
  direction: 'forward' | 'reverse';
}

/** Theme preference for the app */
export type ThemePreference = 'light' | 'dark' | 'system';

/** Session state - one session per day maximum */
export type SessionState = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

/** Weakness rating scale: 1 = very weak, 5 = very strong */
export type WeaknessRating = 1 | 2 | 3 | 4 | 5;

/** Total number of pages in the Quran */
export const TOTAL_QURAN_PAGES = 604;

/** Default values for new users */
export const DEFAULT_USER_SETTINGS = {
  dailyPageCapacity: 20,
  smartTrackingEnabled: false,
  hasSeenSmartTrackingPreview: false,
  theme: 'system' as ThemePreference,
  notificationsEnabled: true,
  reminderTime: '08:00',
} as const;

/** Default weakness rating for new pages */
export const DEFAULT_WEAKNESS_RATING: WeaknessRating = 4;

// ============================================================================
// USER DOCUMENT TYPES
// ============================================================================

/**
 * Notification settings for the user
 */
export interface NotificationSettings {
  /** Whether notifications are enabled */
  enabled: boolean;
  /** Daily reminder time in HH:mm format */
  reminderTime: string;
}

/**
 * User profile and settings
 *
 * Collection: users/{userId}
 *
 * This document contains all user preferences and aggregated stats.
 * Aggregated stats are denormalized here for quick dashboard reads.
 */
export interface FirestoreUser {
  // Identity
  /** User ID from Firebase Auth */
  uid: string;
  /** Display name */
  displayName: string | null;
  /** Email address */
  email: string | null;
  /** Profile photo URL */
  photoURL: string | null;

  // Timestamps
  /** When the user account was created */
  createdAt: Timestamp;
  /** Last time any user data was updated */
  updatedAt: Timestamp;
  /** Last time the user was active in the app */
  lastActiveAt: Timestamp;

  // Revision Settings
  /** How many pages to revise per day */
  dailyPageCapacity: number;
  /** Whether Smart Tracking (page ratings + Insights tab) is enabled */
  smartTrackingEnabled: boolean;
  /** Whether the user has finished (or dismissed) the Smart Tracking preview tour */
  hasSeenSmartTrackingPreview: boolean;

  // UI Preferences
  /** Theme preference */
  theme: ThemePreference;
  /** Notification settings */
  notifications: NotificationSettings;

  // Current Progress Tracking
  /** For users actively memorizing: current juz number */
  currentMemorizationJuz: number | null;
  /** For users actively memorizing: current page number within juz */
  currentMemorizationPage: number | null;
  /** Position in the user's khatam cycle */
  currentKhatamPage: number;
  /** Optional user-edited schedule (Phase 7 plan editor). Null means use the
   *  default sequential resolver. */
  customPlan: FirestoreCustomPlan | null;

  // Aggregated Stats (denormalized for quick reads)
  /** Current revision streak in days */
  streak: number;
  /** Last date a revision was completed (YYYY-MM-DD) */
  lastRevisionDate: string | null;
  /** Total number of pages with status 'memorized' */
  totalMemorizedPages: number;
  /** Total number of pages with status 'learning' */
  totalLearningPages: number;
  /** Total revision sessions completed */
  totalSessionsCompleted: number;
  /** Total pages revised all time */
  totalPagesRevisedAllTime: number;

  // Onboarding
  /** Whether the user has completed onboarding */
  onboardingComplete: boolean;

  /** Surah numbers the user explicitly marked memorized at the surah level.
   *  Tracked separately from page-level status so checking one short surah
   *  doesn't visually flip its neighbors that share the same physical page. */
  memorizedSurahs?: number[];

  /** When true, the "current day" for revision rolls over at fajr instead of
   *  midnight. Requires `locationCoords` to be set. */
  fajrBoundaryEnabled?: boolean;
  /** User location for prayer-time calculation. */
  locationCoords?: { latitude: number; longitude: number } | null;
  /** adhan calculation method (e.g. "MuslimWorldLeague", "NorthAmerica", "Egyptian"). */
  fajrCalculationMethod?: string;
  /** ISO timestamp the user's current schedule cycle started. Reset when the
   *  user finishes onboarding so Day 1 aligns to their latest setup. */
  scheduleAnchorDate?: string;
}

/**
 * Input type for creating a new user (without server-generated fields)
 */
export interface CreateUserInput {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  dailyPageCapacity?: number;
  smartTrackingEnabled?: boolean;
  hasSeenSmartTrackingPreview?: boolean;
  theme?: ThemePreference;
  notifications?: Partial<NotificationSettings>;
}

/**
 * Input type for updating user settings
 */
export interface UpdateUserInput {
  displayName?: string | null;
  dailyPageCapacity?: number;
  smartTrackingEnabled?: boolean;
  hasSeenSmartTrackingPreview?: boolean;
  theme?: ThemePreference;
  notifications?: Partial<NotificationSettings>;
  currentMemorizationJuz?: number | null;
  currentMemorizationPage?: number | null;
  currentKhatamPage?: number;
  customPlan?: FirestoreCustomPlan | null;
  onboardingComplete?: boolean;
  totalMemorizedPages?: number;
  streak?: number;
  lastRevisionDate?: string | null;
  memorizedSurahs?: number[];
  fajrBoundaryEnabled?: boolean;
  locationCoords?: { latitude: number; longitude: number } | null;
  fajrCalculationMethod?: string;
  scheduleAnchorDate?: string;
}

// ============================================================================
// PAGE DOCUMENT TYPES
// ============================================================================

/**
 * Individual page progress
 *
 * Collection: users/{userId}/pages/{pageNumber}
 * Document ID: Page number as string (e.g., "1", "604")
 *
 * Design: Each page is a separate document to allow:
 * - Granular updates without rewriting all 604 pages
 * - Efficient queries by status, weakness, or lastRevisedAt
 * - Indexed sorting for algorithm needs
 */
export interface FirestorePage {
  /** Page number (1-604) - also the document ID */
  pageNumber: number;
  /** Current memorization status */
  status: PageStatus;
  /** When this page was marked as memorized */
  dateMemorized: Timestamp | null;
  /** Last time this page was revised */
  lastRevisedAt: Timestamp | null;
  /** User's self-assessment of how well they know this page (1-5) */
  weaknessRating: WeaknessRating;
  /** Total number of times this page has been revised */
  totalRevisionCount: number;
  /** Number of times this page was assigned but skipped */
  skipCount: number;
  /** Last time any field was updated */
  updatedAt: Timestamp;
}

/**
 * Input type for updating page data
 * All fields optional for partial updates
 */
export interface UpdatePageInput {
  status?: PageStatus;
  dateMemorized?: Timestamp | null;
  lastRevisedAt?: Timestamp | null;
  weaknessRating?: WeaknessRating;
  totalRevisionCount?: number;
  skipCount?: number;
}

/**
 * Batch update for multiple pages at once
 * Used at end of revision session
 */
export interface BatchPageUpdate {
  pageNumber: number;
  updates: UpdatePageInput;
}

// ============================================================================
// SESSION DOCUMENT TYPES
// ============================================================================

/**
 * Weakness update made during a session
 */
export interface WeaknessUpdate {
  /** Page number that was rated */
  pageNumber: number;
  /** Previous rating before this session */
  previousRating: WeaknessRating;
  /** New rating set by user */
  newRating: WeaknessRating;
  /** Timestamp when the rating was changed */
  changedAt: Timestamp;
}

/**
 * Daily revision session
 *
 * Collection: users/{userId}/sessions/{sessionId}
 * Document ID: Auto-generated or date-based (e.g., "2024-01-15")
 *
 * Constraint: Maximum one session per day per user
 * The date field should be used for uniqueness checking
 */
export interface FirestoreSession {
  /** Unique session ID */
  id: string;
  /** Date of the session (YYYY-MM-DD format) - unique per user */
  date: string;
  /** Current state of the session */
  state: SessionState;

  // Session Timing
  /** When the session was created/started */
  createdAt: Timestamp;
  /** When the session was last updated */
  updatedAt: Timestamp;
  /** When the session was completed (null if not completed) */
  completedAt: Timestamp | null;
  /** Total duration in minutes (calculated on completion) */
  durationMinutes: number | null;

  // Assigned Pages (snapshot at session creation)
  /** Pages assigned for this session (frozen at creation) */
  assignedPages: number[];
  /** Total number of assigned pages */
  totalAssignedPages: number;

  // Progress Tracking
  /** Pages that have been revised in this session */
  pagesRevised: number[];
  /** Pages that were skipped (assigned but not revised) */
  pagesSkipped: number[];
  /** Weakness ratings updated during this session */
  weaknessUpdates: WeaknessUpdate[];

  // Computed on completion
  /** Percentage of assigned pages completed (0-100) */
  completionPercentage: number;
}

/**
 * Input for creating a new session
 */
export interface CreateSessionInput {
  date: string;
  assignedPages: number[];
}

/**
 * Input for updating session progress
 */
export interface UpdateSessionInput {
  state?: SessionState;
  pagesRevised?: number[];
  pagesSkipped?: number[];
  weaknessUpdates?: WeaknessUpdate[];
  completedAt?: Timestamp | null;
  durationMinutes?: number | null;
  completionPercentage?: number;
}

// ============================================================================
// ALGORITHM SUPPORT TYPES
// ============================================================================

/**
 * Daily assignment generated by the algorithm
 */
export interface DailyAssignment {
  /** Date for this assignment (YYYY-MM-DD) */
  date: string;
  /** Ordered list of page numbers to revise */
  pages: number[];
  /** Breakdown by juz for display */
  juzBreakdown: { juz: number; pages: number[] }[];
  /** Total pages in this assignment */
  totalPages: number;
}

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

import { Timestamp, FieldValue } from 'firebase/firestore';

// ============================================================================
// ENUMS AND CONSTANTS
// ============================================================================

/** Status of a page in user's memorization journey */
export type PageStatus = 'not_memorized' | 'learning' | 'memorized';

/** Revision mode determines how pages are selected for daily revision */
export type RevisionMode = 'weighted' | 'sequential';

/** Theme preference for the app */
export type ThemePreference = 'light' | 'dark' | 'system';

/** Session state - one session per day maximum */
export type SessionState = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

/** Weakness rating scale: 1 = very weak, 5 = very strong */
export type WeaknessRating = 1 | 2 | 3 | 4 | 5;

/** Days of the week (0 = Sunday, 6 = Saturday) */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Total number of pages in the Quran */
export const TOTAL_QURAN_PAGES = 604;

/** Default values for new users */
export const DEFAULT_USER_SETTINGS = {
  dailyPageCapacity: 20,
  activeDays: [0, 1, 2, 3, 4, 5, 6] as DayOfWeek[],
  dangerThresholdDays: 10,
  revisionMode: 'weighted' as RevisionMode,
  theme: 'system' as ThemePreference,
  notificationsEnabled: true,
  reminderTime: '08:00',
  dangerAlertEnabled: true,
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
  /** Whether to alert when pages enter danger zone */
  dangerAlertEnabled: boolean;
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
  /** Which days of the week the user revises (0=Sun, 6=Sat) */
  activeDays: DayOfWeek[];
  /** How many days before a page becomes "in danger" */
  dangerThresholdDays: number;
  /** Revision mode: weighted (urgency-based) or sequential (khatam-style) */
  revisionMode: RevisionMode;

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
  /** For sequential mode: which page to start khatam from */
  currentKhatamPage: number;

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
  activeDays?: DayOfWeek[];
  dangerThresholdDays?: number;
  revisionMode?: RevisionMode;
  theme?: ThemePreference;
  notifications?: Partial<NotificationSettings>;
}

/**
 * Input type for updating user settings
 */
export interface UpdateUserInput {
  displayName?: string | null;
  dailyPageCapacity?: number;
  activeDays?: DayOfWeek[];
  dangerThresholdDays?: number;
  revisionMode?: RevisionMode;
  theme?: ThemePreference;
  notifications?: Partial<NotificationSettings>;
  currentMemorizationJuz?: number | null;
  currentMemorizationPage?: number | null;
  currentKhatamPage?: number;
  onboardingComplete?: boolean;
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
// QUERY RESULT TYPES
// ============================================================================

/**
 * Page data with computed urgency score
 * Used by the revision algorithm
 */
export interface PageWithUrgency extends FirestorePage {
  /** Computed urgency score (higher = more urgent to revise) */
  urgencyScore: number;
  /** Days since last revision */
  daysSinceRevision: number;
  /** Whether this page is in the danger zone */
  inDangerZone: boolean;
}

/**
 * Summary stats for the dashboard
 */
export interface UserStats {
  totalMemorizedPages: number;
  totalLearningPages: number;
  pagesInDangerZone: number;
  currentStreak: number;
  totalSessionsCompleted: number;
  totalPagesRevisedAllTime: number;
  averageSessionDuration: number;
  weakestPages: number[]; // Page numbers with rating 1-2
}

/**
 * Filter options for querying pages
 */
export interface PageQueryFilters {
  status?: PageStatus;
  minWeaknessRating?: WeaknessRating;
  maxWeaknessRating?: WeaknessRating;
  hasNotBeenRevisedSince?: Date;
  juzNumber?: number;
}

/**
 * Sort options for querying pages
 */
export interface PageQuerySort {
  field: 'lastRevisedAt' | 'weaknessRating' | 'skipCount' | 'pageNumber' | 'urgencyScore';
  direction: 'asc' | 'desc';
}

// ============================================================================
// ALGORITHM SUPPORT TYPES
// ============================================================================

/**
 * Parameters for urgency calculation
 * These can be user-specific and learned over time
 */
export interface UrgencyParameters {
  /** User's danger threshold in days */
  dangerThresholdDays: number;
  /** Weight for time-based urgency (default 1.0) */
  timeWeight: number;
  /** Weight for weakness-based urgency (default 1.0) */
  weaknessWeight: number;
  /** Weight for skip penalty (default 0.2 per skip) */
  skipPenaltyWeight: number;
  /** Weight for recency multiplier (for newly memorized pages) */
  recencyWeight: number;
}

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
  /** Estimated time to complete in minutes */
  estimatedMinutes: number;
}

// ============================================================================
// OFFLINE SUPPORT TYPES
// ============================================================================

/**
 * Pending write operation for offline support
 * Stored locally and synced when online
 */
export interface PendingWrite {
  /** Unique ID for this pending operation */
  id: string;
  /** Type of operation */
  type: 'UPDATE_PAGE' | 'UPDATE_SESSION' | 'CREATE_SESSION' | 'UPDATE_USER';
  /** Document path */
  path: string;
  /** Data to write */
  data: Record<string, unknown>;
  /** When this operation was queued */
  queuedAt: number;
  /** Number of retry attempts */
  retryCount: number;
}

/**
 * Sync status for offline-first support
 */
export interface SyncStatus {
  /** Last successful sync timestamp */
  lastSyncAt: number | null;
  /** Whether there are pending writes */
  hasPendingWrites: boolean;
  /** Number of pending write operations */
  pendingWriteCount: number;
  /** Whether currently syncing */
  isSyncing: boolean;
  /** Last sync error if any */
  lastError: string | null;
}

// Status of a page in user's memorization journey
export type PageStatus = 'not_memorized' | 'in_progress' | 'memorized';

// User profile and preferences
export interface User {
  id: string;
  createdAt: string;
  name?: string;                    // User's display name

  // Smart Tracking opt-in feature
  smartTrackingEnabled: boolean;
  hasSeenSmartTrackingPreview: boolean;

  // Preferences
  dailyPageCapacity: number;        // e.g., 20 pages
  reminderTime: string;             // "08:00"
  notificationsEnabled: boolean;

  // Current progress
  currentMemorizationJuz: number | null;
  currentMemorizationPage: number | null;

  // Position in the user's khatam cycle
  currentKhatamPage: number;

  // Optional custom schedule (Phase 7 plan editor). When null, the default
  // sequential resolver is used. When set, this plan overrides what's due
  // on each calendar day, looping after one full cycle.
  customPlan: CustomPlan | null;

  // Stats
  streak: number;
  lastRevisionDate: string | null;

  // Surah numbers the user has explicitly marked memorized at the surah level.
  // Distinct from page-level state because short surahs that share a page
  // (e.g., Shams/Layl/Duha on page 595) shouldn't all flip checked just
  // because the shared page was marked via one of them.
  memorizedSurahs: number[];

  // Fajr-based day boundary. When enabled, "today's session" rolls over at
  // fajr (computed locally from coords + method) instead of midnight, so
  // night-revisers who finish at 1 AM still count as the previous day.
  fajrBoundaryEnabled: boolean;
  locationCoords: { latitude: number; longitude: number } | null;
  /** adhan calculation method id — see `FajrCalculationMethod` in lib/fajrBoundary. */
  fajrCalculationMethod: string;

  // Anchor for the default sliding-window schedule. Reset when the user
  // finishes onboarding (including replays) so "Day 1 of the cycle" lines
  // up with whatever they just configured. Falls back to `createdAt` for
  // legacy users who don't have the field yet.
  scheduleAnchorDate: string;
}

/** A user-edited schedule that overrides the default sequential plan. */
export interface CustomPlan {
  /** One entry per day in the cycle. Each entry is the list of page numbers
   *  scheduled for that day; an empty array means an off day. */
  days: number[][];
  /** The date (YYYY-MM-DD) that maps to `days[0]`. The plan loops from here. */
  cycleStartDate: string;
  /** Which direction the user generated the plan from — useful for re-rendering
   *  the editor in the same orientation. */
  direction: 'forward' | 'reverse';
}

// User's relationship with each Quran page
export interface UserPage {
  pageNumber: number;               // 1-604
  status: PageStatus;
  dateMemorized: string | null;
  weaknessRating: number;           // 1-5, default 4
  lastRevisedDate: string | null;
  totalRevisionCount: number;
  skipCount: number;                // times scheduled but not revised
}

// A revision session log
export interface RevisionLog {
  id: string;
  date: string;
  pagesRevised: number[];
  pagesSkipped: number[];
  weaknessUpdates: { page: number; rating: number }[];
  durationMinutes: number | null;
}

// Static Quran reference data
export interface QuranPage {
  pageNumber: number;               // 1-604
  juzNumber: number;                // 1-30
  surahNumber: number;              // 1-114
  surahName: string;
  surahNameArabic: string;
  startingAyah: number;
}

// Daily revision assignment
export interface DailyAssignment {
  date: string;
  pages: number[];
  juzBreakdown: { juz: number; pages: number[] }[];
  totalPages: number;
}


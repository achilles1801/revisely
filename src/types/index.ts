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
  // How the daily quota is interpreted. 'pages' uses dailyPageCapacity as a
  // raw page count; 'juz' uses dailyJuzCount and ignores dailyPageCapacity.
  // 'pages' is the historical default; 'juz' was added so users who think
  // in juz ("one juz a day") don't have to math their way through uneven
  // juz lengths.
  scheduleMode: 'pages' | 'juz';
  // Only meaningful when scheduleMode === 'juz'. Defaults to 1 for new users.
  dailyJuzCount: number;
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

  // Named schedules the user has saved to reuse later. Applying one copies its
  // days/direction into `customPlan` (with a fresh cycleStartDate); the saved
  // entry itself is a reusable snapshot, independent of the active plan.
  savedPlans: SavedPlan[];

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

/** A reusable, named schedule the user saved to switch between later. Stores
 *  the cycle shape only — `cycleStartDate` is assigned fresh (to "today") when
 *  the preset is applied, so applying always starts day 0 on the current day. */
export interface SavedPlan {
  /** Stable client-generated id. */
  id: string;
  /** User-facing name, e.g. "Ramadan rotation". */
  name: string;
  /** Cycle days, same shape as CustomPlan.days. */
  days: number[][];
  /** Direction the cycle was generated in. */
  direction: 'forward' | 'reverse';
  /** ISO timestamp the preset was saved (for stable sorting / display). */
  createdAt: string;
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
  // Every page the user was scheduled to revise this day. Source of truth for
  // "the whole session" — UI surfaces (recent sessions row, edit modal) should
  // reference this rather than reconstructing from revised + skipped, since
  // skipped is only populated on Submit, not on intermediate Save.
  assignedPages?: number[];
  pagesRevised: number[];
  pagesSkipped: number[];
  weaknessUpdates: { page: number; rating: number }[];
  durationMinutes: number | null;
}

// One day in the user's personal memorization/revision journal. Free-form text
// on purpose — huffaz already have their own shorthand ("1/2 p3", "4L p4",
// "5p Maryam + Taha") and the journal should record it as written.
export interface JournalEntry {
  date: string;                     // YYYY-MM-DD, also the document ID
  memorization: string;
  memorizationMinutes: number | null;
  revision: string;
  revisionMinutes: number | null;
  notes: string;
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


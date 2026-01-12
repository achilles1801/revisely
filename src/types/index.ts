// Status of a page in user's memorization journey
export type PageStatus = 'not_memorized' | 'in_progress' | 'memorized';

// Revision modes
export type RevisionMode = 'weighted' | 'sequential';

// User profile and preferences
export interface User {
  id: string;
  createdAt: string;
  name?: string;                    // User's display name

  // Preferences
  mode: RevisionMode;
  dailyPageCapacity: number;        // e.g., 20 pages
  activeDays: number[];             // 0=Sun, 1=Mon, etc.
  reminderTime: string;             // "08:00"
  notificationsEnabled: boolean;
  dangerAlertEnabled: boolean;
  
  // Learned parameters
  dangerThresholdDays: number;      // starts at 10, learned over time
  
  // Current progress
  currentMemorizationJuz: number | null;
  currentMemorizationPage: number | null;
  
  // For sequential mode
  currentKhatamPage: number;
  
  // Stats
  streak: number;
  lastRevisionDate: string | null;
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
  estimatedMinutes: number;
}


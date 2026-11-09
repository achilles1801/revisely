import { generateDailyAssignment } from '../../algorithm';
import { getQuranData } from '../../quranData';
import type { RevisionLog, User, UserPage } from '../../../types';

// Fajr is compared with the device's clock, so the place is one where solar time
// matches this machine's time zone (as lib/__tests__/fajrBoundary does): fajr then
// falls in the early morning wherever the tests run.
export const PLACE = {
  latitude: 30,
  longitude: Math.max(-165, Math.min(165, -new Date(2026, 9, 17, 12).getTimezoneOffset() / 4)),
};

export const user = (overrides: Partial<User> = {}): User =>
  ({
    id: 'u1',
    createdAt: '2026-01-01T12:00:00Z',
    smartTrackingEnabled: false,
    hasSeenSmartTrackingPreview: false,
    dailyPageCapacity: 5,
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
    scheduleAnchorDate: '2026-10-01T12:00:00Z',
    ...overrides,
  }) as User;

/** Juz 1 to 30 all memorized: a full plan. */
export const pages: UserPage[] = Array.from({ length: 604 }, (_, i) => ({
  pageNumber: i + 1,
  status: 'memorized',
  dateMemorized: '2025-01-01',
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
})) as UserPage[];

export const quranData = getQuranData();

/** The pages of the revision day that `date` (local midnight) names. */
export function assignedOn(u: User, date: Date): number[] {
  return generateDailyAssignment(pages, quranData, u, date).pages;
}

export function logFor(date: string, pagesRevised: number[]): RevisionLog {
  return { id: `${date}-log`, date, assignedPages: pagesRevised, pagesRevised, pagesSkipped: [], weaknessUpdates: [], durationMinutes: 5 };
}

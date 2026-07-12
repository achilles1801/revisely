import {
  createCustomPlanFromDraft,
  createCustomPlanFromSavedPlan,
} from '../schedulePlans';
import {
  customPlanFromFirestore,
  customPlanToFirestore,
  getScheduleAnchorDateFromFirestore,
  savedPlansFromFirestore,
  savedPlansToFirestore,
} from '../schedulePersistence';
import {
  getPagesScheduledForDate,
  shiftScheduleAnchor,
} from '../algorithm';
import type { CustomPlan, SavedPlan, User, UserPage } from '../../types';
import type { FirestoreUser } from '../../types/firestore';

const baseUser: User = {
  id: 'u1',
  createdAt: '2026-01-01T12:00:00Z',
  smartTrackingEnabled: false,
  hasSeenSmartTrackingPreview: false,
  dailyPageCapacity: 3,
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
  scheduleAnchorDate: '2026-06-08T12:00:00Z',
};

function makePage(pageNumber: number): UserPage {
  return {
    pageNumber,
    status: 'memorized',
    dateMemorized: '2026-01-01',
    weaknessRating: 4,
    lastRevisedDate: null,
    totalRevisionCount: 0,
    skipCount: 0,
  };
}

function firestoreUser(overrides: Partial<FirestoreUser>): FirestoreUser {
  return {
    uid: 'u1',
    displayName: null,
    email: null,
    photoURL: null,
    createdAt: { toDate: () => new Date('2026-01-01T12:00:00Z') } as any,
    updatedAt: { toDate: () => new Date('2026-01-01T12:00:00Z') } as any,
    lastActiveAt: { toDate: () => new Date('2026-01-01T12:00:00Z') } as any,
    dailyPageCapacity: 3,
    scheduleMode: 'pages',
    dailyJuzCount: 1,
    smartTrackingEnabled: false,
    hasSeenSmartTrackingPreview: false,
    theme: 'system',
    notifications: { enabled: true, reminderTime: '08:00' },
    currentMemorizationJuz: null,
    currentMemorizationPage: null,
    currentKhatamPage: 1,
    customPlan: null,
    savedPlans: [],
    streak: 0,
    lastRevisionDate: null,
    totalMemorizedPages: 0,
    totalLearningPages: 0,
    totalSessionsCompleted: 0,
    totalPagesRevisedAllTime: 0,
    onboardingComplete: true,
    memorizedSurahs: [],
    fajrBoundaryEnabled: false,
    locationCoords: null,
    fajrCalculationMethod: 'NorthAmerica',
    scheduleAnchorDate: '2026-06-08T12:00:00Z',
    ...overrides,
  };
}

describe('schedule editing lifecycle', () => {
  const memorized = Array.from({ length: 9 }, (_, i) => makePage(i + 1));

  it('saving an edited draft anchors day 0 to today and the live scheduler uses that edit', () => {
    const saved = createCustomPlanFromDraft(
      [[7, 8], [], [1, 3, 5]],
      'reverse',
      new Date('2026-06-08T15:30:00Z'),
    );
    const persisted = customPlanToFirestore(saved);
    const reloadedUser = {
      ...baseUser,
      customPlan: customPlanFromFirestore(persisted),
    };

    expect(persisted).toEqual({
      days: [{ pages: [7, 8] }, { pages: [] }, { pages: [1, 3, 5] }],
      cycleStartDate: '2026-06-08',
      direction: 'reverse',
    });
    expect(getPagesScheduledForDate(reloadedUser, new Date('2026-06-08T12:00:00Z'), memorized)).toEqual([7, 8]);
    expect(getPagesScheduledForDate(reloadedUser, new Date('2026-06-09T12:00:00Z'), memorized)).toEqual([]);
    expect(getPagesScheduledForDate(reloadedUser, new Date('2026-06-10T12:00:00Z'), memorized)).toEqual([1, 3, 5]);
    expect(getPagesScheduledForDate(reloadedUser, new Date('2026-06-11T12:00:00Z'), memorized)).toEqual([7, 8]);
  });

  it('custom plans override default capacity-based scheduling until cleared', () => {
    const customPlan: CustomPlan = {
      days: [[9], [8], [7]],
      cycleStartDate: '2026-06-08',
      direction: 'forward',
    };
    const customUser = { ...baseUser, customPlan };
    const defaultUser = { ...customUser, customPlan: null };
    const today = new Date('2026-06-08T12:00:00Z');

    expect(getPagesScheduledForDate(customUser, today, memorized)).toEqual([9]);
    expect(getPagesScheduledForDate(defaultUser, today, memorized)).toEqual([1, 2, 3]);
  });

  it('applying a saved plan creates an active custom plan with a fresh today anchor', () => {
    const savedPlan: SavedPlan = {
      id: 'ramadan',
      name: 'Ramadan rotation',
      days: [[2, 4], [6], []],
      direction: 'reverse',
      createdAt: '2026-06-01T12:00:00Z',
    };
    const customPlan = createCustomPlanFromSavedPlan(
      savedPlan,
      new Date('2026-06-12T08:00:00Z'),
    );
    const reloadedUser = {
      ...baseUser,
      customPlan: customPlanFromFirestore(customPlanToFirestore(customPlan)),
    };

    expect(customPlan).toEqual({
      days: [[2, 4], [6], []],
      cycleStartDate: '2026-06-12',
      direction: 'reverse',
    });
    expect(getPagesScheduledForDate(reloadedUser, new Date('2026-06-12T12:00:00Z'), memorized)).toEqual([2, 4]);
    expect(getPagesScheduledForDate(reloadedUser, new Date('2026-06-14T12:00:00Z'), memorized)).toEqual([]);
  });

  it('saved named plans round-trip through Firestore without losing rest days or direction', () => {
    const plans: SavedPlan[] = [
      {
        id: 'weekly',
        name: 'Weekly loop',
        days: [[1, 2, 3], [], [4, 5]],
        direction: 'forward',
        createdAt: '2026-06-01T12:00:00Z',
      },
      {
        id: 'reverse',
        name: 'Reverse review',
        days: [[9, 8], [7]],
        direction: 'reverse',
        createdAt: '2026-06-02T12:00:00Z',
      },
    ];

    const persisted = savedPlansToFirestore(plans);
    expect(persisted).toEqual([
      {
        id: 'weekly',
        name: 'Weekly loop',
        days: [{ pages: [1, 2, 3] }, { pages: [] }, { pages: [4, 5] }],
        direction: 'forward',
        createdAt: '2026-06-01T12:00:00Z',
      },
      {
        id: 'reverse',
        name: 'Reverse review',
        days: [{ pages: [9, 8] }, { pages: [7] }],
        direction: 'reverse',
        createdAt: '2026-06-02T12:00:00Z',
      },
    ]);
    expect(savedPlansFromFirestore(persisted)).toEqual(plans);
  });

  it('go back a day persists by shifting the custom plan anchor, not the cycle contents', () => {
    const user = {
      ...baseUser,
      customPlan: {
        days: [[1], [2], [3]],
        cycleStartDate: '2026-06-08',
        direction: 'forward' as const,
      },
    };
    const shifted = shiftScheduleAnchor(user, 1);
    const reloadedUser = {
      ...shifted,
      customPlan: customPlanFromFirestore(customPlanToFirestore(shifted.customPlan)),
    };

    expect(reloadedUser.customPlan?.days).toEqual([[1], [2], [3]]);
    expect(reloadedUser.customPlan?.cycleStartDate).toBe('2026-06-09');
    expect(getPagesScheduledForDate(reloadedUser, new Date('2026-06-09T12:00:00Z'), memorized)).toEqual([1]);
    expect(getPagesScheduledForDate(reloadedUser, new Date('2026-06-10T12:00:00Z'), memorized)).toEqual([2]);
  });

  it('skip ahead persists by shifting the default schedule anchor and survives reload', () => {
    const skippedAhead = shiftScheduleAnchor(baseUser, -1);
    const fsUser = firestoreUser({
      scheduleAnchorDate: skippedAhead.scheduleAnchorDate,
      customPlan: customPlanToFirestore(skippedAhead.customPlan),
      savedPlans: savedPlansToFirestore(skippedAhead.savedPlans),
    });
    const reloadedUser = {
      ...baseUser,
      customPlan: customPlanFromFirestore(fsUser.customPlan),
      savedPlans: savedPlansFromFirestore(fsUser.savedPlans),
      scheduleAnchorDate: getScheduleAnchorDateFromFirestore(fsUser),
    };
    const today = new Date('2026-06-08T12:00:00Z');
    const tomorrow = new Date('2026-06-09T12:00:00Z');

    expect(reloadedUser.scheduleAnchorDate).toBe(skippedAhead.scheduleAnchorDate);
    expect(getPagesScheduledForDate(reloadedUser, today, memorized)).toEqual(
      getPagesScheduledForDate(baseUser, tomorrow, memorized),
    );
  });

  it('legacy users without scheduleAnchorDate fall back to createdAt so scheduling remains deterministic', () => {
    const fsUser = firestoreUser({
      scheduleAnchorDate: undefined,
      createdAt: { seconds: Date.parse('2026-06-01T12:00:00Z') / 1000 } as any,
    });

    expect(getScheduleAnchorDateFromFirestore(fsUser)).toBe('2026-06-01T12:00:00.000Z');
  });
});

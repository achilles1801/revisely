// The schedule editor's drag and swipe edits, all the way to what a day
// asks you to revise: the cycle after a move or a delete, the plan it saves,
// carry-over, and the same plan read back on another device.
import { getPagesForDay, getPagesScheduledForDate, scheduledDaysFrom } from '../algorithm';
import { applyCarryOver, settleCarryOverForNewPlan } from '../carryOver';
import { insertDay, moveDay, removeDay, rotateCustomPlanToToday } from '../planBuilder';
import { createCustomPlanFromDraft, dateToLocalISODay } from '../schedulePlans';
import { customPlanFromFirestore, customPlanToFirestore } from '../schedulePersistence';
import type { User, UserPage } from '../../types';

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
  scheduleAnchorDate: '2026-01-01T12:00:00Z',
};

const memorized: UserPage[] = Array.from({ length: 12 }, (_, i) => ({
  pageNumber: i + 1,
  status: 'memorized',
  dateMemorized: '2025-01-01',
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
}));

const today = new Date(2026, 9, 27);
const day = (offset: number) => new Date(2026, 9, 27 + offset);
// A four-day cycle with a rest day: today 1–3, tomorrow 4–6, then rest, then 7–9.
const draft = [[1, 2, 3], [4, 5, 6], [], [7, 8, 9]];

/** Save the edited draft as the editor does, and read the schedule back. */
function save(user: User, days: number[][]): User {
  return {
    ...settleCarryOverForNewPlan(user, dateToLocalISODay(today)),
    customPlan: createCustomPlanFromDraft(days, 'forward', today),
  };
}
const week = (user: User, from = today) => scheduledDaysFrom(user, memorized, from, 8);

describe('moving a day', () => {
  it('puts what was on it on the date it was dropped on; the dates stay', () => {
    // Drag tomorrow's 4–6 onto the fourth date.
    const moved = moveDay(draft, 1, 3);
    expect(moved).toEqual([[1, 2, 3], [], [7, 8, 9], [4, 5, 6]]);
    const user = save(baseUser, moved);
    expect(getPagesForDay(user, day(0), memorized)).toEqual([1, 2, 3]);
    expect(getPagesForDay(user, day(1), memorized)).toEqual([]);
    expect(getPagesForDay(user, day(3), memorized)).toEqual([4, 5, 6]);
    // The cycle repeats in the new order.
    expect(getPagesForDay(user, day(7), memorized)).toEqual([4, 5, 6]);
  });

  it('dropped back on its own date, nothing changes', () => {
    expect(moveDay(draft, 2, 2)).toEqual(draft);
  });

  it('to the first and the last date', () => {
    expect(moveDay(draft, 3, 0)).toEqual([[7, 8, 9], [1, 2, 3], [4, 5, 6], []]);
    expect(moveDay(draft, 0, 3)).toEqual([[4, 5, 6], [], [7, 8, 9], [1, 2, 3]]);
    // Today's pages are whatever landed first.
    expect(getPagesForDay(save(baseUser, moveDay(draft, 3, 0)), today, memorized)).toEqual([7, 8, 9]);
  });

  it('a rest day moves like any other', () => {
    const moved = moveDay(draft, 2, 0);
    expect(moved).toEqual([[], [1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    expect(getPagesForDay(save(baseUser, moved), today, memorized)).toEqual([]);
  });

  it('never loses or repeats a page', () => {
    let days = draft;
    for (const [from, to] of [[0, 3], [2, 1], [3, 0], [1, 2]]) days = moveDay(days, from, to);
    expect(days.flat().sort((a, b) => a - b)).toEqual(draft.flat().sort((a, b) => a - b));
    expect(days).toHaveLength(draft.length);
  });
});

describe('deleting a day', () => {
  it('shortens the cycle; the days after it move up a date', () => {
    const shorter = removeDay(draft, 1);
    expect(shorter).toEqual([[1, 2, 3], [], [7, 8, 9]]);
    const user = save(baseUser, shorter);
    expect(week(user)).toEqual([
      [1, 2, 3], [], [7, 8, 9],
      [1, 2, 3], [], [7, 8, 9],
      [1, 2, 3], [],
    ]);
  });

  it('deleting the first or the last day', () => {
    expect(removeDay(draft, 0)).toEqual([[4, 5, 6], [], [7, 8, 9]]);
    expect(removeDay(draft, 3)).toEqual([[1, 2, 3], [4, 5, 6], []]);
  });

  it('a cycle keeps at least one day, and an index outside it changes nothing', () => {
    expect(removeDay([[1, 2]], 0)).toEqual([[1, 2]]);
    expect(removeDay(draft, 9)).toEqual(draft);
    expect(removeDay(draft, -1)).toEqual(draft);
  });

  it('Undo puts it back where it was', () => {
    for (let i = 0; i < draft.length; i++) {
      expect(insertDay(removeDay(draft, i), i, draft[i])).toEqual(draft);
    }
    // Past the end, it goes last.
    expect(insertDay([[1]], 9, [2])).toEqual([[1], [2]]);
  });

  it('leaves the draft it was given alone', () => {
    const copy = draft.map((d) => [...d]);
    removeDay(draft, 0);
    moveDay(draft, 0, 2);
    insertDay(draft, 0, [5]);
    expect(draft).toEqual(copy);
  });
});

describe('carry-over', () => {
  // Yesterday's 2 and 3 weren't revised: with "Keep daily amount" they open
  // today and the schedule shifts back two pages.
  const plan = createCustomPlanFromDraft(
    [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]],
    'forward',
    day(-1),
  );
  const shifted = applyCarryOver({ ...baseUser, customPlan: plan }, memorized, [2, 3], today);

  it('the editor shows the shifted days, and saving a reorder folds the shift in', () => {
    const shown = scheduledDaysFrom(shifted, memorized, today, 4);
    const draftNow = rotateCustomPlanToToday(plan, today);
    expect(draftNow).toEqual([[4, 5, 6], [7, 8, 9], [10, 11, 12], [1, 2, 3]]);
    // Move the last day to tomorrow, as the editor would from what it shows.
    const moved = moveDay(shown, 3, 1);
    const saved = save(shifted, moved);
    expect(saved.scheduleShiftPages).toBe(0);
    expect(saved.carryOver?.skip).toBe(0);
    // Today still opens with the carried pages, on top of today's day.
    expect(getPagesForDay(saved, today, memorized).slice(0, 2)).toEqual([2, 3]);
    expect(getPagesScheduledForDate(saved, day(1), memorized)).toEqual(moved[1]);
  });

  it('deleting a day keeps the carried pages on today', () => {
    const shown = scheduledDaysFrom(shifted, memorized, today, 4);
    const saved = save(shifted, removeDay(shown, 2));
    expect(saved.customPlan?.days).toHaveLength(3);
    expect(getPagesForDay(saved, today, memorized).slice(0, 2)).toEqual([2, 3]);
  });
});

describe('the plan on another device', () => {
  it('arrives as saved, rest days and all, and is read on that device’s dates', () => {
    const saved = save(baseUser, moveDay(draft, 3, 1)); // [[1,2,3],[7,8,9],[4,5,6],[]]
    const stored = JSON.parse(JSON.stringify(customPlanToFirestore(saved.customPlan)));
    const other: User = { ...baseUser, customPlan: customPlanFromFirestore(stored) };
    expect(other.customPlan).toEqual(saved.customPlan);
    // Two days later the other device is on the third date of the cycle.
    expect(getPagesForDay(other, day(2), memorized)).toEqual([4, 5, 6]);
    expect(getPagesForDay(other, day(3), memorized)).toEqual([]);
    // Its editor opens with that date first.
    expect(rotateCustomPlanToToday(other.customPlan!, day(2))).toEqual([[4, 5, 6], [], [1, 2, 3], [7, 8, 9]]);
  });

  it('a deleted day is gone there too', () => {
    const saved = save(baseUser, removeDay(draft, 2));
    const other = customPlanFromFirestore(customPlanToFirestore(saved.customPlan));
    expect(other?.days).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
  });
});

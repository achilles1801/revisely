// Catch-up credit (SESS-7): a carried page is credited to the day it was missed; today is done by
// its own pages; the catch-up never counts toward today's completion.
import { applyCarryOver, catchUpDayOf, findLeftovers, ownPagesOf } from '../../../src/lib/carryOver';
import { creditedOnDay, creditIndex, sessionCredit } from '../../../src/lib/aheadCredit';
import { completedDays } from '../../../src/lib/streak';
import type { RevisionLog, User, UserPage } from '../../../src/types';

const base = {
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
} as unknown as User;

const memorizedPages: UserPage[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((pageNumber) => ({
  pageNumber,
  status: 'memorized',
  dateMemorized: '2025-01-01',
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
} as unknown as UserPage));
const memorized = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

const D = '2026-10-10'; // missed day: scheduled 1, 2, 3
const T = '2026-10-11'; // today: own pages 4, 5, 6 (add mode) or 7, 8, 9 (shift mode, leftovers stand in for 1–3)
const scheduledOn = (day: string) => (day === D ? [1, 2, 3] : day === T ? [4, 5, 6] : []);

const log = (date: string, p: Partial<RevisionLog>): RevisionLog =>
  ({ id: date, date, assignedPages: [], pagesRevised: [], pagesSkipped: [], weaknessUpdates: [], durationMinutes: null, ...p } as RevisionLog);

/** The session's page → day map, as the session screen builds it: own pages to today, catch-ups to their day. */
function pageDaysFor(user: User, sessionDay: string, own: number[]) {
  const days = new Map<number, string>();
  for (const p of own) days.set(p, sessionDay);
  for (const p of user.carryOver?.pages ?? []) {
    const d = catchUpDayOf(user, sessionDay, p);
    if (d) days.set(p, d);
  }
  return days;
}

describe('catch-up credit (SESS-7)', () => {
  it('[SESS-7] add mode: a catch-up is credited to its missed day, not to today; today is done by its own pages', () => {
    const leftovers = findLeftovers([], T, [4, 5, 6], memorized, 3, scheduledOn);
    expect(leftovers.pages).toEqual([1, 2, 3]);
    expect(leftovers.from).toEqual({ '1': D, '2': D, '3': D });
    const user = applyCarryOver({ ...base, carryOverMode: 'add' }, memorizedPages, leftovers.pages, new Date(2026, 9, 11), leftovers.from);
    // Revise everything: own pages and the catch-up.
    const credit = sessionCredit([4, 5, 6, 1, 2, 3], pageDaysFor(user, T, [4, 5, 6]), T);
    expect(credit.pagesRevised).toEqual([4, 5, 6]);
    expect(credit.ahead).toEqual({ [D]: [1, 2, 3] });
    const logs = [log(T, { assignedPages: ownPagesOf([4, 5, 6, 1, 2, 3], user, T), ...credit })];
    expect([...creditedOnDay(logs, T)].sort()).toEqual([4, 5, 6]);
    expect([...creditedOnDay(logs, D)].sort()).toEqual([1, 2, 3]);
  });

  it('[SESS-7] shift mode: today is done with its own pages while the catch-up is still pending', () => {
    // The shift: the carried pages 1–3 stand in for the first 3 scheduled pages of today, which move back.
    const scheduledToday = [4, 5, 6, 7, 8, 9];
    const user = applyCarryOver({ ...base, carryOverMode: 'shift' }, memorizedPages, [1, 2, 3], new Date(2026, 9, 11), {
      '1': D,
      '2': D,
      '3': D,
    });
    expect(user.carryOver?.skip).toBeGreaterThan(0);
    const assignment = [1, 2, 3, ...scheduledToday.slice(user.carryOver?.skip ?? 0)];
    const own = ownPagesOf(assignment, user, T);
    expect(own).not.toContain(1);
    // Today's own pages revised, the catch-up pages not yet.
    const credit = sessionCredit(own, pageDaysFor(user, T, own), T);
    const logs = [log(T, { assignedPages: own, ...credit })];
    const credited = creditedOnDay(logs, T);
    expect(own.every((p) => credited.has(p))).toBe(true); // today is done
    expect(creditedOnDay(logs, D).size).toBe(0); // the catch-up is not done
  });

  it('[SESS-7] partial miss restored: the missed day counts only once all its pages are credited to it', () => {
    const missedScheduled = (day: string) => (day === D ? [1, 2, 3] : day === T ? [4, 5] : []);
    const base1 = [log('2026-10-08', { assignedPages: [1, 2], pagesRevised: [1, 2] })];
    // Today's catch-up revises 1 and 2 only: the missed day is still short of page 3.
    const partial = [...base1, log(T, { assignedPages: [4, 5], pagesRevised: [4, 5], ahead: { [D]: [1, 2] } })];
    expect(completedDays(creditIndex(partial), missedScheduled).has(D)).toBe(false);
    // Page 3 is revised as catch-up later the same day: the missed day is now done.
    const restored = [...base1, log(T, { assignedPages: [4, 5], pagesRevised: [4, 5], ahead: { [D]: [1, 2, 3] } })];
    expect(completedDays(creditIndex(restored), missedScheduled).has(D)).toBe(true);
  });

  it('[SESS-7] Fajr after midnight: the session keeps the day it opened on, and the catch-up goes to its missed day', () => {
    // The session opened on T; the calendar has moved on past midnight (and maybe Fajr). Its credit uses T.
    const credit = sessionCredit([4, 1], new Map([[4, T], [1, D]]), T);
    expect(credit).toEqual({ pagesRevised: [4], ahead: { [D]: [1] } });
    expect(catchUpDayOf({ ...base, carryOver: { day: T, pages: [1], from: { '1': D } } } as User, T, 1)).toBe(D);
  });

  it('[SESS-7] a catch-up page is only credited away from today when the carry is for today', () => {
    expect(catchUpDayOf({ ...base, carryOver: null } as User, T, 1)).toBeNull();
    expect(catchUpDayOf({ ...base, carryOver: { day: '2026-10-12', pages: [1], from: { '1': D } } } as User, T, 1)).toBeNull();
  });
});

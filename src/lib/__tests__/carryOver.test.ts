import {
  applyCarryOver,
  duePagesOf,
  findLeftoverPages,
  planDuePages,
  findLeftovers,
  hasCarriedOver,
  insightsPagesOn,
  leftoversFor,
  settleCarryOverForNewPlan,
} from '../carryOver';
import { generateDailyAssignment, scheduledDaysFrom } from '../algorithm';
import type { RevisionLog, User, UserPage } from '../../types';

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

const memorized: UserPage[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((pageNumber) => ({
  pageNumber,
  status: 'memorized',
  dateMemorized: '2025-01-01',
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
}));
const memorizedSet = new Set(memorized.map((p) => p.pageNumber));

function log(date: string, assignedPages: number[], pagesRevised: number[]): RevisionLog {
  return {
    id: `${date}-${pagesRevised.join('.')}`,
    date,
    assignedPages,
    pagesRevised,
    pagesSkipped: [],
    weaknessUpdates: [],
    durationMinutes: 5,
  };
}

const TODAY = '2026-10-17';
const today = new Date(2026, 9, 17);

describe('findLeftoverPages', () => {
  it('returns yesterday’s assigned pages that were not revised', () => {
    const logs = [log('2026-10-16', [1, 2, 3], [1])];
    expect(findLeftoverPages(logs, TODAY, [4, 5, 6], memorizedSet)).toEqual([2, 3]);
  });

  it('merges several sessions on the same day', () => {
    const logs = [log('2026-10-16', [1, 2, 3], [1]), log('2026-10-16', [1, 2, 3], [3])];
    expect(findLeftoverPages(logs, TODAY, [4, 5, 6], memorizedSet)).toEqual([2]);
  });

  it('skips pages already revised today or already in today’s session', () => {
    const logs = [log('2026-10-16', [1, 2, 3], [1]), log(TODAY, [4, 5, 6], [2])];
    expect(findLeftoverPages(logs, TODAY, [3, 4, 5], memorizedSet)).toEqual([]);
  });

  it('ignores days before the lookback', () => {
    // Four days before TODAY: outside the three-day lookback.
    const logs = [log('2026-10-13', [1, 2, 3], [1])];
    expect(findLeftoverPages(logs, TODAY, [], memorizedSet)).toEqual([]);
    expect(findLeftoverPages(logs, TODAY, [], memorizedSet, 4)).toEqual([2, 3]);
  });

  it('a day with no session gives nothing when there is no schedule for it', () => {
    expect(findLeftoverPages([], TODAY, [], memorizedSet)).toEqual([]);
  });

  it('drops pages that are no longer memorized', () => {
    const logs = [log('2026-10-16', [1, 2, 3], [1])];
    expect(findLeftoverPages(logs, TODAY, [], new Set([1, 2]))).toEqual([2]);
  });
});

describe('findLeftovers: a day missed entirely', () => {
  // The schedule gives each day its pages (scheduledOn); a day with a log uses the log's.
  // TODAY is Oct 17, so Oct 14 is three days back, Oct 16 yesterday.
  const scheduled: Record<string, number[]> = {
    '2026-10-14': [7, 8],
    '2026-10-15': [1, 2, 3],
    '2026-10-16': [4, 5, 6],
  };
  const scheduledOn = (d: string) => scheduled[d] ?? [];

  it('offers a missed day in full, from the schedule, and says it was missed', () => {
    const got = findLeftovers([], TODAY, [], memorizedSet, 3, scheduledOn);
    expect(got.pages).toEqual([7, 8, 1, 2, 3, 4, 5, 6]);
    expect(got.days).toEqual([
      { day: '2026-10-14', ago: 3, missed: true },
      { day: '2026-10-15', ago: 2, missed: true },
      { day: '2026-10-16', ago: 1, missed: true },
    ]);
  });

  it('leaves out pages already in today’s session', () => {
    const got = findLeftovers([], TODAY, [7, 8, 9], memorizedSet, 3, scheduledOn);
    expect(got.pages).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('a partly revised day offers only what is left, and is not called missed', () => {
    const logs = [log('2026-10-15', [1, 2, 3], [1])];
    const got = findLeftovers(logs, TODAY, [], memorizedSet, 3, scheduledOn);
    expect(got.pages).toEqual([7, 8, 2, 3, 4, 5, 6]);
    expect(got.days).toEqual([
      { day: '2026-10-14', ago: 3, missed: true },
      { day: '2026-10-15', ago: 2, missed: false },
      { day: '2026-10-16', ago: 1, missed: true },
    ]);
  });

  it('a page revised after its scheduled day is not offered from that day', () => {
    // Oct 14 revised page 1, which the schedule had on Oct 15 (missed). It was
    // revised since, so it is not left over.
    const logs = [log('2026-10-14', [], [1])];
    const got = findLeftovers(logs, TODAY, [], memorizedSet, 3, scheduledOn);
    expect(got.pages).not.toContain(1);
    expect(got.pages).toEqual([7, 8, 2, 3, 4, 5, 6]);
  });

  it('a page revised today is not offered from an earlier day', () => {
    const logs = [log(TODAY, [5], [5])];
    const got = findLeftovers(logs, TODAY, [], memorizedSet, 3, scheduledOn);
    expect(got.pages).toEqual([7, 8, 1, 2, 3, 4, 6]);
  });

  it('a day with nothing scheduled (an off day) gives no days', () => {
    const got = findLeftovers([], TODAY, [], memorizedSet, 1, () => []);
    expect(got).toEqual({ pages: [], from: {}, days: [] });
  });
});

const day = (d: number) => new Date(2026, 9, d);
const pagesOn = (user: User, d: number) => generateDailyAssignment(memorized, [], user, day(d)).pages;

describe('applyCarryOver', () => {
  const plan = {
    days: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
    cycleStartDate: '2026-10-15', // Oct 16 = [4,5,6], Oct 17 = [7,8,9]
    direction: 'forward' as const,
  };

  it('keep daily amount: leftovers first, the end of today moves to tomorrow, the plan flows on', () => {
    const user = { ...baseUser, customPlan: plan };
    const next = applyCarryOver(user, memorized, [5, 6], today);
    expect(pagesOn(next, 17)).toEqual([5, 6, 7]);
    expect(pagesOn(next, 18)).toEqual([8, 9, 1]);
    expect(pagesOn(next, 19)).toEqual([2, 3, 4]);
    // The plan itself is untouched: same days, same start.
    expect(next.customPlan).toBe(plan);
    expect(next.scheduleShiftPages).toBe(2);
  });

  it('keeps an automatic schedule automatic', () => {
    const user = { ...baseUser, scheduleAnchorDate: new Date(2026, 9, 16, 12).toISOString() }; // Oct 16 = [1,2,3]
    expect(pagesOn(user, 17)).toEqual([4, 5, 6]);
    const next = applyCarryOver(user, memorized, [2, 3], today);
    expect(next.customPlan).toBeNull();
    expect(pagesOn(next, 17)).toEqual([2, 3, 4]);
    expect(pagesOn(next, 18)).toEqual([5, 6, 7]);
  });

  it('drops pages revised yesterday when the leftovers are scattered', () => {
    const user = { ...baseUser, customPlan: plan };
    // Oct 16 = [4,5,6] and only 5 was revised.
    const next = applyCarryOver(user, memorized, [4, 6], today);
    expect(pagesOn(next, 17)).toEqual([4, 6, 7]);
    expect(pagesOn(next, 18)).toEqual([8, 9, 1]);
  });

  it('with more leftovers than today holds, today is all leftovers and today’s plan moves whole', () => {
    const big = { days: [[1, 2, 3, 4, 5], [6, 7], [8, 9]], cycleStartDate: '2026-10-16', direction: 'forward' as const };
    const user = { ...baseUser, customPlan: big };
    const next = applyCarryOver(user, memorized, [2, 3, 4, 5], today);
    expect(pagesOn(next, 17)).toEqual([2, 3, 4, 5]);
    expect(pagesOn(next, 18)).toEqual([6, 7]);
    // Carried once: the button's leftovers are gone and a second apply is a no-op.
    expect(hasCarriedOver(next, TODAY)).toBe(true);
    expect(applyCarryOver(next, memorized, [2, 3], today)).toBe(next);
  });

  it('on an off day the leftovers become today and nothing shifts', () => {
    const withOff = { days: [[1, 2, 3], [], [4, 5, 6]], cycleStartDate: '2026-10-16', direction: 'forward' as const };
    const user = { ...baseUser, customPlan: withOff };
    const next = applyCarryOver(user, memorized, [2, 3], today);
    expect(pagesOn(next, 17)).toEqual([2, 3]);
    expect(pagesOn(next, 18)).toEqual([4, 5, 6]);
    expect(next.scheduleShiftPages ?? 0).toBe(0);
  });

  it('add on top: today gets the leftovers plus its own pages, nothing else moves', () => {
    const user: User = { ...baseUser, customPlan: plan, carryOverMode: 'add' };
    const next = applyCarryOver(user, memorized, [5, 6], today);
    expect(pagesOn(next, 17)).toEqual([5, 6, 7, 8, 9]);
    expect(pagesOn(next, 18)).toEqual([1, 2, 3]);
  });

  it('does not show a carried page that is no longer memorized', () => {
    const user: User = { ...baseUser, customPlan: plan, carryOverMode: 'add' };
    const next = applyCarryOver(user, memorized, [5, 6], today);
    const without5 = memorized.filter((p) => p.pageNumber !== 5);
    expect(generateDailyAssignment(without5, [], next, today).pages).toEqual([6, 7, 8, 9]);
  });

  it('leaves the plan’s start untouched (the shift is a page offset, not a date)', () => {
    const user = { ...baseUser, customPlan: plan };
    const next = applyCarryOver(user, memorized, [5, 6], today);
    expect(pagesOn(next, 18)).toEqual([8, 9, 1]);
    expect(next.customPlan?.cycleStartDate).toBe('2026-10-15');
  });

  it('saving the plan in the editor keeps today as it is and folds the shift into the plan', () => {
    const user = { ...baseUser, customPlan: plan };
    const shifted = applyCarryOver(user, memorized, [5, 6], today);
    const shown = scheduledDaysFrom(shifted, memorized, today, 3);
    expect(shown).toEqual([[5, 6, 7], [8, 9, 1], [2, 3, 4]]);
    const saved: User = {
      ...settleCarryOverForNewPlan(shifted),
      customPlan: { days: shown, cycleStartDate: TODAY, direction: 'forward' },
    };
    expect(saved.scheduleShiftPages).toBe(0);
    expect(pagesOn(saved, 17)).toEqual([5, 6, 7]);
    expect(pagesOn(saved, 18)).toEqual([8, 9, 1]);
  });
});

describe('tomorrow’s pages beside today’s carry (carryOver.next)', () => {
  const tomorrow = '2026-10-18';
  const withNext: User = {
    ...baseUser,
    carryOver: { day: TODAY, pages: [1], skip: 0, next: { day: tomorrow, pages: [9], source: 'insights' } },
  };

  it('today reads today’s carry, tomorrow reads the one held beside it', () => {
    expect(generateDailyAssignment(memorized, [], withNext, today).pages[0]).toBe(1);
    expect(generateDailyAssignment(memorized, [], withNext, new Date(2026, 9, 18)).pages[0]).toBe(9);
    expect(hasCarriedOver(withNext, TODAY)).toBe(true);
    // Tomorrow holds pages from Insights alone: not a carry-over, so its catch-up is still offered (ACT-24).
    expect(hasCarriedOver(withNext, tomorrow)).toBe(false);
    expect(hasCarriedOver(withNext, '2026-10-19')).toBe(false);
  });

  it('Add to today keeps the pages already put on tomorrow', () => {
    const insightsFirst: User = { ...baseUser, carryOver: { day: tomorrow, pages: [9], skip: 0, source: 'insights' } };
    for (const carryOverMode of ['shift', 'add'] as const) {
      const after = applyCarryOver({ ...insightsFirst, carryOverMode }, memorized, [4], today);
      expect(after.carryOver?.day).toBe(TODAY);
      expect(after.carryOver?.pages).toEqual([4]);
      expect(after.carryOver?.next).toEqual({ day: tomorrow, pages: [9], source: 'insights' });
    }
  });
});

// The day the pages from Insights are due, the leftovers of the days before weren't offered and Add to
// today did nothing: they made a carry-over for the day (Nov 8 2026). They never stop it now (ACT-24).
describe('[ACT-24] [CARRY-1] leftovers beside the pages from Insights', () => {
  const big = { days: [[1, 2, 3], [4, 5], [6, 7], [8, 9]], cycleStartDate: '2026-10-16', direction: 'forward' as const };
  const insightsToday: User = { ...baseUser, customPlan: big, carryOver: { day: TODAY, pages: [9], skip: 0, source: 'insights' } };
  const pagesOf = (user: User) => generateDailyAssignment(memorized, [], user, today).pages;
  const from = { '3': '2026-10-16' };

  it('pages from Insights alone are not a carry-over: the catch-up is still offered', () => {
    expect(hasCarriedOver(insightsToday, TODAY)).toBe(false);
    const logs = [log('2026-10-16', [1, 2, 3], [1, 2])];
    expect(leftoversFor(insightsToday, logs, TODAY, pagesOf(insightsToday), memorized).pages).toContain(3);
  });

  it('Add to today puts the leftovers after them, each with its day; the pages from Insights stay labelled', () => {
    for (const carryOverMode of ['shift', 'add'] as const) {
      const user = applyCarryOver({ ...insightsToday, carryOverMode }, memorized, [3], today, from);
      expect(user.carryOver).toMatchObject({ day: TODAY, pages: [9, 3], source: 'insights', from });
      expect(pagesOf(user).slice(0, 2)).toEqual([9, 3]);
      expect([...insightsPagesOn(user, TODAY)]).toEqual([9]);
      // Once a day: the catch-up isn't offered again.
      expect(hasCarriedOver(user, TODAY)).toBe(true);
    }
  });

  it('Keep daily amount, the leftovers filling the day: they finish it, the pages from Insights stay extra', () => {
    const user = applyCarryOver(insightsToday, memorized, [2, 3], today, { '2': '2026-10-16', '3': '2026-10-16' });
    expect(pagesOf(user)).toEqual([9, 2, 3]);
    expect(duePagesOf(pagesOf(user), user, TODAY)).toEqual([2, 3]);
  });

  it('pages from Insights for tomorrow stay beside them', () => {
    const both: User = { ...insightsToday, carryOver: { ...insightsToday.carryOver!, next: { day: '2026-10-18', pages: [8], source: 'insights' } } };
    const user = applyCarryOver(both, memorized, [3], today, from);
    expect(user.carryOver?.pages).toEqual([9, 3]);
    expect(user.carryOver?.next).toEqual({ day: '2026-10-18', pages: [8], source: 'insights' });
  });

  it('a page put first that the day has anyway is still its own (Nov 8 2026: none was, and the day was never done)', () => {
    // Oct 18 = [6, 7]; Insights put [9, 6, 7] first.
    const user: User = { ...baseUser, customPlan: big, carryOver: { day: '2026-10-18', pages: [9, 6, 7], skip: 0, source: 'insights' } };
    const oct18 = generateDailyAssignment(memorized, [], user, new Date(2026, 9, 18)).pages;
    expect(oct18).toEqual([9, 6, 7]);
    expect(duePagesOf(oct18, user, '2026-10-18', memorized)).toEqual([6, 7]);
    expect(planDuePages(user, '2026-10-18', memorized)).toEqual([6, 7]);
  });

  it('pages from Insights held beside yesterday’s carry (its next) join today’s', () => {
    const held: User = { ...baseUser, customPlan: big, carryOver: { day: '2026-10-16', pages: [1], skip: 0, next: { day: TODAY, pages: [9], source: 'insights' } } };
    const user = applyCarryOver(held, memorized, [3], today, from);
    expect(user.carryOver).toMatchObject({ day: TODAY, pages: [9, 3], source: 'insights', from });
  });
});

// D1 (Majd, Nov 7 2026): with Keep daily amount, today is the missed pages alone when they fill it,
// and finishing them finishes today. Its own pages are the next day's (revised ahead, AHEAD-2).
describe('[SESS-7] [CARRY-2] the pages that finish a day (duePagesOf)', () => {
  const big = { days: [[1, 2, 3], [4, 5], [6, 7], [8, 9]], cycleStartDate: '2026-10-16', direction: 'forward' as const };
  const pagesOf = (user: User) => generateDailyAssignment(memorized, [], user, today).pages;

  // Oct 16 = [1, 2, 3], today (Oct 17) = [4, 5], Oct 18 = [6, 7].
  it('a day with its own pages left is finished by them, not by the carried pages', () => {
    const user = applyCarryOver({ ...baseUser, customPlan: big }, memorized, [3], today);
    expect(pagesOf(user)).toEqual([3, 4]);
    expect(duePagesOf(pagesOf(user), user, TODAY)).toEqual([4]);
  });

  it('Keep daily amount with as many leftovers as the day holds or more: the carried pages finish it', () => {
    for (const leftovers of [[2, 3], [1, 2, 3]]) {
      const user = applyCarryOver({ ...baseUser, customPlan: big }, memorized, leftovers, today);
      expect(pagesOf(user)).toEqual(leftovers);
      expect(duePagesOf(pagesOf(user), user, TODAY)).toEqual(leftovers);
      // Its own pages (4, 5) are tomorrow's.
      expect(pagesOn(user, 18)).toEqual([4, 5]);
    }
  });

  it('an off day given leftovers moved nothing: no pages of its own are due', () => {
    const withOff = { days: [[1, 2, 3], [], [4, 5, 6]], cycleStartDate: '2026-10-16', direction: 'forward' as const };
    const user = applyCarryOver({ ...baseUser, customPlan: withOff }, memorized, [2, 3], today);
    expect(duePagesOf(pagesOf(user), user, TODAY)).toEqual([]);
  });

  it('Add (on top) keeps the day’s own pages due', () => {
    const user = applyCarryOver({ ...baseUser, customPlan: big, carryOverMode: 'add' }, memorized, [2, 3], today);
    expect(duePagesOf(pagesOf(user), user, TODAY)).toEqual([4, 5]);
  });

  it('[SESS-6] a missed day with no session is read from the carry that took its pages, not the moved plan', () => {
    // Oct 16 ([1, 2, 3]) missed entirely; Add to today fills Oct 17 with them and moves the plan.
    const user = applyCarryOver({ ...baseUser, customPlan: big }, memorized, [1, 2, 3], today, { '1': '2026-10-16', '2': '2026-10-16', '3': '2026-10-16' });
    expect(planDuePages(user, '2026-10-16', memorized)).toEqual([1, 2, 3]);
    // The moved plan would have given Oct 16 other pages.
    expect(pagesOn(user, 16)).not.toEqual([1, 2, 3]);
    // Today and later days are read from the plan.
    expect(planDuePages(user, TODAY, memorized)).toEqual([1, 2, 3]);
    expect(planDuePages(user, '2026-10-18', memorized)).toEqual([4, 5]);
  });

  it('[CARRY-1] carried pages revised on the day they filled are not offered again the next day', () => {
    // Oct 17 was filled with Oct 16's pages 4 and 5 (credited to Oct 16) and revised them.
    const filled: RevisionLog = { ...log(TODAY, [4, 5], []), ahead: { '2026-10-16': [4, 5] } };
    expect(findLeftoverPages([filled], '2026-10-18', [6, 7], memorizedSet)).toEqual([]);
  });
});

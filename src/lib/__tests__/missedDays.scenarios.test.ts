// Missed revision days, end to end: what Home offers, what "Add to today" does,
// and what the days after see. The plan: 20 memorized pages, 5 a day, starting
// Sunday 1 Nov 2026, so Nov 1 is 1–5, Nov 2 is 6–10, Nov 3 is 11–15, Nov 4 is
// 16–20, and Nov 5 is 1–5 again.

import { applyCarryOver, leftoversFor } from '../carryOver';
import { getPagesForDay } from '../algorithm';
import { catchUpLine } from '../todayLines';
import { plainText } from '../passages';
import { getRevisionDayForUser } from '../fajrBoundary';
import type { RevisionLog, User, UserPage } from '../../types';

const NBSP = ' ';

const baseUser: User = {
  id: 'u1',
  createdAt: '2026-10-01T12:00:00',
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
  scheduleAnchorDate: '2026-11-01T12:00:00',
};

const memorizedPages: UserPage[] = Array.from({ length: 20 }, (_, i) => ({
  pageNumber: i + 1,
  status: 'memorized',
  dateMemorized: '2025-01-01',
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
}));

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** The schedule's pages for a revision day, read on its calendar date. */
function pagesFor(user: User, day: string): number[] {
  const [y, m, d] = day.split('-').map(Number);
  return getPagesForDay(user, new Date(y, m - 1, d), memorizedPages);
}

function session(date: string, assigned: number[], revised: number[]): RevisionLog {
  return {
    id: `${date}-${revised.join('.')}`,
    date,
    assignedPages: assigned,
    pagesRevised: revised,
    pagesSkipped: [],
    weaknessUpdates: [],
    durationMinutes: 5,
  };
}

describe('the schedule these scenarios use', () => {
  it('gives each day its five pages, in order', () => {
    expect(pagesFor(baseUser, '2026-11-01')).toEqual(range(1, 5));
    expect(pagesFor(baseUser, '2026-11-02')).toEqual(range(6, 10));
    expect(pagesFor(baseUser, '2026-11-03')).toEqual(range(11, 15));
    expect(pagesFor(baseUser, '2026-11-04')).toEqual(range(16, 20));
    expect(pagesFor(baseUser, '2026-11-05')).toEqual(range(1, 5));
  });
});

describe('missed one day (yesterday, no session)', () => {
  const today = '2026-11-04';
  const logs = [
    session('2026-11-01', range(1, 5), range(1, 5)),
    session('2026-11-02', range(6, 10), range(6, 10)),
  ];
  const todaysPages = pagesFor(baseUser, today);

  it('offers yesterday’s five pages, and says it was missed', () => {
    const got = leftoversFor(baseUser, logs, today, todaysPages, memorizedPages);
    expect(got.pages).toEqual(range(11, 15));
    expect(got.days).toEqual([{ day: '2026-11-03', ago: 1, missed: true }]);
    expect(plainText(catchUpLine(got)!.title)).toBe('Missed yesterday · Revise Al-Baqarah 70–101');
  });

  it('shift: catching up puts the missed pages today, and today’s pages move to tomorrow', () => {
    const got = leftoversFor(baseUser, logs, today, todaysPages, memorizedPages);
    const next = applyCarryOver(baseUser, memorizedPages, got.pages, new Date(2026, 10, 4));
    expect(pagesFor(next, today)).toEqual(range(11, 15));
    expect(pagesFor(next, '2026-11-05')).toEqual(range(16, 20));
  });

  it('add: the missed pages go on top of today’s, and nothing else moves', () => {
    const add = { ...baseUser, carryOverMode: 'add' as const };
    const got = leftoversFor(add, logs, today, todaysPages, memorizedPages);
    const next = applyCarryOver(add, memorizedPages, got.pages, new Date(2026, 10, 4));
    expect(pagesFor(next, today)).toEqual([...range(11, 15), ...range(16, 20)]);
    expect(pagesFor(next, '2026-11-05')).toEqual(range(1, 5));
  });

  it('once the missed pages are added, nothing is offered again today', () => {
    const next = applyCarryOver(baseUser, memorizedPages, range(11, 15), new Date(2026, 10, 4));
    const again = leftoversFor(next, logs, today, pagesFor(next, today), memorizedPages);
    expect(again.pages).toEqual([]);
    expect(catchUpLine(again)).toBeNull();
  });
});

describe('missed three days', () => {
  // Nov 2, 3 and 4 had no session; Nov 5 is today (its own pages are 1–5).
  const today = '2026-11-05';
  const logs = [session('2026-11-01', range(1, 5), range(1, 5))];
  const todaysPages = pagesFor(baseUser, today);

  it('offers all three days, in one line', () => {
    const got = leftoversFor(baseUser, logs, today, todaysPages, memorizedPages);
    expect(got.pages).toEqual(range(6, 20));
    expect(got.days.map((d) => d.ago)).toEqual([3, 2, 1]);
    expect(got.days.every((d) => d.missed)).toBe(true);
    expect(plainText(catchUpLine(got)!.title)).toBe('Missed 3 days · Revise Al-Baqarah 30–134');
  });

  it('shift: the catch-up is today; today’s own pages move to the day after', () => {
    const got = leftoversFor(baseUser, logs, today, todaysPages, memorizedPages);
    const next = applyCarryOver(baseUser, memorizedPages, got.pages, new Date(2026, 10, 5));
    expect(pagesFor(next, today)).toEqual(range(6, 20));
    expect(pagesFor(next, '2026-11-06')).toEqual(range(1, 5));
  });

  it('add: the catch-up and today’s pages both happen today', () => {
    const add = { ...baseUser, carryOverMode: 'add' as const };
    const got = leftoversFor(add, logs, today, todaysPages, memorizedPages);
    const next = applyCarryOver(add, memorizedPages, got.pages, new Date(2026, 10, 5));
    expect(pagesFor(next, today)).toEqual([...range(6, 20), ...range(1, 5)]);
  });
});

describe('a partly done day', () => {
  // Nov 3 had 11–15; only 11 and 12 were revised. The rest is still to do.
  const today = '2026-11-04';
  const logs = [
    session('2026-11-01', range(1, 5), range(1, 5)),
    session('2026-11-02', range(6, 10), range(6, 10)),
    session('2026-11-03', range(11, 15), [11, 12]),
  ];

  it('offers the rest of that day, and says it was left, not missed', () => {
    const got = leftoversFor(baseUser, logs, today, pagesFor(baseUser, today), memorizedPages);
    expect(got.pages).toEqual([13, 14, 15]);
    expect(got.days).toEqual([{ day: '2026-11-03', ago: 1, missed: false }]);
    expect(plainText(catchUpLine(got)!.title)).toBe('Left yesterday · Revise Al-Baqarah 84–101');
  });
});

describe('a day revised ahead is done, not missed', () => {
  // Nov 2’s session revised its own pages and also Nov 3’s 11–15 ahead, so Nov 3
  // had no session of its own and is done: nothing from it is offered.
  const today = '2026-11-04';
  const ahead = { ...session('2026-11-02', range(6, 10), range(6, 10)), ahead: { '2026-11-03': range(11, 15) } };
  const logs = [session('2026-11-01', range(1, 5), range(1, 5)), ahead];

  it('offers nothing from a day whose pages were all revised ahead', () => {
    const got = leftoversFor(baseUser, logs, today, pagesFor(baseUser, today), memorizedPages);
    expect(got).toEqual({ pages: [], from: {}, days: [] });
  });
});

describe('Fajr after midnight', () => {
  // Fajr in New York is about 05:50 on 4 Nov. Before it the revision day is still
  // Nov 3, so "yesterday" is Nov 2 and Nov 4’s pages are not yet today’s.
  const fajrUser: User = {
    ...baseUser,
    fajrBoundaryEnabled: true,
    locationCoords: { latitude: 40.7128, longitude: -74.006 },
  };
  const logs = [session('2026-11-01', range(1, 5), range(1, 5))];

  it('at 00:30 the revision day is still the day before, and its missed day is the one before that', () => {
    const revisionDay = getRevisionDayForUser(fajrUser, new Date(2026, 10, 4, 0, 30));
    expect(revisionDay).toBe('2026-11-03');
    const got = leftoversFor(fajrUser, logs, revisionDay, pagesFor(fajrUser, revisionDay), memorizedPages);
    expect(got.pages).toEqual(range(6, 10));
    expect(got.days).toEqual([{ day: '2026-11-02', ago: 1, missed: true }]);
    expect(plainText(catchUpLine(got)!.title)).toBe('Missed yesterday · Revise Al-Baqarah 30–69');
  });

  it('at noon the revision day is Nov 4, and yesterday is Nov 3', () => {
    const revisionDay = getRevisionDayForUser(fajrUser, new Date(2026, 10, 4, 12, 0));
    expect(revisionDay).toBe('2026-11-04');
    const got = leftoversFor(fajrUser, logs, revisionDay, pagesFor(fajrUser, revisionDay), memorizedPages);
    // Oldest day first.
    expect(got.days).toEqual([
      { day: '2026-11-02', ago: 2, missed: true },
      { day: '2026-11-03', ago: 1, missed: true },
    ]);
    expect(got.pages).toEqual(range(6, 15));
  });
});

describe('a day before the last carry-over', () => {
  // Nov 4 carried 11–15 (the shift moves the whole schedule back 5 pages), and
  // nothing was revised. On Nov 5 the schedule for Nov 3 is shifted too (6–10),
  // so Nov 3 must not be read from it: only Nov 4 is offered.
  const carried = applyCarryOver(baseUser, memorizedPages, range(11, 15), new Date(2026, 10, 4));
  const today = '2026-11-05';
  const logs = [session('2026-11-01', range(1, 5), range(1, 5))];

  it('offers the carried day, and nothing from before it', () => {
    const got = leftoversFor(carried, logs, today, pagesFor(carried, today), memorizedPages);
    expect(got.pages).toEqual(range(11, 15));
    expect(got.days).toEqual([{ day: '2026-11-04', ago: 1, missed: true }]);
    expect(plainText(catchUpLine(got)!.title)).toBe('Missed yesterday · Revise Al-Baqarah 70–101');
  });
});

describe('before the plan started', () => {
  it('a day before the plan’s start is not missed', () => {
    const late: User = { ...baseUser, scheduleAnchorDate: '2026-11-04T12:00:00' };
    const got = leftoversFor(late, [], '2026-11-04', pagesFor(late, '2026-11-04'), memorizedPages);
    expect(got).toEqual({ pages: [], from: {}, days: [] });
    expect(catchUpLine(got)).toBeNull();
  });
});

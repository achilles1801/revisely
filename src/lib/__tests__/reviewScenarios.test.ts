// Review session and "Tomorrow starts at" (Majd, Nov 4 2026). Five pages a day,
// memorized pages 1–20: a four-day cycle, Tue 3 Nov = 6–10, Wed 4 Nov = 11–15,
// Thu 5 Nov = 16–20.
//   • Review session = exactly the pages marked done on the revision day: its own
//     pages plus the pages revised ahead for later days. Nothing unrevised.
//   • "Tomorrow starts at" continues from the first page of the next day NOT yet
//     done (a partly done day keeps its remaining pages); a fully done day is
//     passed over, so the next one after it is offered.

import { nextRevisionDayPlan, revisionDayPlan } from '../aheadPlan';
import { doneOnDay, reviewedOn } from '../aheadCredit';
import { todayLines } from '../todayLines';
import { getRevisionDayForUser, getFajrTimeFor } from '../fajrBoundary';
import type { RevisionLog, User, UserPage } from '../../types';

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const baseUser: User = {
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
  // Local midnight of Mon 2 Nov: day 0 of the cycle is Mon 2 Nov.
  scheduleAnchorDate: new Date(2026, 10, 2).toISOString(),
};

const pages: UserPage[] = range(1, 20).map((pageNumber) => ({
  pageNumber,
  status: 'memorized',
  dateMemorized: '2025-01-01',
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
}));

const TUE = '2026-11-03';
const WED = '2026-11-04';
const THU = '2026-11-05';
const TODAY = range(6, 10); // Tuesday's own five pages

/**
 * Tuesday's session as the app writes it: `pagesRevised` holds every page the
 * session revised, its own and the ones revised ahead, and `ahead` says which
 * later day each ahead page is credited to.
 */
function tuesdaySession(ahead: Record<string, number[]> = {}): RevisionLog[] {
  const aheadPages = Object.values(ahead).flat();
  return [
    {
      id: 'tue',
      date: TUE,
      assignedPages: TODAY,
      pagesRevised: [...TODAY, ...aheadPages],
      pagesSkipped: [],
      weaknessUpdates: [],
      durationMinutes: 20,
      ahead,
    } as unknown as RevisionLog,
  ];
}

describe('review session: exactly the pages marked done that day', () => {
  it('5 + 0: the five pages of the day', () => {
    const logs = tuesdaySession();
    expect([...reviewedOn(logs, TUE)].sort((a, b) => a - b)).toEqual(TODAY);
    expect(doneOnDay(logs, TUE).size).toBe(5);
  });

  it('5 + 2 (partial ahead day): the five and the two ahead, seven in all', () => {
    const logs = tuesdaySession({ [WED]: [11, 12] });
    expect([...reviewedOn(logs, TUE)].sort((a, b) => a - b)).toEqual([...TODAY, 11, 12]);
    expect(doneOnDay(logs, TUE).size).toBe(7);
  });

  it('5 + 5 (full ahead day): the five and the five ahead, ten in all', () => {
    const logs = tuesdaySession({ [WED]: range(11, 15) });
    expect([...reviewedOn(logs, TUE)].sort((a, b) => a - b)).toEqual(range(6, 15));
    expect(doneOnDay(logs, TUE).size).toBe(10);
  });

  it('5 + 7 (spanning two days): the five, five of Wednesday and two of Thursday, twelve in all', () => {
    const logs = tuesdaySession({ [WED]: range(11, 15), [THU]: [16, 17] });
    expect([...reviewedOn(logs, TUE)].sort((a, b) => a - b)).toEqual([...range(6, 15), 16, 17]);
    expect(doneOnDay(logs, TUE).size).toBe(12);
  });
});

describe('"Tomorrow starts at": the next day not yet done', () => {
  it('5 + 0: Wednesday, all five pages', () => {
    const logs = tuesdaySession();
    expect(nextRevisionDayPlan(baseUser, pages, TUE, new Set(TODAY), logs)).toEqual({ day: WED, pages: range(11, 15) });
  });

  it('5 + 2 (partial): Wednesday continues with its remaining three, not its first five', () => {
    const logs = tuesdaySession({ [WED]: [11, 12] });
    expect(nextRevisionDayPlan(baseUser, pages, TUE, new Set(TODAY), logs)).toEqual({ day: WED, pages: [13, 14, 15] });
    expect(revisionDayPlan(baseUser, pages, WED, logs).pages).toEqual([13, 14, 15]);
  });

  it('5 + 5 (full): Wednesday is done, so the next is Thursday, all five pages', () => {
    const logs = tuesdaySession({ [WED]: range(11, 15) });
    expect(nextRevisionDayPlan(baseUser, pages, TUE, new Set(TODAY), logs)).toEqual({ day: THU, pages: range(16, 20) });
  });

  it('5 + 7 (spanning two days): Wednesday done, Thursday continues with its remaining three', () => {
    const logs = tuesdaySession({ [WED]: range(11, 15), [THU]: [16, 17] });
    expect(nextRevisionDayPlan(baseUser, pages, TUE, new Set(TODAY), logs)).toEqual({ day: THU, pages: [18, 19, 20] });
  });
});

describe('Fajr after midnight: the revision day is still Tuesday', () => {
  // Fajr is worked out for the place, as in fajrBoundary.test: a point well
  // east or west of the time zone's centre gives a Fajr after midnight here.
  const fajrUser: User = {
    ...baseUser,
    fajrBoundaryEnabled: true,
    locationCoords: {
      latitude: 30,
      longitude: Math.max(-165, Math.min(165, -new Date(2026, 9, 17, 12).getTimezoneOffset() / 4)),
    },
  };
  const beforeFajr = new Date(2026, 10, 4, 0, 30);
  const fajr = getFajrTimeFor(new Date(2026, 10, 4, 12), fajrUser);

  it('at 00:30 on Wednesday the revision day is Tuesday, and the scenarios hold on it', () => {
    if (!fajr || fajr.getTime() <= beforeFajr.getTime()) return; // no Fajr after midnight here
    const revisionDay = getRevisionDayForUser(fajrUser, beforeFajr);
    expect(revisionDay).toBe(TUE);

    const logs = tuesdaySession({ [WED]: [11, 12] });
    expect([...reviewedOn(logs, revisionDay)].sort((a, b) => a - b)).toEqual([...TODAY, 11, 12]);
    expect(nextRevisionDayPlan(fajrUser, pages, revisionDay, new Set(TODAY), logs)).toEqual({
      day: WED,
      pages: [13, 14, 15],
    });
  });
});

// Home's "Done · N" and "Review session" are one list: the day's done pages.
// The count is that list's length, so the two cannot disagree.
describe('Done · N matches the review list', () => {
  const reviewList = (logs: RevisionLog[]) => [...doneOnDay(logs, TUE)].sort((a, b) => a - b);
  const doneTitle = (logs: RevisionLog[]) => todayLines('completed', TODAY, doneOnDay(logs, TUE)).title.text;

  it.each([
    ['5 + 0', tuesdaySession(), 5],
    ['5 + 2 (partial ahead day)', tuesdaySession({ [WED]: [11, 12] }), 7],
    ['5 + 5 (full ahead day)', tuesdaySession({ [WED]: range(11, 15) }), 10],
    ['5 + 7 (two days)', tuesdaySession({ [WED]: range(11, 15), [THU]: [16, 17] }), 12],
  ])('%s: the title says the list’s count', (_name, logs, count) => {
    expect(reviewList(logs)).toHaveLength(count);
    expect(doneTitle(logs)).toBe(`Done · ${count}\u00a0pages`);
  });

  it('a page credited to the day by an earlier session is in the list and the count', () => {
    // Monday's session revised page 6 ahead for Tuesday; Tuesday's own session revised 7–10.
    const logs: RevisionLog[] = [
      { id: 'mon', date: '2026-11-02', assignedPages: [1, 2, 3, 4, 5], pagesRevised: [1, 2, 3, 4, 5, 6],
        pagesSkipped: [], weaknessUpdates: [], durationMinutes: 10, ahead: { [TUE]: [6] } } as unknown as RevisionLog,
      { id: 'tue', date: TUE, assignedPages: TODAY, pagesRevised: [7, 8, 9, 10], pagesSkipped: [],
        weaknessUpdates: [], durationMinutes: 10 } as unknown as RevisionLog,
    ];
    expect(reviewList(logs)).toEqual(TODAY);
    expect(doneTitle(logs)).toBe('Done · 5\u00a0pages');
  });
});

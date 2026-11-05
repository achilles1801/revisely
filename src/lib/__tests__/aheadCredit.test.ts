import {
  aheadCreditFor,
  aheadWithin,
  creditIndex,
  creditedOnDay,
  mergeAhead,
  removeAheadPages,
} from '../aheadCredit';
import { recomputePagesFromLogs } from '../algorithm';
import { doneOnDay, reviewedOn, reviewPagesInOrder } from '../aheadCredit';
import { removeRevisedPages } from '../revisionSession';
import { applySessionEdit, mergeSessionAdd, sessionUpdateData } from '../offline/ops';
import type { RevisionLog, UserPage } from '../../types';
import type { FirestoreSession } from '../../types/firestore';

function log(date: string, pagesRevised: number[], ahead?: Record<string, number[]>): RevisionLog {
  return {
    id: date,
    date,
    assignedPages: [],
    pagesRevised,
    pagesSkipped: [],
    weaknessUpdates: [],
    durationMinutes: null,
    ...(ahead ? { ahead } : {}),
  };
}

describe('creditedOnDay', () => {
  it('is what was revised that day, plus what was revised ahead for it', () => {
    const logs = [
      log('2026-01-05', [1, 2], { '2026-01-06': [3, 4] }),
      log('2026-01-06', [5]),
      log('2026-01-07', [9], { '2026-01-08': [10] }),
    ];
    expect([...creditedOnDay(logs, '2026-01-06')].sort()).toEqual([3, 4, 5]);
    expect([...creditedOnDay(logs, '2026-01-08')]).toEqual([10]);
    expect(creditedOnDay(logs, '2026-01-09').size).toBe(0);
  });

  it('indexes every day in one pass', () => {
    const index = creditIndex([log('2026-01-05', [1], { '2026-01-06': [2] })]);
    expect([...(index.get('2026-01-05') ?? [])]).toEqual([1]);
    expect([...(index.get('2026-01-06') ?? [])]).toEqual([2]);
  });
});

describe('aheadCreditFor', () => {
  const pageDays = new Map<number, string>([
    [1, '2026-01-05'],
    [2, '2026-01-05'],
    [3, '2026-01-06'],
    [4, '2026-01-07'],
  ]);

  it('groups the pages not on the session day by the day they count for', () => {
    expect(aheadCreditFor(pageDays, [1, 2, 3, 4], '2026-01-05')).toEqual({
      '2026-01-06': [3],
      '2026-01-07': [4],
    });
  });

  it('leaves out the session day itself', () => {
    expect(aheadCreditFor(pageDays, [1, 2], '2026-01-05')).toEqual({});
  });
});

describe('mergeAhead and removeAheadPages', () => {
  it('merges per day without repeating a page', () => {
    expect(mergeAhead({ d: [1, 2] }, { d: [2, 3], e: [4] })).toEqual({ d: [1, 2, 3], e: [4] });
  });

  it('drops pages from every day and empties the days that are left with none', () => {
    expect(removeAheadPages({ d: [1, 2], e: [3] }, [1, 3])).toEqual({ d: [2] });
  });

  it('a page unchecked from the session also stops being credited ahead', () => {
    const edited = removeRevisedPages(log('2026-01-05', [1, 2], { '2026-01-06': [2] }), [2]);
    expect(edited.pagesRevised).toEqual([1]);
    expect(edited.ahead).toEqual({});
  });
});

describe('session merges keep the credit', () => {
  const at = Date.UTC(2026, 0, 5, 10);
  const add = {
    kind: 'session.add' as const,
    date: '2026-01-05',
    assignedPages: [1, 2],
    pagesRevised: [1],
    pagesSkipped: [],
    weaknessUpdates: [],
    durationAtLeast: 5,
    durationAdd: 5,
  };

  it('a new session takes the ahead credit, and is not complete on pages revised ahead alone', () => {
    const session = mergeSessionAdd(null, { ...add, pagesRevised: [1, 9], ahead: { '2026-01-06': [9] } }, at);
    expect(session.ahead).toEqual({ '2026-01-06': [9] });
    expect(session.state).toBe('IN_PROGRESS');
    expect(session.completionPercentage).toBe(50);
  });

  it('completion counts this day’s own pages, so pages revised ahead do not complete it', () => {
    const existing: FirestoreSession = {
      ...({} as FirestoreSession),
      id: '2026-01-05',
      date: '2026-01-05',
      state: 'IN_PROGRESS',
      assignedPages: [1, 2],
      totalAssignedPages: 2,
      pagesRevised: [1],
      pagesSkipped: [],
      weaknessUpdates: [],
      durationMinutes: 5,
      completionPercentage: 50,
    };
    const merged = mergeSessionAdd(existing, { ...add, pagesRevised: [9, 8, 7], ahead: { '2026-01-06': [9, 8, 7] } }, at);
    expect(merged.state).toBe('IN_PROGRESS');
    expect(merged.ahead).toEqual({ '2026-01-06': [9, 8, 7] });
  });

  it('an edit replaces the whole ahead map; without one it stays', () => {
    const existing = mergeSessionAdd(null, { ...add, pagesRevised: [1, 9], ahead: { '2026-01-06': [9] } }, at);
    const kept = applySessionEdit(existing, {
      kind: 'session.edit',
      id: '2026-01-05',
      addRevised: [],
      removeRevised: [],
      pagesSkipped: [],
      durationMinutes: 5,
      weaknessUpdates: [],
    });
    expect(kept?.ahead).toEqual({ '2026-01-06': [9] });
    const cleared = applySessionEdit(existing, {
      kind: 'session.edit',
      id: '2026-01-05',
      addRevised: [],
      removeRevised: [],
      pagesSkipped: [],
      durationMinutes: 5,
      weaknessUpdates: [],
      ahead: {},
    });
    expect(cleared?.ahead).toEqual({});
  });

  it('the update writes the ahead map', () => {
    expect(sessionUpdateData({ ahead: { '2026-01-06': [9] } } as unknown as FirestoreSession).ahead).toEqual({
      '2026-01-06': [9],
    });
    // Without credit the update leaves the field out, as before pages could be revised ahead.
    expect(sessionUpdateData({} as FirestoreSession)).not.toHaveProperty('ahead');
  });
});

describe('recomputePagesFromLogs', () => {
  it('a page revised ahead counts as revised on the day it was done', () => {
    const pages: UserPage[] = [
      { pageNumber: 9, status: 'memorized', dateMemorized: null, weaknessRating: 4, lastRevisedDate: null, totalRevisionCount: 0, skipCount: 0 },
    ];
    const [page] = recomputePagesFromLogs(pages, [log('2026-01-05', [9], { '2026-01-06': [9] })]);
    expect(page.lastRevisedDate).toBe('2026-01-05');
    expect(page.totalRevisionCount).toBe(1);
  });
});

describe('credit is only for pages the session has revised', () => {
  const at = Date.UTC(2026, 10, 3, 10);
  const add = {
    kind: 'session.add' as const,
    date: '2026-11-03',
    assignedPages: [6, 235],
    pagesRevised: [6],
    pagesSkipped: [],
    weaknessUpdates: [],
    durationAtLeast: 5,
    durationAdd: 5,
  };

  it('aheadWithin keeps only the revised pages, and drops days left empty', () => {
    expect(aheadWithin({ '2026-11-04': [236, 237], '2026-11-05': [240] }, [237, 6])).toEqual({
      '2026-11-04': [237],
    });
    expect(aheadWithin(undefined, [1])).toEqual({});
  });

  it('a new session never gets credit for a page it does not revise', () => {
    const s = mergeSessionAdd(null, { ...add, ahead: { '2026-11-04': [236] } }, at);
    expect(s.ahead).toBeUndefined();
    expect(s.pagesRevised).toEqual([6]);
  });

  it('a merge into a session keeps only the credit for pages it revised', () => {
    const existing = mergeSessionAdd(null, add, at);
    const merged = mergeSessionAdd(existing, { ...add, pagesRevised: [235], ahead: { '2026-11-04': [236] } }, at);
    expect(merged.pagesRevised).toEqual([6, 235]);
    expect(merged.ahead).toBeUndefined();
  });

  it('an edit that unchecks a page drops its credit, even when the edit still names it', () => {
    const existing = mergeSessionAdd(
      null,
      { ...add, pagesRevised: [6, 236], ahead: { '2026-11-04': [236] } },
      at,
    );
    expect(existing.ahead).toEqual({ '2026-11-04': [236] });
    const edited = applySessionEdit(existing, {
      kind: 'session.edit',
      id: '2026-11-03',
      addRevised: [],
      removeRevised: [236],
      pagesSkipped: [],
      durationMinutes: 5,
      weaknessUpdates: [],
      ahead: { '2026-11-04': [236] },
    });
    expect(edited!.pagesRevised).toEqual([6]);
    expect(edited!.ahead).toEqual({});
  });
});

// Review session (Nov 4 2026): the day's review is today's pages plus the pages
// its sessions revised ahead, each once, and the Done count is that whole set.
// Repro: Tuesday 3 Nov, fajr boundary on, Tuesday's session revised 6-9 and 235,
// then revised ahead 236-240 for Wednesday 4 Nov (the scheduled set for that day).
describe('the review of a day with pages revised ahead', () => {
  const tuesday = {
    id: 'tue',
    date: '2026-11-03',
    assignedPages: [6, 7, 8, 9, 235],
    pagesRevised: [6, 7, 8, 9, 235, 236, 237, 238, 239, 240],
    pagesSkipped: [],
    weaknessUpdates: [],
    durationMinutes: 30,
    ahead: { '2026-11-04': [236, 237, 238, 239, 240] },
  } as unknown as RevisionLog;

  it('is every page the day revised, its own and the ahead ones, once each', () => {
    const review = [...reviewedOn([tuesday], '2026-11-03')].sort((a, b) => a - b);
    expect(review).toEqual([6, 7, 8, 9, 235, 236, 237, 238, 239, 240]);
  });

  it('the Done count is that whole set, not only today’s pages', () => {
    expect(doneOnDay([tuesday], '2026-11-03').size).toBe(10);
  });

  it('a session on another day does not join this day’s review', () => {
    expect([...reviewedOn([tuesday], '2026-11-04')]).toEqual([]);
  });
});

describe('the review’s order (Majd, Nov 5 2026)', () => {
  const sorted = (s: Iterable<number>) => [...s].sort((a, b) => a - b);

  it('the day’s own pages first, in its order, then the pages revised ahead, day by day', () => {
    // Tuesday is 582–590 and 1 (a juz plan wraps); Wednesday 591–593 and Thursday 601 revised ahead.
    const assigned = [582, 583, 584, 585, 586, 587, 588, 589, 590, 1];
    const tuesday = log('2026-11-03', [...assigned, 601, 591, 592, 593], {
      '2026-11-05': [601],
      '2026-11-04': [591, 592, 593],
    });
    const order = reviewPagesInOrder([tuesday], '2026-11-03', assigned);
    expect(order).toEqual([...assigned, 591, 592, 593, 601]);
    // The same pages as Home's "Done · N".
    expect(sorted(order)).toEqual(sorted(doneOnDay([tuesday], '2026-11-03')));
  });

  it('the repro day: today’s 6–9 and 235, then Wednesday’s 236–240', () => {
    const tuesday = log('2026-11-03', [6, 7, 8, 9, 235, 236, 237, 238, 239, 240], {
      '2026-11-04': [236, 237, 238, 239, 240],
    });
    expect(reviewPagesInOrder([tuesday], '2026-11-03', [6, 7, 8, 9, 235])).toEqual([
      6, 7, 8, 9, 235, 236, 237, 238, 239, 240,
    ]);
  });

  it('pages revised ahead for the day in an earlier session are the day’s own', () => {
    const monday = log('2026-11-02', [1, 2, 3, 6, 7], { '2026-11-03': [6, 7] });
    const tue = log('2026-11-03', [8, 9, 10, 11], { '2026-11-04': [11] });
    const order = reviewPagesInOrder([monday, tue], '2026-11-03', [6, 7, 8, 9, 10]);
    expect(order).toEqual([6, 7, 8, 9, 10, 11]);
    expect(sorted(order)).toEqual(sorted(doneOnDay([monday, tue], '2026-11-03')));
  });

  it('a day done only ahead: its pages, in its order', () => {
    const monday = log('2026-11-02', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { '2026-11-03': [6, 7, 8, 9, 10] });
    expect(reviewPagesInOrder([monday], '2026-11-03', [6, 7, 8, 9, 10])).toEqual([6, 7, 8, 9, 10]);
  });

  it('several sessions of the day: every page once', () => {
    const a = log('2026-11-03', [6, 7]);
    const b = { ...log('2026-11-03', [8, 9, 10, 11, 12], { '2026-11-04': [11, 12] }), id: 'b' };
    expect(reviewPagesInOrder([a, b], '2026-11-03', [6, 7, 8, 9, 10])).toEqual([6, 7, 8, 9, 10, 11, 12]);
  });
});

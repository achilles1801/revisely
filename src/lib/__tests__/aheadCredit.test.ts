import {
  aheadCreditFor,
  aheadWithin,
  creditIndex,
  creditedOnDay,
  mergeAhead,
  removeAheadPages,
} from '../aheadCredit';
import { recomputePagesFromLogs } from '../algorithm';
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

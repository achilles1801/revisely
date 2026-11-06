// The streak rule (C5, owner-approved Nov 2026): a day counts when every page scheduled for it is
// credited to it, ahead credits included; alive through yesterday until today's revision day ends.
import { aliveStreak, completedDays, previousIsoDay, streakFromLogs } from '../../../src/lib/streak';
import type { RevisionLog, User, UserPage } from '../../../src/types';

const log = (date: string, assignedPages: number[], pagesRevised: number[], ahead?: Record<string, number[]>): RevisionLog => ({
  id: date,
  date,
  assignedPages,
  pagesRevised,
  pagesSkipped: [],
  weaknessUpdates: [],
  durationMinutes: null,
  ...(ahead ? { ahead } : {}),
});

describe('the streak rule', () => {
  it('[SESS-2] steps back one calendar day, across months, years and leap days', () => {
    expect(previousIsoDay('2026-11-01')).toBe('2026-10-31');
    expect(previousIsoDay('2027-01-01')).toBe('2026-12-31');
    expect(previousIsoDay('2028-03-01')).toBe('2028-02-29');
  });

  it('[SESS-2] a day counts only when every page scheduled for it is credited to it', () => {
    const credited = new Map([
      ['2026-11-01', new Set([1, 2])], // all of its pages
      ['2026-11-02', new Set([3])], // one of two
    ]);
    const done = completedDays(credited, (d) => (d === '2026-11-01' ? [1, 2] : [3, 4]));
    expect([...done]).toEqual(['2026-11-01']);
  });

  it('[SESS-2] a page revised ahead counts for the day it is scheduled on', () => {
    // Day 2's page 4 was revised on day 3, credited back to day 2.
    const logs = [log('2026-11-02', [3, 4], [3]), log('2026-11-03', [5], [5], { '2026-11-02': [4] })];
    const done = completedDays(
      new Map([
        ['2026-11-02', new Set([3, 4])],
        ['2026-11-03', new Set([5])],
      ]),
      (d) => logs.find((l) => l.date === d)?.assignedPages ?? [],
    );
    expect(done.has('2026-11-02')).toBe(true);
  });

  it('[SESS-2] a day with nothing scheduled never counts', () => {
    expect(completedDays(new Map([['2026-11-02', new Set([1])]]), () => []).size).toBe(0);
  });

  it('[SESS-2] counts today when today is done', () => {
    expect(aliveStreak(new Set(['2026-11-03', '2026-11-02']), '2026-11-03')).toBe(2);
  });

  it('[SESS-2] stays alive through yesterday until today’s revision day ends', () => {
    expect(aliveStreak(new Set(['2026-11-02', '2026-11-01']), '2026-11-03')).toBe(2);
  });

  it('[SESS-2] a gap ends the streak; no done days is zero', () => {
    expect(aliveStreak(new Set(['2026-11-01']), '2026-11-03')).toBe(0);
    expect(aliveStreak(new Set(), '2026-11-03')).toBe(0);
  });

  it('[SESS-2] a partly done day breaks the streak (from the logs)', () => {
    const user = {} as User;
    const pages = [] as UserPage[];
    const logs = [
      log('2026-11-01', [1, 2], [1, 2]),
      log('2026-11-02', [3, 4], [3]), // page 4 not revised: day not done
      log('2026-11-03', [5], [5]),
    ];
    expect(streakFromLogs({ user, pages, logs, today: '2026-11-03' })).toBe(1);
  });
});

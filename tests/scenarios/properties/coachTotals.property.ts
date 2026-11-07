// What the coach is sent (COACH-2): only an insight's own totals, as whole numbers and tenths.
import { COACH_FIELDS, coachTotals } from '../../../src/lib/coach/totals';

describe('the coach’s payload (COACH-2)', () => {
  it('[COACH-2] sends exactly the asked insight’s totals, rounded, and nothing else', () => {
    const source = { memorizedPages: 10.4, revisedWithin7Days: 4, revisedWithin30Days: 9, streakDays: 99, pagesPerDay7: 4.36 };
    expect(coachTotals('coverage', source)).toEqual({ memorizedPages: 10, revisedWithin7Days: 4, revisedWithin30Days: 9 });
    expect(Object.keys(coachTotals('pace', { ...source, pagesPerDay30: 2, plannedPerDay: 5 }))).toEqual(COACH_FIELDS.pace);
  });

  it('[COACH-2] a missing or negative total is an error, never a silent zero', () => {
    expect(() => coachTotals('coverage', { memorizedPages: 1 })).toThrow('missing total');
    expect(() => coachTotals('weakSpots', { weakPages: -1, moderatePages: 0, strongPages: 0, weakRevisedLast7Days: 0 })).toThrow();
  });
});

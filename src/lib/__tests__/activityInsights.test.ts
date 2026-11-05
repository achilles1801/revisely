import { PACE_MIN_ITEMS, consistency, coverage, dayMarks, growthByMonth, juzUntouchedLongest, lastRevisedByPage, pace } from '../activityInsights';

const TODAY = '2026-11-10';

describe('Activity Insights (C3)', () => {
  it('coverage: the share of memorized pages revised within the window', () => {
    const last = new Map([[1, '2026-11-09'], [2, '2026-11-01']]);
    const memorized = new Set([1, 2, 3, 4]);
    expect(coverage(memorized, last, TODAY, 7)).toBe(0.25);
    expect(coverage(memorized, last, TODAY, 30)).toBe(0.5);
  });

  it('a credit for a later day does not count as a revision yet', () => {
    const last = lastRevisedByPage([{ day: '2026-11-08', countsFor: '2026-11-12', pages: [9], minutes: null }], TODAY);
    expect(last.has(9)).toBe(false);
  });

  it('juz untouched longest: the juz with the oldest least-recent page, or never', () => {
    const juzOf = (p: number) => (p <= 10 ? 1 : 2);
    const memorized = new Set([1, 2, 11, 12]);
    const last = new Map([[1, '2026-11-09'], [2, '2026-11-09'], [11, '2026-10-01']]);
    // Juz 2 has page 12, never revised: it is untouched for as long as that page is.
    expect(juzUntouchedLongest(juzOf, memorized, last, TODAY)).toEqual({ juz: 2, daysSince: null });
    expect(juzUntouchedLongest(juzOf, new Set([1, 11]), new Map([[1, '2026-11-09'], [11, '2026-10-01']]), TODAY)).toEqual({ juz: 2, daysSince: 40 });
    expect(juzUntouchedLongest(juzOf, new Set([1, 2]), new Map([[1, '2026-11-09'], [2, '2026-11-01']]), TODAY)).toEqual({ juz: 1, daysSince: 9 });
  });

  it('consistency: days with an item in the window, and per weekday', () => {
    const c = consistency([{ day: '2026-11-09' }, { day: '2026-11-09' }, { day: '2026-11-02' }], TODAY, 7);
    expect(c.days).toBe(1);
    expect(c.perWeekday[1] + c.perWeekday[2] + c.perWeekday[3] + c.perWeekday[4] + c.perWeekday[5] + c.perWeekday[6] + c.perWeekday[0]).toBe(1);
  });

  it('growth: pages memorized per month', () => {
    const g = growthByMonth([{ day: '2026-10-05', pages: [1, 2] }, { day: '2026-10-09', pages: [3] }, { day: '2026-11-01', pages: [4] }]);
    expect(g.get('2026-10')).toBe(3);
    expect(g.get('2026-11')).toBe(1);
  });

  it(`pace: shown only with at least ${PACE_MIN_ITEMS} timed items, as minutes per page`, () => {
    const few = Array.from({ length: PACE_MIN_ITEMS - 1 }, () => ({ day: '2026-11-09', pages: [1], minutes: 10 }));
    expect(pace(few, TODAY, 30)).toBeNull();
    const enough = Array.from({ length: PACE_MIN_ITEMS }, () => ({ day: '2026-11-09', pages: [1, 2], minutes: 10 }));
    expect(pace(enough, TODAY, 30)).toBe(5);
  });

  it('day marks: the ring is the share of the day’s assigned pages revised; memorized, read and note as dots', () => {
    const marks = dayMarks('2026-11-09', {
      revised: [{ day: '2026-11-09', countsFor: '2026-11-09', pages: [1, 2], minutes: null }],
      memorized: [{ day: '2026-11-09', pages: [3] }],
      read: [],
      noteDays: new Set(['2026-11-09']),
    });
    expect(marks).toEqual({ ring: 1, memorized: true, read: false, note: true });
    expect(dayMarks('2026-11-08', { revised: [], memorized: [], read: [], noteDays: new Set() }).ring).toBeNull();
  });
});

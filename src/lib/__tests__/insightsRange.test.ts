import {
  activeDays,
  beforeWords,
  coverageCycles,
  coveragePercent,
  rangeLabel,
  rangeSpan,
  daysToLoad,
  memorizedIn,
  missedPattern,
  parseRange,
  rangeWords,
  weeksGrid,
} from '../insightsRange';

const TODAY = '2026-11-03'; // a Tuesday
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** Every day of the last `n` (today included), except those given. */
const activeExcept = (n: number, missed: string[]) => {
  const set = new Set<string>();
  for (let k = 0; k < n; k++) set.add(shift(TODAY, -k));
  missed.forEach((d) => set.delete(d));
  return set;
};

describe('Insights’ range', () => {
  it('the last choice, or 30 days', () => {
    expect(parseRange('7')).toBe(7);
    expect(parseRange('90')).toBe(90);
    expect(parseRange(null)).toBe(30);
    expect(parseRange('365')).toBe(30);
    expect(parseRange('all')).toBe('all');
  });

  it('All time: since the account’s first day, in its words; no comparison before it', () => {
    expect(rangeLabel('all')).toBe('All time');
    expect(rangeSpan('all', TODAY, '2026-09-09')).toEqual({ window: 56, inWords: 'since 9 September', lastWords: 'since 9 September', inTheLast: 'since 9 September', before: null, all: true });
    expect(rangeSpan(30, TODAY, '2026-09-09')).toMatchObject({ window: 30, inWords: 'in 30 days', inTheLast: 'in the last 30 days', before: 'the month before', all: false });
    expect(daysToLoad('all', TODAY, '2026-01-01')).toBe(307);
  });

  it('All time’s coverage in cycles: page revisions over the memorized pages', () => {
    const revised = [
      { countsFor: TODAY, pages: [1, 2, 3, 4] },
      { countsFor: '2026-10-01', pages: [1, 2] },
      // Credited to tomorrow: not yet.
      { countsFor: '2026-11-04', pages: [5] },
    ];
    expect(coverageCycles(revised, TODAY, 4)).toBe('1.5');
    expect(coverageCycles(revised.slice(0, 1), TODAY, 4)).toBe('1');
  });

  it('words for the chip and the sections', () => {
    expect([7, 30, 90].map((r) => rangeWords(r as 7))).toEqual(['7 days', '30 days', '3 months']);
    expect(beforeWords(90)).toBe('the 3 months before');
    expect(daysToLoad(7)).toBe(90);
    expect(daysToLoad(90)).toBe(180);
  });

  it('coverage never says 100% while a page is left', () => {
    expect(coveragePercent(304, 305)).toBe(99);
    expect(coveragePercent(305, 305)).toBe(100);
    expect(coveragePercent(264, 305)).toBe(87);
    expect(coveragePercent(0, 0)).toBe(0);
  });

  it('active days in the range, or since the account started when that is shorter', () => {
    const active = activeExcept(90, [shift(TODAY, -2)]);
    expect(activeDays(active, TODAY, 7)).toEqual({ done: 6, of: 7, sinceStart: null });
    expect(activeDays(active, TODAY, 90, '2026-09-09')).toEqual({ done: 55, of: 56, sinceStart: '2026-09-09' });
    expect(activeDays(active, TODAY, 30, '2026-09-09').sinceStart).toBeNull();
  });

  it('the weeks grid: a column per week, Sunday first, ending this week; before the start and after today blank', () => {
    const grid = weeksGrid(activeExcept(20, [shift(TODAY, -3)]), TODAY, 3, '2026-10-20');
    expect(grid).toHaveLength(3);
    expect(grid[2][0].day).toBe('2026-11-01');
    expect(grid[2][2]).toEqual({ day: TODAY, state: 'done' });
    expect(grid[2][3].state).toBe('after');
    expect(grid[2][6].state).toBe('after');
    expect(grid[0][0]).toEqual({ day: '2026-10-18', state: 'before' });
    expect(grid[1][6]).toEqual({ day: '2026-10-31', state: 'missed' });
  });

  it('a pattern in the missed days, by weekday', () => {
    // Saturdays only: 31 Oct, 24 Oct, 17 Oct.
    const sats = ['2026-10-31', '2026-10-24', '2026-10-17'];
    expect(missedPattern(activeExcept(90, sats), TODAY, 30)).toBe('Every missed day was a Saturday');
    // Fridays and Saturdays.
    const friSat = [...sats, '2026-10-30', '2026-10-23'];
    expect(missedPattern(activeExcept(90, friSat), TODAY, 30)).toBe('Every missed day was a Friday or a Saturday');
    // Mostly Sundays.
    const suns = ['2026-11-01', '2026-10-25', '2026-10-18', '2026-10-28'];
    expect(missedPattern(activeExcept(90, suns), TODAY, 30)).toBe('Most missed days were Sundays (3 of 4)');
    // Too few, or no pattern.
    expect(missedPattern(activeExcept(90, sats.slice(0, 2)), TODAY, 30)).toBeNull();
    expect(missedPattern(activeExcept(90, ['2026-11-01', '2026-10-27', '2026-10-22', '2026-10-15']), TODAY, 30)).toBeNull();
    // Today isn't over, so it isn't missed.
    expect(missedPattern(activeExcept(90, [TODAY, ...sats.slice(0, 2)]), TODAY, 30)).toBeNull();
  });

  it('pages memorized in the range', () => {
    const items = [
      { day: TODAY, pages: [562] },
      { day: '2026-10-10', pages: [113, 114] },
      { day: '2026-08-01', pages: [1, 2, 3] },
    ];
    expect(memorizedIn(items, TODAY, 7)).toBe(1);
    expect(memorizedIn(items, TODAY, 30)).toBe(3);
    expect(memorizedIn(items, TODAY, 90)).toBe(3);
  });
});

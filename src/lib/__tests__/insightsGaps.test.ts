import {
  gapDate,
  gapsInsightsEnabled,
  gapLabel,
  gapsFigure,
  gapsView,
  longestTile,
  revisionDays,
  rhythmTile,
  STRIP_MAX_DAYS,
  stripLabel,
  usualSteps,
} from '../insightsGaps';

let mockDev = false;
jest.mock('../variant', () => ({ isDevVariant: () => mockDev }));

const TODAY = '2026-11-15';
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const items = (days: string[]) => days.map((day) => ({ day, pages: [1, 2] }));

// The board's account (mocks/insights-gaps): revised most days from 17 Oct, nothing from 29 Oct to 5 Nov,
// back on 6 and 7 Nov, then 9 Nov, and nothing since.
const BOARD = [
  '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24',
  '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-11-06', '2026-11-07', '2026-11-09',
];

describe('revisionDays', () => {
  it('counts a day once, with at least one page revised, up to today', () => {
    expect(
      revisionDays(
        [
          { day: '2026-11-10', pages: [5] },
          { day: '2026-11-10', pages: [6] },
          { day: '2026-11-11', pages: [] },
          { day: '2026-11-09', pages: [7] },
          { day: '2026-11-16', pages: [8] },
        ],
        TODAY,
      ),
    ).toEqual(['2026-11-09', '2026-11-10']);
  });
});

describe('gapsView', () => {
  it('reads the board: 6 days since the last revision, the longest gap 9 days, usually every day', () => {
    const v = gapsView({ revised: items(BOARD), today: TODAY, window: 30, firstDay: '2026-09-01', knownSince: '2026-08-17' })!;
    expect(v.lastDay).toBe('2026-11-09');
    expect(v.sinceLast).toBe(6);
    expect(v.closedToday).toBeNull();
    expect(v.longest).toEqual({ from: '2026-10-28', to: '2026-11-06', days: 9, atLeast: false, open: false, long: true });
    expect(v.usual).toBe(1);
    // 28 Oct → 6 Nov and the open 6 days; one missed day (19 → 21 Oct, 7 → 9 Nov) is a 2-day gap, not long.
    expect(v.longCount).toBe(2);
    expect(v.gaps.map((g) => g.days)).toEqual([2, 9, 2, 6]);
    expect(v.revisedDays).toBe(14);
    expect(v.strip.days).toHaveLength(30);
    expect(v.strip.days[0]).toBe('2026-10-17');
    expect(v.strip.days[29]).toBe(TODAY);
  });

  it('is null with no revision on record', () => {
    expect(gapsView({ revised: [], today: TODAY, window: 30 })).toBeNull();
    expect(gapsView({ revised: [{ day: TODAY, pages: [] }], today: TODAY, window: 30 })).toBeNull();
  });

  it('a revision today closes the gap: "after 6 days", and nothing is open', () => {
    const v = gapsView({ revised: items([...BOARD, TODAY]), today: TODAY, window: 30 })!;
    expect(v.sinceLast).toBe(0);
    expect(v.closedToday).toBe(6);
    expect(v.gaps.filter((g) => g.open)).toEqual([]);
    expect(v.longest!.days).toBe(9);
  });

  it('only a long gap closed today is named ("after"): a missed day is not', () => {
    const v = gapsView({ revised: items(['2026-11-13', TODAY]), today: TODAY, window: 30 })!;
    expect(v.closedToday).toBeNull();
  });

  it('yesterday revised and today not yet is no gap: nothing is missed until today ends', () => {
    const v = gapsView({ revised: items(['2026-11-13', '2026-11-14']), today: TODAY, window: 30 })!;
    expect(v.sinceLast).toBe(1);
    expect(v.gaps).toEqual([]);
    expect(v.longest).toBeNull();
    // A quiet step to today on the strip.
    expect(v.strip.parts).toContainEqual({ kind: 'open', from: 28, to: 29, days: 1, long: false, cut: false });
  });

  it('two days since the last revision is an open gap, not yet long', () => {
    const v = gapsView({ revised: items(['2026-11-12', '2026-11-13']), today: TODAY, window: 30 })!;
    expect(v.sinceLast).toBe(2);
    expect(v.longest).toEqual({ from: '2026-11-13', to: null, days: 2, atLeast: false, open: true, long: false });
    expect(v.longCount).toBe(0);
  });

  it('revising every day leaves no gap; the usual step is a day', () => {
    const days = Array.from({ length: 30 }, (_, i) => shift(TODAY, -i));
    const v = gapsView({ revised: items(days), today: TODAY, window: 30 })!;
    expect(v.longest).toBeNull();
    expect(v.usual).toBe(1);
    expect(v.longCount).toBe(0);
    expect(v.strip.parts).toEqual([{ kind: 'run', from: 0, to: 29 }]);
  });

  it('the usual step is the median, halfway between two when the middle falls between them', () => {
    // Steps 1, 2, 2, 1: median 1.5.
    const v = gapsView({ revised: items(['2026-11-08', '2026-11-09', '2026-11-11', '2026-11-13', '2026-11-14']), today: TODAY, window: 30 })!;
    expect(v.usual).toBe(1.5);
    // Fewer than two steps: no usual rhythm.
    expect(gapsView({ revised: items(['2026-11-10', '2026-11-12']), today: TODAY, window: 30 })!.usual).toBeNull();
  });

  it('counts a gap that began before the range at its full length, cut at the strip’s left end', () => {
    // Revised 1 Oct, then 20 Oct (in the 30 days from 17 Oct): a 19-day gap.
    const v = gapsView({ revised: items(['2026-10-01', '2026-10-20', '2026-10-21']), today: '2026-10-22', window: 7 })!;
    expect(v.longest).toMatchObject({ from: '2026-10-01', to: '2026-10-20', days: 19 });
    expect(v.strip.days[0]).toBe('2026-10-16');
    expect(v.strip.parts).toContainEqual({ kind: 'gap', from: 0, to: 4, days: 19, long: true, cut: true, atLeast: false });
  });

  it('a gap whose missed days are all before the range is not counted', () => {
    // Range from 9 Nov (7 days); revised 1 Nov, then 9 Nov: the missed days end on 8 Nov.
    const v = gapsView({ revised: items(['2026-11-01', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', TODAY]), today: TODAY, window: 7 })!;
    expect(v.longest).toBeNull();
    expect(v.usual).toBe(1);
  });

  it('no gap before the account’s first day, and the range starts there', () => {
    const v = gapsView({ revised: items(['2026-11-12', '2026-11-13', '2026-11-14']), today: TODAY, window: 30, firstDay: '2026-11-10', knownSince: '2026-08-17' })!;
    expect(v.gaps).toEqual([]);
    expect(v.strip.days[0]).toBe('2026-11-10');
    expect(v.strip.days).toHaveLength(6);
  });

  it('a gap before the first day read, in an older account, is at least as long as the days read without one', () => {
    // Items read from 1 Oct; nothing until 20 Oct; the account began in September.
    const v = gapsView({ revised: items(['2026-10-20', '2026-10-21']), today: '2026-10-22', window: 30, firstDay: '2026-09-01', knownSince: '2026-10-01' })!;
    expect(v.longest).toEqual({ from: null, to: '2026-10-20', days: 20, atLeast: true, open: false, long: true });
  });

  it('with no item read that far back, "since your last revision" comes from the pages’ own records (timestamps)', () => {
    const v = gapsView({
      revised: [],
      today: TODAY,
      window: 30,
      lastRevisedOn: new Map([
        [1, '2026-09-01T09:00:00.000Z'],
        [2, '2026-09-20T07:30:00.000Z'],
      ]),
    })!;
    expect(v.lastDay).toBe('2026-09-20');
    expect(v.sinceLast).toBe(56);
    expect(v.longest).toMatchObject({ open: true, days: 56, long: true });
    expect(v.strip.parts).toEqual([{ kind: 'open', from: 0, to: 29, days: 56, long: true, cut: true }]);
  });

  it('pages revised ahead count on the day they were done', () => {
    const v = gapsView({ revised: [{ day: '2026-11-14', pages: [3] }], today: TODAY, window: 7 })!;
    expect(v.lastDay).toBe('2026-11-14');
  });

  it('All time draws at most half a year, and counts every gap since the first day', () => {
    const v = gapsView({ revised: items(['2026-01-10', '2026-03-01', TODAY]), today: TODAY, window: 400, firstDay: '2026-01-01' })!;
    expect(v.strip.days).toHaveLength(STRIP_MAX_DAYS);
    expect(v.longest!.days).toBe(259);
    expect(v.gaps.map((g) => g.days)).toEqual([50, 259]);
  });
});

describe('words', () => {
  it('the figure', () => {
    expect(gapsFigure({ sinceLast: 6, closedToday: null })).toEqual({ value: '6 days', text: 'since your last revision' });
    expect(gapsFigure({ sinceLast: 1, closedToday: null })).toEqual({ value: '1 day', text: 'since your last revision' });
    expect(gapsFigure({ sinceLast: 0, closedToday: null })).toEqual({ value: 'Today', text: 'you revised' });
    expect(gapsFigure({ sinceLast: 0, closedToday: 6 })).toEqual({ value: 'Today', text: 'you revised, after 6 days' });
  });

  it('a gap on the strip', () => {
    expect(gapLabel({ days: 9 })).toBe('9 days');
    expect(gapLabel({ days: 60, atLeast: true })).toBe('60+ days');
    expect(gapLabel({ days: 6, open: true })).toBe('6 days so far');
  });

  it('dates', () => {
    expect(gapDate('2026-10-28')).toBe('28 Oct');
    expect(gapDate('2026-11-06', 'long')).toBe('6 November');
  });

  it('the longest gap’s tile', () => {
    const v = gapsView({ revised: items(BOARD), today: TODAY, window: 30 })!;
    expect(longestTile(v.longest, 'in 30 days')).toEqual({ value: '9', unit: 'days', text: 'Longest gap, 28 Oct – 6 Nov' });
    expect(longestTile(null, 'in 30 days')).toEqual({ value: 'None', unit: null, text: 'No gaps in 30 days' });
    expect(longestTile({ from: '2026-11-09', to: null, days: 6, atLeast: false, open: true, long: true }, 'in 30 days').text).toBe('Longest gap, since 9 Nov');
    expect(longestTile({ from: null, to: '2026-10-20', days: 20, atLeast: true, open: false, long: true }, 'in 30 days')).toEqual({
      value: '20+',
      unit: 'days',
      text: 'Longest gap, until 20 Oct',
    });
  });

  it('the usual rhythm’s tile', () => {
    expect(rhythmTile(1, 2)).toEqual({ value: 'Every day', text: 'Your usual rhythm · 2 gaps of 3+ days' });
    expect(rhythmTile(2, 1)).toEqual({ value: 'Every 2 days', text: 'Your usual rhythm · 1 gap of 3+ days' });
    expect(rhythmTile(1.5, 0)).toEqual({ value: 'Every 1–2 days', text: 'Your usual rhythm · no gaps of 3+ days' });
    expect(usualSteps(3.5)).toEqual({ low: 3, high: 4 });
  });

  it('the strip for VoiceOver', () => {
    const v = gapsView({ revised: items(BOARD), today: TODAY, window: 30 })!;
    expect(stripLabel(v, 'last 30 days')).toBe(
      'Last 30 days: revised on 14 days. Gaps of 3 days or more: 9 days, from 28 October to 6 November; 6 days so far, since 9 November.',
    );
    const daily = gapsView({ revised: items([TODAY]), today: TODAY, window: 30 })!;
    expect(stripLabel(daily, 'last 30 days')).toBe('Last 30 days: revised on 1 day. No gaps of 3 days or more.');
  });
});

describe('who sees it', () => {
  afterEach(() => {
    mockDev = false;
  });

  it('testers, and every account in Revisely Dev; nobody signed out', () => {
    expect(gapsInsightsEnabled({ previewTester: true })).toBe(true);
    expect(gapsInsightsEnabled({ previewTester: false })).toBe(false);
    expect(gapsInsightsEnabled({})).toBe(false);
    expect(gapsInsightsEnabled(null)).toBe(false);
    mockDev = true;
    expect(gapsInsightsEnabled({})).toBe(true);
    expect(gapsInsightsEnabled(null)).toBe(false);
  });
});

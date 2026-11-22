import {
  durationWords,
  gapDate,
  gapDates,
  gapLabel,
  gapOnCalendar,
  gapSpoken,
  gapsFigure,
  gapsHaveNatural,
  gapsInsightsEnabled,
  gapsNewestFirst,
  gapsSummary,
  gapsView,
  naturalDiffers,
  revisionDays,
  usualSteps,
  usualWords,
  type Gap,
} from '../insightsGaps';
import { setMistakeDetectionReleasedForTests } from '../release/mistakeDetection';

// The release's switch is the kill switch: these tests run with it as each says, and back to as it ships.
afterEach(() => setMistakeDetectionReleasedForTests(undefined));

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
  it('reads the board: 6 days since the last revision, the longest gap 8 days without revising, usually every day', () => {
    const v = gapsView({ revised: items(BOARD), today: TODAY, window: 30, firstDay: '2026-09-01', knownSince: '2026-08-17' })!;
    expect(v.lastDay).toBe('2026-11-09');
    expect(v.sinceLast).toBe(6);
    expect(v.closedToday).toBeNull();
    // 29 Oct – 5 Nov: the days the calendar shows empty between 28 Oct and 6 Nov.
    expect(v.longest).toEqual({ from: '2026-10-28', to: '2026-11-06', first: '2026-10-29', last: '2026-11-05', days: 8, atLeast: false, open: false });
    expect(v.usual).toBe(1);
    // One day missed (20 Oct, 8 Nov) is no gap; the gap still open counts today ("6 days so far").
    expect(v.gaps.map((g) => [g.first, g.last, g.days, g.open])).toEqual([
      ['2026-10-29', '2026-11-05', 8, false],
      ['2026-11-10', TODAY, 6, true],
    ]);
    expect(v.revisedDays).toBe(14);
    expect(v.rangeStart).toBe('2026-10-17');
  });

  it('is null with no revision on record', () => {
    expect(gapsView({ revised: [], today: TODAY, window: 30 })).toBeNull();
    expect(gapsView({ revised: [{ day: TODAY, pages: [] }], today: TODAY, window: 30 })).toBeNull();
  });

  it('a revision today closes the gap: 5 days without revising, and nothing is open', () => {
    const v = gapsView({ revised: items([...BOARD, TODAY]), today: TODAY, window: 30 })!;
    expect(v.sinceLast).toBe(0);
    expect(v.closedToday).toBe(5);
    expect(v.gaps.filter((g) => g.open)).toEqual([]);
    expect(v.gaps.map((g) => g.days)).toEqual([8, 5]);
  });

  it('one day missed is no gap, closed today or before', () => {
    const v = gapsView({ revised: items(['2026-11-11', '2026-11-13', TODAY]), today: TODAY, window: 30 })!;
    expect(v.closedToday).toBeNull();
    expect(v.gaps).toEqual([]);
    expect(v.usual).toBe(2);
  });

  it('nothing is open until 2 whole days have gone by: yesterday missed and today not yet is no gap', () => {
    expect(gapsView({ revised: items(['2026-11-13', '2026-11-14']), today: TODAY, window: 30 })!.gaps).toEqual([]);
    const two = gapsView({ revised: items(['2026-11-12', '2026-11-13']), today: TODAY, window: 30 })!;
    expect(two.sinceLast).toBe(2);
    expect(two.gaps).toEqual([]);
    const three = gapsView({ revised: items(['2026-11-11', '2026-11-12']), today: TODAY, window: 30 })!;
    expect(three.longest).toEqual({ from: '2026-11-12', to: null, first: '2026-11-13', last: TODAY, days: 3, atLeast: false, open: true });
  });

  it('a day-old account: one revision day, no gap, no rhythm (Majd, Nov 20 2026)', () => {
    const v = gapsView({ revised: items([TODAY]), today: TODAY, window: 7, firstDay: TODAY })!;
    expect(v.sinceLast).toBe(0);
    expect(v.gaps).toEqual([]);
    expect(v.usual).toBeNull();
    expect(v.revisedDays).toBe(1);
    expect(v.rangeStart).toBe(TODAY);
  });

  it('revising every day leaves no gap; the usual step is a day', () => {
    const days = Array.from({ length: 30 }, (_, i) => shift(TODAY, -i));
    const v = gapsView({ revised: items(days), today: TODAY, window: 30 })!;
    expect(v.longest).toBeNull();
    expect(v.usual).toBe(1);
  });

  it('the usual step is the median, halfway between two when the middle falls between them', () => {
    // Steps 1, 2, 2, 1: median 1.5.
    const v = gapsView({ revised: items(['2026-11-08', '2026-11-09', '2026-11-11', '2026-11-13', '2026-11-14']), today: TODAY, window: 30 })!;
    expect(v.usual).toBe(1.5);
    // Fewer than two steps: no usual rhythm.
    expect(gapsView({ revised: items(['2026-11-10', '2026-11-12']), today: TODAY, window: 30 })!.usual).toBeNull();
  });

  it('counts a gap that began before the range at its full length', () => {
    // Revised 1 Oct, then 20 Oct (in the 7 days from 16 Oct): 18 days without revising, 2–19 Oct.
    const v = gapsView({ revised: items(['2026-10-01', '2026-10-20', '2026-10-21']), today: '2026-10-22', window: 7 })!;
    expect(v.longest).toMatchObject({ from: '2026-10-01', to: '2026-10-20', first: '2026-10-02', last: '2026-10-19', days: 18 });
  });

  it('a gap whose days are all before the range is not counted', () => {
    // Range from 9 Nov (7 days); revised 1 Nov, then 9 Nov: the gap's days end on 8 Nov.
    const v = gapsView({ revised: items(['2026-11-01', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', TODAY]), today: TODAY, window: 7 })!;
    expect(v.longest).toBeNull();
    expect(v.usual).toBe(1);
  });

  it('no gap before the account’s first day, and the range starts there', () => {
    const v = gapsView({ revised: items(['2026-11-12', '2026-11-13', '2026-11-14']), today: TODAY, window: 30, firstDay: '2026-11-10', knownSince: '2026-08-17' })!;
    expect(v.gaps).toEqual([]);
    expect(v.rangeStart).toBe('2026-11-10');
  });

  it('a gap before the first day read, in an older account, is at least as long as the days read without one', () => {
    // Items read from 1 Oct; nothing until 20 Oct; the account began in September.
    const v = gapsView({ revised: items(['2026-10-20', '2026-10-21']), today: '2026-10-22', window: 30, firstDay: '2026-09-01', knownSince: '2026-10-01' })!;
    expect(v.longest).toEqual({ from: null, to: '2026-10-20', first: '2026-10-01', last: '2026-10-19', days: 19, atLeast: true, open: false });
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
    expect(v.longest).toMatchObject({ open: true, days: 56, first: '2026-09-21', last: TODAY });
  });

  it('pages revised ahead count on the day they were done', () => {
    const v = gapsView({ revised: [{ day: '2026-11-14', pages: [3] }], today: TODAY, window: 7 })!;
    expect(v.lastDay).toBe('2026-11-14');
  });

  it('All time counts every gap since the first day', () => {
    const v = gapsView({ revised: items(['2026-01-10', '2026-03-01', TODAY]), today: TODAY, window: 400, firstDay: '2026-01-01' })!;
    expect(v.gaps.map((g) => g.days)).toEqual([49, 258]);
    expect(v.longest!.days).toBe(258);
  });

  it('lists the gap still open first, then the latest first', () => {
    const v = gapsView({ revised: items(BOARD), today: TODAY, window: 30 })!;
    expect(gapsNewestFirst(v.gaps).map((g) => g.first)).toEqual(['2026-11-10', '2026-10-29']);
    const closed = gapsView({ revised: items(['2026-10-01', '2026-10-05', '2026-10-20', '2026-10-24', TODAY]), today: TODAY, window: 60 })!;
    expect(gapsNewestFirst(closed.gaps).map((g) => g.first)).toEqual(['2026-10-25', '2026-10-21', '2026-10-06', '2026-10-02']);
  });
});

describe('words', () => {
  it('the figure: a number under 2 weeks, red from 3 days', () => {
    const at = (sinceLast: number, closedToday: number | null = null) => gapsFigure({ sinceLast, closedToday, lastDay: shift(TODAY, -sinceLast) });
    expect(at(6)).toEqual({ value: '6 days', text: 'since your last revision', red: true });
    expect(at(2)).toEqual({ value: '2 days', text: 'since your last revision', red: false });
    expect(at(1)).toEqual({ value: '1 day', text: 'since your last revision', red: false });
    expect(at(13)).toMatchObject({ value: '13 days', red: true });
    expect(at(0)).toEqual({ value: 'Today', text: 'you revised', red: false });
    expect(at(0, 5)).toEqual({ value: 'Today', text: 'you revised, after a 5-day gap', red: false });
  });

  it('the figure from 2 weeks: words and the date, never red; back today, gently; days when asked', () => {
    const at = (sinceLast: number, closedToday: number | null = null, inDays = false) =>
      gapsFigure({ sinceLast, closedToday, lastDay: shift(TODAY, -sinceLast) }, inDays);
    expect(at(22)).toEqual({ value: 'Over 3 weeks', text: 'since your last revision, on 24 Oct', red: false });
    expect(at(14)).toEqual({ value: '2 weeks', text: 'since your last revision, on 1 Nov', red: false });
    expect(at(22, null, true)).toEqual({ value: '22 days', text: 'since your last revision, on 24 Oct', red: false });
    expect(at(0, 22)).toEqual({ value: 'Today', text: 'you’re back, after over 3 weeks', red: false });
    expect(at(0, 22, true)).toEqual({ value: 'Today', text: 'you’re back, after 22 days', red: false });
  });

  it('lengths as a person says them, from 2 weeks', () => {
    const words = (d: number) => durationWords(d);
    expect([1, 13].map(words)).toEqual(['1 day', '13 days']);
    expect([14, 15, 21, 25, 41].map(words)).toEqual(['2 weeks', 'over 2 weeks', '3 weeks', 'over 3 weeks', 'over 5 weeks']);
    expect([42, 45, 61, 75, 200].map(words)).toEqual(['over a month', 'over a month', 'about 2 months', 'over 2 months', 'over 6 months']);
    expect([365, 400, 800].map(words)).toEqual(['about a year', 'about a year', 'about 2 years']);
    expect(durationWords(25, true)).toBe('25 days');
    expect(naturalDiffers(13)).toBe(false);
    expect(naturalDiffers(14)).toBe(true);
  });

  it('a gap’s length', () => {
    expect(gapLabel({ days: 8 })).toBe('8 days');
    expect(gapLabel({ days: 60, atLeast: true })).toBe('60+ days');
    expect(gapLabel({ days: 6, open: true })).toBe('6 days so far');
    expect(gapLabel({ days: 22, open: true })).toBe('over 3 weeks so far');
    expect(gapLabel({ days: 22 })).toBe('over 3 weeks');
    expect(gapLabel({ days: 22 }, true)).toBe('22 days');
  });

  it('a gap’s days: across months, in one month, still open, begun before the days read', () => {
    const g = (first: string, last: string, extra: Partial<Gap> = {}) => ({ first, last, open: false, atLeast: false, ...extra });
    expect(gapDates(g('2026-10-29', '2026-11-05'))).toBe('29 Oct – 5 Nov');
    expect(gapDates(g('2026-10-09', '2026-10-10'))).toBe('9–10 Oct');
    expect(gapDates(g('2026-11-10', TODAY, { open: true }))).toBe('10 Nov – today');
    expect(gapDates(g('2026-10-01', '2026-10-19', { atLeast: true }))).toBe('until 19 Oct');
    expect(gapDates(g('2026-10-29', '2026-11-05'), 'long')).toBe('29 October – 5 November');
  });

  it('a gap for VoiceOver: exact days, the dates in full', () => {
    const v = gapsView({ revised: items(BOARD), today: TODAY, window: 30 })!;
    expect(v.gaps.map(gapSpoken)).toEqual([
      '8 days without revising, 29 October – 5 November',
      '6 days so far without revising, 10 November – today',
    ]);
  });

  it('dates', () => {
    expect(gapDate('2026-10-28')).toBe('28 Oct');
    expect(gapDate('2026-11-06', 'long')).toBe('6 November');
  });

  it('the line under the figure: the gaps in the range and the usual rhythm, or none yet', () => {
    const board = gapsView({ revised: items(BOARD), today: TODAY, window: 30 })!;
    expect(gapsSummary(board, 'in 30 days')).toBe('2 gaps in 30 days · you usually revise every day');
    const one = gapsView({ revised: items(['2026-11-01', '2026-11-02', '2026-11-06', '2026-11-07', TODAY]), today: TODAY, window: 30, firstDay: '2026-11-01' })!;
    expect(gapsSummary(one, 'since 1 November')).toBe('2 gaps since 1 November · you usually revise every 2–3 days');
    const daily = gapsView({ revised: items(['2026-11-13', '2026-11-14', TODAY]), today: TODAY, window: 30 })!;
    expect(gapsSummary(daily, 'in 30 days')).toBe('No gaps in 30 days · you usually revise every day');
    const first = gapsView({ revised: items([TODAY]), today: TODAY, window: 7, firstDay: TODAY })!;
    expect(gapsSummary(first, 'since 15 November')).toBe('No gaps yet');
    const singleGap = gapsView({ revised: items(['2026-11-10', TODAY]), today: TODAY, window: 30 })!;
    expect(gapsSummary(singleGap, 'in 30 days')).toBe('1 gap in 30 days');
  });

  it('the usual rhythm in words', () => {
    expect(usualWords(1)).toBe('you usually revise every day');
    expect(usualWords(2)).toBe('you usually revise every 2 days');
    expect(usualWords(1.5)).toBe('you usually revise every 1–2 days');
    expect(usualSteps(3.5)).toEqual({ low: 3, high: 4 });
    expect(usualWords(15)).toBe('you usually revise about every 2 weeks');
    expect(usualWords(50)).toBe('you usually revise about every 2 months');
    expect(usualWords(15, true)).toBe('you usually revise every 15 days');
  });
});

describe('a gap on the calendar (ACT-28)', () => {
  const gap = (g: Partial<Gap>): Gap => ({ from: null, to: null, first: '', last: '', days: 0, atLeast: false, open: false, ...g });
  it('marks its days without a revision, named above the grid', () => {
    expect(gapOnCalendar(gap({ from: '2026-10-28', to: '2026-11-06', first: '2026-10-29', last: '2026-11-05', days: 8 }))).toEqual({
      from: '2026-10-29',
      to: '2026-11-05',
      cue: 'Gap, 29 Oct – 5 Nov · 8 days',
    });
  });

  it('still open: to today; begun before the days read: from as far back as is known; long ones in words, or days', () => {
    expect(gapOnCalendar(gap({ from: '2026-11-09', first: '2026-11-10', last: TODAY, days: 6, open: true }))).toEqual({
      from: '2026-11-10',
      to: TODAY,
      cue: 'Gap, 10 Nov – today · 6 days so far',
    });
    expect(gapOnCalendar(gap({ to: '2026-11-08', first: '2026-09-08', last: '2026-11-07', days: 60, atLeast: true }))).toEqual({
      from: '2026-09-08',
      to: '2026-11-07',
      cue: 'Gap, until 7 Nov · 60+ days',
    });
    const long = gap({ from: '2026-10-01', to: '2026-10-24', first: '2026-10-02', last: '2026-10-23', days: 22 });
    expect(gapOnCalendar(long).cue).toBe('Gap, 2–23 Oct · over 3 weeks');
    expect(gapOnCalendar(long, true).cue).toBe('Gap, 2–23 Oct · 22 days');
  });
});

describe('who sees it', () => {
  afterEach(() => {
    mockDev = false;
  });

  it('with the release switched off: every account in Revisely Dev, nobody signed out; not the store app, testers included', () => {
    setMistakeDetectionReleasedForTests(false);
    expect(gapsInsightsEnabled({ previewTester: true })).toBe(false);
    expect(gapsInsightsEnabled({})).toBe(false);
    mockDev = true;
    expect(gapsInsightsEnabled({})).toBe(true);
    expect(gapsInsightsEnabled({ previewTester: true })).toBe(true);
    expect(gapsInsightsEnabled(null)).toBe(false);
  });
});

describe('the Days switch', () => {
  it('shows only when something reads differently in days', () => {
    expect(gapsHaveNatural(gapsView({ revised: items(BOARD), today: TODAY, window: 30 })!)).toBe(false);
    expect(gapsHaveNatural(gapsView({ revised: items(['2026-10-20']), today: TODAY, window: 30 })!)).toBe(true);
    expect(gapsHaveNatural(gapsView({ revised: items(['2026-10-20', TODAY]), today: TODAY, window: 30 })!)).toBe(true);
  });
});

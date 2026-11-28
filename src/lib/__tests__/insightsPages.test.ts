import { getPagesForJuz } from '../quranData';
import { juzTiles } from '../insightsView';
import { chartLayout } from '../../components/activity/TapChart';
import { textWidth } from '../../../jest/textWidth';
import { coverageBefore, dayPartOf, doneByWords, juzDoneBy, partOfMonth, quickestPart, ratingsOn, slippingJuz, slippingWords, strengthWeeks, weakCount, weakMostOften, weekBarLabel, weekName } from '../insightsPages';

const TODAY = '2026-11-28';
const ago = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const juz = (n: number) => getPagesForJuz(n);

describe('Coverage before the range (ACT-38)', () => {
  const memorized = new Set([...juz(29), ...juz(30)]);

  it('counts the pages memorized then that were revised in the same length of days before the range', () => {
    const revised = [
      { day: ago(40), countsFor: ago(40), pages: juz(30) },
      // In the range itself: not the days before.
      { day: ago(5), countsFor: ago(5), pages: juz(29) },
      // Before both spans.
      { day: ago(70), countsFor: ago(70), pages: juz(29) },
    ];
    expect(coverageBefore({ memorized, revised, memorizations: [], today: TODAY, window: 30, firstDay: ago(200) })).toEqual({
      revised: juz(30).length,
      of: memorized.size,
    });
  });

  it('leaves out the pages memorized during the range', () => {
    const memorizations = [{ day: ago(3), pages: juz(29) }];
    expect(coverageBefore({ memorized, revised: [], memorizations, today: TODAY, window: 30, firstDay: ago(200) })).toEqual({ revised: 0, of: juz(30).length });
  });

  it('says nothing when the account is younger than both spans together, or nothing was memorized then', () => {
    expect(coverageBefore({ memorized, revised: [], memorizations: [], today: TODAY, window: 30, firstDay: ago(45) })).toBeNull();
    expect(coverageBefore({ memorized, revised: [], memorizations: [], today: TODAY, window: 30, firstDay: null })).toBeNull();
    const all = [{ day: ago(1), pages: [...memorized] }];
    expect(coverageBefore({ memorized, revised: [], memorizations: all, today: TODAY, window: 30, firstDay: ago(200) })).toBeNull();
  });
});

describe('The juz slipping out of rotation (ACT-38)', () => {
  // Juz 1–6 and 21–30 memorized; Juz 4 last revised 41 days ago, Juz 5 33, Juz 6 31, the rest this week.
  const memorized = new Set([1, 2, 3, 4, 5, 6, ...[21, 22, 23, 24, 25, 26, 27, 28, 29, 30]].flatMap(juz));
  const last = new Map<number, string>();
  for (const p of memorized) last.set(p, ago(2));
  for (const p of juz(4)) last.set(p, ago(41));
  for (const p of juz(5)) last.set(p, ago(33));
  for (const p of juz(6)) last.set(p, ago(31));
  const tiles = juzTiles(memorized, new Set(), last, TODAY);

  it('names the two left longest, longest first', () => {
    expect(slippingJuz(tiles).map((t) => t.juz)).toEqual([4, 5]);
  });

  it('only those left longer than the plan takes to go round', () => {
    expect(slippingJuz(tiles, 32).map((t) => t.juz)).toEqual([4, 5]);
    expect(slippingJuz(tiles, 35).map((t) => t.juz)).toEqual([4]);
    expect(slippingJuz(tiles, 45)).toEqual([]);
  });

  it('a juz never revised in the 30+ days on record comes first', () => {
    const never = new Map(last);
    for (const p of juz(21)) never.delete(p);
    expect(slippingJuz(juzTiles(memorized, new Set(), never, TODAY)).map((t) => t.juz)).toEqual([21, 4]);
  });

  it('says how long ago, and how often the plan goes round', () => {
    expect(slippingWords(slippingJuz(tiles), 15)).toEqual({
      title: 'Juz 4 and Juz 5 are slipping out of rotation',
      detail: 'Last revised 41 and 33 days ago; your plan goes round every 15 days.',
    });
    expect(slippingWords(slippingJuz(tiles, 35), null)).toEqual({ title: 'Juz 4 is slipping out of rotation', detail: 'Last revised 41 days ago.' });
    const never = new Map(last);
    for (const p of juz(21)) never.delete(p);
    expect(slippingWords(slippingJuz(juzTiles(memorized, new Set(), never, TODAY)), 15).detail).toBe(
      'Juz 21 never revised · Juz 4 41 days ago; your plan goes round every 15 days.',
    );
  });
});

describe('When the juz in progress is done (MEM-11)', () => {
  // Juz 30 memorized, Juz 29 (20 pages) all but its first 11; 3 pages memorized in each of the last three months.
  const j29 = juz(29);
  const memorized = new Set([...juz(30), ...j29.slice(11)]);
  const memorizations = [
    { day: ago(80), pages: j29.slice(11, 14) },
    { day: ago(50), pages: j29.slice(14, 17) },
    { day: ago(10), pages: j29.slice(17) },
  ];

  it('the juz the latest memorization went into, at the pace of the last 90 days', () => {
    const done = juzDoneBy({ memorized, memorizations, today: TODAY, firstDay: ago(400) });
    expect(j29).toHaveLength(20);
    // 9 pages in 90 days: 3 a month, so 11 pages take 110 days.
    expect(done).toEqual({ juz: 29, left: 11, perMonth: 3, day: '2027-03-18' });
  });

  it('reads as the part of the month, with the year when it is not this one', () => {
    expect(partOfMonth('2026-12-05', TODAY)).toBe('early December');
    expect(partOfMonth('2027-01-15', TODAY)).toBe('mid-January 2027');
    expect(partOfMonth('2026-12-28', TODAY)).toBe('late December');
    const done = { juz: 29, left: 11, perMonth: 10, day: '2026-12-15' };
    expect(doneByWords(done, TODAY)).toEqual({ title: 'At this pace, Juz 29 is done in mid-December', detail: '11 pages to go, at about 10 a month.' });
  });

  it('counts from the account’s first day when it is younger than 90 days (30 days at least)', () => {
    const young = juzDoneBy({ memorized, memorizations: [{ day: ago(10), pages: j29.slice(14) }], today: TODAY, firstDay: ago(20) });
    // 6 pages since an account 21 days old, over 30 days at least: 6 a month.
    expect(young?.perMonth).toBe(6);
  });

  it('says nothing with no juz in progress, under a page a month, or two years away', () => {
    expect(juzDoneBy({ memorized: new Set(juz(30)), memorizations: [{ day: ago(5), pages: juz(30) }], today: TODAY, firstDay: ago(400) })).toBeNull();
    expect(juzDoneBy({ memorized, memorizations: [{ day: ago(200), pages: j29.slice(11) }], today: TODAY, firstDay: ago(400) })).toBeNull();
    // One page in 90 days: a third of a page a month.
    expect(juzDoneBy({ memorized, memorizations: [{ day: ago(5), pages: [j29[19]] }], today: TODAY, firstDay: ago(400) })).toBeNull();
  });
});

describe('Weak spots over time (ACT-39)', () => {
  const memorized = new Set([1, 2, 3, 4, 5]);
  // Now: 1 and 2 weak, 3 moderate.
  const now = new Map([[1, 2], [2, 1], [3, 3], [4, 5]]);
  const rating = (p: number) => now.get(p);
  const logs = [
    { date: ago(40), weaknessUpdates: [{ page: 1, rating: 1 }, { page: 3, rating: 2 }, { page: 4, rating: 2 }] },
    { date: ago(20), weaknessUpdates: [{ page: 3, rating: 3 }, { page: 4, rating: 5 }] },
    { date: ago(2), weaknessUpdates: [{ page: 1, rating: 2 }, { page: 2, rating: 1 }] },
  ];

  it('a page’s rating on a day is its last session rating then; rated only later, strong; never in the logs, as now', () => {
    const then = ratingsOn({ logs, memorized, rating, day: ago(30) });
    expect([...then]).toEqual([[1, 1], [2, undefined], [3, 2], [4, 2], [5, undefined]]);
  });

  it('weak now, and as the range began', () => {
    expect(weakCount({ logs, memorized, rating, today: TODAY, window: 30 })).toEqual({ now: 2, before: 3 });
    // No session before the range in the logs: nothing to compare with; All time: none.
    expect(weakCount({ logs, memorized, rating, today: TODAY, window: 90 })).toEqual({ now: 2, before: null });
    expect(weakCount({ logs, memorized, rating, today: TODAY, window: null })).toEqual({ now: 2, before: null });
  });

  it('weak and moderate at the end of each week, the last ending today', () => {
    expect(strengthWeeks({ logs, memorized, rating, today: TODAY, weeks: 7 })).toEqual([
      { end: ago(42), weak: 0, moderate: 0 },
      { end: ago(35), weak: 3, moderate: 0 },
      { end: ago(28), weak: 3, moderate: 0 },
      { end: ago(21), weak: 3, moderate: 0 },
      { end: ago(14), weak: 1, moderate: 1 },
      { end: ago(7), weak: 1, moderate: 1 },
      { end: TODAY, weak: 2, moderate: 1 },
    ]);
  });

  it('the page rated weak most often, at least twice, and still memorized', () => {
    expect(weakMostOften(new Map([[7, 3], [2, 3], [1, 1]]), memorized)).toEqual({ page: 2, times: 3 });
    expect(weakMostOften(new Map([[1, 1]]), memorized)).toBeNull();
    expect(weakMostOften(new Map([[9, 4]]), memorized)).toBeNull();
  });
});

describe('When they are quickest (ACT-40)', () => {
  const at = (day: string, hour: number) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).getTime();
  const session = (n: number, hour: number, minutes: number) => ({ day: ago(n), countsFor: ago(n), pages: [1, 2, 3, 4, 5], minutes, occurredAt: at(ago(n), hour) });

  it('the parts of the day, by the hour a session began', () => {
    expect([0, 6, 7, 11, 12, 16, 17, 20, 21, 23].map(dayPartOf)).toEqual(['dawn', 'dawn', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night']);
  });

  it('the quickest part and the slowest, from three timed revisions in each', () => {
    const revised = [session(1, 5, 8), session(2, 5, 8), session(3, 6, 8), session(4, 22, 11), session(5, 22, 11), session(6, 23, 11), session(7, 13, 50)];
    expect(quickestPart(revised, TODAY, 30)).toEqual({ quickest: { part: 'dawn', perPage: 1.6 }, slowest: { part: 'night', perPage: 2.2 } });
  });

  it('nothing from one part alone, from too few, or when they differ by under 0.2 min a page', () => {
    expect(quickestPart([session(1, 5, 8), session(2, 5, 8), session(3, 5, 8)], TODAY, 30)).toBeNull();
    expect(quickestPart([session(1, 5, 8), session(2, 5, 8), session(3, 5, 8), session(4, 22, 11), session(5, 22, 11)], TODAY, 30)).toBeNull();
    expect(quickestPart([session(1, 5, 8), session(2, 5, 8), session(3, 5, 8), session(4, 22, 8.5), session(5, 22, 8.5), session(6, 22, 8.5)], TODAY, 30)).toBeNull();
  });
});

describe('A weekly chart’s labels (ACT-39, ACT-40)', () => {
  it('names the week on the line over the chart, by its first day', () => {
    expect(weekName(TODAY, TODAY)).toBe('This week');
    expect(weekName(ago(7), TODAY)).toBe('Week of 15 Nov');
  });

  it('every bar labelled: the first day’s number, which fits a 5-bar chart on an SE at the largest text', () => {
    const labels = [28, 21, 14, 7, 0].map((n) => weekBarLabel(ago(n), TODAY, true));
    expect(labels).toEqual(['25', '1', '8', '15', '22']);
    // The card's inside on an SE is 260 pt; text shrinks to 0.6 at most; chrome stops growing at 1.4×.
    const { slot } = chartLayout(5, 260);
    for (const l of labels) expect(textWidth(l, 'meta@13', 1.4) * 0.6).toBeLessThanOrEqual(slot);
  });

  it('only the ends and the pick labelled: the day and month, and "This wk" for the newest', () => {
    expect(weekBarLabel(ago(7), TODAY, false)).toBe('15 Nov');
    expect(weekBarLabel(TODAY, TODAY, false)).toBe('This wk');
  });
});

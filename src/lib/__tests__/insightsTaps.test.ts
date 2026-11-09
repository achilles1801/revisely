import { hourDetail, minutesWords, monthOfMemorizing, timedRevisions, uncoveredRows } from '../insightsTaps';
import { plainText } from '../passages';
import { getJuzForPage, getPagesForJuz } from '../quranData';

const TODAY = '2026-11-03';
const juzPages = (j: number) => getPagesForJuz(j).filter((p) => getJuzForPage(p) === j);

describe('what isn’t covered (i7)', () => {
  // Juz 4 memorized, last revised 41 days ago; Juz 30 revised today but for 600–604; Al-Mulk's first page
  // memorized today, never revised.
  const memorized = new Set([...juzPages(4), ...juzPages(30), 562]);
  const last = new Map<number, string>();
  juzPages(4).forEach((p) => last.set(p, '2026-09-23'));
  juzPages(30).filter((p) => p < 600).forEach((p) => last.set(p, TODAY));
  const rows = uncoveredRows({ memorized, last, memorizedOn: new Map([[562, TODAY]]), today: TODAY, window: 30 });

  it('a whole memorized juz as one row, by its surahs and how long ago', () => {
    expect(rows[0]).toMatchObject({ kind: 'juz', juz: 4, label: 'Juz 4' });
    expect(plainText(rows[0].detail)).toMatch(/^Ali 'Imran.* to An-Nisa.* · Last revised 41 days ago$/);
  });

  it('a run memorized in the range and never revised says so', () => {
    const mulk = rows.find((r) => r.juz === 29)!;
    expect(plainText(mulk.label)).toMatch(/Al-Mulk/);
    expect(mulk.detail).toBe('Memorized today, not revised yet');
  });

  it('a run inside a juz that was otherwise revised', () => {
    const end = rows.find((r) => r.juz === 30)!;
    expect(end.kind).toBe('passage');
    expect(end.pages).toEqual([600, 601, 602, 603, 604]);
    expect(end.detail).toBe('Never revised');
  });

  it('nothing when every memorized page was revised in the range', () => {
    const all = new Map([...memorized].map((p) => [p, TODAY] as [number, string]));
    expect(uncoveredRows({ memorized, last: all, today: TODAY, window: 7 })).toEqual([]);
  });
});

describe('a month of memorizing (i10)', () => {
  const items = [
    { day: '2026-10-29', pages: [120] },
    { day: '2026-10-20', pages: [118, 119] },
    { day: '2026-09-15', pages: [100] },
  ];
  it('its total, its passage and its items newest first', () => {
    const m = monthOfMemorizing(items, '2026-10');
    expect(m.pages).toBe(3);
    expect(plainText(m.passage)).toMatch(/^Al-Ma'idah/);
    expect(m.items.map((i) => i.day)).toEqual(['2026-10-29', '2026-10-20']);
    expect(m.items[1].when).toBe('Tuesday 20 October · 2 pages');
  });
  it('a month with none', () => {
    expect(monthOfMemorizing(items, '2026-08')).toMatchObject({ pages: 0, items: [] });
  });
});

describe('the hours scrub (i8)', () => {
  // Local times: two sessions from 6:10 (40 min each), one from 21:30 (50 min, into 10 PM).
  const at = (day: string, h: number, m: number) => new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h, m).getTime();
  const items = [
    { day: '2026-11-02', occurredAt: at('2026-11-02', 6, 10), minutes: 40 },
    { day: '2026-10-30', occurredAt: at('2026-10-30', 6, 10), minutes: 40 },
    { day: '2026-11-03', occurredAt: at('2026-11-03', 21, 30), minutes: 50 },
    { day: '2026-08-01', occurredAt: at('2026-08-01', 6, 0), minutes: 60 },
  ];
  it('the hour’s minutes, its sessions and the last', () => {
    expect(hourDetail(items, TODAY, 30, 'in 30 days', 6)).toEqual({ title: '6–7 AM · 1 h 20 min', detail: '2 sessions in 30 days, the last yesterday' });
    expect(hourDetail(items, TODAY, 30, 'in 30 days', 22)).toEqual({ title: '10–11 PM · 20 min', detail: '1 session in 30 days, the last today' });
    expect(hourDetail(items, TODAY, 30, 'in 30 days', 11)).toEqual({ title: '11 AM–12 PM', detail: 'Nothing timed in 30 days' });
  });
  it('minutes in words', () => {
    expect(minutesWords(54)).toBe('54 min');
    expect(minutesWords(354)).toBe('5 h 54 min');
    expect(minutesWords(120)).toBe('2 h');
  });
});

describe('Pace’s timed revisions (i11)', () => {
  const revised = [
    { day: TODAY, countsFor: TODAY, pages: Array.from({ length: 18 }, (_, i) => 542 + i), minutes: 34 },
    { day: '2026-11-01', countsFor: '2026-11-01', pages: [522, 523, 524, 525, 526, 527], minutes: 9 },
    { day: '2026-10-31', countsFor: '2026-10-31', pages: [500, 501], minutes: null },
    // Ahead for tomorrow: not a revision of its own day.
    { day: TODAY, countsFor: '2026-11-04', pages: [562], minutes: 2 },
  ];
  it('each timed revision, newest first, with its minutes a page; the ones without time counted', () => {
    const { list, untimed } = timedRevisions(revised, TODAY, 30);
    expect(list.map((r) => r.day)).toEqual([TODAY, '2026-11-01']);
    expect(list[0].detail).toBe('Today · 18 pages in 34 min');
    expect(list[1].detail).toBe('Sunday · 6 pages in 9 min');
    expect(list[1].perPage).toBeCloseTo(1.5);
    expect(untimed).toBe(1);
  });
});

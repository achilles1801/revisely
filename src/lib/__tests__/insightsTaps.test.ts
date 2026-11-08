import { monthOfMemorizing, uncoveredRows } from '../insightsTaps';
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
    expect(plainText(rows[0].detail)).toMatch(/^Ali 'Imran.* to An-Nisa.* · 41 days ago$/);
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
    expect(end.detail).toBe('Not revised yet');
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

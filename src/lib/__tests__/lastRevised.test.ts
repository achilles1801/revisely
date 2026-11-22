import {
  lastRevisedRows,
  matchesFilter,
  pageRecency,
  parseLastRevisedPrefs,
  recencyShort,
  recencyText,
  rowName,
  suggestedView,
  type LastRevisedInput,
} from '../lastRevised';
import { plainText } from '../passages';

const TODAY = '2026-11-15';
// Al-Fatihah (p. 1) and Al-Baqarah's first pages (2–4), Al-Mulk (562–564), An-Naba (582).
const LAST: Record<number, string> = {
  1: TODAY,
  2: '2026-10-24',
  3: '2026-10-24T09:00:00.000Z'.slice(0, 10),
  4: '2026-11-09',
  562: '2026-10-28',
  563: '2026-10-28',
  564: '2026-11-01',
  582: '2026-11-09',
};
const input = (over: Partial<LastRevisedInput> = {}): LastRevisedInput => ({
  memorized: [1, 2, 3, 4, 562, 563, 564, 582],
  last: (p) => LAST[p] ?? null,
  since: () => '2026-09-01',
  today: TODAY,
  ...over,
});

describe('lastRevisedRows', () => {
  it('[ACT-30] by surah, longest waiting first: each as recent as its least recently revised page, its pages inside', () => {
    const rows = lastRevisedRows('surah', input());
    // Page 564 ends Al-Mulk and starts Al-Qalam: both have it.
    expect(rows.map((r) => [plainText(rowName(r)), r.oldest.wait])).toEqual([
      ['Al-Baqarah', 22],
      ['Al-Mulk', 18],
      ['Al-Qalam', 14],
      ['An-Naba', 6],
      ['Al-Fatihah', 0],
    ]);
    expect(rows[0].pages.map((p) => [p.page, p.wait])).toEqual([
      [2, 22],
      [3, 22],
      [4, 6],
    ]);
  });

  it('[ACT-30] a row’s pages go longest waiting first, so the page that dates it comes first; equals keep the mushaf’s order', () => {
    // Page 4 is Al-Baqarah's oldest now: it comes before 2 and 3, which keep their order.
    const rows = lastRevisedRows('surah', input({ last: (p) => (p === 4 ? '2026-10-01' : LAST[p] ?? null) }));
    const baqarah = rows.find((r) => r.number === 2)!;
    expect(baqarah.pages.map((p) => [p.page, p.wait])).toEqual([
      [4, 45],
      [2, 22],
      [3, 22],
    ]);
    expect(baqarah.oldest).toBe(baqarah.pages[0]);
  });

  it('by juz, hizb and page', () => {
    expect(lastRevisedRows('juz', input()).map((r) => [rowName(r), r.oldest.wait])).toEqual([
      ['Juz 1', 22],
      ['Juz 29', 18],
      ['Juz 30', 6],
    ]);
    expect(lastRevisedRows('hizb', input()).map((r) => rowName(r))).toEqual(['Hizb 1', 'Hizb 57', 'Hizb 59']);
    const pages = lastRevisedRows('page', input());
    expect(pages.map((r) => r.number)).toEqual([2, 3, 562, 563, 564, 4, 582, 1]);
    expect(plainText(rowName(pages[0]))).toMatch(/^Al-Fatihah|^Al-Baqarah/);
  });

  it('a page never revised waits from when it was memorized: "Not revised yet" for 30 days, then "Never revised", first', () => {
    const rows = lastRevisedRows('page', input({ memorized: [1, 5, 6], since: (p) => (p === 5 ? '2026-11-10' : '2026-09-01') }));
    expect(rows.map((r) => [r.number, r.oldest.state, r.oldest.wait])).toEqual([
      [6, 'never', 75],
      [5, 'notYet', 5],
      [1, 'dated', 0],
    ]);
  });

  it('a surah with one page never revised is "Never revised" itself', () => {
    const rows = lastRevisedRows('surah', input({ memorized: [2, 3, 5] }));
    expect(rows[0].oldest).toMatchObject({ page: 5, state: 'never' });
  });

  it('nothing memorized: no rows', () => {
    expect(lastRevisedRows('surah', input({ memorized: [] }))).toEqual([]);
  });
});

describe('sort and filter (Majd, Nov 16 2026: "a filter and sort options like by date")', () => {
  it('[ACT-30] recent first: the latest revised at the top, never revised last; mushaf order by number', () => {
    const recent = lastRevisedRows('surah', input({ memorized: [1, 2, 3, 4, 5, 562, 563, 564, 582] }), { sort: 'recent' });
    expect(recent.map((r) => [plainText(rowName(r)), r.oldest.state === 'dated' ? r.oldest.wait : r.oldest.state])).toEqual([
      ['Al-Fatihah', 0],
      ['An-Naba', 6],
      ['Al-Qalam', 14],
      ['Al-Mulk', 18],
      ['Al-Baqarah', 'never'],
    ]);
    // Inside a row, the same order: Al-Baqarah's latest revised page first, the one never revised last.
    expect(recent[4].pages.map((p) => p.page)).toEqual([4, 2, 3, 5]);
    expect(recent[4].oldest.page).toBe(5);
    const mushaf = lastRevisedRows('surah', input(), { sort: 'mushaf' });
    expect(mushaf.map((r) => r.number)).toEqual([1, 2, 67, 68, 78]);
    expect(mushaf[1].pages.map((p) => p.page)).toEqual([2, 3, 4]);
  });

  it('[ACT-30] a filter narrows to the pages that match: a row shows when one of its pages does, with only those, out of its total', () => {
    const week = lastRevisedRows('surah', input(), { filter: 'week' });
    expect(week.map((r) => [plainText(rowName(r)), r.pages.map((p) => p.page), r.total])).toEqual([
      ['Al-Baqarah', [4], 3],
      ['An-Naba', [582], 1],
      ['Al-Fatihah', [1], 1],
    ]);
    // Dated by the pages shown: Al-Baqarah's page 4, 6 days ago.
    expect(week[0].oldest.wait).toBe(6);
    const waiting = lastRevisedRows('juz', input(), { filter: 'waiting' });
    expect(waiting.map((r) => [rowName(r), r.pages.map((p) => p.page)])).toEqual([
      ['Juz 1', [2, 3]],
      ['Juz 29', [562, 563, 564]],
    ]);
    const never = lastRevisedRows('surah', input({ memorized: [1, 2, 5] }), { filter: 'never' });
    expect(never.map((r) => [r.number, r.pages.map((p) => p.page)])).toEqual([[2, [5]]]);
  });

  it('the filters', () => {
    const r = (last: string | null, since = '2026-09-01') => pageRecency(1, { last: () => last, since: () => since, today: TODAY });
    expect(matchesFilter(r('2026-11-09'), 'week')).toBe(true);
    expect(matchesFilter(r('2026-11-08'), 'week')).toBe(false);
    expect(matchesFilter(r('2026-11-01'), 'waiting')).toBe(true);
    expect(matchesFilter(r('2026-11-02'), 'waiting')).toBe(false);
    // Waiting since it was memorized counts too.
    expect(matchesFilter(r(null), 'waiting')).toBe(true);
    expect(matchesFilter(r(null, '2026-11-10'), 'waiting')).toBe(false);
    expect(matchesFilter(r(null, '2026-11-10'), 'never')).toBe(true);
    expect(matchesFilter(r(TODAY), 'never')).toBe(false);
  });
});

describe('the unit that suits the account', () => {
  const pages = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  it('Juz on the juz plan, or with about 10 juz memorized; Page inside one surah; Surah otherwise', () => {
    expect(suggestedView({ memorized: pages(582, 604), juzPlan: false })).toBe('surah');
    expect(suggestedView({ memorized: pages(582, 604), juzPlan: true })).toBe('juz');
    expect(suggestedView({ memorized: pages(1, 200), juzPlan: false })).toBe('juz');
    expect(suggestedView({ memorized: pages(1, 199), juzPlan: false })).toBe('surah');
    // Al-Baqarah's first pages only.
    expect(suggestedView({ memorized: pages(2, 20), juzPlan: false })).toBe('page');
    expect(suggestedView({ memorized: [], juzPlan: false })).toBe('surah');
  });
});

describe('words', () => {
  it('when', () => {
    const at = (last: string | null, since = '2026-09-01') => recencyText(pageRecency(1, { last: () => last, since: () => since, today: TODAY }));
    expect(at(TODAY)).toBe('Today');
    expect(at('2026-11-14')).toBe('14 Nov · yesterday');
    expect(at('2026-10-24')).toBe('24 Oct · 22 days ago');
    expect(at(null, '2026-11-10')).toBe('Not revised yet');
    expect(at(null)).toBe('Never revised');
  });

  it('under its row, a page says how long ago only: the row gives the date', () => {
    const at = (last: string | null, since = '2026-09-01') => recencyShort(pageRecency(1, { last: () => last, since: () => since, today: TODAY }));
    expect(at(TODAY)).toBe('Today');
    expect(at('2026-11-14')).toBe('Yesterday');
    expect(at('2026-10-24')).toBe('22 days ago');
    expect(at(null, '2026-11-10')).toBe('Not revised yet');
    expect(at(null)).toBe('Never revised');
  });

  it('the unit and sort picked, kept per account; anything unreadable is nothing picked', () => {
    expect(parseLastRevisedPrefs(JSON.stringify({ view: 'hizb', sort: 'mushaf' }))).toEqual({ view: 'hizb', sort: 'mushaf' });
    expect(parseLastRevisedPrefs(JSON.stringify({ view: 'nonsense', sort: 7 }))).toEqual({ view: undefined, sort: undefined });
    expect(parseLastRevisedPrefs('{')).toEqual({});
    expect(parseLastRevisedPrefs(null)).toEqual({});
  });
});

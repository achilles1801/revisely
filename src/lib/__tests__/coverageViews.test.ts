import {
  coverageWords,
  defaultOpenJuz,
  openJuz,
  pageCoverage,
  pageWords,
  parseCoverageView,
  parseOpenChoices,
  stateOf,
  surahCoverage,
  toggleJuz,
  type CoverageInput,
} from '../coverageViews';
import { getPagesForJuz } from '../quranData';
import { plainText } from '../passages';

const TODAY = '2026-11-03';
const ago = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// Majd's case: Juz 30 memorized yesterday, today's five pages revised.
const fresh: CoverageInput = {
  memorized: new Set(range(582, 604)),
  last: new Map(range(582, 586).map((p) => [p, TODAY])),
  today: TODAY,
  sinceOf: () => ago(1),
};

describe('Coverage views (ACT-26)', () => {
  it('[ACT-26] Surah: the memorized surahs under the juz each starts in, each with its own counts', () => {
    const groups = surahCoverage(fresh);
    expect(groups.map((g) => g.juz)).toEqual([30]);
    expect(groups[0].counts).toEqual({ week: 5, month: 0, new: 18, stale: 0 });
    expect(coverageWords(groups[0].counts)).toBe('5 of 23 pages revised, the rest not revised yet');
    const [naba, naziat] = groups[0].surahs;
    expect(plainText(naba.name)).toBe('An-Naba');
    expect(naba.counts).toEqual({ week: 2, month: 0, new: 0, stale: 0 });
    expect(coverageWords(naba.counts)).toBe('revised this week');
    expect(plainText(naziat.name)).toBe("An-Nazi'at");
    expect(groups[0].surahs.map((s) => plainText(s.name)).slice(-1)).toEqual(['An-Nas']);
    expect(groups[0].surahs).toHaveLength(37);
  });

  it('a surah running on into the next juz is under both, each with that juz’s pages (as the juz sheet’s rows)', () => {
    // Al-Baqarah's last pages (40–49) run from Juz 2 (22–41) into Juz 3 (42–61).
    const last = new Map(range(40, 41).map((p) => [p, ago(1)]));
    const groups = surahCoverage({ memorized: new Set(range(40, 49)), last, today: TODAY, sinceOf: () => ago(2) });
    expect(groups.map((g) => [g.juz, g.surahs.map((s) => [s.sura, s.pages])])).toEqual([
      [2, [[2, [40, 41]]]],
      [3, [[2, range(42, 49)]]],
    ]);
    expect(groups[0].surahs[0].counts).toEqual({ week: 2, month: 0, new: 0, stale: 0 });
    expect(groups[1].counts.new).toBe(8);
  });

  it('[ACT-26] the juz open at first: those with something to act on, else the one revised least recently', () => {
    expect(defaultOpenJuz(surahCoverage(fresh))).toEqual([30]);
    const juz28 = getPagesForJuz(28);
    const juz29 = getPagesForJuz(29);
    const settled: CoverageInput = {
      memorized: new Set([...juz28, ...juz29]),
      last: new Map([...juz28.map((p) => [p, ago(2)] as const), ...juz29.map((p) => [p, ago(12)] as const)]),
      today: TODAY,
    };
    expect(defaultOpenJuz(surahCoverage(settled))).toEqual([29]);
    // A juz with a page 30+ days: that one.
    const juz4 = getPagesForJuz(4);
    const withOld: CoverageInput = { ...settled, memorized: new Set([...juz28, ...juz29, ...juz4]), last: new Map([...settled.last, ...juz4.map((p) => [p, ago(41)] as const)]) };
    expect(defaultOpenJuz(surahCoverage(withOld))).toEqual([4]);
    expect(defaultOpenJuz([])).toEqual([]);
  });

  it('[ACT-26] the user’s choices sit over the default: a juz they closed stays closed, one they opened stays open', () => {
    const groups = surahCoverage(fresh);
    expect([...openJuz(groups, parseOpenChoices(null))]).toEqual([30]);
    const closed = toggleJuz(parseOpenChoices(null), 30, true);
    expect(closed).toEqual({ opened: [], closed: [30] });
    expect([...openJuz(groups, closed)]).toEqual([]);
    const reopened = toggleJuz(closed, 30, false);
    expect(reopened).toEqual({ opened: [30], closed: [] });
    expect([...openJuz(groups, reopened)]).toEqual([30]);
    // Kept as JSON on the phone; anything unreadable is no choice.
    expect(parseOpenChoices(JSON.stringify(reopened))).toEqual(reopened);
    expect(parseOpenChoices('{not json')).toEqual({ opened: [], closed: [] });
    expect(parseOpenChoices(JSON.stringify({ opened: [0, 31, 'x', 4], closed: 5 }))).toEqual({ opened: [4], closed: [] });
  });

  it('[ACT-26] Page: a row per juz with a memorized page, a cell per page of the juz', () => {
    const rows = pageCoverage(fresh);
    expect(rows.map((r) => r.juz)).toEqual([30]);
    expect(rows[0].cells).toHaveLength(23);
    expect(rows[0].cells.slice(3, 7)).toEqual([
      { page: 585, state: 'week' },
      { page: 586, state: 'week' },
      { page: 587, state: 'new' },
      { page: 588, state: 'new' },
    ]);
    // A juz partly memorized: its other pages are cells too, not memorized.
    const partly = pageCoverage({ memorized: new Set([562]), last: new Map(), today: TODAY, sinceOf: () => TODAY });
    expect(partly[0].cells[0]).toEqual({ page: 562, state: 'new' });
    expect(partly[0].cells[1]).toEqual({ page: 563, state: 'none' });
    expect(pageWords('stale')).toBe('over 30 days');
    expect(pageWords('none')).toBe('not memorized');
  });

  it('words and state for every mix', () => {
    expect(coverageWords({ week: 0, month: 0, new: 0, stale: 0 })).toBe('not memorized');
    expect(coverageWords({ week: 2, month: 0, new: 0, stale: 0 })).toBe('revised this week');
    expect(coverageWords({ week: 0, month: 3, new: 0, stale: 0 })).toBe('revised this month');
    expect(coverageWords({ week: 2, month: 3, new: 0, stale: 0 })).toBe('2 of 5 pages this week, the rest this month');
    expect(coverageWords({ week: 0, month: 0, new: 1, stale: 0 })).toBe('not revised yet');
    expect(coverageWords({ week: 0, month: 0, new: 0, stale: 4 })).toBe('over 30 days');
    expect(coverageWords({ week: 15, month: 0, new: 0, stale: 5 })).toBe('5 of 20 pages over 30 days');
    expect(stateOf({ week: 15, month: 0, new: 2, stale: 0 })).toBe('new');
    expect(stateOf({ week: 0, month: 0, new: 0, stale: 0 })).toBe('none');
  });

  it('the view kept on the phone: Juz unless it says Surah or Page', () => {
    expect(parseCoverageView('surah')).toBe('surah');
    expect(parseCoverageView('page')).toBe('page');
    expect(parseCoverageView(null)).toBe('juz');
    expect(parseCoverageView('hizb')).toBe('juz');
  });
});

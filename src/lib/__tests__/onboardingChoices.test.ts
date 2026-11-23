import { chosenCounts, daysPerRound, firstDayPages, juzState, memorizedWithPending, toggleJuz } from '../onboardingChoices';
import { getPagesForJuz } from '../quranData';
import type { PageStatus } from '../memorizationChanges';
import type { UserPage } from '../../types';

const page = (pageNumber: number, status: UserPage['status'] = 'not_memorized'): UserPage => ({
  pageNumber,
  status,
  dateMemorized: null,
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
});
const all = () => Array.from({ length: 604 }, (_, i) => page(i + 1));

describe('toggleJuz', () => {
  it('chooses a whole juz, then clears it, leaving nothing in the buffer', () => {
    const on = toggleJuz(30, all(), new Map(), [], new Map());
    expect(memorizedWithPending(all(), on.pending)).toEqual(getPagesForJuz(30));
    const off = toggleJuz(30, all(), on.pending, [], on.pendingSurahs);
    expect(off.pending.size).toBe(0);
  });

  it('a partly chosen juz becomes whole first', () => {
    const pending = new Map<number, PageStatus>([[1, 'memorized']]);
    const next = toggleJuz(1, all(), pending, [], new Map());
    expect(juzState(1, new Set(memorizedWithPending(all(), next.pending)))).toBe('all');
  });

  it('counts a page not loaded yet', () => {
    const loaded = all().slice(0, 450);
    const next = toggleJuz(30, loaded, new Map(), [], new Map());
    expect(memorizedWithPending(loaded, next.pending)).toEqual(getPagesForJuz(30));
  });

  it('clearing a juz takes back a saved page, and any surah that loses a page', () => {
    const saved = all().map((p) => (p.pageNumber === 2 ? page(2, 'memorized') : p));
    const whole = toggleJuz(1, saved, new Map(), [], new Map<number, PageStatus>([[1, 'memorized']]));
    const cleared = toggleJuz(1, saved, whole.pending, [2], whole.pendingSurahs);
    expect(memorizedWithPending(saved, cleared.pending)).toEqual([]);
    // Al-Fatihah was only in the buffer; Al-Baqarah was saved, so it is cleared explicitly.
    expect(cleared.pendingSurahs.has(1)).toBe(false);
    expect(cleared.pendingSurahs.get(2)).toBe('not_memorized');
  });
});

describe('chosenCounts', () => {
  it('counts whole juz, and the pages outside them', () => {
    expect(chosenCounts([1])).toEqual({ juz: 0, pages: 1 });
    expect(chosenCounts(getPagesForJuz(30))).toEqual({ juz: 1, pages: 0 });
    expect(chosenCounts([1, ...getPagesForJuz(30)])).toEqual({ juz: 1, pages: 1 });
    expect(chosenCounts([])).toEqual({ juz: 0, pages: 0 });
  });
});

describe('the plan’s numbers', () => {
  const memorized = [1, ...getPagesForJuz(30)];

  it('a round takes the pages over the daily amount, or the juz over the juz a day', () => {
    expect(daysPerRound(memorized, 'pages', 10, 1)).toBe(3);
    expect(daysPerRound(memorized, 'juz', 10, 1)).toBe(2);
    expect(daysPerRound([], 'pages', 10, 1)).toBe(0);
  });

  it('day one is the first pages, or the first juz, in mushaf order', () => {
    expect(firstDayPages(memorized, 'pages', 3, 1)).toEqual([1, 582, 583]);
    expect(firstDayPages(memorized, 'juz', 10, 1)).toEqual([1]);
    expect(firstDayPages(memorized, 'juz', 10, 2)).toEqual(memorized);
  });
});

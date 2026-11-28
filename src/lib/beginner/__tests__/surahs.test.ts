// The beginner path's surahs (BEHAVIOUR.md BEGIN-1, BEGIN-3, BEGIN-5): their order, what a choice changes by the ayah, the
// next on the path, and about how long a day takes.
import { ayahKey, ayahsOnPage } from '../../ayahKeys';
import type { UserPage } from '../../../types';
import { BEGINNER_SURAHS, knownSurahs, minutesFor, nextSurahOnPath, surahAyahs, surahChoiceChanges } from '../surahs';

const page = (pageNumber: number, status: UserPage['status'], verses?: number[]): UserPage => ({
  pageNumber,
  status,
  dateMemorized: null,
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
  ...(verses ? { verses } : {}),
});

describe('[BEGIN-1] the path’s surahs', () => {
  it('Al-Fatihah, then An-Nas back to An-Naba: 38, each once', () => {
    expect(BEGINNER_SURAHS).toHaveLength(38);
    expect(BEGINNER_SURAHS.slice(0, 4)).toEqual([1, 114, 113, 112]);
    expect(BEGINNER_SURAHS[BEGINNER_SURAHS.length - 1]).toBe(78);
    expect(new Set(BEGINNER_SURAHS).size).toBe(38);
  });

  it('a surah’s ayahs, in order', () => {
    expect(surahAyahs(1)).toEqual([1, 2, 3, 4, 5, 6, 7].map((a) => ayahKey(1, a)));
    expect(surahAyahs(108)).toHaveLength(3);
  });

  it('a surah is known once every ayah is, also on a shared page (An-Nas on the last page)', () => {
    const known = knownSurahs([page(1, 'memorized'), page(604, 'in_progress', surahAyahs(114))]);
    expect([...known].sort((a, b) => a - b)).toEqual([1, 114]);
    // Part of Al-Falaq isn't Al-Falaq.
    expect(knownSurahs([page(604, 'in_progress', surahAyahs(113).slice(0, 3))]).has(113)).toBe(false);
  });

  it('the next on the path is the first not known; none once all 38 are', () => {
    expect(nextSurahOnPath(new Set())).toBe(1);
    expect(nextSurahOnPath(new Set([1, 114, 113]))).toBe(112);
    expect(nextSurahOnPath(new Set([114]))).toBe(1);
    expect(nextSurahOnPath(new Set(BEGINNER_SURAHS))).toBeNull();
  });
});

describe('[BEGIN-5] what saving a choice changes', () => {
  it('adds the ayahs of surahs newly chosen, never touching those known', () => {
    const { add, remove, added } = surahChoiceChanges(new Set([1]), new Set([1, 112]), false);
    expect(added).toEqual([112]);
    expect(add).toEqual(surahAyahs(112));
    expect(remove).toEqual([]);
  });

  it('in setup, takes off a path surah known before and no longer chosen; a surah off the path is never touched', () => {
    const { add, remove } = surahChoiceChanges(new Set([1, 114, 67]), new Set([114]), true);
    expect(add).toEqual([]);
    expect(remove).toEqual(surahAyahs(1));
  });

  it('Your surahs never takes one off', () => {
    expect(surahChoiceChanges(new Set([1, 114]), new Set(), false).remove).toEqual([]);
  });
});

describe('[BEGIN-3] about how long today takes', () => {
  it('two minutes a page, Al-Fatihah’s and Al-Baqarah’s first pages as half pages, at least a minute', () => {
    expect(minutesFor([1], new Map())).toBe(1);
    expect(minutesFor([604], new Map())).toBe(2);
    expect(minutesFor([1, 604], new Map())).toBe(3);
    expect(minutesFor([1, 2, 3], new Map())).toBe(4);
    expect(minutesFor([], new Map())).toBe(1);
  });

  it('a partly memorized page counts for its memorized ayahs’ share of it (MEM-2)', () => {
    const all = minutesFor([604], new Map());
    const anNas = minutesFor([604], new Map([[604, surahAyahs(114)]]));
    expect(anNas).toBeLessThanOrEqual(all);
    expect(minutesFor([604], new Map([[604, ayahsOnPage(604)]]))).toBe(all);
  });

  it('a juz of pages reads in tens of minutes, not one', () => {
    expect(minutesFor(Array.from({ length: 10 }, (_, i) => 582 + i), new Map())).toBe(20);
  });
});

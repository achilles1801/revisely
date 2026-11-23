import { getPagesForHizb, getPagesForJuz } from '../quranData';
import {
  chosenHalf,
  chosenInJuz,
  chosenWords,
  foldName,
  juzHalves,
  juzParts,
  juzStates,
  searchPlaces,
  setJuzPages,
  togglePages,
} from '../revisedPicker';

const ALL = new Set(Array.from({ length: 604 }, (_, i) => i + 1));

describe('Revised elsewhere’s picker (ACT-33)', () => {
  it('every juz is its two hizbs and its four parts, in order, with nothing left out', () => {
    for (let juz = 1; juz <= 30; juz++) {
      const pages = getPagesForJuz(juz);
      expect(juzHalves(juz).flat()).toEqual(pages);
      expect(juzParts(juz).flat()).toEqual(pages);
      expect(juzParts(juz).length).toBeLessThanOrEqual(4);
    }
  });

  it('a juz is all, part or none of what can be logged in it', () => {
    const canLog = new Set(getPagesForJuz(1).slice(0, 4));
    const states = juzStates(new Set(canLog), canLog);
    expect(states[0]).toBe('all');
    expect(states[1]).toBe('none');
    expect(juzStates(new Set([[...canLog][0]]), canLog)[0]).toBe('part');
  });

  it('a toggle takes the pages, or gives them back when all were chosen', () => {
    const on = togglePages(new Set([1]), [1, 2]);
    expect([...on]).toEqual([1, 2]);
    expect([...togglePages(on, [1, 2])]).toEqual([]);
  });

  it('says what is chosen: whole juz first, then the halves and parts', () => {
    const half = getPagesForHizb(38).filter((p) => getPagesForJuz(19).includes(p));
    const chosen = new Set([...getPagesForJuz(18), ...getPagesForJuz(20), ...half]);
    expect(chosenWords(chosen, ALL)).toBe('Juz 18, Juz 20 and half of Juz 19');
    expect(chosenWords(new Set(), ALL)).toBe('');
    expect(chosenWords(new Set([getPagesForJuz(5)[0]]), ALL)).toBe('part of Juz 5');
    const many = new Set([1, ...getPagesForJuz(3), ...getPagesForJuz(4), ...getPagesForJuz(5), ...getPagesForJuz(6)]);
    expect(chosenWords(many, ALL)).toBe('Juz 3, Juz 4 and 3 more');
  });

  it('names a juz opened for part of it', () => {
    const half = juzHalves(19)[1];
    expect(chosenHalf(19, new Set(half), ALL)).toBe(1);
    expect(chosenInJuz(19, new Set(half), ALL)).toEqual({ title: 'Second half of Juz 19', detail: `${half.length} pages · Hizb 38` });
    expect(chosenInJuz(19, new Set(), ALL)).toBeNull();
    expect(chosenInJuz(19, new Set(getPagesForJuz(19)), ALL)?.title).toBe('Juz 19');
    expect(chosenInJuz(19, new Set(half.slice(0, 2)), ALL)?.title).toBe('Part of Juz 19');
  });

  it('a juz’s pages are replaced without touching another’s', () => {
    const other = getPagesForJuz(2)[0];
    const next = setJuzPages(new Set([...getPagesForJuz(1), other]), 1, [3]);
    expect([...next].sort((a, b) => a - b)).toEqual([3, other]);
  });

  it('search folds names, finds a surah with the juz that hold it, and finds a juz by number', () => {
    expect(foldName('An-Naml')).toBe(foldName('an naml'));
    expect(foldName('١٩')).toBe('19');
    const naml = searchPlaces('naml', ALL);
    expect(naml[0].key).toBe('surah-27');
    expect(naml.slice(1).map((r) => r.key)).toEqual(['juz-19', 'juz-20']);
    expect(naml[1].detail).toMatch(/^Has An.Naml’s /);
    expect(searchPlaces('النمل', ALL)[0].key).toBe('surah-27');
    expect(searchPlaces('juz 19', ALL).map((r) => r.key)).toEqual(['juz-19']);
    expect(searchPlaces('19', ALL).map((r) => r.key).sort()).toEqual(expect.arrayContaining(['juz-19', 'surah-19']));
    expect(searchPlaces('zzz', ALL)).toEqual([]);
    expect(searchPlaces('   ', ALL)).toEqual([]);
  });

  it('search offers only what can be logged', () => {
    const canLog = new Set(getPagesForJuz(1));
    expect(searchPlaces('naml', canLog)).toEqual([]);
    expect(searchPlaces('baqarah', canLog).map((r) => r.key)).toEqual(['surah-2', 'juz-1']);
  });
});

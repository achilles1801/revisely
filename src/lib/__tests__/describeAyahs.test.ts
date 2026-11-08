import { ayahsBetween, ayahsOfPages } from '../ayahKeys';
import { __resetMushafEditionForTests, __setMushafEditionForTests } from '../mushafEdition';
import { describeAyahs, describePagesToRevise, describePassage, placeOfPageToRevise, plainText } from '../passages';
import { getPagesForJuz } from '../quranData';

const words = (keys: number[], opts?: Parameters<typeof describeAyahs>[1]) => plainText(describeAyahs(keys, opts));
const juzPages = (...juz: number[]) => juz.flatMap(getPagesForJuz);
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

beforeAll(() => __setMushafEditionForTests('madani1405'));
afterAll(() => __resetMushafEditionForTests());

describe('describeAyahs: any ayahs, by surah and ayah', () => {
  it('names part of a surah by its ayahs', () => {
    const alMulk = ayahsBetween(67001, 67020);
    expect(words(alMulk)).toBe('Al-Mulk, ayahs 1–20');
    expect(words(alMulk, { form: 'compact' })).toBe('Al-Mulk 1–20');
    expect(words(alMulk, { form: 'short' })).toBe('Start of Al-Mulk');
    expect(words([67007])).toBe('Al-Mulk, ayah 7');
    expect(words(ayahsBetween(67013, 67020), { form: 'short' })).toBe('Al-Mulk 13–20');
  });

  it('names a run across surahs from verse to verse, and a whole surah by name', () => {
    expect(words(ayahsBetween(67027, 68015))).toBe('Al-Mulk 27 to Al-Qalam 15');
    expect(words(ayahsBetween(67001, 68015))).toBe('Al-Mulk to Al-Qalam 15');
    expect(words(ayahsBetween(67001, 67030))).toBe('Al-Mulk');
    expect(words(ayahsBetween(112001, 114006))).toBe('Al-Ikhlas to An-Nas');
  });

  it('lists separate parts, whole juz carved out as for pages', () => {
    const set = [...ayahsOfPages(juzPages(1, 2, 3, 4, 5, 6)), ...ayahsBetween(67001, 67020)];
    expect(words(set)).toBe('Juz 1–6 and Al-Mulk 1–20');
    const run = [...ayahsOfPages(juzPages(21, 22, 23, 24, 25, 26, 27, 28)), ...ayahsBetween(67001, 67020)];
    expect(words(run)).toBe('Juz 21–28 and Al-Mulk 1–20');
    expect(words([2255, 67001, 112001], { max: 2 })).toBe('Al-Baqarah 255 and 2 more');
  });

  it('names whole pages exactly as describePassage names them', () => {
    const sets = [[562], [562, 563], juzPages(28), [...juzPages(1, 2), 300, 301, 604], [1, 2, 3, 50, 51, 400], juzPages(29, 30)];
    for (const pages of sets) {
      for (const form of ['long', 'compact', 'short'] as const) {
        expect(describeAyahs(ayahsOfPages(pages), { form })).toBe(describePassage(pages, { form }));
      }
    }
  });

  it('says nothing for no ayahs, and skips what aren’t ayahs', () => {
    expect(describeAyahs([])).toBe('');
    expect(words([67000, 67007, 999999])).toBe('Al-Mulk, ayah 7');
  });
});

describe('describePagesToRevise: pages, a partly memorized one by its ayahs', () => {
  const anNas = new Map([[604, [114001, 114002, 114003, 114004, 114005, 114006]]]);
  const plainOf = (s: string) => plainText(s);

  it('names a partly memorized page by its memorized ayahs, in mushaf order or the order given', () => {
    expect(plainOf(describePagesToRevise([603, 604], anNas))).toBe('Al-Kafirun to Al-Masad and An-Nas');
    expect(plainOf(describePagesToRevise([603, 604, 1], anNas, { order: 'given', juz: true }))).toBe('Al-Kafirun to Al-Masad and An-Nas, then Al-Fatihah');
    expect(plainOf(placeOfPageToRevise(604, anNas))).toBe('An-Nas');
    expect(plainOf(placeOfPageToRevise(603, anNas))).toBe('Al-Kafirun');
  });

  it('with no partly memorized page among them, is describePassage', () => {
    for (const opts of [{}, { order: 'given' as const, juz: true }, { form: 'short' as const, max: 2 }]) {
      expect(describePagesToRevise(range(542, 561), anNas, opts)).toBe(describePassage(range(542, 561), opts));
      expect(describePagesToRevise([595, 596, 1, 2], new Map(), opts)).toBe(describePassage([595, 596, 1, 2], opts));
    }
  });
});

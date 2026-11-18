// The surahs' Arabic names, as the reader's header, the Read tab, the verse sheet and the wheels show them.
// Spelled as the King Fahd Complex mushaf and standard Arabic spelling write them. Tanzil's and Quran.com's lists
// drop or add a hamza in a few names (ابراهيم, الإنفطار, الإنشقاق, الانسان); a native reader stops at those.
import { getAllSurahs, getSurahDisplay } from '../quranData';

const HARAKAT = /[ً-ٰٟ]/g;
const plain = (n: number) => getAllSurahs()[n - 1].nameArabic;
const voweled = (n: number) => getSurahDisplay(n)!.nameArabicVoweled;

describe('surah names in Arabic', () => {
  it('has all 114, and the voweled name is the plain one with its harakat', () => {
    expect(getAllSurahs()).toHaveLength(114);
    for (let n = 1; n <= 114; n++) {
      expect([n, voweled(n).replace(HARAKAT, '')]).toEqual([n, plain(n)]);
    }
  });

  it('writes no hamza on the wasl alif of انفطار and انشقاق (verbal nouns of انفعل)', () => {
    expect(plain(82)).toBe('الانفطار');
    expect(plain(84)).toBe('الانشقاق');
    expect(voweled(82)).toBe('الِانْفِطَار');
    expect(voweled(84)).toBe('الِانْشِقَاق');
  });

  it('keeps the hamza where it is written: إبراهيم, الإسراء, الإنسان, الإخلاص, سبأ, النبأ', () => {
    expect([14, 17, 76, 112, 34, 78].map(plain)).toEqual(['إبراهيم', 'الإسراء', 'الإنسان', 'الإخلاص', 'سبأ', 'النبأ']);
  });

  it('leaves the opening letters unvoweled, as the mushaf writes them: طه، يس، ص، ق', () => {
    expect([20, 36, 38, 50].map(voweled)).toEqual(['طه', 'يس', 'ص', 'ق']);
  });

  it('uses no tatweel', () => {
    for (let n = 1; n <= 114; n++) expect(plain(n) + voweled(n)).not.toContain('ـ');
  });
});

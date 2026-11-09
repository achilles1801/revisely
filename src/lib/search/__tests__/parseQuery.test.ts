import { hasArabic, parseReference } from '../parseQuery';

describe('parseReference', () => {
  it('reads an ayah as surah:ayah, in any digits', () => {
    expect(parseReference('2:255')).toEqual([{ kind: 'verse', sura: 2, ayah: 255 }]);
    expect(parseReference(' 10 16 ')).toEqual([{ kind: 'verse', sura: 10, ayah: 16 }]);
    expect(parseReference('١٠:١٦')).toEqual([{ kind: 'verse', sura: 10, ayah: 16 }]);
    expect(parseReference('1:8')).toEqual([]);
    expect(parseReference('115:1')).toEqual([]);
  });

  it('reads pages and juz', () => {
    expect(parseReference('pg 62')).toEqual([{ kind: 'page', page: 62 }]);
    expect(parseReference('Page 604')).toEqual([{ kind: 'page', page: 604 }]);
    expect(parseReference('p.62')).toEqual([{ kind: 'page', page: 62 }]);
    expect(parseReference('صفحة ٦٢')).toEqual([{ kind: 'page', page: 62 }]);
    expect(parseReference('page 605')).toEqual([]);
    expect(parseReference("juz' 30")).toEqual([{ kind: 'juz', juz: 30 }]);
    expect(parseReference('الجزء 1')).toEqual([{ kind: 'juz', juz: 1 }]);
  });

  it('offers a surah and a page for a bare number', () => {
    expect(parseReference('62')).toEqual([
      { kind: 'surah', sura: 62 },
      { kind: 'page', page: 62 },
    ]);
    expect(parseReference('300')).toEqual([{ kind: 'page', page: 300 }]);
  });

  it('reads surah names, with or without their article, spelling and marks', () => {
    expect(parseReference('Yunus')).toEqual([{ kind: 'surah', sura: 10 }]);
    expect(parseReference('al-fatihah')).toEqual([{ kind: 'surah', sura: 1 }]);
    expect(parseReference('Fatiha')).toEqual([{ kind: 'surah', sura: 1 }]);
    expect(parseReference('surah kahf')).toEqual([{ kind: 'surah', sura: 18 }]);
    expect(parseReference("Āli-'Imrān")).toEqual([{ kind: 'surah', sura: 3 }]);
    expect(parseReference('baqara')).toEqual([{ kind: 'surah', sura: 2 }]);
  });

  it('reads a surah name with an ayah', () => {
    expect(parseReference('Yunus 16')).toEqual([{ kind: 'verse', sura: 10, ayah: 16 }]);
    expect(parseReference('al-kahf:10')).toEqual([{ kind: 'verse', sura: 18, ayah: 10 }]);
    expect(parseReference('يونس ١٦')).toEqual([{ kind: 'verse', sura: 10, ayah: 16 }]);
  });

  it('reads Arabic surah names', () => {
    expect(parseReference('يونس')).toEqual([{ kind: 'surah', sura: 10 }]);
    expect(parseReference('سورة الكهف')).toEqual([{ kind: 'surah', sura: 18 }]);
    expect(parseReference('فاتحة')).toEqual([{ kind: 'surah', sura: 1 }]);
  });

  it('names no place for words of an ayah', () => {
    expect(parseReference('قل لو شاء الله')).toEqual([]);
    expect(parseReference('hello there')).toEqual([]);
  });
});

describe('hasArabic', () => {
  it('tells Arabic words from the rest', () => {
    expect(hasArabic('قل')).toBe(true);
    expect(hasArabic('2:255')).toBe(false);
    expect(hasArabic('Yunus')).toBe(false);
  });
});

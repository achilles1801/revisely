jest.mock('expo-file-system', () => ({}));
jest.mock('../clearQuran', () => ({
  getClearQuranVerse: jest.fn(),
  peekClearQuranVerse: jest.fn(),
  prefetchClearQuran: jest.fn(),
  prefetchClearQuranAround: jest.fn(),
}));

import {
  arabicDigits,
  formatVerseForSharing,
  PDF,
  RLE,
  verseEndMark,
  verseReference,
  verseShareText,
} from '../verseShare';

// The user's example (Āl ʿImrān 3:5), as the Quran.com app copies it.
const AL_IMRAN_5 = 'إِنَّ ٱللَّهَ لَا یَخۡفَىٰ عَلَیۡهِ شَیۡءࣱ فِی ٱلۡأَرۡضِ وَلَا فِی ٱلسَّمَاۤءِ';

describe('the verse number', () => {
  it('in Arabic-Indic digits, most significant first', () => {
    expect(arabicDigits(5)).toBe('٥');
    expect(arabicDigits(10)).toBe('١٠');
    expect(arabicDigits(255)).toBe('٢٥٥');
    expect(arabicDigits(286)).toBe('٢٨٦');
  });

  it('inside the ornate parentheses, spaced: ﴿ ٥ ﴾', () => {
    expect(verseEndMark(5)).toBe('﴿ ٥ ﴾');
    expect([...verseEndMark(5)].map((c) => c.codePointAt(0)!.toString(16))).toEqual([
      'fd3f',
      '20',
      '665',
      '20',
      'fd3e',
    ]);
    expect(verseEndMark(286)).toBe('﴿ ٢٨٦ ﴾');
  });
});

describe('the copied text', () => {
  it('is the verse, its number, then a blank line and the reference: the user’s example', () => {
    expect(formatVerseForSharing(AL_IMRAN_5, 3, 5)).toBe(
      `\u202B${AL_IMRAN_5}﴿ ٥ ﴾\u202C\n\nĀli-'Imrān, Ayah 5`,
    );
  });

  it('the Arabic line alone sits between one right-to-left embedding and its pop', () => {
    const text = formatVerseForSharing(AL_IMRAN_5, 3, 5);
    const [arabicLine, blank, reference] = text.split('\n');
    expect(arabicLine.startsWith(RLE)).toBe(true);
    expect(arabicLine.endsWith(PDF)).toBe(true);
    expect(text.split(RLE)).toHaveLength(2);
    expect(text.split(PDF)).toHaveLength(2);
    expect(blank).toBe('');
    expect(reference).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/);
  });

  it('multi-digit verse numbers', () => {
    expect(formatVerseForSharing('ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ', 2, 255)).toBe(
      '\u202Bٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ﴿ ٢٥٥ ﴾\u202C\n\nAl-Baqarah, Ayah 255',
    );
    expect(formatVerseForSharing('نٓ', 68, 1)).toMatch(/﴿ ١ ﴾\u202C\n\nAl-Qalam, Ayah 1$/);
  });

  it('trims space around the Arabic, so the number follows the last word', () => {
    expect(formatVerseForSharing(`  ${AL_IMRAN_5} \n`, 3, 5).startsWith(`${RLE}${AL_IMRAN_5}﴿`)).toBe(true);
  });
});

describe('the reference', () => {
  it('is the app’s surah name, with its diacritics, and the ayah', () => {
    expect(verseReference(1, 1)).toBe('Al-Fātiḥah, Ayah 1');
    expect(verseReference(3, 5)).toBe("Āli-'Imrān, Ayah 5");
    expect(verseReference(20, 14)).toBe('Ṭāhā, Ayah 14');
    expect(verseReference(86, 1)).toBe('Aṭ-Ṭāriq, Ayah 1');
    expect(verseReference(26, 227)).toBe("Ash-Shu'arā', Ayah 227");
  });

  it('in composed characters, so it pastes and searches the same everywhere', () => {
    for (const sura of [1, 3, 20, 58, 86, 114]) {
      const ref = verseReference(sura, 1);
      expect(ref).toBe(ref.normalize('NFC'));
    }
  });
});

describe('verseShareText: the verse sheet’s Arabic', () => {
  const ayah = (sura: number, numberInSurah: number, text: string) => ({
    numberInSurah,
    text,
    surah: { number: sura, englishName: 'x' },
  });
  let pages: Record<number, ReturnType<typeof ayah>[]>;
  let singles: Record<string, ReturnType<typeof ayah>>;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    pages = {};
    singles = {};
    fetchMock = jest.fn(async (url: string) => {
      const page = url.match(/\/page\/(\d+)\/quran-uthmani$/);
      if (page) return { ok: true, json: async () => ({ data: { ayahs: pages[Number(page[1])] ?? [] } }) };
      const single = url.match(/\/ayah\/(\d+:\d+)\/quran-uthmani$/);
      if (single && singles[single[1]]) return { ok: true, json: async () => ({ data: singles[single[1]] }) };
      return { ok: false, status: 404, json: async () => ({}) };
    });
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  });

  it('the Uthmani edition, from the page the verse is held on', async () => {
    pages[50] = [ayah(3, 5, AL_IMRAN_5)];
    await expect(verseShareText(50, 3, 5)).resolves.toBe(`${RLE}${AL_IMRAN_5}﴿ ٥ ﴾${PDF}\n\nĀli-'Imrān, Ayah 5`);
    expect(fetchMock).toHaveBeenCalledWith('https://api.alquran.cloud/v1/page/50/quran-uthmani');
  });

  it('the whole verse, however long: 2:282 fills page 48 by itself', async () => {
    const whole = 'يَٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُوٓا۟ إِذَا تَدَايَنتُم … وَٱللَّهُ بِكُلِّ شَىْءٍ عَلِيمٌ';
    pages[48] = [ayah(2, 282, whole)];
    await expect(verseShareText(48, 2, 282)).resolves.toBe(`${RLE}${whole}﴿ ٢٨٢ ﴾${PDF}\n\nAl-Baqarah, Ayah 282`);
  });

  it('a verse its page’s listing lacks is fetched on its own, whole', async () => {
    // Should the API's page differ from the mushaf's, the verse comes by its key.
    const whole = 'وَإِن كُنتُمْ عَلَىٰ سَفَرٍ … وَٱللَّهُ بِمَا تَعْمَلُونَ عَلِيمٌ';
    pages[49] = [ayah(2, 284, 'لِّلَّهِ مَا فِى ٱلسَّمَٰوَٰتِ')];
    singles['2:283'] = ayah(2, 283, whole);
    await expect(verseShareText(49, 2, 283)).resolves.toBe(`${RLE}${whole}﴿ ٢٨٣ ﴾${PDF}\n\nAl-Baqarah, Ayah 283`);
    expect(fetchMock).toHaveBeenCalledWith('https://api.alquran.cloud/v1/ayah/2:283/quran-uthmani');
  });

  it('without the basmala the API puts before a surah’s first verse, as the sheet shows it', async () => {
    pages[2] = [ayah(2, 1, 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ الٓمٓ')];
    await expect(verseShareText(2, 2, 1)).resolves.toBe(`${RLE}الٓمٓ﴿ ١ ﴾${PDF}\n\nAl-Baqarah, Ayah 1`);
  });

  it('Al-Fātiḥah 1 is the basmala, and keeps it', async () => {
    pages[1] = [ayah(1, 1, 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ')];
    await expect(verseShareText(1, 1, 1)).resolves.toMatch(/^\u202Bبِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ﴿ ١ ﴾/);
  });

  it('fails, rather than copying something else, when the verse can’t be loaded', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('offline');
    });
    await expect(verseShareText(200, 9, 1)).rejects.toThrow();
  });
});

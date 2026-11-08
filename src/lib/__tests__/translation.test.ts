jest.mock('expo-file-system', () => ({}));
const mockClearQuranVerse = jest.fn();
const mockPeekClearQuran = jest.fn((_s: number, _a: number): string | undefined => undefined);
const mockPrefetchClearQuran = jest.fn();
const mockPrefetchAround = jest.fn();
jest.mock('../clearQuran', () => ({
  getClearQuranVerse: (...a: unknown[]) => mockClearQuranVerse(...a),
  peekClearQuranVerse: (s: number, a: number) => mockPeekClearQuran(s, a),
  prefetchClearQuran: (...a: unknown[]) => mockPrefetchClearQuran(...a),
  prefetchClearQuranAround: (...a: unknown[]) => mockPrefetchAround(...a),
}));
// Saheeh International (lib/saheeh, its own tests): a sura of seven verses kept once one loads.
const mockSaheehLoaded = new Map<string, { text: string; footnotes: string; version: string }>();
const mockSaheehVerse = jest.fn(async (s: number, a: number) => {
  for (let n = 1; n <= 7; n++) {
    mockSaheehLoaded.set(`${s}:${n}`, { text: `saheeh ${n}`, footnotes: n === 6 ? '[11] A note.' : '', version: '1.1.2' });
  }
  return mockSaheehLoaded.get(`${s}:${a}`)!;
});
const mockPrefetchSaheeh = jest.fn();
jest.mock('../saheeh', () => ({
  SAHEEH_PAGE_URL: 'https://quranenc.com/en/browse/english_saheeh',
  SAHEEH_KEY: 'english_saheeh',
  SAHEEH_BYTES: 1_093_165,
  getSaheehVerse: (s: number, a: number) => mockSaheehVerse(s, a),
  peekSaheehVerse: (s: number, a: number) => mockSaheehLoaded.get(`${s}:${a}`) ?? null,
  prefetchSaheeh: (...a: unknown[]) => mockPrefetchSaheeh(...a),
}));

import {
  CLEAR_QURAN_ID,
  creditLine,
  getVerseText,
  peekVerseText,
  prefetchVerseNeighbours,
  prefetchVerseText,
  isTranslationAvailable,
  parsePageResponse,
  pickerTitle,
  __resetTranslationForTests,
  resolveTranslation,
  stripBismillah,
  TRANSLATIONS,
} from '../translation';

describe('parsePageResponse', () => {
  it('maps the alquran.cloud page response', () => {
    const json = {
      code: 200,
      data: {
        ayahs: [
          { numberInSurah: 1, text: 'Alif, Lam, Meem.', surah: { number: 3, englishName: "Aal-i-Imraan" } },
        ],
      },
    };
    expect(parsePageResponse(json)).toEqual([
      { surahNumber: 3, surahName: 'Aal-i-Imraan', ayahNumber: 1, text: 'Alif, Lam, Meem.' },
    ]);
  });

  it('rejects an error response', () => {
    expect(() => parsePageResponse({ code: 404, data: 'Not found.' })).toThrow();
  });
});

describe('Saheeh International (QuranEnc.com)', () => {
  const saheeh = TRANSLATIONS.find((t) => t.id === 'en.sahih')!;
  const arabicPage = {
    data: { ayahs: [{ numberInSurah: 6, text: 'إِنَّ ٱلَّذِينَ', surah: { number: 2, englishName: 'Al-Baqarah' } }] },
  };

  beforeEach(() => {
    __resetTranslationForTests();
    mockSaheehLoaded.clear();
    mockSaheehVerse.mockClear();
    (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => arabicPage }));
  });

  it('comes from QuranEnc, with its footnotes and the version shown', async () => {
    const text = await getVerseText(3, 2, 6, 'en.sahih');
    expect(mockSaheehVerse).toHaveBeenCalledWith(2, 6);
    expect(text).toEqual({
      sura: 2,
      ayah: 6,
      surahName: 'Al-Baqarah',
      arabic: 'إِنَّ ٱلَّذِينَ',
      translation: 'saheeh 6',
      translationName: 'Saheeh International',
      footnotes: '[11] A note.',
      version: '1.1.2',
    });
    // alquran.cloud gives only the Arabic now: its Saheeh copy had no licence.
    const urls = (global.fetch as jest.Mock).mock.calls.map(([u]) => String(u));
    expect(urls.every((u) => u.includes('quran-uthmani'))).toBe(true);
  });

  it('carries the credit QuranEnc requires: the publisher, the source and the version', () => {
    expect(saheeh.credit).toEqual({
      text: 'Saheeh International, issued by Noor International Center',
      linkLabel: 'QuranEnc.com',
      url: 'https://quranenc.com/en/browse/english_saheeh',
    });
    expect(creditLine(saheeh, '1.1.2')).toBe('Saheeh International, issued by Noor International Center · v1.1.2');
    expect(pickerTitle(saheeh)).toBe('Saheeh International — Noor International Center');
  });
});

describe('translations', () => {
  it('falls back to Saheeh International for unknown or unavailable choices', () => {
    expect(resolveTranslation(undefined).id).toBe('en.sahih');
    expect(resolveTranslation('nope').id).toBe('en.sahih');
  });

  it('strips the basmala the API prefixes to first verses', () => {
    const baqarah1 = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ الٓمٓ';
    expect(stripBismillah(baqarah1, 2, 1)).toBe('الٓمٓ');
    expect(stripBismillah(baqarah1, 1, 1)).toBe(baqarah1); // it is Al-Fatihah 1
    expect(stripBismillah('ذَٰلِكَ ٱلْكِتَٰبُ', 2, 2)).toBe('ذَٰلِكَ ٱلْكِتَٰبُ');
  });
});

describe('The Clear Quran', () => {
  const tcq = TRANSLATIONS.find((t) => t.id === CLEAR_QURAN_ID)!;
  const arabicPage = {
    data: { ayahs: [{ numberInSurah: 6, text: 'إِنَّ ٱلَّذِينَ', surah: { number: 2, englishName: 'Al-Baqarah' } }] },
  };

  beforeEach(() => {
    mockClearQuranVerse.mockReset();
    (global as any).fetch = jest.fn(async (_url: string) => ({ ok: true, json: async () => arabicPage }));
  });

  it('carries the credit the publisher requires, and is listed with its author', () => {
    expect(tcq.credit).toEqual({
      text: 'The Clear Quran® by Dr. Mustafa Khattab',
      linkLabel: 'theclearquran.org',
      url: 'https://theclearquran.org',
    });
    expect(pickerTitle(tcq)).toBe('The Clear Quran® — Dr. Mustafa Khattab');
    // No version of its own: the credit stays as the publisher requires.
    expect(creditLine(tcq)).toBe('The Clear Quran® by Dr. Mustafa Khattab');
  });

  it('is a normal choice now: a saved choice keeps it', () => {
    expect(isTranslationAvailable(tcq)).toBe(true);
    expect(resolveTranslation(CLEAR_QURAN_ID).id).toBe(CLEAR_QURAN_ID);
  });

  it('shows its own text exactly as given, with the Arabic', async () => {
    const given = 'Indeed, those who persist in disbelief—it is the same whether you warn them or not—they will never believe.';
    mockClearQuranVerse.mockResolvedValue(given);
    const text = await getVerseText(3, 2, 6, CLEAR_QURAN_ID);
    expect(mockClearQuranVerse).toHaveBeenCalledWith(2, 6);
    expect(text).toEqual({
      sura: 2,
      ayah: 6,
      surahName: 'Al-Baqarah',
      arabic: 'إِنَّ ٱلَّذِينَ',
      translation: given,
      translationName: 'The Clear Quran®',
    });
    // Its text came from The Clear Quran, not from alquran.cloud.
    const urls = (global.fetch as jest.Mock).mock.calls.map(([url]) => String(url));
    expect(urls.every((u) => u.includes('quran-uthmani'))).toBe(true);
  });

  it('when its text fails, the error stands: never another translation in its place', async () => {
    mockSaheehVerse.mockClear();
    mockClearQuranVerse.mockRejectedValue(new Error('RATE_LIMITED'));
    await expect(getVerseText(3, 2, 6, CLEAR_QURAN_ID)).rejects.toThrow('RATE_LIMITED');
    expect(mockSaheehVerse).not.toHaveBeenCalled();
  });
});

describe('ready before it is asked for', () => {
  // Page 50 holds 2:6–7 (made up, as the API answers).
  const page = {
    data: {
      ayahs: [6, 7].map((n) => ({
        numberInSurah: n,
        text: `arabic ${n}`,
        surah: { number: 2, englishName: 'Al-Baqarah' },
      })),
    },
  };

  beforeEach(() => {
    mockClearQuranVerse.mockReset();
    mockPeekClearQuran.mockReset().mockReturnValue(undefined);
    mockPrefetchClearQuran.mockReset();
    mockPrefetchAround.mockReset();
    mockPrefetchSaheeh.mockReset();
    mockSaheehLoaded.clear();
    __resetTranslationForTests();
    (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => page }));
  });

  it('peekVerseText gives exactly what getVerseText gave, without waiting; nothing it lacks', async () => {
    expect(peekVerseText(50, 2, 6, 'en.sahih')).toBeNull();
    const loaded = await getVerseText(50, 2, 6, 'en.sahih');
    expect(peekVerseText(50, 2, 6, 'en.sahih')).toEqual(loaded);
    expect(peekVerseText(50, 2, 7, 'en.sahih')).toEqual(await getVerseText(50, 2, 7, 'en.sahih'));
    expect(peekVerseText(50, 2, 8, 'en.sahih')).toBeNull();

    // The Clear Quran: the Arabic is here; its text only once it has come.
    expect(peekVerseText(50, 2, 6, CLEAR_QURAN_ID)).toBeNull();
    mockPeekClearQuran.mockImplementation((s, a) => (s === 2 && a === 6 ? 'its text' : undefined));
    expect(peekVerseText(50, 2, 6, CLEAR_QURAN_ID)).toEqual({
      sura: 2,
      ayah: 6,
      surahName: 'Al-Baqarah',
      arabic: 'arabic 6',
      translation: 'its text',
      translationName: 'The Clear Quran®',
    });
  });

  it('a press and hold starts loading the verse, for the chosen translation only', async () => {
    prefetchVerseText(60, 2, 6, CLEAR_QURAN_ID); // a page not loaded yet
    expect(mockPrefetchClearQuran).toHaveBeenCalledWith(2, 6);
    await new Promise((r) => setTimeout(r, 0));
    const urls = (global.fetch as jest.Mock).mock.calls.map(([u]) => String(u));
    expect(mockPrefetchSaheeh).not.toHaveBeenCalled();
    expect(urls.some((u) => u.includes('quran-uthmani'))).toBe(true);
    prefetchVerseText(60, 3, 6, 'en.sahih');
    expect(mockPrefetchSaheeh).toHaveBeenCalledWith(3);
  });

  it('neighbours: the Clear Quran two verses either side; others by page', async () => {
    prefetchVerseNeighbours({ sura: 2, ayah: 6 }, CLEAR_QURAN_ID);
    expect(mockPrefetchAround).toHaveBeenCalledWith({ sura: 2, ayah: 6 }, 2);
    expect(mockPrefetchClearQuran.mock.calls).toEqual([
      [2, 7],
      [2, 5],
    ]);
    mockPrefetchAround.mockReset();
    prefetchVerseNeighbours({ sura: 2, ayah: 6 }, 'en.sahih');
    expect(mockPrefetchAround).not.toHaveBeenCalled();
  });
});

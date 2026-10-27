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

import {
  CLEAR_QURAN_ID,
  getVerseText,
  peekVerseText,
  prefetchVerseNeighbours,
  prefetchVerseText,
  isTranslationAvailable,
  parsePageResponse,
  pickerTitle,
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

describe('getAyahTranslation', () => {
  const pageResponse = {
    data: {
      ayahs: [{ numberInSurah: 10, text: 'Ten.', surah: { number: 3, englishName: 'Aal-i-Imraan' } }],
    },
  };
  const single = {
    data: { numberInSurah: 9, text: 'Nine.', surah: { number: 3, englishName: 'Aal-i-Imraan' } },
  };

  beforeEach(() => {
    (global as any).fetch = jest.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.includes('/page/') ? pageResponse : single),
    }));
  });

  it('takes a verse from its page, and fetches one carried over from the previous page', async () => {
    const { getAyahTranslation } = require('../translation');
    expect((await getAyahTranslation(51, 3, 10)).text).toBe('Ten.');
    expect((await getAyahTranslation(51, 3, 9)).text).toBe('Nine.');
    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => c[0]);
    expect(urls).toEqual([
      'https://api.alquran.cloud/v1/page/51/en.sahih',
      'https://api.alquran.cloud/v1/ayah/3:9/en.sahih',
    ]);
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
    expect(pickerTitle(TRANSLATIONS[0])).toBe('Saheeh International');
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
    mockClearQuranVerse.mockRejectedValue(new Error('RATE_LIMITED'));
    await expect(getVerseText(3, 2, 6, CLEAR_QURAN_ID)).rejects.toThrow('RATE_LIMITED');
    const urls = (global.fetch as jest.Mock).mock.calls.map(([url]) => String(url));
    expect(urls.some((u) => u.includes('en.sahih'))).toBe(false);
  });
});

describe('ready before it is asked for', () => {
  // Page 50 holds 2:6–7 in both editions (made up, as the API answers).
  const page = (edition: string) => ({
    data: {
      ayahs: [6, 7].map((n) => ({
        numberInSurah: n,
        text: edition === 'quran-uthmani' ? `arabic ${n}` : `saheeh ${n}`,
        surah: { number: 2, englishName: 'Al-Baqarah' },
      })),
    },
  });

  beforeEach(() => {
    mockClearQuranVerse.mockReset();
    mockPeekClearQuran.mockReset().mockReturnValue(undefined);
    mockPrefetchClearQuran.mockReset();
    mockPrefetchAround.mockReset();
    (global as any).fetch = jest.fn(async (url: string) => ({
      ok: true,
      json: async () => page(url.includes('quran-uthmani') ? 'quran-uthmani' : 'en.sahih'),
    }));
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
    expect(urls.some((u) => u.includes('en.sahih'))).toBe(false);
    expect(urls.some((u) => u.includes('quran-uthmani'))).toBe(true);
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

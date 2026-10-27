jest.mock('expo-file-system', () => ({}));
const mockClearQuranVerse = jest.fn();
jest.mock('../clearQuran', () => ({ getClearQuranVerse: (...a: unknown[]) => mockClearQuranVerse(...a) }));

import {
  CLEAR_QURAN_ID,
  getVerseText,
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

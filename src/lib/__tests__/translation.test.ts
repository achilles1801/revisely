jest.mock('expo-file-system', () => ({}));

import { parsePageResponse, resolveTranslation, stripBismillah } from '../translation';

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
    expect(resolveTranslation('en.khattab').id).toBe('en.sahih'); // not licensed yet
  });

  it('strips the basmala the API prefixes to first verses', () => {
    const baqarah1 = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ الٓمٓ';
    expect(stripBismillah(baqarah1, 2, 1)).toBe('الٓمٓ');
    expect(stripBismillah(baqarah1, 1, 1)).toBe(baqarah1); // it is Al-Fatihah 1
    expect(stripBismillah('ذَٰلِكَ ٱلْكِتَٰبُ', 2, 2)).toBe('ذَٰلِكَ ٱلْكِتَٰبُ');
  });
});

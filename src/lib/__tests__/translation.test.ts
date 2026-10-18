jest.mock('expo-file-system', () => ({}));

import { parsePageResponse } from '../translation';

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

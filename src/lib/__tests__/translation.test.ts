jest.mock('expo-file-system', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

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
import {
  CLEAR_QURAN_PLACEHOLDER,
  clearQuranPreviewAllowed,
  initClearQuranPreview,
  isClearQuranPreview,
  resetClearQuranPreviewForTests,
  setClearQuranPreview,
} from '../clearQuranPreview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReleaseInfo } from '../releaseInfo';

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

describe('The Clear Quran: credit, and the testers’ preview', () => {
  const tcq = TRANSLATIONS.find((t) => t.id === CLEAR_QURAN_ID)!;

  beforeEach(async () => {
    resetClearQuranPreviewForTests();
    await AsyncStorage.clear();
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

  it('can’t be chosen without the preview: a saved choice falls back to Saheeh', () => {
    expect(isTranslationAvailable(tcq)).toBe(false);
    expect(resolveTranslation(CLEAR_QURAN_ID).id).toBe('en.sahih');
  });

  it('the preview is only for development builds and testers on the preview channel', () => {
    const release = (channel: string | null, isDev = false) => ({ channel, isDev }) as ReleaseInfo;
    expect(clearQuranPreviewAllowed(release('preview'), true)).toBe(true);
    expect(clearQuranPreviewAllowed(release(null, true), undefined)).toBe(true);
    expect(clearQuranPreviewAllowed(release('production'), true)).toBe(false); // the App Store
    expect(clearQuranPreviewAllowed(release('preview'), false)).toBe(false); // App Review, others
    expect(clearQuranPreviewAllowed(release('preview'), undefined)).toBe(false);
  });

  it('where not allowed, the switch does nothing (and a saved "on" is ignored)', async () => {
    await AsyncStorage.setItem('@revisely_clear_quran_preview', 'true');
    await initClearQuranPreview(false);
    setClearQuranPreview(true);
    expect(isClearQuranPreview()).toBe(false);
    expect(resolveTranslation(CLEAR_QURAN_ID).id).toBe('en.sahih');
  });

  it('allowed and on: it can be chosen, and shows a labelled placeholder (never another translation’s text)', async () => {
    await initClearQuranPreview(true);
    setClearQuranPreview(true);
    expect(await AsyncStorage.getItem('@revisely_clear_quran_preview')).toBe('true');
    expect(resolveTranslation(CLEAR_QURAN_ID).id).toBe(CLEAR_QURAN_ID);
    const fetchMock = jest.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({
        data: { ayahs: [{ numberInSurah: 6, text: 'إِنَّ ٱلَّذِينَ', surah: { number: 2, englishName: 'Al-Baqarah' } }] },
      }),
    }));
    (global as any).fetch = fetchMock;
    const text = await getVerseText(3, 2, 6, CLEAR_QURAN_ID);
    expect(text).toMatchObject({
      translation: CLEAR_QURAN_PLACEHOLDER,
      translationName: 'The Clear Quran®',
      placeholder: true,
      arabic: 'إِنَّ ٱلَّذِينَ',
    });
    // Only the Arabic was fetched.
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes('quran-uthmani'))).toBe(true);
    // Remembered across launches.
    await initClearQuranPreview(true);
    expect(isClearQuranPreview()).toBe(true);
  });
});

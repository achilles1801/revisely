// The whole Arabic text, downloaded with the offline mushaf (lib/translation).
const mockFiles = new Map<string, string>();
const mockExcluded: string[] = [];

jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    create() {
      mockFiles.set(this.uri, '');
    }
    write(text: string) {
      mockFiles.set(this.uri, text);
    }
    async text() {
      return mockFiles.get(this.uri) as string;
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    move(to: { uri: string }) {
      mockFiles.set(to.uri, mockFiles.get(this.uri) as string);
      mockFiles.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return true;
    }
    create() {}
    delete() {
      for (const k of [...mockFiles.keys()]) if (k.startsWith(`${this.uri}/`)) mockFiles.delete(k);
    }
  }
  return { Directory, File, Paths: { cache: 'cache', document: 'file:///documents' } };
});
jest.mock('../../../modules/recitation-audio', () => ({
  __esModule: true,
  default: { excludeFromBackup: (path: string) => mockExcluded.push(path) },
}));
jest.mock('../clearQuran', () => ({
  getClearQuranVerse: jest.fn(),
  peekClearQuranVerse: () => undefined,
  prefetchClearQuran: jest.fn(),
  prefetchClearQuranAround: jest.fn(),
}));

import { Platform } from 'react-native';
import {
  __resetTranslationForTests,
  downloadArabicText,
  getArabicVerse,
  getPageEdition,
  hasArabicText,
  parseQuranResponse,
  removeArabicText,
} from '../translation';

/** alquran.cloud's /v1/quran/quran-uthmani, made up: 114 surahs, 6236 verses over 604 pages. */
function wholeQuran() {
  const surahs = [];
  let i = 0;
  for (let s = 1; s <= 114; s++) {
    const count = s < 114 ? 55 : 6236 - 55 * 113;
    const ayahs = [];
    for (let a = 1; a <= count; a++, i++) {
      ayahs.push({ numberInSurah: a, text: `${s}:${a}`, page: Math.floor((i * 604) / 6236) + 1 });
    }
    surahs.push({ number: s, englishName: `Surah ${s}`, ayahs });
  }
  return { code: 200, data: { surahs } };
}

let fetched: string[] = [];

beforeEach(() => {
  mockFiles.clear();
  mockExcluded.length = 0;
  fetched = [];
  __resetTranslationForTests();
  (global as any).fetch = jest.fn(async (url: string) => {
    fetched.push(url);
    if (url.includes('/v1/quran/')) return { ok: true, json: async () => wholeQuran() };
    return { ok: false, status: 503, json: async () => ({}) };
  });
});

describe('the whole Arabic text', () => {
  it('splits by page as the page endpoint does', () => {
    const byPage = parseQuranResponse(wholeQuran());
    expect(Object.keys(byPage)).toHaveLength(604);
    expect(byPage[1][0]).toEqual({ surahNumber: 1, surahName: 'Surah 1', ayahNumber: 1, text: '1:1' });
    expect(byPage[604].at(-1)?.text).toBe('114:21');
  });

  it('refuses anything that is not the whole text', () => {
    const short = wholeQuran();
    short.data.surahs[113].ayahs.pop();
    expect(() => parseQuranResponse(short)).toThrow();
    expect(() => parseQuranResponse({ code: 404, data: 'Not found' })).toThrow();
  });

  it('is downloaded in one request, kept in the documents directory, out of iCloud backups', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await downloadArabicText();
    expect(fetched).toEqual(['https://api.alquran.cloud/v1/quran/quran-uthmani']);
    expect(hasArabicText()).toBe(true);
    expect([...mockFiles.keys()]).toEqual(['file:///documents/quran-text/quran-uthmani.json']);
    expect(mockExcluded).toEqual(['/documents/quran-text']);
    await downloadArabicText();
    expect(fetched).toHaveLength(1);
  });

  it('serves every page offline once on the phone, read from disk after a restart', async () => {
    await downloadArabicText();
    __resetTranslationForTests();
    fetched = [];
    const page = await getPageEdition(300, 'quran-uthmani');
    expect(page.length).toBeGreaterThan(0);
    expect(await getArabicVerse(604, 114, 21)).toBe('114:21');
    expect(fetched).toEqual([]);
  });

  it('is never used for a translation', async () => {
    await downloadArabicText();
    await expect(getPageEdition(300, 'en.sahih')).rejects.toThrow();
    expect(fetched.at(-1)).toBe('https://api.alquran.cloud/v1/page/300/en.sahih');
  });

  it('is removed with the offline mushaf', async () => {
    await downloadArabicText();
    removeArabicText();
    expect(hasArabicText()).toBe(false);
    expect([...mockFiles.keys()]).toEqual([]);
  });
});

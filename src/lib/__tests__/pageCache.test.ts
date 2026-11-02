// A small file system: files by path; a directory exists if it was created or holds a file.
const mockFiles = new Set<string>();
const mockDirs = new Set<string>();
const mockDownloads: string[] = [];
const mockExcluded: string[] = [];
let mockFailing = new Set<string>();
// Sizes by path (a file without one is 1 byte); Android's legacy downloads.
const mockSizes = new Map<string, number>();
const mockLegacy: string[] = [];
let mockLegacyResult: (url: string) => { status: number; headers: Record<string, string>; size: number } = () => ({
  status: 200,
  headers: { 'Content-Length': '1' },
  size: 1,
});

jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get name() {
      return this.uri.split('/').pop() as string;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.has(this.uri) ? (mockSizes.get(this.uri) ?? 1) : null;
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    move(to: { uri: string }) {
      if (!mockFiles.has(this.uri)) throw new Error('missing');
      mockFiles.delete(this.uri);
      mockFiles.add(to.uri);
      if (mockSizes.has(this.uri)) mockSizes.set(to.uri, mockSizes.get(this.uri) as number);
    }
    static async downloadFileAsync(url: string, dest: { uri: string }) {
      mockDownloads.push(url);
      if (mockFailing.has(url.slice(-7))) throw new Error('offline');
      mockFiles.add(dest.uri);
      return dest;
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockDirs.has(this.uri) || [...mockFiles].some((f) => f.startsWith(`${this.uri}/`));
    }
    create() {
      mockDirs.add(this.uri);
    }
    delete() {
      for (const f of [...mockFiles]) if (f.startsWith(`${this.uri}/`)) mockFiles.delete(f);
      for (const d of [...mockDirs]) if (d === this.uri || d.startsWith(`${this.uri}/`)) mockDirs.delete(d);
    }
    list() {
      return [...mockFiles]
        .filter((f) => f.startsWith(`${this.uri}/`) && !f.slice(this.uri.length + 1).includes('/'))
        .map((f) => new File(f));
    }
  }
  return { Directory, File, Paths: { cache: 'cache', document: 'documents' } };
});

jest.mock('expo-file-system/legacy', () => ({
  downloadAsync: async (url: string, uri: string) => {
    mockLegacy.push(url);
    const r = mockLegacyResult(url);
    mockFiles.add(uri);
    mockSizes.set(uri, r.size);
    return { uri, status: r.status, headers: r.headers };
  },
}));

jest.mock('../../../modules/recitation-audio', () => ({
  __esModule: true,
  default: { excludeFromBackup: (path: string) => mockExcluded.push(path) },
}));

import { Dimensions, PixelRatio, Platform } from 'react-native';
import {
  __resetPageCacheForTests,
  cacheFolderName,
  cachePage,
  evictCachedPage,
  expectedPageSize,
  getCachedPageUri,
  migrateLegacyPages,
  onPageRemoved,
  onPageStored,
  pagesAround,
  pagesOnPhone,
  pathOf,
  prefetchPages,
  removeAllPages,
} from '../pageCache';
import { __resetPageImageSetForTests } from '../quranImages';

beforeEach(() => {
  mockFiles.clear();
  mockDirs.clear();
  mockDownloads.length = 0;
  mockExcluded.length = 0;
  mockFailing = new Set(['013.png']);
  mockSizes.clear();
  mockLegacy.length = 0;
  mockLegacyResult = () => ({ status: 200, headers: { 'Content-Length': '1' }, size: 1 });
  __resetPageCacheForTests();
  __resetPageImageSetForTests();
});

afterEach(() => {
  jest.restoreAllMocks();
  __resetPageImageSetForTests();
});

describe('pages on the phone', () => {
  it('downloads a page once and then serves it from disk', async () => {
    expect(getCachedPageUri(5)).toBeNull();
    const [a, b] = await Promise.all([cachePage(5), cachePage(5)]);
    expect(a).toBe('documents/mushaf/full/005.png');
    expect(b).toBe(a);
    expect(await cachePage(5)).toBe(a);
    expect(mockDownloads).toHaveLength(1);
    expect(getCachedPageUri(5)).toBe(a);
  });

  it('keeps pages in the documents directory, which the system never empties', async () => {
    const uri = await cachePage(8);
    expect(uri?.startsWith('documents/mushaf/')).toBe(true);
    expect(uri?.startsWith('cache')).toBe(false);
  });

  it('keeps the folder out of iCloud backups (iOS)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await cachePage(8);
    await cachePage(9);
    expect(mockExcluded).toEqual(['documents/mushaf']);
  });

  it('keeps it out again after the folder was removed and made again', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await cachePage(8);
    removeAllPages();
    await cachePage(8);
    expect(mockExcluded).toEqual(['documents/mushaf', 'documents/mushaf']);
  });

  it('returns null when the download fails and leaves nothing behind', async () => {
    expect(await cachePage(13)).toBeNull();
    expect(getCachedPageUri(13)).toBeNull();
    expect([...mockFiles]).toEqual([]);
  });

  it('says when a page was saved', async () => {
    const stored: number[] = [];
    onPageStored((p) => stored.push(p));
    await cachePage(3);
    await cachePage(3);
    await cachePage(13);
    expect(stored).toEqual([3]);
  });

  it('prefetches only pages it does not have', async () => {
    await cachePage(2);
    prefetchPages([1, 2, 3, 0, 605]);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockDownloads.map((u) => u.slice(-7)).sort()).toEqual(['001.png', '002.png', '003.png']);
  });

  it('lists the pages on the phone, ignoring partial downloads', async () => {
    await cachePage(1);
    await cachePage(604);
    mockFiles.add('documents/mushaf/full/002.png.part');
    expect([...pagesOnPhone()].sort((a, b) => a - b)).toEqual([1, 604]);
  });

  it('removes every page', async () => {
    await cachePage(1);
    mockFiles.add('cache/mushaf/002.png');
    removeAllPages();
    expect([...mockFiles]).toEqual([]);
    expect(getCachedPageUri(1)).toBeNull();
    expect(getCachedPageUri(2)).toBeNull();
  });

  it('evicts only the file that failed to load', async () => {
    mockFiles.add('cache/mushaf/007.png');
    mockFiles.add('documents/mushaf/full/007.png');
    evictCachedPage(7, 'cache/mushaf/007.png');
    expect([...mockFiles]).toEqual(['documents/mushaf/full/007.png']);
  });

  it('deletes a page that failed to load only if it isn\'t whole, and says so', () => {
    const removed: number[] = [];
    onPageRemoved((p) => removed.push(p));
    mockFiles.add('documents/mushaf/full/007.png');
    mockSizes.set('documents/mushaf/full/007.png', expectedPageSize(7) as number);
    expect(evictCachedPage(7, 'documents/mushaf/full/007.png')).toBe(true);
    expect(mockFiles.has('documents/mushaf/full/007.png')).toBe(true);
    expect(removed).toEqual([]);

    mockSizes.set('documents/mushaf/full/007.png', 1000);
    expect(evictCachedPage(7, 'documents/mushaf/full/007.png')).toBe(false);
    expect(mockFiles.has('documents/mushaf/full/007.png')).toBe(false);
    expect(removed).toEqual([7]);
  });

  it('knows every page\'s size in each set', () => {
    for (const set of ['full', 'w1080', 'w1440'] as const) {
      for (const p of [1, 3, 300, 604]) expect(expectedPageSize(p, set)).toBeGreaterThan(50_000);
    }
    expect(expectedPageSize(3, 'full')).toBe(4_350_701);
  });
});

describe('pages cached before Nov 2026 (the caches directory)', () => {
  it('are shown from there until they are moved', () => {
    mockFiles.add('cache/mushaf/010.png');
    expect(getCachedPageUri(10)).toBe('cache/mushaf/010.png');
    expect(pagesOnPhone().has(10)).toBe(true);
  });

  it('are moved into the documents directory once, never downloaded again', async () => {
    mockFiles.add('cache/mushaf/010.png');
    mockFiles.add('cache/mushaf/011.png');
    mockFiles.add('cache/mushaf/011.png.part');
    mockFiles.add('documents/mushaf/full/011.png');
    expect(getCachedPageUri(10)).toBe('cache/mushaf/010.png');
    migrateLegacyPages();
    expect([...mockFiles].sort()).toEqual(['documents/mushaf/full/010.png', 'documents/mushaf/full/011.png']);
    expect(getCachedPageUri(10)).toBe('documents/mushaf/full/010.png');
    expect(await cachePage(11)).toBe('documents/mushaf/full/011.png');
    expect(mockDownloads).toEqual([]);
  });
});

describe('pages on Android (#153)', () => {
  // A Pixel 8: 411 dp at 2.625 = 1080 px wide.
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 411.42857, height: 914.28571, scale: 2.625, fontScale: 1 });
    jest.spyOn(PixelRatio, 'getPixelSizeForLayoutSize').mockImplementation((dp) => Math.round(dp * 2.625));
    __resetPageImageSetForTests();
    __resetPageCacheForTests();
  });

  it('keeps the width-sized copy in its own folder, downloaded from its own set', async () => {
    expect(await cachePage(50)).toBe('documents/mushaf/w1080/050.png');
    expect(mockLegacy).toEqual([
      'https://storage.googleapis.com/revision-buddy-3a398.firebasestorage.app/mushaf/w1080/050.png',
    ]);
    expect(getCachedPageUri(50)).toBe('documents/mushaf/w1080/050.png');
    expect(mockExcluded).toEqual([]);
  });

  it('never serves a full-size page cached before the switch as the copy', () => {
    mockFiles.add('cache/mushaf/050.png');
    mockFiles.add('documents/mushaf/full/050.png');
    expect(getCachedPageUri(50)).toBeNull();
  });

  it('moves its own cached copies, deletes the other cached sets, keeps another downloaded set', () => {
    // A foldable has used its other screen: that download stays.
    mockFiles.add('cache/mushaf-w1080/020.png');
    mockFiles.add('cache/mushaf/020.png');
    mockFiles.add('cache/mushaf-w1440/020.png');
    mockFiles.add('documents/mushaf/w1440/021.png');
    migrateLegacyPages();
    expect([...mockFiles].sort()).toEqual(['documents/mushaf/w1080/020.png', 'documents/mushaf/w1440/021.png']);
  });

  it('downloads with the shared HTTP client (legacy downloadAsync), never one client a file', async () => {
    expect(await cachePage(50)).toBe('documents/mushaf/w1080/050.png');
    expect(mockLegacy).toEqual([
      'https://storage.googleapis.com/revision-buddy-3a398.firebasestorage.app/mushaf/w1080/050.png',
    ]);
    expect(mockDownloads).toEqual([]);
  });

  it('refuses an error response and leaves nothing behind', async () => {
    mockLegacyResult = () => ({ status: 404, headers: {}, size: 300 });
    expect(await cachePage(50)).toBeNull();
    expect([...mockFiles]).toEqual([]);
  });

  it('refuses a page cut short (fewer bytes than the server said)', async () => {
    mockLegacyResult = () => ({ status: 200, headers: { 'content-length': '5000' }, size: 4000 });
    expect(await cachePage(50)).toBeNull();
    expect([...mockFiles]).toEqual([]);
    expect(getCachedPageUri(50)).toBeNull();
  });

  it('gives up on a download that never ends', async () => {
    jest.useFakeTimers();
    const legacy = require('expo-file-system/legacy');
    const real = legacy.downloadAsync;
    legacy.downloadAsync = () => new Promise(() => undefined);
    try {
      const p = cachePage(51);
      await Promise.resolve();
      jest.advanceTimersByTime(120_000);
      expect(await p).toBeNull();
    } finally {
      legacy.downloadAsync = real;
      jest.useRealTimers();
    }
  });
});

describe('pathOf', () => {
  it('turns a file URI into a path', () => {
    expect(pathOf('file:///var/mobile/Containers/Data/Application/X/Documents/mushaf/')).toBe(
      '/var/mobile/Containers/Data/Application/X/Documents/mushaf',
    );
    expect(pathOf('file:///Users/a%20b/Documents/mushaf')).toBe('/Users/a b/Documents/mushaf');
  });
});

describe('cacheFolderName', () => {
  it('names the old cache folders', () => {
    expect(cacheFolderName('full')).toBe('mushaf');
    expect(cacheFolderName('w1080')).toBe('mushaf-w1080');
    expect(cacheFolderName('w1440')).toBe('mushaf-w1440');
  });
});

describe('pagesAround', () => {
  const session = [10, 11, 12, 13, 14];
  it('takes a short list whole, nearest first', () => {
    expect(pagesAround(session, 2)).toEqual([12, 13, 11, 14, 10]);
  });
  it('takes a window of a long list', () => {
    const all = Array.from({ length: 604 }, (_, i) => i + 1);
    expect(pagesAround(all, 99)).toEqual([100, 101, 99, 102, 98, 103, 97]);
    expect(pagesAround(all, 0)).toEqual([1, 2, 3, 4]);
  });
});

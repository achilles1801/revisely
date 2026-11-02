const mockFiles = new Set<string>();
const mockDownloads: string[] = [];
const mockDeletedDirs: string[] = [];

jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
    }
    get exists() {
      return true;
    }
    create() {}
    delete() {
      mockDeletedDirs.push(this.uri);
    }
  }
  class File {
    uri: string;
    constructor(dir: { uri: string }, name: string) {
      this.uri = `${dir.uri}/${name}`;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    move(to: { uri: string }) {
      mockFiles.delete(this.uri);
      mockFiles.add(to.uri);
    }
    static async downloadFileAsync(url: string, dest: { uri: string }) {
      mockDownloads.push(url);
      if (url.endsWith('/013.png')) throw new Error('offline');
      mockFiles.add(dest.uri);
      return dest;
    }
  }
  return { Directory, File, Paths: { cache: 'cache', document: 'documents' } };
});

import { Dimensions, PixelRatio, Platform } from 'react-native';
import {
  __resetPageCacheForTests,
  cacheFolderName,
  cachePage,
  getCachedPageUri,
  pagesAround,
  prefetchPages,
  removeOtherPageSets,
} from '../pageCache';
import { __resetPageImageSetForTests } from '../quranImages';

beforeEach(() => {
  mockFiles.clear();
  mockDownloads.length = 0;
  mockDeletedDirs.length = 0;
  __resetPageCacheForTests();
  __resetPageImageSetForTests();
});

afterEach(() => {
  jest.restoreAllMocks();
  __resetPageImageSetForTests();
});

describe('page cache', () => {
  it('mockDownloads a page once and then serves it from disk', async () => {
    expect(getCachedPageUri(5)).toBeNull();
    const [a, b] = await Promise.all([cachePage(5), cachePage(5)]);
    expect(a).toBe('cache/mushaf/005.png');
    expect(b).toBe(a);
    expect(await cachePage(5)).toBe(a);
    expect(mockDownloads).toHaveLength(1);
    expect(getCachedPageUri(5)).toBe(a);
  });

  it('keeps pages in the caches directory, which iOS may empty (never documents or backups)', async () => {
    const uri = await cachePage(8);
    expect(uri).toBe('cache/mushaf/008.png');
    expect(uri?.startsWith('documents')).toBe(false);
  });

  it('returns null when the download fails and leaves nothing cached', async () => {
    expect(await cachePage(13)).toBeNull();
    expect(getCachedPageUri(13)).toBeNull();
  });

  it('prefetches only pages it does not have', async () => {
    await cachePage(2);
    prefetchPages([1, 2, 3, 0, 605]);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockDownloads.map((u) => u.slice(-7)).sort()).toEqual(['001.png', '002.png', '003.png']);
  });
});

describe('page cache on Android (#153)', () => {
  // A Pixel 8: 411 dp at 2.625 = 1080 px wide.
  beforeEach(() => {
    // The cleanup waits 10 s after the first use; fake timers keep it inside the test.
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 411.42857, height: 914.28571, scale: 2.625, fontScale: 1 });
    jest.spyOn(PixelRatio, 'getPixelSizeForLayoutSize').mockImplementation((dp) => Math.round(dp * 2.625));
    __resetPageImageSetForTests();
    __resetPageCacheForTests();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('clears the old folders 10 s after the cache is first used', () => {
    getCachedPageUri(7);
    expect(mockDeletedDirs).toEqual([]);
    jest.advanceTimersByTime(10_000);
    expect(mockDeletedDirs.sort()).toEqual(['cache/mushaf', 'cache/mushaf-w1440']);
  });

  it('keeps the width-sized copy in its own folder, downloaded from its own set', async () => {
    expect(await cachePage(50)).toBe('cache/mushaf-w1080/050.png');
    expect(mockDownloads).toEqual([
      'https://storage.googleapis.com/revision-buddy-3a398.firebasestorage.app/mushaf/w1080/050.png',
    ]);
    expect(getCachedPageUri(50)).toBe('cache/mushaf-w1080/050.png');
  });

  it('never serves a full-size page cached before the switch as the copy', () => {
    mockFiles.add('cache/mushaf/050.png');
    expect(getCachedPageUri(50)).toBeNull();
  });

  it('clears the other sets’ folders (the old full-size pages), never its own', () => {
    removeOtherPageSets();
    expect(mockDeletedDirs.sort()).toEqual(['cache/mushaf', 'cache/mushaf-w1440']);
  });
});

describe('cacheFolderName', () => {
  it('keeps the originals where they always were', () => {
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

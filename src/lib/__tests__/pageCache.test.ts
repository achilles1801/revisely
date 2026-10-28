const mockFiles = new Set<string>();
const mockDownloads: string[] = [];

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

import {
  __resetPageCacheForTests,
  cachePage,
  getCachedPageUri,
  pagesAround,
  prefetchPages,
} from '../pageCache';

beforeEach(() => {
  mockFiles.clear();
  mockDownloads.length = 0;
  __resetPageCacheForTests();
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

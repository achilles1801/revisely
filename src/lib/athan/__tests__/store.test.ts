// Athan voices on the phone: the catalog, downloads into Library/Sounds, cancel,
// delete, withdrawal, and the sound a prayer's notification plays. The file
// system and the downloader are kept in memory here.

const mockFiles = new Map<string, number>(); // uri → size
const mockExclude = jest.fn();
type Progress = (p: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void;
const mockDownload: {
  next: (url: string, dest: string, progress: Progress) => Promise<{ status: number } | undefined>;
  urls: string[];
  dests: string[];
  cancelled: number;
} = { next: async () => ({ status: 200 }), urls: [], dests: [], cancelled: 0 };

jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts
      .map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri))
      .reduce((acc, p) => (acc ? `${acc.replace(/\/+$/, '')}/${p.replace(/^\/+/, '')}` : p), '')
      .replace(/\/+$/, '');
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return true;
    }
    create() {}
    get parentDirectory() {
      return new Directory(this.uri.slice(0, this.uri.lastIndexOf('/')));
    }
    list() {
      return [...mockFiles.keys()].filter((u) => u.slice(0, u.lastIndexOf('/')) === this.uri).map((u) => new File(u));
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri) ?? 0;
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    move(to: { uri: string }) {
      mockFiles.set(to.uri, mockFiles.get(this.uri) ?? 0);
      mockFiles.delete(this.uri);
      this.uri = to.uri;
    }
  }
  return {
    Directory,
    File,
    Paths: {
      document: new Directory('file:///app/Documents'),
      cache: new Directory('file:///app/Library/Caches'),
      availableDiskSpace: 1e10,
    },
  };
});

jest.mock('expo-file-system/legacy', () => ({
  createDownloadResumable: (url: string, dest: string, _opts: unknown, progress: Progress) => ({
    downloadAsync: () => {
      mockDownload.urls.push(url);
      mockDownload.dests.push(dest);
      return mockDownload.next(url, dest, progress);
    },
    cancelAsync: async () => {
      mockDownload.cancelled++;
    },
  }),
}));

jest.mock('../../../../modules/recitation-audio', () => ({
  __esModule: true,
  default: { excludeFromBackup: (path: string) => mockExclude(path) },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  athanClipName,
  athanSoundFile,
  cancelAthanDownload,
  deleteAthanVoice,
  downloadAthanVoice,
  getAthanCatalog,
  getAthanVoiceState,
  refreshAthanCatalog,
  resetAthanStoreForTests,
} from '../store';
import { ATHAN_BASE_URL, BUNDLED_ATHAN_VOICE_ID } from '../catalog';

const SOUNDS = 'file:///app/Library/Sounds';
const CLIP = 345_754;
const B = ATHAN_BASE_URL;
const voice = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Voice ${id}`,
  style: 'makkah',
  provenance: 'unclear',
  license: 'CC0 1.0',
  attribution: `Credit ${id}`,
  full: { url: `${B}full/${id}.m4a`, duration_s: 280, bytes: 4_700_000 },
  notif: { ios_caf: `${B}notif/${id}.caf`, m4a: `${B}notif/${id}.m4a`, duration_s: 29.5 },
  enabled: true,
  ...extra,
});
const CATALOG = { version: 1, voices: [voice(BUNDLED_ATHAN_VOICE_ID), voice('makkah-regular'), voice('makkah-fajr', { fajr: true }), voice('listen-only', { notif: undefined })] };

const fetchMock = jest.fn();
function serve(json: unknown, etag = '"v1"') {
  fetchMock.mockResolvedValueOnce({ status: 200, ok: true, json: async () => json, headers: { get: () => etag } });
}

/** A download that writes `bytes` (in two progress steps) and answers `status`. */
function downloads(bytes = CLIP, status = 200) {
  mockDownload.next = async (_url, dest, progress) => {
    progress({ totalBytesWritten: bytes / 2, totalBytesExpectedToWrite: bytes });
    progress({ totalBytesWritten: bytes, totalBytesExpectedToWrite: bytes });
    if (status === 200) mockFiles.set(dest, bytes);
    return { status };
  };
}

beforeEach(async () => {
  mockFiles.clear();
  mockExclude.mockClear();
  mockDownload.urls = [];
  mockDownload.dests = [];
  mockDownload.cancelled = 0;
  downloads();
  resetAthanStoreForTests();
  await AsyncStorage.clear();
  fetchMock.mockReset();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the sound a prayer’s athan plays', () => {
  it('the bundled voice: always there', () => {
    expect(getAthanVoiceState(BUNDLED_ATHAN_VOICE_ID)).toEqual({ status: 'bundled' });
    expect(athanSoundFile(null)).toBe('athan_default.caf');
    expect(athanSoundFile(BUNDLED_ATHAN_VOICE_ID)).toBe('athan_default.caf');
  });

  it('a voice not on the phone plays the bundled one, never a missing file', () => {
    expect(athanSoundFile('makkah-fajr')).toBe('athan_default.caf');
    expect(athanSoundFile('../../etc')).toBe('athan_default.caf');
  });

  it('a clip already in Library/Sounds is ready at launch', () => {
    mockFiles.set(`${SOUNDS}/${athanClipName('makkah-fajr')}`, CLIP);
    expect(getAthanVoiceState('makkah-fajr')).toEqual({ status: 'ready' });
    expect(athanSoundFile('makkah-fajr')).toBe('athan-makkah-fajr.caf');
  });
});

describe('the catalog', () => {
  it('read from revisely.app, saved for offline, not read again for six hours', async () => {
    serve(CATALOG);
    await refreshAthanCatalog();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://revisely.app/athan/catalog.json');
    expect(getAthanCatalog().map((v) => v.id)).toEqual([BUNDLED_ATHAN_VOICE_ID, 'makkah-regular', 'makkah-fajr', 'listen-only']);
    await refreshAthanCatalog();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The next launch, offline: the saved one.
    resetAthanStoreForTests();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await refreshAthanCatalog({ force: true });
    expect(getAthanCatalog().map((v) => v.id)).toContain('makkah-fajr');
  });

  it('asks with its ETag; a 304 keeps what it has', async () => {
    serve(CATALOG, '"v7"');
    await refreshAthanCatalog();
    fetchMock.mockResolvedValueOnce({ status: 304, ok: false, headers: { get: () => '"v7"' } });
    await refreshAthanCatalog({ force: true });
    expect(fetchMock.mock.calls[1][1]).toEqual({ headers: { 'If-None-Match': '"v7"' } });
    expect(getAthanCatalog()).toHaveLength(4);
  });
});

describe('a voice’s state, as screens read it', () => {
  it('is the same object until it changes (useSyncExternalStore loops on a new one each read)', () => {
    // The bundled voice's state was a new object on every read: the voice
    // picker's rows re-rendered until React gave up ("Maximum update depth").
    expect(getAthanVoiceState(BUNDLED_ATHAN_VOICE_ID)).toBe(getAthanVoiceState(BUNDLED_ATHAN_VOICE_ID));
    expect(getAthanVoiceState(BUNDLED_ATHAN_VOICE_ID)).toEqual({ status: 'bundled' });
    expect(getAthanVoiceState('makkah-fajr')).toBe(getAthanVoiceState('makkah-fajr'));
  });
});

describe('download, cancel, delete', () => {
  beforeEach(async () => {
    serve(CATALOG);
    await refreshAthanCatalog();
  });

  it('downloads the clip into Library/Sounds, out of iCloud backup; then it plays', async () => {
    const seen: string[] = [];
    const done = downloadAthanVoice('makkah-fajr');
    seen.push(JSON.stringify(getAthanVoiceState('makkah-fajr')));
    expect(await done).toBe(true);
    expect(mockDownload.urls).toEqual([`${B}notif/makkah-fajr.caf`]);
    expect(getAthanVoiceState('makkah-fajr')).toEqual({ status: 'ready' });
    expect(mockFiles.get(`${SOUNDS}/athan-makkah-fajr.caf`)).toBe(CLIP);
    expect(mockFiles.has(`${SOUNDS}/athan-makkah-fajr.caf.part`)).toBe(false);
    // The legacy download API writes only in Documents and Caches ("is not
    // writable" in Library/Sounds, on every phone): it lands in Caches first.
    expect(mockDownload.dests).toEqual(['file:///app/Library/Caches/athan-makkah-fajr.caf.part']);
    expect(mockFiles.has('file:///app/Library/Caches/athan-makkah-fajr.caf.part')).toBe(false);
    expect(mockExclude).toHaveBeenCalledWith('/app/Library/Sounds/athan-makkah-fajr.caf');
    expect(athanSoundFile('makkah-fajr')).toBe('athan-makkah-fajr.caf');
    expect(seen[0]).toContain('downloading');
  });

  it('a failed download leaves nothing behind and says so', async () => {
    downloads(CLIP, 404);
    expect(await downloadAthanVoice('makkah-fajr')).toBe(false);
    expect(getAthanVoiceState('makkah-fajr')).toEqual({
      status: 'missing',
      error: 'The download stopped. Check your connection and try again.',
    });
    expect([...mockFiles.keys()].filter((k) => k.includes('makkah'))).toEqual([]);
    expect(athanSoundFile('makkah-fajr')).toBe('athan_default.caf');
  });

  it('something that isn’t a clip (an error page, a whole athan) is thrown away', async () => {
    downloads(900);
    expect(await downloadAthanVoice('makkah-fajr')).toBe(false);
    downloads(9_000_000);
    expect(await downloadAthanVoice('makkah-fajr')).toBe(false);
    expect(mockFiles.size).toBe(0);
  });

  it('cancelled: back to not downloaded, quietly', async () => {
    let finish!: (r: { status: number } | undefined) => void;
    mockDownload.next = () => new Promise((r) => (finish = r));
    const done = downloadAthanVoice('makkah-regular');
    expect(getAthanVoiceState('makkah-regular').status).toBe('downloading');
    cancelAthanDownload('makkah-regular');
    expect(mockDownload.cancelled).toBe(1);
    expect(getAthanVoiceState('makkah-regular')).toEqual({ status: 'missing', error: null });
    finish(undefined);
    expect(await done).toBe(false);
    expect(getAthanVoiceState('makkah-regular')).toEqual({ status: 'missing', error: null });
  });

  it('deleted: gone from the phone, and prayers set to it play the bundled voice', async () => {
    await downloadAthanVoice('makkah-fajr');
    deleteAthanVoice('makkah-fajr');
    expect(mockFiles.has(`${SOUNDS}/athan-makkah-fajr.caf`)).toBe(false);
    expect(getAthanVoiceState('makkah-fajr')).toEqual({ status: 'missing', error: null });
    expect(athanSoundFile('makkah-fajr')).toBe('athan_default.caf');
    // The bundled voice can't be deleted.
    deleteAthanVoice(BUNDLED_ATHAN_VOICE_ID);
    expect(getAthanVoiceState(BUNDLED_ATHAN_VOICE_ID)).toEqual({ status: 'bundled' });
  });

  it('a listen-only voice can’t be downloaded for notifications', async () => {
    expect(await downloadAthanVoice('listen-only')).toBe(false);
    expect(mockDownload.urls).toEqual([]);
    expect(getAthanVoiceState('listen-only')).toMatchObject({ status: 'missing' });
  });

  it('the bundled voice, or one already here: ready at once, nothing downloaded', async () => {
    expect(await downloadAthanVoice(BUNDLED_ATHAN_VOICE_ID)).toBe(true);
    await downloadAthanVoice('makkah-fajr');
    mockDownload.urls = [];
    expect(await downloadAthanVoice('makkah-fajr')).toBe(true);
    expect(mockDownload.urls).toEqual([]);
  });

  it('withdrawn from the catalog (a rights claim): its clip is deleted at the next read', async () => {
    await downloadAthanVoice('makkah-regular');
    await downloadAthanVoice('makkah-fajr');
    serve({ version: 1, voices: [voice(BUNDLED_ATHAN_VOICE_ID), voice('makkah-fajr', { fajr: true }), voice('makkah-regular', { enabled: false })] }, '"v2"');
    await refreshAthanCatalog({ force: true });
    expect(mockFiles.has(`${SOUNDS}/athan-makkah-regular.caf`)).toBe(false);
    expect(mockFiles.has(`${SOUNDS}/athan-makkah-fajr.caf`)).toBe(true);
    expect(athanSoundFile('makkah-regular')).toBe('athan_default.caf');
    expect(athanSoundFile('makkah-fajr')).toBe('athan-makkah-fajr.caf');
  });
});

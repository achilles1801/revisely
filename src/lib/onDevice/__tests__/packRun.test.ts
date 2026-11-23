// Recite's pack on the phone (ONDEV-2, ONDEV-3): the run around the native module. The sealed format and the native
// readers are held to each other by scripts/recite-pack-check; here the module, the files and the callable stand in.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setNetworkState, __resetNetworkStateForTests } from '../../networkState';
import {
  __resetPackForTests,
  downloadPackNow,
  dropBadPack,
  getPackStatus,
  packForEngine,
  preparePack,
  removePack,
  requestPackDownload,
  RETRY_MS,
} from '../packRun';

const mockFiles = new Map<string, number>();
const mockDirs = new Set<string>();

jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri).replace(/\/$/, '')).join('/');
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
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
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get name() {
      return this.uri.split('/').pop();
    }
    get exists() {
      return mockDirs.has(this.uri);
    }
    create() {
      mockDirs.add(this.uri);
    }
    delete() {
      for (const d of [...mockDirs]) if (d === this.uri || d.startsWith(`${this.uri}/`)) mockDirs.delete(d);
      for (const f of [...mockFiles.keys()]) if (f.startsWith(`${this.uri}/`)) mockFiles.delete(f);
    }
    list() {
      return [...mockDirs]
        .filter((d) => d.startsWith(`${this.uri}/`) && !d.slice(this.uri.length + 1).includes('/'))
        .map((d) => new Directory(d));
    }
  }
  return { File, Directory, Paths: { document: { uri: 'file:///docs' }, availableDiskSpace: 10_000_000_000 } };
});

const mockDownload = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  createDownloadResumable: (url: string, to: string, _o: unknown, progress: (p: { totalBytesWritten: number }) => void) => ({
    downloadAsync: () => mockDownload(url, to, progress),
    cancelAsync: () => mockCancel(),
  }),
}));
const mockCancel = jest.fn(async () => undefined);

jest.mock('../../../../modules/recitation-audio', () => ({ __esModule: true, default: { excludeFromBackup: jest.fn() } }));

const mockCall = jest.fn();
jest.mock('../../../services/firestoreService', () => ({ callFunction: (...a: unknown[]) => mockCall(...a) }));
const mockAuth: { currentUser: { uid: string } | null } = { currentUser: { uid: 'u1' } };
jest.mock('../../firebase', () => ({
  get auth() {
    return mockAuth;
  },
}));
jest.mock('../../logger', () => ({ logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }));

let mockCellular = false;
jest.mock('../../mushafOffline', () => ({
  SPACE_MARGIN: 100_000_000,
  prepareMushafOffline: async () => undefined,
  getMushafStatus: () => ({ prefs: { cellular: mockCellular } }),
}));

const engine = {
  packPublicKey: jest.fn(async () => ({ publicKey: 'UFVC', keyFormat: 'spki' as const })),
  packSaveKey: jest.fn(async () => undefined),
  packVerify: jest.fn(async () => ({ ok: true }) as { ok: boolean; error?: string }),
  sha256: jest.fn(async (_uri: string) => ''),
};
let mockEngine: typeof engine | null = engine;
jest.mock('../benchRun', () => ({ benchEngine: () => mockEngine }));

const SHA = { core: 'a'.repeat(64), strict: 'b'.repeat(64) };
const url = (id: string, part: string) => `https://storage.googleapis.com/revisely-dev.firebasestorage.app/packs/recite/${id}/${part}.rcpk?sig=1`;
const answer = (id = 'v7m-1', parts: ('core' | 'strict')[] = ['strict', 'core']) => ({
  result: {
    packId: id,
    format: 1,
    wrap: 'RSA-OAEP-SHA1',
    wrappedKey: 'V1JBUFBFRA==',
    parts: parts.map((part) => ({ part, url: url(id, part), bytes: part === 'core' ? 4800 : 1700, sha256: SHA[part] })),
    expiresAt: Date.now() + 15 * 60_000,
  },
});

const wifi = { connected: true, type: 'wifi', expensive: false };
const cellular = { connected: true, type: 'cellular', expensive: true };

/** Lets the run's chain of promises finish. */
async function settle() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
  await new Promise((r) => setImmediate(r));
  for (let i = 0; i < 40; i++) await Promise.resolve();
}

async function run() {
  requestPackDownload();
  await settle();
}

beforeEach(async () => {
  jest.clearAllMocks();
  __resetPackForTests();
  __resetNetworkStateForTests();
  await AsyncStorage.clear();
  mockFiles.clear();
  mockDirs.clear();
  mockEngine = engine;
  mockCellular = false;
  mockAuth.currentUser = { uid: 'u1' };
  setNetworkState(wifi);
  mockCall.mockResolvedValue(answer());
  mockDownload.mockImplementation(async (u: string, to: string) => {
    mockFiles.set(to, u.includes('/core.') ? 4800 : 1700);
    return { status: 200 };
  });
  engine.sha256.mockImplementation(async (uri: string) => (uri.includes('core') ? SHA.core : SHA.strict));
  engine.packVerify.mockResolvedValue({ ok: true });
});

afterEach(() => {
  __resetPackForTests();
  jest.useRealTimers();
});

describe('Recite’s pack on the phone', () => {
  it('fetches core first, checks each part with the module, and is ready for the engine', async () => {
    await run();
    expect(getPackStatus().phase).toBe('ready');
    expect(getPackStatus().bytes).toBe(6500);
    expect(mockDownload.mock.calls.map((c) => (c[0] as string).split('/').pop()!.split('.')[0])).toEqual(['core', 'strict']);
    expect(engine.packSaveKey).toHaveBeenCalledWith('file:///docs/recite-pack/v7m-1', 'V1JBUFBFRA==');
    expect(engine.packVerify.mock.calls.map((c) => (c as unknown[])[2])).toEqual(['core', 'strict']);
    expect(mockFiles.has('file:///docs/recite-pack/v7m-1/core.rcpk')).toBe(true);
    expect([...mockFiles.keys()].some((f) => f.endsWith('.part'))).toBe(false);
    expect(packForEngine()).toEqual({ dir: 'file:///docs/recite-pack/v7m-1', packId: 'v7m-1', parts: ['core', 'strict'] });
  });

  it('sends the callable only the public key', async () => {
    await run();
    expect(mockCall.mock.calls[0][1]).toBe('recitePack');
    expect(mockCall.mock.calls[0][2]).toEqual({ publicKey: 'UFVC', keyFormat: 'spki' });
  });

  it('waits for Wi-Fi on mobile data, without asking the server', async () => {
    setNetworkState(cellular);
    await run();
    expect(getPackStatus().phase).toBe('waiting-for-wifi');
    expect(mockCall).not.toHaveBeenCalled();
    expect(packForEngine()).toBeNull();
  });

  it('downloads over mobile data with the setting on, or for one “Download now”', async () => {
    setNetworkState(cellular);
    mockCellular = true;
    await run();
    expect(getPackStatus().phase).toBe('ready');

    __resetPackForTests();
    await AsyncStorage.clear();
    mockFiles.clear();
    mockDirs.clear();
    mockCellular = false;
    setNetworkState(cellular);
    await downloadPackNow({ overMobileData: true });
    await settle();
    expect(getPackStatus().phase).toBe('ready');
  });

  it('does nothing without someone signed in or in a build without the module', async () => {
    mockAuth.currentUser = null;
    await run();
    expect(mockCall).not.toHaveBeenCalled();

    mockAuth.currentUser = { uid: 'u1' };
    mockEngine = null;
    await run();
    expect(getPackStatus().phase).toBe('unavailable');
    expect(mockCall).not.toHaveBeenCalled();
  });

  it.each(['PERMISSION_DENIED', 'FAILED_PRECONDITION', 'RESOURCE_EXHAUSTED'])('%s: not for now, with no retries', async (code) => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    mockCall.mockRejectedValue(Object.assign(new Error('no'), { code }));
    await run();
    expect(getPackStatus().phase).toBe('unavailable');
    jest.advanceTimersByTime(RETRY_MS[2] * 2);
    await settle();
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  it('a part that fails its sha256 is deleted, never used, and tried again in a minute', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    engine.sha256.mockResolvedValueOnce('c'.repeat(64));
    await run();
    expect(getPackStatus().phase).toBe('error');
    expect(mockFiles.size).toBe(0);
    expect(packForEngine()).toBeNull();
    jest.advanceTimersByTime(RETRY_MS[0]);
    await settle();
    expect(getPackStatus().phase).toBe('ready');
  });

  it('a part the module refuses is deleted and never used', async () => {
    engine.packVerify.mockResolvedValueOnce({ ok: false, error: 'chunk 3 failed its check' });
    await run();
    expect(getPackStatus().phase).toBe('error');
    expect(mockFiles.has('file:///docs/recite-pack/v7m-1/core.rcpk')).toBe(false);
    expect(packForEngine()).toBeNull();
  });

  it('a holder asks about a newer pack at most once a day', async () => {
    await run();
    expect(mockCall).toHaveBeenCalledTimes(1);
    await run();
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  it('a new pack comes beside the old one, which stays in use until the new core is whole', async () => {
    await run();
    await downloadPackNow(); // asks again now
    mockCall.mockResolvedValue(answer('v7m-2'));
    engine.sha256.mockResolvedValueOnce('c'.repeat(64)); // the new core part fails
    await settle();
    expect(packForEngine()?.packId).toBe('v7m-1');
    expect(mockFiles.has('file:///docs/recite-pack/v7m-1/core.rcpk')).toBe(true);

    await downloadPackNow();
    await settle();
    expect(packForEngine()?.packId).toBe('v7m-2');
    expect(mockFiles.has('file:///docs/recite-pack/v7m-1/core.rcpk')).toBe(false);
  });

  it('losing Wi-Fi mid-download stops it without an error, and it starts again on Wi-Fi', async () => {
    let finish: (v: { status: number } | undefined) => void = () => undefined;
    mockDownload.mockImplementationOnce(() => new Promise((r) => (finish = r)));
    requestPackDownload();
    await settle();
    expect(getPackStatus().phase).toBe('downloading');
    setNetworkState(cellular);
    expect(mockCancel).toHaveBeenCalled();
    finish(undefined);
    await settle();
    expect(getPackStatus().phase).toBe('waiting-for-wifi');

    setNetworkState(wifi);
    await settle();
    expect(getPackStatus().phase).toBe('ready');
  });

  it('a part gone from the phone no longer counts', async () => {
    await run();
    __resetPackForTests();
    mockFiles.delete('file:///docs/recite-pack/v7m-1/core.rcpk');
    await preparePack();
    expect(packForEngine()).toBeNull();
    expect(getPackStatus().phase).toBe('idle');
  });

  it('a pack the engine refuses is dropped and not fetched again, until a new id or Download now', async () => {
    await run();
    await dropBadPack('v7m-1');
    expect(getPackStatus().phase).toBe('unavailable');
    expect(packForEngine()).toBeNull();
    expect(mockFiles.size).toBe(0);

    mockCall.mockClear();
    mockDownload.mockClear();
    await run(); // within the day: not even asked
    expect(mockCall).not.toHaveBeenCalled();

    const now = Date.now();
    const later = jest.spyOn(Date, 'now').mockReturnValue(now + 25 * 60 * 60 * 1000);
    mockCall.mockResolvedValue({ result: { ...answer().result, expiresAt: now + 26 * 60 * 60 * 1000 } });
    await run(); // the next day, the same id: asked, not downloaded
    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockDownload).not.toHaveBeenCalled();
    expect(getPackStatus().phase).toBe('unavailable');

    mockCall.mockResolvedValue({ result: { ...answer('v7m-2').result, expiresAt: now + 26 * 60 * 60 * 1000 } });
    later.mockReturnValue(now + 50 * 60 * 60 * 1000);
    mockCall.mockResolvedValue({ result: { ...answer('v7m-2').result, expiresAt: now + 51 * 60 * 60 * 1000 } });
    await run(); // a new pack is fetched
    expect(packForEngine()?.packId).toBe('v7m-2');
    later.mockRestore();
  });

  it('a pack one engine refused is fetched again once the app has another engine', async () => {
    const carrying = (version: string) =>
      Object.assign({}, engine, { coreInfo: () => JSON.stringify({ version, abi: 1, headerAbi: 1, stub: false, selfTest: 'skipped' }) });
    mockEngine = carrying('recite-core 0.2.0');
    await run();
    await dropBadPack('v7m-1');
    mockCall.mockClear();
    await run(); // the same engine: not asked
    expect(mockCall).not.toHaveBeenCalled();
    expect(packForEngine()).toBeNull();

    mockEngine = carrying('recite-core 0.3.0');
    await run();
    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(packForEngine()?.packId).toBe('v7m-1');
  });

  it('Download now tries a refused pack again', async () => {
    await run();
    await dropBadPack('v7m-1');
    await downloadPackNow();
    await settle();
    expect(packForEngine()?.packId).toBe('v7m-1');
  });

  it('Remove deletes it all and keeps it off until Download now', async () => {
    await run();
    await removePack();
    expect(getPackStatus().phase).toBe('removed');
    expect(mockFiles.size).toBe(0);
    expect(packForEngine()).toBeNull();

    mockCall.mockClear();
    await run();
    expect(mockCall).not.toHaveBeenCalled();

    await downloadPackNow();
    await settle();
    expect(getPackStatus().phase).toBe('ready');
  });
});

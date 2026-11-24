// The engine opening from Recite's pack (ONDEV-3, ONDEV-4): only a real engine decrypts it, and a pack it refuses isn't
// decrypted again. The native side (decrypting, aligned buffers, wiping after release) runs on a phone.
import { __resetEngineForTests, deviceConnect, engineSelfCheck, engineStrictTest, warmEngine } from '../engine';
import { routedFeed } from '../../reciteLive/route';

const mockModule = {
  coreInfo: jest.fn(() => JSON.stringify({ version: '0.2.0', abi: 1, headerAbi: 1, stub: false, selfTest: 'passed' })),
  engineInfo: jest.fn((): string | null => null),
  enginePackOpen: jest.fn(async () => ({ ok: true, code: 0 }) as { ok: boolean; code: number; error?: string; info?: string }),
  engineRelease: jest.fn(async () => undefined),
  engineStart: jest.fn(async () => ({ code: -3, error: 'strict refused' }) as { take?: number; code?: number; error?: string }),
  engineFeed: jest.fn(),
  engineControl: jest.fn(),
  engineFinish: jest.fn(),
  engineClose: jest.fn(),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
  memoryPeakMb: jest.fn(() => 400),
  engineOpenFiles: jest.fn(async () => ({ ok: true, code: 0 })),
};
jest.mock('../../../../modules-dev/recite-engine', () => ({
  __esModule: true,
  get default() {
    return mockModule;
  },
}));
jest.mock('../../variant', () => ({ isDevVariant: () => true }));
let mockReplay = false;
jest.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///docs' } },
  File: class {
    uri = 'file:///docs/recite-replay/frames.jsonl';
    get exists() {
      return mockReplay;
    }
  },
}));
jest.mock('../../logger', () => ({ logger: { warn: jest.fn(), log: jest.fn() } }));
jest.mock('../../reciteLive/route', () => ({ routedFeed: jest.fn() }));
jest.mock('../../reciteLive/whereSettings', () => ({ reciteWhere: () => ({}) }));

const PACK = { dir: 'file:///docs/recite-pack/v7m-1', packId: 'v7m-1', parts: ['core', 'strict'] };
let mockPack: typeof PACK | null = PACK;
const mockDrop = jest.fn(async (_id: string) => undefined);
const mockRefetch = jest.fn(async (_id: string) => undefined);
jest.mock('../packRun', () => ({
  preparePack: async () => undefined,
  packForEngine: () => mockPack,
  dropBadPack: (id: string) => mockDrop(id),
  refetchDamagedPack: (id: string) => mockRefetch(id),
}));

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.clearAllMocks();
  __resetEngineForTests();
  mockPack = PACK;
  mockReplay = false;
  mockModule.engineInfo.mockReturnValue(null);
  mockModule.coreInfo.mockReturnValue(JSON.stringify({ version: '0.2.0', abi: 1, headerAbi: 1, stub: false, selfTest: 'passed' }));
  mockModule.enginePackOpen.mockResolvedValue({ ok: true, code: 0 });
});

describe('warmEngine', () => {
  it('opens the engine from the pack once it is whole on the phone', async () => {
    warmEngine();
    await settle();
    expect(mockModule.enginePackOpen).toHaveBeenCalledWith(PACK.dir, 'v7m-1', ['core', 'strict'], JSON.stringify({ threads: 2 }));
    expect(mockModule.engineOpenFiles).not.toHaveBeenCalled();
  });

  it('with no pack, a build with the replay stand-in opens that', async () => {
    mockPack = null;
    mockReplay = true;
    warmEngine();
    await settle();
    expect(mockModule.enginePackOpen).not.toHaveBeenCalled();
    expect(mockModule.engineOpenFiles).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the stub', { version: 'stub', abi: 1, headerAbi: 1, stub: true, selfTest: 'skipped' }],
    ['another ABI', { version: '0.2.0', abi: 2, headerAbi: 1, stub: false, selfTest: 'passed' }],
    ['a failed self-test', { version: '0.2.0', abi: 1, headerAbi: 1, stub: false, selfTest: 'failed: mel' }],
  ])('%s never decrypts the pack', async (_name, info) => {
    mockModule.coreInfo.mockReturnValue(JSON.stringify(info));
    warmEngine();
    await settle();
    expect(mockModule.enginePackOpen).not.toHaveBeenCalled();
  });

  it('a pack the engine calls bad data (RC_ERR_DATA) is dropped', async () => {
    mockModule.enginePackOpen.mockResolvedValue({ ok: false, code: -2, error: 'a blob missing' });
    warmEngine();
    await settle();
    expect(mockDrop).toHaveBeenCalledWith('v7m-1');
  });

  it('files damaged on the phone are fetched again, and the pack isn’t called bad', async () => {
    mockModule.enginePackOpen.mockResolvedValue({ ok: false, code: -20, error: 'chunk 3 failed its check' });
    warmEngine();
    await settle();
    expect(mockRefetch).toHaveBeenCalledWith('v7m-1');
    expect(mockDrop).not.toHaveBeenCalled();
  });

  it('any other failure keeps the pack, and it isn’t decrypted again this run', async () => {
    mockModule.enginePackOpen.mockResolvedValue({ ok: false, code: -3, error: 'no memory for v7.weights.f16' });
    warmEngine();
    await settle();
    warmEngine();
    await settle();
    expect(mockModule.enginePackOpen).toHaveBeenCalledTimes(1);
    expect(mockDrop).not.toHaveBeenCalled();
  });

  it('never gives a pack to the replay stand-in, which would call a real pack bad', async () => {
    mockModule.coreInfo.mockReturnValue(JSON.stringify({ version: 'recite-core 0.1.0 (replay)', abi: 1, headerAbi: 1, stub: false, selfTest: 'passed' }));
    warmEngine();
    await settle();
    expect(mockModule.enginePackOpen).not.toHaveBeenCalled();
    expect(mockDrop).not.toHaveBeenCalled();
  });

  it('does nothing while an engine is open', async () => {
    mockModule.engineInfo.mockReturnValue('{"abi":1}');
    warmEngine();
    await settle();
    expect(mockModule.enginePackOpen).not.toHaveBeenCalled();
  });
});

describe('[ONDEV-1] engineSelfCheck', () => {
  const INFO = JSON.stringify({
    pack: 'table-key',
    self_check: { ran: true, ok: true, ort: '1.31.1', models: { v7: { ran: true, ok: true, max_diff: 0.00004, top_diff: 0, frames: 240, prepacking: false }, v5: { ran: false } } },
  });
  const opensWithInfo = () =>
    mockModule.enginePackOpen.mockImplementation(async () => {
      mockModule.engineInfo.mockReturnValue(INFO);
      return { ok: true, code: 0, info: INFO };
    });

  it('reads the pack’s check, and closes the engine it opened so the bench’s memory doesn’t carry it', async () => {
    opensWithInfo();
    expect(await engineSelfCheck()).toMatchObject({ ok: true, packId: 'v7m-1', pack: 'table-key', ort: '1.31.1', v7: { maxDiff: 0.00004, topDiff: 0 } });
    expect(mockModule.engineRelease).toHaveBeenCalledTimes(1);
  });

  it('leaves open an engine that was already open', async () => {
    opensWithInfo();
    warmEngine();
    await settle();
    expect(await engineSelfCheck()).toMatchObject({ ok: true, packId: 'v7m-1' });
    expect(mockModule.engineRelease).not.toHaveBeenCalled();
  });

  it('never closes the engine under a take that started while it was opening', async () => {
    jest.useFakeTimers();
    try {
      deviceConnect((() => undefined) as never);
      const deps = (routedFeed as jest.Mock).mock.calls[0][0] as { onTakeOpen: () => void; onTakeClose: () => void };
      mockModule.enginePackOpen.mockImplementationOnce(async () => {
        deps.onTakeOpen();
        mockModule.engineInfo.mockReturnValue(INFO);
        return { ok: true, code: 0, info: INFO };
      });
      expect(await engineSelfCheck()).toMatchObject({ ok: true });
      expect(mockModule.engineRelease).not.toHaveBeenCalled();

      deps.onTakeClose(); // with the take over, the next check closes what it opened
      mockModule.engineInfo.mockReturnValue(null);
      opensWithInfo();
      await engineSelfCheck();
      expect(mockModule.engineRelease).toHaveBeenCalledTimes(1);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('reports a refused open with its code and error', async () => {
    mockModule.enginePackOpen.mockResolvedValue({ ok: false, code: -3, error: 'v7 check: largest difference 5.9' });
    expect(await engineSelfCheck()).toMatchObject({ ok: false, packId: 'v7m-1', openCode: -3, openError: 'v7 check: largest difference 5.9' });
    expect(mockModule.engineRelease).not.toHaveBeenCalled();
  });

  it('has no self-check to report from files damaged on the phone', async () => {
    mockModule.enginePackOpen.mockResolvedValue({ ok: false, code: -20, error: 'chunk 3 failed its check' });
    expect(await engineSelfCheck()).toBeNull();
  });

  it('has nothing to report with no pack on the phone', async () => {
    mockPack = null;
    expect(await engineSelfCheck()).toBeNull();
  });
});

describe('[ONDEV-1] engineStrictTest', () => {
  const REAL = JSON.stringify({ version: 'recite-core 0.2.0', hop: 0.5, self_check: { ran: true, ok: true } });

  it('runs on the real engine, and closes an engine it opened', async () => {
    mockModule.enginePackOpen.mockImplementationOnce(async () => {
      mockModule.engineInfo.mockReturnValue(REAL);
      return { ok: true, code: 0, info: REAL };
    });
    const run = await engineStrictTest(new Int16Array(1600), () => true);
    expect(mockModule.engineStart).toHaveBeenCalledTimes(1);
    expect(run).toMatchObject({ ok: false, error: 'strict refused', hop: 0.5, peakAfterMb: 400 });
    expect(mockModule.engineRelease).toHaveBeenCalledTimes(1);
  });

  it('asks for Strict where the engine has it, and words and harakat where it doesn’t', async () => {
    for (const [levels, tajweed, level] of [[['recite', 'harakat', 'strict'], true, 'strict'], [['recite', 'harakat'], false, 'harakat']] as const) {
      mockModule.engineStart.mockClear();
      mockModule.engineInfo.mockReturnValue(JSON.stringify({ version: 'recite-core 0.2.0', hop: 0.5, levels }));
      const run = await engineStrictTest(new Int16Array(1600), () => true);
      expect(run?.level).toBe(level);
      expect(JSON.parse((mockModule.engineStart.mock.calls[0] as unknown as [string])[0]).tajweed).toBe(tajweed);
    }
  });

  it('never runs on the replay stand-in', async () => {
    mockModule.engineInfo.mockReturnValue(JSON.stringify({ version: 'recite-core replay 0.1.0' }));
    expect(await engineStrictTest(new Int16Array(1600), () => true)).toBeNull();
    expect(mockModule.engineStart).not.toHaveBeenCalled();
  });
});

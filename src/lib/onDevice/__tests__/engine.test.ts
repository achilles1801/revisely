// The engine opening from Recite's pack (ONDEV-3, ONDEV-4): only a real engine decrypts it, and a pack it refuses isn't
// decrypted again. The native side (decrypting, aligned buffers, wiping after release) runs on a phone.
import { __resetEngineForTests, warmEngine } from '../engine';

const mockModule = {
  coreInfo: jest.fn(() => JSON.stringify({ version: '0.2.0', abi: 1, headerAbi: 1, stub: false, selfTest: 'passed' })),
  engineInfo: jest.fn((): string | null => null),
  enginePackOpen: jest.fn(async () => ({ ok: true, code: 0 }) as { ok: boolean; code: number; error?: string }),
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
jest.mock('../packRun', () => ({
  preparePack: async () => undefined,
  packForEngine: () => mockPack,
  dropBadPack: (id: string) => mockDrop(id),
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

  it('any other failure keeps the pack, and it isn’t decrypted again this run', async () => {
    mockModule.enginePackOpen.mockResolvedValue({ ok: false, code: -3, error: 'no memory for v7.weights.f16' });
    warmEngine();
    await settle();
    warmEngine();
    await settle();
    expect(mockModule.enginePackOpen).toHaveBeenCalledTimes(1);
    expect(mockDrop).not.toHaveBeenCalled();
  });

  it('does nothing while an engine is open', async () => {
    mockModule.engineInfo.mockReturnValue('{"abi":1}');
    warmEngine();
    await settle();
    expect(mockModule.enginePackOpen).not.toHaveBeenCalled();
  });
});

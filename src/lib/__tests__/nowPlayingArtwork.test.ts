// The lock screen's artwork: only a URL expo-audio can load. An Android release
// build names the bundled icon ("assets_icon"), and expo-audio's Android side
// rejected every call that carried it (emulator, Nov 6 2026).
const mockDownload = jest.fn();
jest.mock('expo-asset', () => ({
  Asset: { fromModule: () => ({ downloadAsync: () => mockDownload() }) },
}));
jest.mock('../logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), log: jest.fn() } }));

type Module = typeof import('../nowPlayingArtwork');
const load = (): Module => {
  let m: Module | undefined;
  jest.isolateModules(() => {
    m = require('../nowPlayingArtwork');
  });
  return m as Module;
};
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => mockDownload.mockReset());

describe('nowPlayingArtwork', () => {
  it('tells a URL from a resource name', () => {
    const { isArtworkUrl } = load();
    expect(isArtworkUrl('file:///data/user/0/com.revisionbuddy.app/cache/icon.png')).toBe(true);
    expect(isArtworkUrl('https://example.com/icon.png')).toBe(true);
    expect(isArtworkUrl('assets_icon')).toBe(false);
    expect(isArtworkUrl('')).toBe(false);
    expect(isArtworkUrl(null)).toBe(false);
    expect(isArtworkUrl(undefined)).toBe(false);
  });

  it('uses the bundled icon once it is a file', async () => {
    mockDownload.mockResolvedValue({ localUri: 'file:///cache/icon.png', uri: 'asset://icon' });
    const { lockScreenArtwork } = load();
    expect(lockScreenArtwork()).toBeUndefined();
    await settle();
    expect(lockScreenArtwork()).toBe('file:///cache/icon.png');
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it('Android release: the icon is a drawable resource, so there is no artwork, and it is not looked up again', async () => {
    mockDownload.mockResolvedValue({ localUri: 'assets_icon', uri: 'assets_icon' });
    const { lockScreenArtwork } = load();
    lockScreenArtwork();
    await settle();
    expect(lockScreenArtwork()).toBeUndefined();
    expect(lockScreenArtwork()).toBeUndefined();
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });
});

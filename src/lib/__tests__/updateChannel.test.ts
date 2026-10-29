const mockSetOverride = jest.fn();
const mockCheck = jest.fn(() => Promise.resolve({ isAvailable: true }));
const mockFetch = jest.fn(() => Promise.resolve({}));
let mockEnabled = true;
let mockModule: { isTestFlight: () => boolean } | null = { isTestFlight: () => true };
jest.mock('expo-updates', () => ({
  get isEnabled() {
    return mockEnabled;
  },
  setUpdateRequestHeadersOverride: (h: unknown) => mockSetOverride(h),
  checkForUpdateAsync: () => mockCheck(),
  fetchUpdateAsync: () => mockFetch(),
}));
jest.mock('../../../modules/install-source', () => ({
  get __esModule() {
    return true;
  },
  get default() {
    return mockModule;
  },
}));
jest.mock('../logger', () => ({ logger: { warn: jest.fn(), log: jest.fn(), error: jest.fn() } }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyUpdateChannel, channelOverride, resetUpdateChannelForTests } from '../updateChannel';

const g = globalThis as { __DEV__?: boolean };
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetUpdateChannelForTests();
  g.__DEV__ = false;
  mockEnabled = true;
  mockModule = { isTestFlight: () => true };
});
afterAll(() => {
  g.__DEV__ = true;
});

describe('update channel', () => {
  it('a tester in TestFlight follows preview, and gets its update now', async () => {
    expect(applyUpdateChannel(true)).toBe('preview');
    expect(mockSetOverride).toHaveBeenCalledWith({ 'expo-channel-name': 'preview' });
    await flush();
    expect(mockCheck).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalled();
  });

  it('App Review (TestFlight receipt, not a tester) stays on production', () => {
    expect(applyUpdateChannel(false)).toBe('production');
    expect(mockSetOverride).toHaveBeenCalledWith(null);
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it('the App Store follows production, even for a tester, clearing an earlier switch', async () => {
    applyUpdateChannel(true);
    await flush();
    jest.clearAllMocks();
    mockModule = { isTestFlight: () => false };
    expect(applyUpdateChannel(true)).toBe('production');
    expect(mockSetOverride).toHaveBeenCalledWith(null);
    await flush();
    // Back on production: its update is fetched for the next launch.
    expect(mockFetch).toHaveBeenCalled();
  });

  it('a tester taken off preview gets production’s update at the next launch, not the one after', async () => {
    applyUpdateChannel(true);
    await flush();
    // A cold start later: nothing in memory, the last channel remembered.
    resetUpdateChannelForTests();
    jest.clearAllMocks();
    expect(applyUpdateChannel(false)).toBe('production');
    await flush();
    expect(mockFetch).toHaveBeenCalled();
  });

  it('an ordinary install on production fetches nothing extra', async () => {
    applyUpdateChannel(false);
    await flush();
    resetUpdateChannelForTests();
    applyUpdateChannel(false);
    await flush();
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it('when it cannot tell where it was installed from, production (never preview by accident)', () => {
    mockModule = {
      isTestFlight: () => {
        throw new Error('no receipt');
      },
    };
    expect(applyUpdateChannel(true)).toBe('production');
    expect(mockSetOverride).toHaveBeenCalledWith(null);
  });

  it('sets nothing again while the channel stays the same', () => {
    applyUpdateChannel(true);
    applyUpdateChannel(true);
    expect(mockSetOverride).toHaveBeenCalledTimes(1);
  });

  it('does nothing without the module (binaries before 1.0.2), in development, or with updates off', () => {
    mockModule = null;
    expect(applyUpdateChannel(true)).toBeNull();
    mockModule = { isTestFlight: () => true };
    mockEnabled = false;
    expect(applyUpdateChannel(true)).toBeNull();
    mockEnabled = true;
    g.__DEV__ = true;
    expect(applyUpdateChannel(true)).toBeNull();
    expect(mockSetOverride).not.toHaveBeenCalled();
  });

  describe('Android (Play cannot tell internal testing from production)', () => {
    const { Platform } = jest.requireActual('react-native') as typeof import('react-native');
    const realOS = Platform.OS;
    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
      mockModule = null; // the module is iOS-only
    });
    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => realOS });
    });

    it('a tester follows preview without the install-source module', async () => {
      expect(applyUpdateChannel(true)).toBe('preview');
      expect(mockSetOverride).toHaveBeenCalledWith({ 'expo-channel-name': 'preview' });
      await flush();
      expect(mockFetch).toHaveBeenCalled();
    });

    it("everyone else, Play's reviewers included, stays on production", () => {
      expect(applyUpdateChannel(false)).toBe('production');
      expect(mockSetOverride).toHaveBeenCalledWith(null);
    });

    it('still does nothing in development or with updates off', () => {
      mockEnabled = false;
      expect(applyUpdateChannel(true)).toBeNull();
      mockEnabled = true;
      g.__DEV__ = true;
      expect(applyUpdateChannel(true)).toBeNull();
      expect(mockSetOverride).not.toHaveBeenCalled();
    });
  });

  it('only ever overrides the channel header (the one expo-updates allows)', () => {
    expect(channelOverride('preview')).toEqual({ 'expo-channel-name': 'preview' });
    expect(channelOverride('production')).toBeNull();
  });
});

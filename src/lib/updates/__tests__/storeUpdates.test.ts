let mockInstalled: string | null = '1.0.3';
let mockBuild: string | null = '5';
jest.mock('expo-application', () => ({
  get nativeApplicationVersion() {
    return mockInstalled;
  },
  get nativeBuildVersion() {
    return mockBuild;
  },
}));
let mockInstallSource: { isTestFlight: () => boolean } | null = { isTestFlight: () => false };
jest.mock('../../../../modules/install-source', () => ({
  get __esModule() {
    return true;
  },
  get default() {
    return mockInstallSource;
  },
}));
let mockConfig: Record<string, unknown> | null = null;
let mockConfigFails = false;
const mockGetDoc = jest.fn((_ref: string) =>
  mockConfigFails
    ? Promise.reject(new Error('client is offline'))
    : Promise.resolve({ exists: () => mockConfig != null, data: () => mockConfig }),
);
jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  getDoc: (ref: string) => mockGetDoc(ref),
}));
jest.mock('../../firebase', () => ({ db: {} }));
jest.mock('../../logger', () => ({ logger: { warn: jest.fn(), log: jest.fn(), error: jest.fn() } }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';
import {
  CONFIG_EVERY_MS,
  LOOKUP_EVERY_MS,
  LOOKUP_WAITING_EVERY_MS,
  currentStoreDecision,
  markOffered,
  openStore,
  refreshStoreState,
  resetStoreForTests,
  setStoreTester,
  subscribeStore,
} from '../storeUpdates';

const g = globalThis as { __DEV__?: boolean; fetch?: unknown };
const HOUR = 3_600_000;
let mockListing: Record<string, unknown> | null = { bundleId: 'com.revisionbuddy.app', version: '1.0.4', minimumOsVersion: '15.1' };
const fetchMock = jest.fn((_url: string) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ resultCount: mockListing ? 1 : 0, results: mockListing ? [mockListing] : [] }) }),
);

/** The app closed and opened again: memory gone, the phone's copy kept. */
const relaunch = () => resetStoreForTests();

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetStoreForTests();
  g.__DEV__ = false;
  g.fetch = fetchMock;
  jest.replaceProperty(Platform, 'OS', 'ios');
  mockInstalled = '1.0.3';
  mockBuild = '5';
  mockInstallSource = { isTestFlight: () => false };
  mockConfig = null;
  mockConfigFails = false;
  mockListing = { bundleId: 'com.revisionbuddy.app', version: '1.0.4', minimumOsVersion: '15.1' };
});
afterAll(() => {
  g.__DEV__ = true;
});

describe('iOS', () => {
  it('reads config/app and the App Store listing, then offers the newer version once', async () => {
    await refreshStoreState(0);
    expect(mockGetDoc).toHaveBeenCalledWith('config/app');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(currentStoreDecision()).toEqual({ required: null, offer: '1.0.4' });
    markOffered('1.0.4');
    expect(currentStoreDecision().offer).toBeNull();
    relaunch();
    await refreshStoreState(HOUR);
    expect(currentStoreDecision().offer).toBeNull();
  });

  it("the lookup asks only for this app's bundle id", async () => {
    await refreshStoreState(0);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toMatch(/^https:\/\/itunes\.apple\.com\/lookup\?bundleId=com\.revisionbuddy\.app&t=\d+$/);
  });

  it('looks up once a day and reads the config every 6 hours', async () => {
    await refreshStoreState(0);
    await refreshStoreState(CONFIG_EVERY_MS - 1);
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await refreshStoreState(CONFIG_EVERY_MS);
    expect(mockGetDoc).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await refreshStoreState(LOOKUP_EVERY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a minimum the listing does not show yet: looks again hourly, and blocks once it does', async () => {
    mockConfig = { minSupported: { ios: '1.0.5' } };
    await refreshStoreState(0);
    expect(currentStoreDecision().required).toBeNull();
    await refreshStoreState(LOOKUP_WAITING_EVERY_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    mockListing = { ...mockListing, version: '1.0.5' };
    await refreshStoreState(LOOKUP_WAITING_EVERY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(currentStoreDecision()).toEqual({ required: { installed: '1.0.3', minimum: '1.0.5' }, offer: null });
  });

  it("offline: what's saved on the phone still decides (a block stays a block)", async () => {
    mockConfig = { minSupported: { ios: '1.0.4' } };
    await refreshStoreState(0);
    expect(currentStoreDecision().required).not.toBeNull();
    relaunch();
    mockConfigFails = true;
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await refreshStoreState(LOOKUP_EVERY_MS);
    expect(currentStoreDecision().required).toEqual({ installed: '1.0.3', minimum: '1.0.4' });
  });

  it('removing the minimum lifts the block', async () => {
    mockConfig = { minSupported: { ios: '1.0.4' } };
    await refreshStoreState(0);
    mockConfig = { minSupported: {} };
    await refreshStoreState(CONFIG_EVERY_MS);
    expect(currentStoreDecision().required).toBeNull();
  });

  it('TestFlight and App Review (a sandbox receipt) read nothing and see nothing', async () => {
    mockInstallSource = { isTestFlight: () => true };
    mockConfig = { minSupported: { ios: '9.0' } };
    await refreshStoreState(0);
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(currentStoreDecision()).toEqual({ required: null, offer: null });
  });

  it("binaries that can't tell where they came from: nothing", async () => {
    mockInstallSource = null;
    await refreshStoreState(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('development: nothing', async () => {
    g.__DEV__ = true;
    await refreshStoreState(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(currentStoreDecision()).toEqual({ required: null, offer: null });
  });

  it('opens the App Store page, or its web page if that fails', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(true);
    await openStore();
    expect(open).toHaveBeenLastCalledWith('itms-apps://apps.apple.com/app/id6767990248');
    open.mockRejectedValueOnce(new Error('no')).mockResolvedValueOnce(true);
    await openStore();
    expect(open).toHaveBeenLastCalledWith('https://apps.apple.com/app/id6767990248');
  });
});

describe('Android', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockInstallSource = null; // no such module on Android
  });

  it("offers config/app's latest.android, never asks Apple", async () => {
    mockConfig = { latest: { android: '1.0.4' } };
    await refreshStoreState(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(currentStoreDecision()).toEqual({ required: null, offer: '1.0.4' });
  });

  it('blocks below its minimum when Play has it', async () => {
    mockConfig = { minSupported: { android: '1.0.4' }, latest: { android: '1.0.4' } };
    await refreshStoreState(0);
    expect(currentStoreDecision().required).toEqual({ installed: '1.0.3', minimum: '1.0.4' });
  });

  it('a tester (closed or internal testing) is offered the internal testing build, by version code', async () => {
    mockConfig = { testing: { android: { version: '1.0.3', code: 6 } } };
    await refreshStoreState(0);
    expect(currentStoreDecision().offer).toBeNull(); // not a tester yet: production has nothing
    const changed = jest.fn();
    subscribeStore(changed);
    setStoreTester(true);
    expect(changed).toHaveBeenCalled();
    expect(currentStoreDecision()).toEqual({ required: null, offer: '1.0.3 (6)' });
    markOffered('1.0.3 (6)');
    relaunch();
    setStoreTester(true);
    await refreshStoreState(HOUR);
    expect(currentStoreDecision().offer).toBeNull();
    // The next build is offered again.
    mockConfig = { testing: { android: { version: '1.0.3', code: 7 } } };
    await refreshStoreState(HOUR + CONFIG_EVERY_MS);
    expect(currentStoreDecision().offer).toBe('1.0.3 (7)');
    // Once it is installed, nothing.
    mockBuild = '7';
    expect(currentStoreDecision().offer).toBeNull();
  });

  it('opens Google Play', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(true);
    await openStore();
    expect(open).toHaveBeenLastCalledWith('market://details?id=com.revisionbuddy.app');
  });
});

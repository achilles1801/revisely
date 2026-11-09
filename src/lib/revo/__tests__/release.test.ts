// Who has Revo (REVO-37): config/app's `revo`, read by the phone; what each value opens Revo to.
let mockConfig: Record<string, unknown> | null = null;
let mockFails = false;
const mockGetDoc = jest.fn((_ref: string) =>
  mockFails
    ? Promise.reject(new Error('client is offline'))
    : Promise.resolve({ exists: () => mockConfig != null, get: (f: string) => mockConfig?.[f] }),
);
jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  getDoc: (ref: string) => mockGetDoc(ref),
}));
jest.mock('../../firebase', () => ({ db: {} }));
jest.mock('../../logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { revoAvailable, useRevoAvailable } from '../availability';
import { REVO_PATTERNS_KEY, REVO_RELEASE_EVERY_MS, REVO_RELEASE_KEY, refreshRevoRelease, resetRevoReleaseForTests, revoPatternsOn, revoReleaseOf, startRevoRelease, useRevoRelease } from '../release';

const tester = { previewTester: true };
const member = { previewTester: false };

beforeEach(async () => {
  resetRevoReleaseForTests();
  mockConfig = null;
  mockFails = false;
  mockGetDoc.mockClear();
  await AsyncStorage.clear();
});

describe('who has Revo (REVO-37)', () => {
  it('[REVO-37] testers (the default): testers only; everyone: every account; off: nobody, testers included', () => {
    expect(revoAvailable(tester, 'testers')).toBe(true);
    expect(revoAvailable(member, 'testers')).toBe(false);
    expect(revoAvailable(member, 'everyone')).toBe(true);
    expect(revoAvailable(tester, 'off')).toBe(false);
    expect(revoAvailable(null, 'everyone')).toBe(false);
    expect(revoReleaseOf('everyone')).toBe('everyone');
    expect(revoReleaseOf('off')).toBe('off');
    for (const v of [undefined, null, 'Everyone', true, 3]) expect(revoReleaseOf(v)).toBe('testers');
  });

  it('[REVO-37] testers until config/app has been read; then what it says, kept on the phone', async () => {
    mockConfig = { revo: 'everyone', minSupported: {} };
    const { result } = renderHook(() => useRevoAvailable(member));
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    expect(mockGetDoc).toHaveBeenCalledWith('config/app');
    expect(await AsyncStorage.getItem(REVO_RELEASE_KEY)).toBe('everyone');
  });

  it('[REVO-37] a launch offline uses the value kept from the last read', async () => {
    await AsyncStorage.setItem(REVO_RELEASE_KEY, 'everyone');
    mockFails = true;
    const { result } = renderHook(() => useRevoRelease());
    await waitFor(() => expect(result.current).toBe('everyone'));
  });

  it('[REVO-37] read again when due (10 minutes) or at once when forced, as after the server refused Revo as paused', async () => {
    mockConfig = { revo: 'everyone' };
    const { result } = renderHook(() => useRevoRelease());
    await waitFor(() => expect(result.current).toBe('everyone'));
    const t0 = Date.now();
    mockConfig = { revo: 'off' };
    await act(() => refreshRevoRelease(false, t0 + 60_000));
    expect(result.current).toBe('everyone');
    await act(() => refreshRevoRelease(false, t0 + REVO_RELEASE_EVERY_MS + 1));
    expect(result.current).toBe('off');
    mockConfig = {};
    await act(() => refreshRevoRelease(true));
    expect(result.current).toBe('testers');
  });
});

describe('whether the server takes the patterns (REVO-40)', () => {
  it('[REVO-40] off until config/app.revoPatterns is true; read with the release, kept on the phone, and off again when it is', async () => {
    expect(revoPatternsOn()).toBe(false);
    mockConfig = { revo: 'everyone' };
    await act(() => refreshRevoRelease(true));
    expect(revoPatternsOn()).toBe(false);
    mockConfig = { revo: 'everyone', revoPatterns: 'yes' };
    await act(() => refreshRevoRelease(true));
    expect(revoPatternsOn()).toBe(false);
    mockConfig = { revo: 'everyone', revoPatterns: true };
    await act(() => refreshRevoRelease(true));
    expect(revoPatternsOn()).toBe(true);
    expect(await AsyncStorage.getItem(REVO_PATTERNS_KEY)).toBe('1');
    mockConfig = { revo: 'everyone' };
    await act(() => refreshRevoRelease(true));
    expect(revoPatternsOn()).toBe(false);
  });

  it('[REVO-40] a launch offline uses the value kept from the last read', async () => {
    await AsyncStorage.setItem(REVO_PATTERNS_KEY, '1');
    mockFails = true;
    startRevoRelease();
    await waitFor(() => expect(revoPatternsOn()).toBe(true));
  });
});

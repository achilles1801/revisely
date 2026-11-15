import AsyncStorage from '@react-native-async-storage/async-storage';

const mockCapture = jest.fn();
jest.mock('@sentry/react-native', () => ({ captureMessage: (...args: unknown[]) => mockCapture(...args) }));
const mockFetchNet = jest.fn();
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: () => mockFetchNet() } }));
let mockDev = false;
jest.mock('../variant', () => ({ isDevVariant: () => mockDev }));

import { markUpdateRestart, reportSignInDropped } from '../signInDropped';

const NOW = Date.parse('2026-11-15T22:00:00Z');

beforeEach(async () => {
  mockCapture.mockClear();
  mockFetchNet.mockReset();
  mockDev = false;
  await AsyncStorage.clear();
});

function tags(): Record<string, string> {
  expect(mockCapture).toHaveBeenCalledTimes(1);
  const [message, options] = mockCapture.mock.calls[0];
  expect(message).toBe('A saved sign-in was dropped at launch');
  expect(options.level).toBe('warning');
  // Nothing about the account: no user, no extra, only these tags.
  expect(Object.keys(options).sort()).toEqual(['level', 'tags']);
  return options.tags;
}

describe('AUTH-2: a dropped sign-in is reported to Sentry, with no account details', () => {
  it('in the store app, online, with no restart into an update before it', async () => {
    mockFetchNet.mockResolvedValue({ isConnected: true });
    await reportSignInDropped(NOW);
    expect(tags()).toEqual({ signin_dropped: 'launch', app_variant: 'store', after_update_restart: 'no', online: 'yes' });
  });

  it('in Revisely Dev, offline, a minute after "Update now" restarted the app', async () => {
    mockDev = true;
    mockFetchNet.mockResolvedValue({ isConnected: false });
    await markUpdateRestart(NOW - 60_000);
    await reportSignInDropped(NOW);
    expect(tags()).toMatchObject({ app_variant: 'dev', after_update_restart: 'yes', online: 'no' });
  });

  it('a restart into an update long before doesn’t count, and an unknown connection says so', async () => {
    mockFetchNet.mockResolvedValue({ isConnected: null });
    await markUpdateRestart(NOW - 10 * 60_000);
    await reportSignInDropped(NOW);
    expect(tags()).toMatchObject({ after_update_restart: 'no', online: 'unknown' });
  });

  it('NetInfo that never answers doesn’t hold the report up', async () => {
    mockFetchNet.mockReturnValue(new Promise(() => undefined));
    await reportSignInDropped(NOW);
    expect(tags()).toMatchObject({ online: 'unknown' });
  });
});

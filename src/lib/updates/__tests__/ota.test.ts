let mockEnabled = true;
const mockCheck = jest.fn();
const mockFetch = jest.fn();
const mockReload = jest.fn((_o?: unknown) => Promise.resolve());
jest.mock('expo-updates', () => ({
  get isEnabled() {
    return mockEnabled;
  },
  updateId: 'running-update',
  checkForUpdateAsync: () => mockCheck(),
  fetchUpdateAsync: () => mockFetch(),
  reloadAsync: (o: unknown) => mockReload(o),
}));
const mockPrevent = jest.fn(() => Promise.resolve());
const mockHide = jest.fn(() => Promise.resolve());
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: () => mockPrevent(),
  hideAsync: () => mockHide(),
}));
let mockBusy: string[] = [];
jest.mock('../busy', () => ({ busyReasons: () => mockBusy }));
jest.mock('../../logger', () => ({ logger: { warn: jest.fn(), log: jest.fn(), error: jest.fn() } }));

import { AppState } from 'react-native';
import {
  APPLY_AFTER_AWAY_MS,
  CHECK_INTERVAL_MS,
  LAUNCH_WINDOW_MS,
  SPLASH_CAP_MS,
  appStateChangeForTests as appState,
  applyUpdate,
  bannerState,
  checkForUpdate,
  dismissBanner,
  markUiReady,
  notePendingUpdate,
  resetOtaForTests,
  runLaunchCheck,
  startOtaUpdates,
} from '../ota';

const g = globalThis as { __DEV__?: boolean };
const MIN = 60_000;

/** A server with update `id` (or none), answering after `delay` ms. */
function server(id: string | null, delay = 0) {
  const after = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), delay));
  mockCheck.mockImplementation(() =>
    after(id ? { isAvailable: true, isRollBackToEmbedded: false } : { isAvailable: false, isRollBackToEmbedded: false }),
  );
  mockFetch.mockImplementation(() => after({ isNew: true, isRollBackToEmbedded: false, manifest: { id } }));
}

/** Away for `ms`, then back. */
async function away(ms: number) {
  appState('background');
  await jest.advanceTimersByTimeAsync(ms);
  appState('active');
  await jest.advanceTimersByTimeAsync(10);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetOtaForTests();
  g.__DEV__ = false;
  mockEnabled = true;
  mockBusy = [];
  server(null);
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
});
afterEach(() => {
  jest.useRealTimers();
});
afterAll(() => {
  g.__DEV__ = true;
});

describe('nothing in development or where updates are off', () => {
  it('development: no splash hold, no checks, no restarts', async () => {
    g.__DEV__ = true;
    startOtaUpdates();
    expect(mockPrevent).not.toHaveBeenCalled();
    expect(await checkForUpdate(true)).toBeNull();
    expect(await applyUpdate()).toBe(false);
    expect(mockCheck).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('updates off: the same', async () => {
    mockEnabled = false;
    startOtaUpdates();
    expect(mockPrevent).not.toHaveBeenCalled();
    expect(await runLaunchCheck()).toBe('none');
    expect(mockCheck).not.toHaveBeenCalled();
  });
});

describe('at launch', () => {
  it('an update downloaded within the window is applied before Home shows, behind the launch screen', async () => {
    server('new-update', 800);
    startOtaUpdates();
    markUiReady();
    expect(mockPrevent).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1700);
    expect(mockReload).toHaveBeenCalledTimes(1);
    const opts = mockReload.mock.calls[0][0] as { reloadScreenOptions: { backgroundColor: string; spinner: { enabled: boolean } } };
    expect(opts.reloadScreenOptions.backgroundColor).toBe('#000000');
    expect(opts.reloadScreenOptions.spinner.enabled).toBe(false);
    // The reload screen covers the switch; the splash isn't dropped first.
    expect(mockHide).not.toHaveBeenCalled();
  });

  it('no update: the splash goes once the check is done and the app has drawn', async () => {
    server(null, 300);
    startOtaUpdates();
    await jest.advanceTimersByTimeAsync(300);
    expect(mockHide).not.toHaveBeenCalled(); // fonts not loaded yet
    markUiReady();
    expect(mockHide).toHaveBeenCalledTimes(1);
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('the app drawn first: the splash waits for the check, at most the window', async () => {
    server(null, 10_000);
    startOtaUpdates();
    markUiReady();
    await jest.advanceTimersByTimeAsync(LAUNCH_WINDOW_MS - 1);
    expect(mockHide).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(mockHide).toHaveBeenCalledTimes(1);
  });

  it('an update that arrives after the window waits; no restart while the user is in', async () => {
    server('late-update', 4000);
    startOtaUpdates();
    markUiReady();
    await jest.advanceTimersByTimeAsync(LAUNCH_WINDOW_MS);
    expect(mockHide).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(mockReload).not.toHaveBeenCalled();
    // Downloaded during this visit: no banner yet.
    expect(bannerState()).toEqual({ visible: false, updateId: 'late-update' });
  });

  it('the splash goes by the cap whatever happens', async () => {
    mockCheck.mockImplementation(() => new Promise(() => undefined)); // hangs
    startOtaUpdates();
    await jest.advanceTimersByTimeAsync(SPLASH_CAP_MS);
    expect(mockHide).toHaveBeenCalledTimes(1);
  });

  it('a failed check (offline) lets the app open', async () => {
    mockCheck.mockImplementation(() => Promise.reject(new Error('offline')));
    startOtaUpdates();
    markUiReady();
    await jest.advanceTimersByTimeAsync(0);
    expect(mockHide).toHaveBeenCalledTimes(1);
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('starts once', () => {
    startOtaUpdates();
    startOtaUpdates();
    expect(mockPrevent).toHaveBeenCalledTimes(1);
    expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
  });
});

describe('coming back to the app', () => {
  async function launchedWithLateUpdate() {
    server('late-update', 2000); // check and download: 4 s
    startOtaUpdates();
    markUiReady();
    await jest.advanceTimersByTimeAsync(5000);
    expect(bannerState().updateId).toBe('late-update');
    server(null);
    jest.clearAllMocks();
  }

  it('away 15 minutes or more with nothing going on: the waiting update is applied', async () => {
    await launchedWithLateUpdate();
    await away(APPLY_AFTER_AWAY_MS);
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('back sooner: no restart, and Home shows the banner (it waited since the last visit)', async () => {
    await launchedWithLateUpdate();
    await away(APPLY_AFTER_AWAY_MS - MIN);
    expect(mockReload).not.toHaveBeenCalled();
    expect(bannerState()).toEqual({ visible: true, updateId: 'late-update' });
  });

  it.each([['recording'], ['recitation'], ['timer'], ['screen']])(
    'never restarts while busy (%s), however long away',
    async (reason) => {
      await launchedWithLateUpdate();
      mockBusy = [reason];
      await away(3 * 60 * MIN);
      expect(mockReload).not.toHaveBeenCalled();
      expect(bannerState().visible).toBe(true);
    },
  );

  it('asks again at most every 10 minutes', async () => {
    startOtaUpdates();
    await jest.advanceTimersByTimeAsync(0);
    expect(mockCheck).toHaveBeenCalledTimes(1); // the launch check
    await away(2 * MIN);
    expect(mockCheck).toHaveBeenCalledTimes(1);
    await away(CHECK_INTERVAL_MS);
    expect(mockCheck).toHaveBeenCalledTimes(2);
  });

  it('an update found on return waits for the next visit (no restart under the user)', async () => {
    startOtaUpdates();
    markUiReady();
    await jest.advanceTimersByTimeAsync(0);
    server('found-on-return');
    await away(APPLY_AFTER_AWAY_MS);
    expect(mockReload).not.toHaveBeenCalled();
    expect(bannerState()).toEqual({ visible: false, updateId: 'found-on-return' });
    // Next return, long enough away: applied.
    await away(APPLY_AFTER_AWAY_MS);
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('only a real background counts (Control Center, a call banner: inactive)', async () => {
    await launchedWithLateUpdate();
    appState('inactive');
    await jest.advanceTimersByTimeAsync(APPLY_AFTER_AWAY_MS);
    appState('active');
    expect(mockReload).not.toHaveBeenCalled();
    expect(bannerState().visible).toBe(false);
  });
});

describe('the banner', () => {
  it('✕ hides it for that update; a later one shows again', async () => {
    notePendingUpdate('u1');
    await away(MIN);
    expect(bannerState().visible).toBe(true);
    dismissBanner();
    expect(bannerState().visible).toBe(false);
    await away(MIN);
    expect(bannerState().visible).toBe(false);
    notePendingUpdate('u2');
    await away(MIN);
    expect(bannerState()).toEqual({ visible: true, updateId: 'u2' });
  });

  it('the update already running is never pending', async () => {
    notePendingUpdate('running-update');
    await away(MIN);
    expect(bannerState()).toEqual({ visible: false, updateId: null });
  });
});

describe('applyUpdate', () => {
  it('one restart at a time; after a failed one it can try again', async () => {
    mockReload.mockImplementationOnce(() => Promise.reject(new Error('no runtime')));
    expect(await applyUpdate()).toBe(false);
    expect(await applyUpdate()).toBe(true);
    expect(await applyUpdate()).toBe(false); // already restarting
    expect(mockReload).toHaveBeenCalledTimes(2);
  });

  it('a roll back to the built-in version counts as an update', async () => {
    mockCheck.mockResolvedValue({ isAvailable: false, isRollBackToEmbedded: true });
    mockFetch.mockResolvedValue({ isNew: false, isRollBackToEmbedded: true });
    expect(await checkForUpdate(true)).toBe('embedded');
  });

  it('one check at a time', async () => {
    server('u', 500);
    const a = checkForUpdate(true);
    const b = checkForUpdate(true);
    await jest.advanceTimersByTimeAsync(1000);
    expect(await a).toBe('u');
    expect(await b).toBe('u');
    expect(mockCheck).toHaveBeenCalledTimes(1);
  });
});

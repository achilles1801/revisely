import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen, act } from '@testing-library/react-native';
import { ThemeProvider } from '../../../context/ThemeContext';
import { describeRelease, ReleaseInput } from '../../../lib/releaseInfo';

const mockCheck = jest.fn();
const mockFetch = jest.fn();
const mockReload = jest.fn(() => Promise.resolve());
jest.mock('expo-updates', () => ({
  isEnabled: true,
  useUpdates: () => ({ lastCheckForUpdateTimeSinceRestart: new Date('2026-10-25T05:00:00Z') }),
  checkForUpdateAsync: () => mockCheck(),
  fetchUpdateAsync: () => mockFetch(),
  reloadAsync: () => mockReload(),
}));
const mockTestError = jest.fn();
const mockNativeCrash = jest.fn();
jest.mock('../../../lib/sentry', () => ({
  sendTestError: () => mockTestError(),
  triggerTestNativeCrash: () => mockNativeCrash(),
}));

import { AppInfo, appInfoSummary, checkForUpdateNow, showsTestActions } from '../AppInfo';
import { notePendingUpdate, resetOtaForTests } from '../../../lib/updates/ota';

const base: ReleaseInput = {
  version: '1.0.2',
  build: '19',
  runtimeVersion: 'b576e0107b9d56bb0645b8baed5c257bf037cb15',
  channel: 'production',
  updateId: '01a1574f-56c7-72e5-ae37-91f7dd0d6a2a',
  updateGroup: '84b0091f-17b0-402b-985a-a5270bc27a51',
  isEmbeddedLaunch: false,
  isEmergencyLaunch: false,
  emergencyLaunchReason: null,
  updateCreatedAt: null,
  isDev: false,
  isDevice: true,
};
const g = globalThis as { __DEV__?: boolean };
const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  resetOtaForTests();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  g.__DEV__ = false;
});
afterAll(() => {
  g.__DEV__ = true;
});

describe('App info', () => {
  it('sums up the build and what JavaScript runs', () => {
    expect(appInfoSummary(describeRelease(base))).toBe('1.0.2 (19) · production · update 84b0091f');
    expect(appInfoSummary(describeRelease({ ...base, isEmbeddedLaunch: true }))).toBe('1.0.2 (19) · production · built-in');
  });

  it('shows the details on tap, without test actions on the App Store channel', async () => {
    wrap(<AppInfo tools release={describeRelease(base)} />);
    fireEvent.press(await screen.findByLabelText(/App info/));
    expect(screen.getByText('Version 1.0.2 (19)')).toBeTruthy();
    expect(screen.getByText('Last update check: 2026-10-25 05:00 UTC')).toBeTruthy();
    expect(screen.queryByText('Test native crash')).toBeNull();
  });

  it('offers test errors and a test native crash on preview', async () => {
    wrap(<AppInfo tools release={describeRelease({ ...base, channel: 'preview' })} />);
    fireEvent.press(await screen.findByLabelText(/App info/));
    fireEvent.press(screen.getByText('Send test error'));
    expect(mockTestError).toHaveBeenCalled();
    fireEvent.press(screen.getByText('Test native crash'));
    // Asks first; the crash only happens on confirming.
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)[2];
    expect(mockNativeCrash).not.toHaveBeenCalled();
    buttons.find((b: any) => b.text === 'Crash').onPress();
    expect(mockNativeCrash).toHaveBeenCalled();
    // Nothing reports from development or a simulator, so there is nothing to test there.
    expect(showsTestActions(describeRelease({ ...base, channel: 'preview', isDev: true }))).toBe(false);
    expect(showsTestActions(describeRelease({ ...base, channel: 'preview', isDevice: false }))).toBe(false);
  });

  it('warns when the last update could not start', async () => {
    wrap(<AppInfo tools release={describeRelease({ ...base, isEmergencyLaunch: true, emergencyLaunchReason: 'x' })} />);
    expect(await screen.findByText(/couldn’t start/)).toBeTruthy();
  });

  it('long-press checks for an update, downloads it and offers the restart at once', async () => {
    mockCheck.mockResolvedValue({ isAvailable: true });
    mockFetch.mockResolvedValue({ isNew: true, manifest: { id: 'new-update' } });
    wrap(<AppInfo tools release={describeRelease(base)} />);
    const row = await screen.findByLabelText(/App info/);
    await act(async () => {
      fireEvent(row, 'longPress');
    });
    const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1);
    expect(title).toBe('Update ready');
    expect(message).toBe('Restart Revisely to use it.');
    expect(buttons.map((b: any) => b.text)).toEqual(['Later', 'Restart to update']);
    buttons.find((b: any) => b.text === 'Restart to update').onPress();
    expect(mockReload).toHaveBeenCalled();
  });

  it('with an update waiting, the details offer the restart instead of a check', async () => {
    notePendingUpdate('waiting-update');
    wrap(<AppInfo tools release={describeRelease(base)} />);
    fireEvent.press(await screen.findByLabelText(/App info/));
    expect(screen.queryByText('Check for updates')).toBeNull();
    fireEvent.press(screen.getByTestId('app-info-restart'));
    expect(mockReload).toHaveBeenCalled();
  });
});

describe('regular users', () => {
  it('see the version only: no update details, no check, no test actions', async () => {
    wrap(<AppInfo release={describeRelease({ ...base, channel: 'preview' })} />);
    expect(await screen.findByTestId('app-version')).toBeTruthy();
    expect(screen.getByText('1.0.2 (19)')).toBeTruthy();
    expect(screen.queryByTestId('app-info-v2')).toBeNull();
    expect(screen.queryByText(/update 01a1574f/)).toBeNull();
    expect(screen.queryByText('Check for updates')).toBeNull();
  });
});

describe('checkForUpdateNow', () => {
  it('up to date, ready, and errors', async () => {
    mockCheck.mockResolvedValueOnce({ isAvailable: false });
    expect((await checkForUpdateNow()).result).toBe('up-to-date');
    mockCheck.mockResolvedValueOnce({ isAvailable: true });
    mockFetch.mockResolvedValueOnce({ isNew: true, manifest: { id: 'u1' } });
    expect((await checkForUpdateNow()).result).toBe('ready');
    resetOtaForTests();
    mockCheck.mockResolvedValueOnce({ isAvailable: false, isRollBackToEmbedded: true });
    mockFetch.mockResolvedValueOnce({ isNew: false, isRollBackToEmbedded: true });
    expect((await checkForUpdateNow()).result).toBe('ready');
    resetOtaForTests();
    mockCheck.mockRejectedValueOnce(new Error('offline'));
    expect(await checkForUpdateNow()).toEqual({ result: 'error', error: 'offline' });
  });

  it('an update downloaded earlier is ready, even when the server has nothing newer', async () => {
    notePendingUpdate('downloaded-before');
    mockCheck.mockResolvedValueOnce({ isAvailable: false });
    expect((await checkForUpdateNow()).result).toBe('ready');
    mockCheck.mockRejectedValueOnce(new Error('offline'));
    expect((await checkForUpdateNow()).result).toBe('ready');
  });
});

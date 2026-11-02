import React from 'react';
import { act, render } from '@testing-library/react-native';
import { AppState } from 'react-native';

const mockApp: Record<string, unknown> = {};
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));
const mockAuth: Record<string, unknown> = {};
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => mockAuth }));
let mockGranted = true;
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: mockGranted, status: mockGranted ? 'granted' : 'denied' })),
}));
const mockSync = jest.fn(async (_input: unknown) => []);
const mockClear = jest.fn(async () => []);
jest.mock('../../../lib/prayer/sync', () => ({
  syncPrayerNotifications: (input: unknown) => mockSync(input),
  clearPrayerNotifications: () => mockClear(),
}));
let mockPosition: { latitude: number; longitude: number } | null = null;
jest.mock('../../../lib/widgets/position', () => ({ lastKnownPosition: jest.fn(async () => mockPosition) }));

import { PrayerSync } from '../PrayerSync';
import { DEFAULT_PRAYER_PREFS, getPrayerPrefs, resetPrayerPrefsForTests, setPrayerAlert, setPrayerPrefs } from '../../../lib/prayer/prefs';

const LONDON = { latitude: 51.51, longitude: -0.13 };
const tester = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  previewTester: true,
  fajrCalculationMethod: 'MoonsightingCommittee',
  fajrBoundaryEnabled: false,
  locationCoords: null,
  ...over,
});
const settle = () => act(async () => {
  jest.advanceTimersByTime(500);
});

let appStateListener: ((s: string) => void) | null = null;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockGranted = true;
  mockPosition = null;
  resetPrayerPrefsForTests({ ...DEFAULT_PRAYER_PREFS, place: LONDON, methodSuggested: true });
  Object.assign(mockAuth, { firebaseUser: { uid: 'u1' }, isLoading: false });
  Object.assign(mockApp, { user: tester(), saveUser: jest.fn(async () => undefined) });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, l: (s: string) => void) => {
    appStateListener = l;
    return { remove: jest.fn() };
  }) as never);
});
afterEach(() => jest.useRealTimers());

describe('<PrayerSync />', () => {
  it('a prayer on, allowed: schedules from today, the place named', async () => {
    setPrayerAlert('asr', { on: true, before: 10 });
    render(<PrayerSync />);
    await settle();
    expect(mockSync).toHaveBeenCalledTimes(1);
    const input = mockSync.mock.calls[0][0] as { days: { day: string }[]; place: string; alerts: { asr: { on: boolean } } };
    expect(input.days).toHaveLength(14);
    expect(input.place).toBe('London');
    expect(input.alerts.asr.on).toBe(true);
  });

  it('nothing on: clears (only prayer ones; lib/prayer/sync)', async () => {
    render(<PrayerSync />);
    await settle();
    expect(mockClear).toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('every account (public from 1.0.3, not only testers); signed out: clears; still loading: does nothing', async () => {
    setPrayerAlert('asr', { on: true });
    Object.assign(mockApp, { user: tester({ previewTester: false }) });
    const view = render(<PrayerSync />);
    await settle();
    expect(mockSync).toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();

    jest.clearAllMocks();
    Object.assign(mockApp, { user: null });
    Object.assign(mockAuth, { firebaseUser: { uid: 'u1' }, isLoading: false });
    view.rerender(<PrayerSync />);
    await settle();
    expect(mockClear).not.toHaveBeenCalled();

    Object.assign(mockAuth, { firebaseUser: null, isLoading: false });
    view.rerender(<PrayerSync />);
    await settle();
    expect(mockClear).toHaveBeenCalled();
  });

  it('notifications not allowed: schedules nothing (the bell asks)', async () => {
    mockGranted = false;
    setPrayerAlert('asr', { on: true });
    render(<PrayerSync />);
    await settle();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('tops up again on coming back to the app, a new time zone, and any setting change', async () => {
    setPrayerAlert('asr', { on: true });
    render(<PrayerSync />);
    await settle();
    expect(mockSync).toHaveBeenCalledTimes(1);
    await act(async () => appStateListener?.('active'));
    await settle();
    expect(mockSync).toHaveBeenCalledTimes(2);
    await act(async () => setPrayerPrefs({ madhab: 'hanafi' }));
    await settle();
    expect(mockSync).toHaveBeenCalledTimes(3);
    await act(async () => setPrayerPrefs({ place: { latitude: 21.42, longitude: 39.83 } }));
    await settle();
    expect(mockSync).toHaveBeenCalledTimes(4);
    expect((mockSync.mock.calls[3][0] as { place: string }).place).toBe('Makkah');
  });

  it('the phone’s position (never asked for) becomes the place when it moved', async () => {
    resetPrayerPrefsForTests({ ...DEFAULT_PRAYER_PREFS, methodSuggested: true });
    mockPosition = { latitude: 40.71, longitude: -74.01 };
    render(<PrayerSync />);
    await settle();
    expect(getPrayerPrefs().place).toEqual(mockPosition);
  });

  it('once, the country’s usual method; not when it already starts the day at fajr', async () => {
    resetPrayerPrefsForTests({ ...DEFAULT_PRAYER_PREFS, place: LONDON, methodSuggested: false });
    Object.assign(mockApp, { user: tester({ fajrCalculationMethod: 'NorthAmerica' }) });
    const view = render(<PrayerSync />);
    await settle();
    expect(mockApp.saveUser).toHaveBeenCalledWith(expect.objectContaining({ fajrCalculationMethod: 'MoonsightingCommittee' }));
    expect(getPrayerPrefs().methodSuggested).toBe(true);
    view.unmount();

    jest.clearAllMocks();
    resetPrayerPrefsForTests({ ...DEFAULT_PRAYER_PREFS, place: LONDON, methodSuggested: false });
    Object.assign(mockApp, { user: tester({ fajrCalculationMethod: 'NorthAmerica', fajrBoundaryEnabled: true }) });
    render(<PrayerSync />);
    await settle();
    expect(mockApp.saveUser).not.toHaveBeenCalled();
  });
});

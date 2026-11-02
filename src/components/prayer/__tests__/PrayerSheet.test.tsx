import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text testID={`icon-${name}`}>{name}</Text> };
});
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});
const mockApp: Record<string, unknown> = {};
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));
let mockPermission = { granted: true, status: 'granted', canAskAgain: true };
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => mockPermission),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
}));
let mockLocationGranted = true;
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: mockLocationGranted, canAskAgain: true })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => new Promise(() => undefined)),
  watchHeadingAsync: jest.fn(async () => ({ remove: jest.fn() })),
}));

import { PrayerSheet } from '../PrayerSheet';
import { DEFAULT_PRAYER_PREFS, getPrayerPrefs, resetPrayerPrefsForTests } from '../../../lib/prayer/prefs';
import { countdown, dayTimes, formatTime } from '../../../lib/prayer/times';
import { paletteLight } from '../../../theme/v2';

const LONDON = { latitude: 51.51, longitude: -0.13 };
const SETTINGS = { method: 'MoonsightingCommittee', highLatitude: 'recommended', madhab: 'standard', adjustments: DEFAULT_PRAYER_PREFS.adjustments } as const;
const DAY = dayTimes(LONDON, new Date(2026, 9, 28, 12), SETTINGS);
// An hour after Dhuhr: Dhuhr is now, Asr next.
const NOW = new Date(DAY.dhuhr!.getTime() + 3600_000);
const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>;

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockPermission = { granted: true, status: 'granted', canAskAgain: true };
  mockLocationGranted = true;
  resetPrayerPrefsForTests({ ...DEFAULT_PRAYER_PREFS, place: LONDON });
  Object.assign(mockApp, { user: { id: 'u1', fajrCalculationMethod: 'MoonsightingCommittee', previewTester: true } });
});
afterEach(() => jest.useRealTimers());

function open(tab: 'times' | 'qibla' = 'times') {
  const onTab = jest.fn();
  const onOpenCalculation = jest.fn();
  render(<PrayerSheet visible tab={tab} onTab={onTab} onClose={jest.fn()} onOpenCalculation={onOpenCalculation} />);
  return { onTab, onOpenCalculation };
}

describe('<PrayerSheet /> Times', () => {
  it('the next prayer and its countdown, the dates, and the place', async () => {
    open();
    await act(async () => {});
    const head = screen.getByTestId('prayer-headline');
    expect(head).toHaveTextContent(`Asr ${countdown(DAY.asr!.getTime() - NOW.getTime())}`);
    expect(screen.getByText(/Wednesday 28 October · 17 Jumada al-Ula 1448/)).toBeTruthy();
    expect(screen.getByText('London, United Kingdom')).toBeTruthy();
  });

  it('six rows: the next one in the accent with its countdown, the current one "Now", sunrise without a bell', async () => {
    open();
    await act(async () => {});
    for (const n of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']) expect(screen.getByTestId(`prayer-row-${n}`)).toBeTruthy();
    const asr = screen.getByTestId('prayer-row-asr');
    expect(flat(asr.props.style).backgroundColor).toBe(paletteLight.accentSubtle);
    expect(within(asr).getByText(formatTime(DAY.asr!))).toBeTruthy();
    expect(within(asr).getByText(countdown(DAY.asr!.getTime() - NOW.getTime()))).toBeTruthy();
    expect(within(screen.getByTestId('prayer-row-dhuhr')).getByText('Now')).toBeTruthy();
    expect(screen.queryByTestId('prayer-bell-sunrise')).toBeNull();
    expect(within(asr).getByText('العصر')).toBeTruthy();
  });

  it('a bell turns that prayer’s notification on (allowed already) and off', async () => {
    open();
    await act(async () => {});
    await act(async () => {
      fireEvent.press(screen.getByTestId('prayer-bell-maghrib'));
    });
    expect(getPrayerPrefs().alerts.maghrib.on).toBe(true);
    await act(async () => {
      fireEvent.press(screen.getByTestId('prayer-bell-maghrib'));
    });
    expect(getPrayerPrefs().alerts.maghrib.on).toBe(false);
  });

  it('not allowed yet: an in-app line first ("Turn on prayer notifications?"), and the bell stays off', async () => {
    mockPermission = { granted: false, status: 'undetermined', canAskAgain: true };
    open();
    await act(async () => {});
    await act(async () => {
      fireEvent.press(screen.getByTestId('prayer-bell-asr'));
    });
    expect(screen.getByText('Turn on prayer notifications?')).toBeTruthy();
    expect(getPrayerPrefs().alerts.asr.on).toBe(false);
  });

  it('refused before: Notifications are off, Open Settings', async () => {
    mockPermission = { granted: false, status: 'denied', canAskAgain: false };
    open();
    await act(async () => {});
    await act(async () => {
      fireEvent.press(screen.getByTestId('prayer-bell-asr'));
    });
    expect(screen.getByText('Notifications are off for Revisely')).toBeTruthy();
    expect(screen.getByText('Open Settings')).toBeTruthy();
  });

  it('Calculation shows the method and Asr, and opens its screen', async () => {
    const { onOpenCalculation } = open();
    await act(async () => {});
    expect(within(screen.getByTestId('prayer-calculation')).getByText('Moonsighting · Standard')).toBeTruthy();
    fireEvent.press(screen.getByTestId('prayer-calculation'));
    expect(onOpenCalculation).toHaveBeenCalled();
  });

  it('the tabs: Qibla shows the compass', async () => {
    const { onTab } = open();
    await act(async () => {});
    fireEvent.press(within(screen.getByTestId('prayer-tabs')).getByText('Qibla'));
    expect(onTab).toHaveBeenCalledWith('qibla');
  });

  it('nowhere to work times out for: asks for location, saying it stays on the phone', async () => {
    resetPrayerPrefsForTests(DEFAULT_PRAYER_PREFS);
    Object.assign(mockApp, { user: { id: 'u1', fajrCalculationMethod: 'NorthAmerica', locationCoords: null } });
    mockLocationGranted = false;
    open();
    await act(async () => {});
    expect(screen.getByTestId('prayer-location-needs-permission')).toBeTruthy();
    expect(screen.getByText(/Your location stays on this phone/)).toBeTruthy();
    expect(screen.getByTestId('prayer-done')).toHaveTextContent('Not now');
  });
});

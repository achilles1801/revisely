import React from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's' },
}));
const mockApp: Record<string, unknown> = {};
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));
const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));
let mockPermission = { granted: true, status: 'granted', canAskAgain: true };
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => mockPermission),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
}));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: false })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => null),
}));

import PrayerNotificationsScreen, { alertSummary } from '../PrayerNotificationsScreen';
import PrayerCalculationScreen, { adjustLabel } from '../PrayerCalculationScreen';
import { DEFAULT_PRAYER_PREFS, getPrayerPrefs, resetPrayerPrefsForTests } from '../../../lib/prayer/prefs';

const LONDON = { latitude: 51.51, longitude: -0.13 };
// A menu's action runs once its modal has gone (iOS: the modal's dismissal).
const dismissMenus = () => screen.UNSAFE_getAllByType(Modal).forEach((m) => m.props.onDismiss?.());

beforeEach(() => {
  jest.clearAllMocks();
  mockPermission = { granted: true, status: 'granted', canAskAgain: true };
  resetPrayerPrefsForTests({ ...DEFAULT_PRAYER_PREFS, place: LONDON });
  Object.assign(mockApp, {
    user: { id: 'u1', previewTester: true, fajrCalculationMethod: 'MoonsightingCommittee' },
    saveUser: jest.fn(async () => undefined),
  });
});

describe('Prayer notifications', () => {
  it('each prayer: off, or what it does (sound · reminder); the summary', () => {
    expect(alertSummary({ on: true, before: 10, sound: 'standard' })).toBe('Standard tone · 10 min before');
    expect(alertSummary({ on: true, before: 0, sound: 'silent' })).toBe('Silent');
    resetPrayerPrefsForTests({
      ...DEFAULT_PRAYER_PREFS,
      place: LONDON,
      alerts: { ...DEFAULT_PRAYER_PREFS.alerts, fajr: { on: true, before: 10, sound: 'standard' } },
    });
    render(<PrayerNotificationsScreen />);
    expect(within(screen.getByTestId('prayer-alert-fajr')).getByText('Standard tone · 10 min before')).toBeTruthy();
    expect(within(screen.getByTestId('prayer-alert-isha')).getByText('Off')).toBeTruthy();
  });

  it('a switch on (allowed): on; not asked yet: the in-app line first', async () => {
    render(<PrayerNotificationsScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('prayer-alert-dhuhr-switch'), 'valueChange', true);
    });
    expect(getPrayerPrefs().alerts.dhuhr.on).toBe(true);
    mockPermission = { granted: false, status: 'undetermined', canAskAgain: true };
    await act(async () => {
      fireEvent(screen.getByTestId('prayer-alert-asr-switch'), 'valueChange', true);
    });
    expect(getPrayerPrefs().alerts.asr.on).toBe(false);
    expect(screen.getByText('Turn on prayer notifications?')).toBeTruthy();
    // Allow: iOS asks, then it's on.
    fireEvent.press(screen.getByTestId('sheet-action-allow'));
    await act(async () => {
      dismissMenus();
    });
    expect(getPrayerPrefs().alerts.asr.on).toBe(true);
  });

  it('its sheet: the reminder (Off, 5–30 min) and the sound (standard or silent)', async () => {
    resetPrayerPrefsForTests({
      ...DEFAULT_PRAYER_PREFS,
      place: LONDON,
      alerts: { ...DEFAULT_PRAYER_PREFS.alerts, maghrib: { on: true, before: 0, sound: 'standard' } },
    });
    render(<PrayerNotificationsScreen />);
    fireEvent.press(screen.getByTestId('prayer-alert-maghrib-detail'));
    const sheet = screen.getByTestId('prayer-alert-sheet');
    for (const m of ['Off', '5 min', '10 min', '15 min', '30 min']) expect(within(sheet).getByText(m)).toBeTruthy();
    fireEvent.press(within(sheet).getByTestId('prayer-before-15'));
    fireEvent.press(within(sheet).getByTestId('prayer-sound-silent'));
    expect(getPrayerPrefs().alerts.maghrib).toEqual({ on: true, before: 15, sound: 'silent' });
    expect(within(sheet).getByText('A banner only')).toBeTruthy();
  });
});

describe('Calculation', () => {
  it('Asr: Standard or Hanafi, with Hanafi’s time today', () => {
    render(<PrayerCalculationScreen />);
    expect(screen.getByText(/Hanafi puts Asr later \(\d{1,2}:\d{2}/)).toBeTruthy();
    fireEvent.press(within(screen.getByTestId('prayer-madhab')).getByText('Hanafi'));
    expect(getPrayerPrefs().madhab).toBe('hanafi');
  });

  it('the method is the account’s (shared with Start day at fajr)', async () => {
    render(<PrayerCalculationScreen />);
    expect(screen.getByText('Also used for “Start day at fajr”.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('prayer-method'));
    fireEvent.press(screen.getByTestId('sheet-action-UmmAlQura'));
    await act(async () => {
      dismissMenus();
    });
    expect(mockApp.saveUser).toHaveBeenCalledWith(expect.objectContaining({ fajrCalculationMethod: 'UmmAlQura' }));
  });

  it('high latitudes: Recommended by default, the others to choose', async () => {
    render(<PrayerCalculationScreen />);
    expect(within(screen.getByTestId('prayer-high-latitude')).getByText('Recommended')).toBeTruthy();
    fireEvent.press(screen.getByTestId('prayer-high-latitude'));
    fireEvent.press(screen.getByTestId('sheet-action-seventhofthenight'));
    await act(async () => {
      dismissMenus();
    });
    expect(getPrayerPrefs().highLatitude).toBe('seventhofthenight');
  });

  it('± minutes per prayer', () => {
    expect(adjustLabel(0)).toBe('0 min');
    expect(adjustLabel(2)).toBe('+2 min');
    expect(adjustLabel(-3)).toBe('−3 min');
    render(<PrayerCalculationScreen />);
    fireEvent.press(within(screen.getByTestId('prayer-adjust-maghrib')).getByLabelText(/Increase|More|increase/));
    expect(getPrayerPrefs().adjustments.maghrib).toBe(1);
  });
});

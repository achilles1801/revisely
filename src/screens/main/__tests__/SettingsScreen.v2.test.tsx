import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name, color }: { name: string; color: string }) => <Text testID={`icon-${name}`}>{color}</Text> };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
// Any glass left in the new design would show up as this.
jest.mock('../../../navigation/TabBar', () => ({ useTabBarFootprint: () => 0 }));
jest.mock('../../../components/settings/AppInfo', () => ({ AppInfo: () => null }));

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => mockNavigation,
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});

const mockUser: any = {
  name: 'Majd',
  reminderTime: '08:00',
  notificationsEnabled: true,
  smartTrackingEnabled: false,
  carryOverMode: 'shift',
  fajrBoundaryEnabled: false,
};
const mockSaveUser = jest.fn(async () => undefined);
jest.mock('../../../context/AppContext', () => ({
  useApp: () => ({ user: mockUser, saveUser: mockSaveUser, resetOnboarding: jest.fn() }),
}));
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ firebaseUser: { uid: 'u1', email: 'majd@example.com' }, signOutUser: jest.fn(), deleteAccount: jest.fn() }),
}));
const mockSchedule = jest.fn(async () => undefined);
jest.mock('../../../lib/notifications', () => ({ scheduleDailyReminder: (...a: unknown[]) => mockSchedule(...(a as [])) }));
const mockSubmitFeedback = jest.fn(async () => undefined);
jest.mock('../../../services/firestoreService', () => ({
  getReadingSessions: jest.fn(async () => []),
  submitFeedback: (...a: unknown[]) => mockSubmitFeedback(...(a as [])),
}));
jest.mock('../../../lib/appUsage', () => ({ getTotalAppUsageSeconds: jest.fn(async () => 0) }));
jest.mock('../../../lib/recordings', () => ({ listRecordings: jest.fn(async () => []), deleteAllRecordings: jest.fn() }));
jest.mock('../../../lib/recordingBackupUi', () => ({
  askTurnOffBackup: jest.fn(),
  backupLabel: () => 'Backed up',
  deleteAllEverywhere: jest.fn(),
  useBackupStatus: () => ({}),
}));
jest.mock('../../../lib/sentry', () => ({ reportProblem: jest.fn() }));
let mockTester = true;
jest.mock('../../../lib/tester', () => ({ isTester: () => mockTester }));

import SettingsScreen from '../SettingsScreen';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { DEFAULT_ACCENT, paletteV2 } from '../../../theme/v2';
import { setHomePrefs } from '../../../lib/homePrefs';

const palette = paletteV2(false, DEFAULT_ACCENT);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const flat = (style: unknown): Record<string, any> => StyleSheet.flatten(style as never) ?? {};

async function renderV2() {
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <SettingsScreen />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
});

describe('Settings in the new design: its sheets and rows', () => {
  it('has no glass anywhere; Smart Tracking says what it does under its label; the version line is metadata', async () => {
    await renderV2();
    expect(screen.getByTestId('smart-tracking-row')).toBeTruthy();
    expect(screen.getByText(/Turn on to rate pages/).props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: palette.secondary })]),
    );
    expect(flat(screen.getByText(/^Revisely · v/).props.style).color).toBe(palette.secondary);
  });

  it('reminder time: a v2 sheet, the chosen hour on the accent tint, Save schedules it', async () => {
    await renderV2();
    fireEvent.press(screen.getByLabelText('Reminder time, 8:00 AM'));
    await act(async () => {});
    const sheet = flat(screen.getByTestId('time-sheet').props.style);
    expect(sheet.backgroundColor).toBe(palette.sheet);
    expect(sheet.borderTopLeftRadius).toBe(20);
    expect(within(screen.getByTestId('time-sheet')).getByText('Reminder time')).toBeTruthy();
    expect(flat(screen.getByTestId('time-hour-8').props.style).backgroundColor).toBe(palette.accentSubtle);
    expect(flat(screen.getByTestId('time-hour-9').props.style).backgroundColor).toBeUndefined();
    fireEvent.press(screen.getByTestId('time-hour-9'));
    fireEvent.press(screen.getByTestId('time-minute-30'));
    expect(flat(screen.getByTestId('time-hour-9').props.style).backgroundColor).toBe(palette.accentSubtle);
    await act(async () => {
      fireEvent.press(screen.getByTestId('time-save'));
    });
    expect(mockSaveUser).toHaveBeenCalledWith(expect.objectContaining({ reminderTime: '09:30' }));
    expect(mockSchedule).toHaveBeenCalledWith('09:30', true);
  });

  it('display name: a field on the quiet fill, saved from the header', async () => {
    await renderV2();
    fireEvent.press(screen.getByLabelText('Display name, Majd'));
    await act(async () => {});
    const input = screen.getByTestId('name-sheet-input');
    expect(flat(input.props.style)).toMatchObject({ backgroundColor: palette.fill, color: palette.text });
    expect(input.props.placeholderTextColor).toBe(palette.secondary);
    fireEvent.changeText(input, '  Omar ');
    await act(async () => {
      fireEvent.press(screen.getByTestId('name-sheet-save'));
    });
    expect(mockSaveUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Omar' }));
  });

  it('feedback: Submit stays off until something is written, then sends it', async () => {
    await renderV2();
    fireEvent.press(screen.getByLabelText('Send feedback'));
    await act(async () => {});
    expect(screen.getByTestId('feedback-sheet-save').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.changeText(screen.getByTestId('feedback-sheet-input'), 'The timer is great');
    expect(screen.getByTestId('feedback-sheet-save').props.accessibilityState).toMatchObject({ disabled: false });
    jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);
    await act(async () => {
      fireEvent.press(screen.getByTestId('feedback-sheet-save'));
    });
    expect(mockSubmitFeedback).toHaveBeenCalledWith(expect.objectContaining({ message: 'The timer is great' }));
  });
});

describe('Settings: Progress style (testers only, while the user compares them)', () => {
  afterEach(() => {
    mockTester = true;
    act(() => setHomePrefs({ progressStyle: 'ring', showProgressCard: true }));
  });

  it('a tester sees Ring, Hairline and Juz dots under the progress card; a choice is kept on this phone', async () => {
    await renderV2();
    expect(screen.getByTestId('progress-style-row')).toBeTruthy();
    expect(screen.getByText('Ring')).toBeTruthy();
    expect(screen.getByText('Hairline')).toBeTruthy();
    expect(screen.getByText('Juz dots')).toBeTruthy();
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    fireEvent.press(screen.getByTestId('pill-dots'));
    await act(async () => {});
    const saved = setItem.mock.calls.filter(([key]) => key === '@revisely_home_prefs').pop();
    expect(saved && JSON.parse(saved[1] as string).progressStyle).toBe('dots');
  });

  it('nobody else sees it (the App Store, App Review)', async () => {
    mockTester = false;
    await renderV2();
    expect(screen.queryByTestId('progress-style-row')).toBeNull();
    expect(screen.queryByText('Juz dots')).toBeNull();
  });

  it('gone while the progress card is off', async () => {
    act(() => setHomePrefs({ showProgressCard: false }));
    await renderV2();
    expect(screen.queryByTestId('progress-style-row')).toBeNull();
  });
});

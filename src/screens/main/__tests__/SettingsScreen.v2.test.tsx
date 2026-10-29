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

let mockFollowable = true;
jest.mock('../../../components/recite/useReciteFollow', () => ({ canFollowWords: () => mockFollowable }));
let mockModelState: Record<string, unknown> = { status: 'missing', error: null };
const mockRemoveModel = jest.fn();
jest.mock('../../../lib/recite/speechModelStore', () => ({
  useSpeechModelState: () => mockModelState,
  removeSpeechModel: () => mockRemoveModel(),
  startModelDownload: jest.fn(),
  cancelModelDownload: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn(async () => ({ type: 'wifi' })) }));

import SettingsScreen from '../SettingsScreen';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { DEFAULT_ACCENT, paletteV2 } from '../../../theme/v2';

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

describe('Settings: no Progress style any more (the juz dots won)', () => {
  it('the row is gone, the progress card’s own rows stay', async () => {
    await renderV2();
    expect(screen.queryByTestId('progress-style-row')).toBeNull();
    expect(screen.queryByText('Progress style')).toBeNull();
    expect(screen.queryByText('Juz dots')).toBeNull();
    expect(screen.getByText('Progress card')).toBeTruthy();
  });
});

describe('Settings: Appearance and haptics (Oct 28)', () => {
  it('Accent is a row like Theme: the label on the left, the three choices on its right', async () => {
    await renderV2();
    const row = screen.getByTestId('accent-row');
    expect(flat(row.props.style).flexDirection).toBe('row');
    // The picker sits in the row itself, after the label, pushed to the right.
    const picker = screen.getByTestId('accent-picker');
    expect(flat(picker.props.style)).toMatchObject({ flexDirection: 'row', justifyContent: 'flex-end' });
    let parent = picker.parent;
    while (parent && parent.props.testID !== 'accent-row') parent = parent.parent;
    expect(parent).toBeTruthy();
    // The same pill size as Theme's Light and Dark.
    expect(flat(screen.getByTestId('accent-indigo').props.style).minHeight).toBe(30);
    expect(screen.getByLabelText('Indigo').props.accessibilityState).toMatchObject({ checked: true });
  });

  it('no Haptics switch: haptics are always on for the moments that matter', async () => {
    await renderV2();
    expect(screen.queryByText('Haptics')).toBeNull();
    expect(screen.queryByLabelText('Haptics')).toBeNull();
  });
});

describe('Settings: Prayer (testers)', () => {
  afterEach(() => {
    delete mockUser.previewTester;
  });

  it('not a tester: Day boundary as before, no Prayer section or Next prayer switch', async () => {
    await renderV2();
    expect(screen.getByText('Day boundary')).toBeTruthy();
    expect(screen.queryByText('Prayer notifications')).toBeNull();
    expect(screen.queryByText('Next prayer')).toBeNull();
  });

  it('a tester: Prayer holds times, notifications, calculation, the Qibla and Start day at fajr; Home screen gets Next prayer', async () => {
    mockUser.previewTester = true;
    mockUser.fajrCalculationMethod = 'MoonsightingCommittee';
    await renderV2();
    expect(screen.queryByText('Day boundary')).toBeNull();
    for (const label of ['Prayer', 'Prayer times', 'Prayer notifications', 'Calculation', 'Qibla', 'Start day at fajr']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // The method is under Calculation now, not under the fajr switch.
    expect(screen.queryByTestId('fajr-method')).toBeNull();
    expect(screen.getByText('Moonsighting')).toBeTruthy();
    expect(screen.getByText('Next prayer')).toBeTruthy();
    expect(screen.getByText('A line under the header')).toBeTruthy();
    fireEvent.press(screen.getByText('Prayer notifications'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PrayerNotifications');
    fireEvent.press(screen.getByText('Calculation'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PrayerCalculation');
  });
});

describe('Settings: the speech model (testers)', () => {
  beforeEach(() => {
    mockFollowable = true;
    mockModelState = { status: 'missing', error: null };
  });
  afterEach(() => {
    delete mockUser.previewTester;
  });

  it('not a tester, or a binary without the module: no row', async () => {
    await renderV2();
    expect(screen.queryByText('Speech model')).toBeNull();
    mockUser.previewTester = true;
    mockFollowable = false;
    await renderV2();
    expect(screen.queryByText('Speech model')).toBeNull();
  });

  it('prayer times public, not a tester: still no row (recite mode has its own gate)', async () => {
    const spy = jest.spyOn(require('../../../lib/prayer/status'), 'prayerTimesEnabled').mockReturnValue(true);
    await renderV2();
    expect(screen.queryByText('Speech model')).toBeNull();
    spy.mockRestore();
  });

  it('not downloaded: says so, and opens the download', async () => {
    mockUser.previewTester = true;
    await renderV2();
    expect(screen.getByText('Speech model')).toBeTruthy();
    expect(screen.getByText('Follows your recitation word by word, on this iPhone')).toBeTruthy();
    expect(screen.getByText('Not downloaded')).toBeTruthy();
    fireEvent.press(screen.getByText('Speech model'));
    await act(async () => {});
    expect(screen.getByTestId('speech-model-sheet')).toBeTruthy();
  });

  it('on the phone: its size, and Delete', async () => {
    mockUser.previewTester = true;
    mockModelState = { status: 'ready', bytes: 59_707_625 };
    await renderV2();
    expect(screen.getByText('57 MB')).toBeTruthy();
    fireEvent.press(screen.getByText('Speech model'));
    await act(async () => {});
    fireEvent.press(screen.getByTestId('sheet-action-delete'));
    await act(async () => {
      screen.UNSAFE_getAllByType(require('react-native').Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
    });
    expect(mockRemoveModel).toHaveBeenCalled();
  });

  it('downloading: the progress', async () => {
    mockUser.previewTester = true;
    mockModelState = { status: 'downloading', progress: 0.3 };
    await renderV2();
    expect(screen.getByText('30%')).toBeTruthy();
  });
});

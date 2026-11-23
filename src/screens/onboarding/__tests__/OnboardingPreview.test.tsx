import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { ensureNotificationsPermission } from '../../../lib/notifications';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{name}</Text> };
});
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 1, longitude: 2 } })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  Accuracy: { Balanced: 3 },
}));
jest.mock('../../../lib/notifications', () => ({ ensureNotificationsPermission: jest.fn(async () => true) }));
jest.mock('../../../components/MemorizationBrowser', () => ({ MemorizationBrowser: () => null }));

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
const mockRoute: { key: string; params: Record<string, unknown> } = { key: 'r1', params: {} };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => mockRoute,
}));

const mockApp: Record<string, unknown> = {};
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ firebaseUser: { displayName: 'Aisha' } }) }));

import JourneySelectScreen from '../JourneySelectScreen';
import JuzSelectionScreen from '../JuzSelectionScreen';
import DailyAmountScreen from '../DailyAmountScreen';
import DayStartScreen from '../DayStartScreen';
import ReminderScreen from '../ReminderScreen';
import { OnboardingPreviewProvider } from '../onboardingAccess';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import type { UserPage } from '../../../types';

const page = (pageNumber: number, status: UserPage['status']): UserPage => ({
  pageNumber,
  status,
  dateMemorized: null,
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
});

const onDone = jest.fn();

async function show(ui: React.ReactElement) {
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <OnboardingPreviewProvider onDone={onDone}>{ui}</OnboardingPreviewProvider>
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
}

const press = (id: string) =>
  act(async () => {
    fireEvent.press(screen.getByTestId(id));
  });

function expectNothingWritten() {
  expect(mockApp.updatePages).not.toHaveBeenCalled();
  expect(mockApp.saveUser).not.toHaveBeenCalled();
  expect(mockApp.completeOnboarding).not.toHaveBeenCalled();
  expect(ensureNotificationsPermission).not.toHaveBeenCalled();
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
}

const answers = { journeyStage: 'in_progress', scheduleMode: 'pages', dailyCapacity: 10, dailyJuzCount: 1 };

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockRoute.params = { journeyStage: 'in_progress' };
  // An account with real progress: half the Quran memorized.
  mockApp.pages = Array.from({ length: 604 }, (_, i) => page(i + 1, i < 302 ? 'memorized' : 'not_memorized'));
  mockApp.user = { memorizedSurahs: [2, 3], dailyPageCapacity: 15 };
  mockApp.updatePages = jest.fn(async () => undefined);
  mockApp.saveUser = jest.fn(async () => undefined);
  mockApp.completeOnboarding = jest.fn(async () => undefined);
  mockApp.createDefaultUser = jest.fn((o: object) => ({ memorizedSurahs: [], ...o }));
});

describe('[ONBOARD-5] Preview onboarding writes nothing', () => {
  it('All of it stays in the preview', async () => {
    await show(<JourneySelectScreen />);
    await press('journey-all');
    expect(mockNavigation.navigate).toHaveBeenCalledWith('DailyAmount', { journeyStage: 'complete' });
    expectNothingWritten();
  });

  it('opens on a blank account, not this one, and Continue saves nothing', async () => {
    await show(<JuzSelectionScreen />);
    expect(screen.getByTestId('juz-selection-summary').props.children).toBe('1 page chosen');
    await press('juz-cell-30');
    await press('juz-continue');
    expect(mockNavigation.navigate).toHaveBeenCalledWith('DailyAmount', { journeyStage: 'in_progress' });
    expectNothingWritten();
  });

  it('the amount reads the blank account', async () => {
    await show(<DailyAmountScreen />);
    expect(screen.queryByTestId('amount-round')).toBeNull();
    await press('amount-continue');
    expectNothingWritten();
  });

  it('At Fajr moves on with no location prompt and no alert', async () => {
    mockRoute.params = answers;
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await show(<DayStartScreen />);
    await press('day-fajr');
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Reminder', expect.objectContaining({ fajrBoundaryEnabled: true }));
    expect(alert).not.toHaveBeenCalled();
    expectNothingWritten();
    alert.mockRestore();
  });

  it.each(['reminder-on', 'reminder-off'])('%s closes the preview, with no prompt and nothing saved', async (id) => {
    mockRoute.params = { ...answers, fajrBoundaryEnabled: true, locationCoords: { latitude: 1, longitude: 2 } };
    await show(<ReminderScreen />);
    await press(id);
    expect(onDone).toHaveBeenCalledTimes(1);
    expectNothingWritten();
  });
});

// Regression: unchecking pages that were already saved must take them back
// out of today's session (it used to only ever add, so 7/10 stayed 7/10).
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import ActiveRevisionScreen from '../ActiveRevisionScreen';
import { getCurrentRevisionDay } from '../../../lib/algorithm';
import type { RevisionLog, User, UserPage } from '../../../types';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's' },
}));
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return { GlassView: View, GlassContainer: View, isLiquidGlassAvailable: () => false };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
jest.mock('../../../components/MushafPager', () => ({ MushafPager: () => null }));

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));

jest.mock('../../../context/ReadingTimerContext', () => ({
  useReadingTimer: () => ({
    timer: null,
    start: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    finish: jest.fn(),
    discard: jest.fn(),
    notePage: jest.fn(),
    noteRevisedPages: jest.fn(),
  }),
  useNow: () => Date.now(),
}));

const mockApp: any = {};
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../../../context/ThemeContext', () => {
  const { colors } = require('../../../theme/colors');
  return { useTheme: () => ({ theme: colors, isDark: false }) };
});

const DAY_PAGES = [331, 332, 333, 334, 335, 336, 337, 338, 339, 340];

function setup(revised: number[]) {
  const user = {
    id: 'u1',
    createdAt: '2026-09-01T00:00:00.000Z',
    smartTrackingEnabled: false,
    hasSeenSmartTrackingPreview: true,
    dailyPageCapacity: 10,
    scheduleMode: 'pages',
    dailyJuzCount: 1,
    reminderTime: '08:00',
    notificationsEnabled: true,
    currentMemorizationJuz: null,
    currentMemorizationPage: null,
    currentKhatamPage: 1,
    savedPlans: [],
    streak: 0,
    lastRevisionDate: null,
    memorizedSurahs: [],
    fajrBoundaryEnabled: false,
    locationCoords: null,
    fajrCalculationMethod: 'NorthAmerica',
    scheduleAnchorDate: '2026-09-01',
    customPlan: null,
  } as User;
  const today = getCurrentRevisionDay(user);
  user.customPlan = { days: [DAY_PAGES], cycleStartDate: today, direction: 'forward' };

  const pages: UserPage[] = Array.from({ length: 604 }, (_, i) => ({
    pageNumber: i + 1,
    status: DAY_PAGES.includes(i + 1) ? 'memorized' : 'not_memorized',
    dateMemorized: null,
    weaknessRating: 4,
    lastRevisedDate: null,
    totalRevisionCount: 0,
    skipCount: 0,
  }));
  const todaysLog: RevisionLog = {
    id: today,
    date: today,
    assignedPages: DAY_PAGES,
    pagesRevised: revised,
    pagesSkipped: [],
    weaknessUpdates: [],
    durationMinutes: 12,
  };
  Object.assign(mockApp, {
    user,
    pages,
    logs: [todaysLog],
    error: null,
    loadData: jest.fn(),
    updatePages: jest.fn(() => Promise.resolve()),
    addLog: jest.fn(() => Promise.resolve()),
    updateLog: jest.fn(() => Promise.resolve()),
  });
  return todaysLog;
}

beforeEach(() => jest.clearAllMocks());

describe('ActiveRevisionScreen — unchecking saved pages', () => {
  it('removes an unchecked page from today’s session on exit', async () => {
    // Everything saved already, so the screen opens on the first page (331).
    const log = setup(DAY_PAGES);
    render(<ActiveRevisionScreen />);
    expect(screen.getByText(/10\/10/)).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Unmark current page'));
    expect(screen.getByText(/9\/10/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Back'));
    });

    expect(mockApp.updateLog).toHaveBeenCalledTimes(1);
    expect(mockApp.updateLog).toHaveBeenCalledWith({
      ...log,
      pagesRevised: DAY_PAGES.filter((p) => p !== 331),
    });
    // Nothing new was checked, so nothing is added.
    expect(mockApp.addLog).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('only adds when nothing saved was unchecked', async () => {
    setup([332, 333]);
    render(<ActiveRevisionScreen />);
    // Opens on 331 (first unrevised); mark it and leave.
    fireEvent.press(screen.getByLabelText('Mark current page as revised'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Back'));
    });
    expect(mockApp.addLog).toHaveBeenCalledWith(
      expect.objectContaining({ pagesRevised: [331] }),
    );
    expect(mockApp.updateLog).not.toHaveBeenCalled();
  });
});

// "Pages by strength" (ACT-12): the Insights tab's Browse as a screen of its own, behind Weak spots'
// "See all pages by strength". Every row, no "Show all"; the filters and the page sheet as before.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text testID={`icon-${name}`}>{name}</Text> };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: mockGoBack }),
}));
const mockApp: any = {};
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));

import { ScrollView } from 'react-native';
import { touchHandlingAncestor } from '../../../../jest/scrollable';
import PagesByStrengthScreen from '../PagesByStrengthScreen';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import type { RevisionLog, User, UserPage } from '../../../types';

const v2 = (ui: React.ReactElement) => (
  <DesignProvider initial={{}}>
    <ThemeProvider>{ui}</ThemeProvider>
  </DesignProvider>
);

const user = {
  id: 'u1',
  createdAt: '2026-01-01T12:00:00.000Z',
  smartTrackingEnabled: true,
  hasSeenSmartTrackingPreview: true,
  previewTester: true,
  dailyPageCapacity: 20,
  scheduleMode: 'pages',
  dailyJuzCount: 1,
  customPlan: null,
  savedPlans: [],
  fajrBoundaryEnabled: false,
} as unknown as User;

const page = (pageNumber: number, weaknessRating: number, revised = true): UserPage => ({
  pageNumber,
  status: 'memorized',
  dateMemorized: '2025-01-01T00:00:00.000Z',
  weaknessRating,
  lastRevisedDate: revised ? new Date(Date.now() - 3 * 86_400_000).toISOString() : null,
  totalRevisionCount: 3,
  skipCount: 0,
});

const log = (id: string, pagesRevised: number[]): RevisionLog =>
  ({ id, date: '2026-10-20', pagesRevised, pagesSkipped: [], weaknessUpdates: [], durationMinutes: null }) as RevisionLog;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
  mockApp.user = user;
  // Page 1 very weak, 2 moderate, 582–583 strong (Juz 30), 50 weak (Juz 3); 600 never revised.
  mockApp.pages = [page(1, 1), page(2, 3), page(582, 5), page(583, 4), page(50, 2), page(600, 3, false)];
  mockApp.logs = [log('a', [1]), log('b', [2]), log('c', [582])];
});

async function open() {
  render(v2(<PagesByStrengthScreen />));
  await act(async () => {});
}

describe('Pages by strength (ACT-12)', () => {
  it('every revised page, weakest first, with no "Show all"; a page never revised is not listed', async () => {
    await open();
    expect(screen.getByText('Pages by strength')).toBeTruthy();
    expect(screen.getByText('5 revised pages')).toBeTruthy();
    expect(screen.getByText('Weakest first')).toBeTruthy();
    const order = screen.getAllByTestId(/^browse-page-/).map((el) => el.props.testID);
    expect(order).toEqual(['browse-page-1', 'browse-page-50', 'browse-page-2', 'browse-page-583', 'browse-page-582']);
    expect(screen.queryByTestId('show-more')).toBeNull();
    expect(screen.queryByTestId('browse-page-600')).toBeNull();
  });

  it('the old Browse: Surahs and Juz, and a juz narrows the pages to it', async () => {
    await open();
    fireEvent.press(screen.getByTestId('pill-surahs'));
    expect(screen.getByTestId('browse-surahs')).toBeTruthy();
    fireEvent.press(screen.getByTestId('pill-juz'));
    fireEvent.press(screen.getByTestId('browse-juz-30'));
    expect(screen.getByTestId('browse-pages')).toBeTruthy();
    expect(screen.getByTestId('browse-page-582')).toBeTruthy();
    expect(screen.queryByTestId('browse-page-1')).toBeNull();
  });

  it('a row opens its page in a sheet; back goes back', async () => {
    await open();
    fireEvent.press(screen.getByTestId('browse-page-50'));
    expect(screen.getByTestId('page-preview')).toBeTruthy();
    fireEvent.press(screen.getByTestId('back'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('nothing above its scroll views holds the touch', async () => {
    await open();
    fireEvent.press(screen.getByTestId('browse-page-1'));
    for (const s of screen.UNSAFE_getAllByType(ScrollView)) expect(touchHandlingAncestor(s)).toBeNull();
  });

  it('no revised page yet: one quiet line, no list', async () => {
    mockApp.pages = [page(600, 3, false)];
    await open();
    expect(screen.getByTestId('pages-by-strength-empty')).toBeTruthy();
    expect(screen.queryByTestId('browse-tabs')).toBeNull();
  });
});

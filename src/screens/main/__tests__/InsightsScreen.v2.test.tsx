import React from 'react';
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
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return { GlassView: View, GlassContainer: View, isLiquidGlassAvailable: () => false };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  useScrollToTop: () => undefined,
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));
// The new design has no glass: any GlassCard rendered would show up here.
jest.mock('../../../components/GlassCard', () => {
  const { View } = require('react-native');
  return { GlassCard: () => <View testID="glass-card" />, GlassBackdrop: () => null };
});

const mockApp: any = {};
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));

import { ScrollView } from 'react-native';
import { touchHandlingAncestor } from '../../../../jest/scrollable';
import AlgorithmScreen from '../AlgorithmScreen';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { DEFAULT_ACCENT, paletteV2 } from '../../../theme/v2';
import type { RevisionLog, User, UserPage } from '../../../types';

const palette = paletteV2(false, DEFAULT_ACCENT);
const flat = (style: unknown) => Object.assign({}, ...[style].flat(5).filter(Boolean));

const v2 = (ui: React.ReactElement) => (
  <DesignProvider initial={{ allowed: true, chosen: 'new' }}>
    <ThemeProvider>{ui}</ThemeProvider>
  </DesignProvider>
);

const user = {
  id: 'u1',
  createdAt: '2026-01-01T12:00:00.000Z',
  smartTrackingEnabled: true,
  hasSeenSmartTrackingPreview: true,
  dailyPageCapacity: 20,
  scheduleMode: 'pages',
  dailyJuzCount: 1,
  customPlan: null,
  savedPlans: [],
  fajrBoundaryEnabled: false,
} as unknown as User;

const page = (pageNumber: number, weaknessRating: number): UserPage => ({
  pageNumber,
  status: 'memorized',
  dateMemorized: '2025-01-01T00:00:00.000Z',
  weaknessRating,
  lastRevisedDate: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  totalRevisionCount: 3,
  skipCount: 0,
});

const log = (id: string, pagesRevised: number[]): RevisionLog =>
  ({ id, date: '2026-10-20', pagesRevised, pagesSkipped: [], weaknessUpdates: [], durationMinutes: null }) as RevisionLog;

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
  mockApp.user = user;
  // Page 1 very weak, page 2 moderate, pages 582–583 strong (Juz 30), 50 in Juz 3.
  mockApp.pages = [page(1, 1), page(2, 3), page(582, 5), page(583, 4), page(50, 2)];
  mockApp.logs = [log('a', [1]), log('b', [2]), log('c', [582])];
  mockApp.loadData = jest.fn(async () => undefined);
});

async function renderInsights() {
  render(v2(<AlgorithmScreen />));
  await act(async () => {});
}

const closeSheets = () => {
  // An ActionSheet's action runs once it has gone (iOS: onDismiss).
  const { Modal } = jest.requireActual('react-native');
  act(() => {
    screen.UNSAFE_getAllByType(Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
  });
};

describe('Insights in the new design', () => {
  it('a large title on the flat ground, no glass, no help button', async () => {
    await renderInsights();
    expect(screen.getByTestId('insights-v2')).toBeTruthy();
    const title = screen.getByText('Insights');
    expect(flat(title.props.style)).toMatchObject({ fontSize: 28, fontWeight: '700', color: palette.text });
    expect(screen.queryByTestId('glass-card')).toBeNull();
    expect(screen.queryByTestId('icon-help')).toBeNull();
  });

  it('warming up before enough sessions: a line and a progress bar, no lists', async () => {
    mockApp.logs = [log('a', [1])];
    await renderInsights();
    expect(screen.getByTestId('insights-warming')).toBeTruthy();
    expect(screen.getByText('Insights warming up')).toBeTruthy();
    expect(screen.getByText('1 of 3 so far')).toBeTruthy();
    expect(screen.getByTestId('insights-warming-progress').props.accessibilityValue).toMatchObject({ now: 33 });
    expect(screen.queryByText('Focus')).toBeNull();
    expect(screen.queryByTestId('glass-card')).toBeNull();
  });

  it('strength: one bar, weak red and strong green, with the counts', async () => {
    await renderInsights();
    expect(screen.getByText('Strength')).toBeTruthy();
    expect(screen.getByText('5 revised pages')).toBeTruthy();
    expect(screen.getByText('2 weak')).toBeTruthy();
    expect(screen.getByText('1 moderate')).toBeTruthy();
    expect(screen.getByText('2 strong')).toBeTruthy();
    expect(flat(screen.getByTestId('strength-bar-weak').props.style)).toMatchObject({ flex: 2, backgroundColor: palette.red });
    expect(flat(screen.getByTestId('strength-bar-moderate').props.style).backgroundColor).toBe(palette.secondary);
    expect(flat(screen.getByTestId('strength-bar-strong').props.style).backgroundColor).toBe(palette.good);
  });

  it('focus: the three weakest pages first, as flat rows with their strength', async () => {
    await renderInsights();
    const first = screen.getByTestId('focus-1');
    expect(within(first).getByText('Page 1 · Al-Fatihah')).toBeTruthy();
    expect(within(first).getByText(/^Very weak · /)).toBeTruthy();
    expect(flat(within(first).getByTestId('strength-dot').props.style).backgroundColor).toBe(palette.red);
    expect(screen.getByTestId('focus-50')).toBeTruthy();
    expect(screen.getByTestId('focus-2')).toBeTruthy();
    // Only three.
    expect(screen.queryByTestId('focus-582')).toBeNull();
  });

  it('browse: pills switch pages, surahs and juz; three rows, then "Show all"', async () => {
    await renderInsights();
    expect(screen.getByTestId('browse-pages')).toBeTruthy();
    expect(screen.queryByTestId('browse-page-583')).toBeNull();
    fireEvent.press(screen.getByTestId('show-more'));
    expect(screen.getByTestId('browse-page-583')).toBeTruthy();
    expect(screen.getByText('Show less')).toBeTruthy();

    fireEvent.press(screen.getByTestId('pill-juz'));
    expect(screen.getByTestId('browse-juz')).toBeTruthy();
    // No juz filter while browsing juz.
    expect(screen.queryByTestId('filter-juz')).toBeNull();
    // A juz narrows the pages to it.
    fireEvent.press(screen.getByTestId('browse-juz-30'));
    expect(screen.getByTestId('browse-pages')).toBeTruthy();
    expect(screen.getByTestId('browse-page-582')).toBeTruthy();
    expect(screen.queryByTestId('browse-page-1')).toBeNull();
    expect(flat(screen.getByTestId('filter-juz').props.style).backgroundColor).toBe(palette.primary);
  });

  it('filters are menus: strength picks a rating, the list follows', async () => {
    await renderInsights();
    fireEvent.press(screen.getByTestId('filter-strength'));
    expect(screen.getByText('Filter by strength')).toBeTruthy();
    fireEvent.press(screen.getByTestId('sheet-action-strength-5'));
    closeSheets();
    expect(screen.getByTestId('browse-page-582')).toBeTruthy();
    expect(screen.queryByTestId('browse-page-583')).toBeNull();
    expect(screen.queryByTestId('browse-page-1')).toBeNull();

    // Let the menu finish sliding away before opening it again.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    fireEvent.press(screen.getByTestId('filter-strength'));
    fireEvent.press(screen.getByTestId('sheet-action-strength-2'));
    closeSheets();
    expect(screen.getByTestId('browse-page-50')).toBeTruthy();
    expect(screen.queryByTestId('browse-page-582')).toBeNull();

    // Weak pages in Juz 30: none.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    fireEvent.press(screen.getByTestId('filter-juz'));
    expect(screen.getByText('Filter by juz')).toBeTruthy();
    fireEvent.press(screen.getByTestId('sheet-action-juz-30'));
    closeSheets();
    expect(screen.getByTestId('browse-empty')).toBeTruthy();
    expect(screen.getByText('No pages match these filters')).toBeTruthy();
  });

  it('nothing above a scroll view holds the touch (the tab, the page sheet)', async () => {
    await renderInsights();
    fireEvent.press(screen.getByTestId('focus-1'));
    const scrolls = screen.UNSAFE_getAllByType(ScrollView);
    expect(scrolls.length).toBeGreaterThan(1);
    for (const s of scrolls) expect(touchHandlingAncestor(s)).toBeNull();
  });

  it('a row opens its page in a sheet', async () => {
    await renderInsights();
    fireEvent.press(screen.getByTestId('focus-1'));
    expect(screen.getByTestId('page-preview')).toBeTruthy();
    expect(screen.getByText('Page 1')).toBeTruthy();
    expect(screen.getByTestId('page-preview-image').props.source).toEqual({
      uri: expect.stringContaining('/mushaf/001.png'),
    });
  });

  it('loading: a spinner on the ground', async () => {
    mockApp.user = null;
    await renderInsights();
    expect(screen.getByTestId('insights-loading')).toBeTruthy();
  });
});

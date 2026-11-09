// "Pages by strength" (ACT-12): the Insights tab's Browse as a screen of its own, behind Weak spots'
// "See all pages by strength". Every row, no "Show all"; the filters and the page sheet as before.
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
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
import { DEFAULT_ACCENT, paletteV2 } from '../../../theme/v2';
import { plainText } from '../../../lib/passages';
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

const page = (pageNumber: number, weaknessRating: number, revised: boolean | Date | string = true): UserPage => ({
  pageNumber,
  status: 'memorized',
  dateMemorized: '2025-01-01T00:00:00.000Z',
  weaknessRating,
  lastRevisedDate:
    revised === false
      ? null
      : typeof revised === 'string'
        ? revised
        : (revised === true ? new Date(Date.now() - 3 * 86_400_000) : revised).toISOString(),
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

  it('each list keeps its id as a view of its own, so iOS doesn’t flatten it away (E2E waits for it)', async () => {
    await open();
    expect(screen.getByTestId('browse-pages').props.collapsable).toBe(false);
    fireEvent.press(screen.getByTestId('pill-surahs'));
    expect(screen.getByTestId('browse-surahs').props.collapsable).toBe(false);
    fireEvent.press(screen.getByTestId('pill-juz'));
    expect(screen.getByTestId('browse-juz').props.collapsable).toBe(false);
  });

  it('Pages | Surahs | Juz are Activity’s tabs: ink pills that hug their labels, the chosen one filled', async () => {
    await open();
    const palette = paletteV2(false, DEFAULT_ACCENT);
    const flat = (style: unknown) => Object.assign({}, ...[style].flat(5).filter(Boolean));
    const row = flat(screen.getByTestId('browse-tabs').props.style);
    expect(row.alignItems).toBe('flex-start');
    expect(flat(screen.getByTestId('pill-pages').props.style).backgroundColor).toBe(palette.text);
    expect(flat(screen.getByTestId('pill-pages').props.style).flex).toBeUndefined();
    expect(flat(screen.getByTestId('pill-surahs').props.style).borderColor).toBe(palette.outline);
    expect(screen.getByLabelText('Pages, selected')).toBeTruthy();
    fireEvent.press(screen.getByTestId('pill-surahs'));
    expect(flat(screen.getByTestId('pill-surahs').props.style).backgroundColor).toBe(palette.text);
  });

  it('a page’s row leads with its surah and ayahs; the page number is only the quiet detail (Majd, Nov 7)', async () => {
    await open();
    const row = screen.getByTestId('browse-page-50');
    expect(within(row).getByText("Ali 'Imran, ayahs 1–9", { normalizer: plainText })).toBeTruthy();
    expect(within(row).getByText('Weak · Juz 3 · p. 50 · revised 3d ago', { normalizer: plainText })).toBeTruthy();
    // The mark is the surah's number, as in Surahs; no "Page 50" title.
    expect(within(row).getByText('3', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText(/^Page \d+/)).toBeNull();
    expect(row.props.accessibilityLabel).toBe("Ali 'Imran, ayahs 1 to 9. Weak · Juz 3 · page 50 · revised 3d ago");
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

  it('a page revised today reads "revised today", never "-1d ago"; earlier ones in whole days', async () => {
    const now = new Date();
    mockApp.pages = [page(548, 2, now), page(549, 2)];
    await open();
    expect(screen.getByText('Weak · Juz 28 · p. 548 · revised today', { normalizer: plainText })).toBeTruthy();
    expect(screen.getByText('Weak · Juz 28 · p. 549 · revised 3d ago', { normalizer: plainText })).toBeTruthy();
    expect(screen.queryByText(/-\d+d ago/)).toBeNull();
  });

  it('a page the self-heal dated (the day, as its midnight UTC) is counted on that day in any zone', async () => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    mockApp.pages = [page(548, 2, `${today}T00:00:00.000Z`)];
    await open();
    expect(screen.getByText('Weak · Juz 28 · p. 548 · revised today', { normalizer: plainText })).toBeTruthy();
  });

  it('no revised page yet: one quiet line, no list', async () => {
    mockApp.pages = [page(600, 3, false)];
    await open();
    expect(screen.getByTestId('pages-by-strength-empty')).toBeTruthy();
    expect(screen.queryByTestId('browse-tabs')).toBeNull();
  });
});

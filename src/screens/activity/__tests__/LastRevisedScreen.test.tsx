// Last revised (ACT-30): the unit that suits the account (or the one picked), recent first (or the sort picked), a
// filter for this visit; a surah opens to its pages, drawn as part of it; a page opens the reader. Recency only.
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Modal } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text testID={`icon-${name}`}>{name}</Text> };
});
const mockNavigate = jest.fn();
let mockParams: Record<string, unknown> | undefined;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: mockParams }),
}));
const mockApp: any = {};
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../../../hooks/useRevisionDay', () => ({ useRevisionDay: () => ({ day: '2026-11-15', date: new Date(2026, 10, 15) }) }));

import LastRevisedScreen from '../LastRevisedScreen';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { lastRevisedPrefsKey } from '../../../lib/lastRevised';
import { plainText } from '../../../lib/passages';
import type { User, UserPage } from '../../../types';

const user = { id: 'u1', createdAt: '2026-09-01T12:00:00.000Z', smartTrackingEnabled: false, fajrBoundaryEnabled: false, scheduleMode: 'pages' } as unknown as User;
// Al-Fatihah today; Al-Baqarah's pages 2–3 on 24 Oct, 4 on 9 Nov; An-Naba (582) on 9 Nov. Revised at 9 a.m. local.
const page = (pageNumber: number, day: string): UserPage =>
  ({
    pageNumber,
    status: 'memorized',
    dateMemorized: '2026-09-01T00:00:00.000Z',
    weaknessRating: 4,
    lastRevisedDate: new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), 9).toISOString(),
    totalRevisionCount: 1,
    skipCount: 0,
  }) as UserPage;

const METRICS = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
async function open() {
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <DesignProvider initial={{}}>
        <ThemeProvider>
          <LastRevisedScreen />
        </ThemeProvider>
      </DesignProvider>
    </SafeAreaProvider>,
  );
  await act(async () => undefined);
}
const label = (testID: string) => plainText(screen.getByTestId(testID).props.accessibilityLabel as string);
const ids = (re: RegExp) => screen.getAllByTestId(re).map((r) => r.props.testID);
// An ActionSheet's action runs once it has gone (iOS: the Modal's onDismiss).
async function choose(chip: string, action: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(chip));
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId(`sheet-action-${action}`));
  });
  await act(async () => {
    screen.UNSAFE_getAllByType(Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
  });
}

describe('Last revised', () => {
  beforeEach(async () => {
    mockNavigate.mockClear();
    mockParams = undefined;
    await AsyncStorage.clear();
    mockApp.user = user;
    mockApp.pages = [page(1, '2026-11-15'), page(2, '2026-10-24'), page(3, '2026-10-24'), page(4, '2026-11-09'), page(582, '2026-11-09')];
  });

  it('opens by surah (it suits this account), recent first, each dated by its oldest page', async () => {
    await open();
    expect(screen.getByTestId('last-revised-unit').props.accessibilityLabel).toBe('Showing Surahs');
    expect(screen.getByTestId('last-revised-sort').props.accessibilityLabel).toBe('Sorted: Recent first');
    expect(screen.getByTestId('last-revised-count')).toHaveTextContent('3 surahs');
    expect(ids(/^last-revised-row-surah-/)).toEqual(['last-revised-row-surah-1', 'last-revised-row-surah-78', 'last-revised-row-surah-2']);
    expect(label('last-revised-row-surah-2')).toBe('Al-Baqarah. 24 Oct · 22 days ago. Shows its pages');
    expect(label('last-revised-row-surah-1')).toBe('Al-Fatihah. Today. Shows its pages');
  });

  it('[ACT-30] an opened surah’s pages read as part of it: named by their ayahs, no disc, the thread line from its disc; a page opens the reader', async () => {
    await open();
    await act(async () => {
      fireEvent.press(screen.getByTestId('last-revised-row-surah-2'));
    });
    // Recent first inside too.
    expect(ids(/^last-revised-page-surah-2-/)).toEqual(['last-revised-page-surah-2-4', 'last-revised-page-surah-2-2', 'last-revised-page-surah-2-3']);
    const child = screen.getByTestId('last-revised-page-surah-2-4');
    expect(within(child).getByText(/^Ayahs/)).toBeTruthy();
    expect(within(child).queryByText(/Al-Baqarah/)).toBeNull();
    expect(within(child).getByText('6 days ago')).toBeTruthy();
    expect(label('last-revised-page-surah-2-4')).toMatch(/, page 4\. 9 Nov · 6 days ago\. Opens it in the reader$/);
    // The row's disc runs its thread line down through its pages, ending half-way on the last.
    expect(within(screen.getByTestId('last-revised-row-surah-2')).getByTestId('thread-line')).toBeTruthy();
    expect(within(screen.getByTestId('last-revised-page-surah-2-2')).getByTestId('last-revised-thread')).toBeTruthy();
    expect(within(screen.getByTestId('last-revised-page-surah-2-3')).getByTestId('last-revised-thread-end')).toBeTruthy();
    fireEvent.press(child);
    expect(mockNavigate).toHaveBeenCalledWith('QuranReader', { pageNumber: 4 });
  });

  it('sort: longest waiting first and mushaf order, kept for the account', async () => {
    await open();
    await choose('last-revised-sort', 'sort-waiting');
    expect(ids(/^last-revised-row-surah-/)).toEqual(['last-revised-row-surah-2', 'last-revised-row-surah-78', 'last-revised-row-surah-1']);
    await choose('last-revised-sort', 'sort-mushaf');
    expect(ids(/^last-revised-row-surah-/)).toEqual(['last-revised-row-surah-1', 'last-revised-row-surah-2', 'last-revised-row-surah-78']);
    expect(JSON.parse((await AsyncStorage.getItem(lastRevisedPrefsKey('u1')))!)).toEqual({ sort: 'mushaf' });
  });

  it('[ACT-30] a filter narrows to the pages that match, says how many, and is filled while on; none: Show all', async () => {
    await open();
    await choose('last-revised-filter', 'filter-waiting');
    expect(screen.getByTestId('last-revised-filter').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('last-revised-count')).toHaveTextContent('1 of 3 surahs');
    expect(ids(/^last-revised-row-surah-/)).toEqual(['last-revised-row-surah-2']);
    expect(label('last-revised-row-surah-2')).toBe('Al-Baqarah. 24 Oct · 22 days ago · 2 of 3 pages. Shows its pages');
    await choose('last-revised-filter', 'filter-never');
    expect(screen.getByTestId('last-revised-empty-filter')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('last-revised-show-all'));
    });
    expect(ids(/^last-revised-row-surah-/)).toHaveLength(3);
  });

  it('the unit picked is kept for the account; Pages are one line each, no disc', async () => {
    await open();
    await choose('last-revised-unit', 'unit-juz');
    expect(ids(/^last-revised-row-juz-/)).toEqual(['last-revised-row-juz-30', 'last-revised-row-juz-1']);
    await choose('last-revised-unit', 'unit-hizb');
    expect(ids(/^last-revised-row-hizb-/)).toEqual(['last-revised-row-hizb-59', 'last-revised-row-hizb-1']);
    await choose('last-revised-unit', 'unit-page');
    expect(ids(/^last-revised-row-page-/)).toEqual([
      'last-revised-row-page-1',
      'last-revised-row-page-4',
      'last-revised-row-page-582',
      'last-revised-row-page-2',
      'last-revised-row-page-3',
    ]);
    expect(screen.getByTestId('last-revised-count')).toHaveTextContent('5 pages');
    fireEvent.press(screen.getByTestId('last-revised-row-page-582'));
    expect(mockNavigate).toHaveBeenCalledWith('QuranReader', { pageNumber: 582 });
    expect(JSON.parse((await AsyncStorage.getItem(lastRevisedPrefsKey('u1')))!)).toEqual({ view: 'page' });
  });

  it('the juz plan suits Juz; Gaps’ full revision line opens it longest waiting first, for that visit', async () => {
    mockApp.user = { ...user, scheduleMode: 'juz' };
    mockParams = { sort: 'waiting' };
    await open();
    expect(screen.getByTestId('last-revised-unit').props.accessibilityLabel).toBe('Showing Juz');
    expect(screen.getByTestId('last-revised-sort').props.accessibilityLabel).toBe('Sorted: Longest waiting first');
    expect(ids(/^last-revised-row-juz-/)).toEqual(['last-revised-row-juz-1', 'last-revised-row-juz-30']);
    expect(await AsyncStorage.getItem(lastRevisedPrefsKey('u1'))).toBeNull();
  });

  it('nothing memorized: says so', async () => {
    mockApp.pages = [];
    await open();
    expect(screen.getByTestId('last-revised-empty')).toBeTruthy();
  });
});

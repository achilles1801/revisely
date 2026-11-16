// Last revised (ACT-30): Surah | Juz | Hizb | Page, longest waiting first; a surah opens to its pages, a page opens
// the reader; the view is kept on the phone. Recency only.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text testID={`icon-${name}`}>{name}</Text> };
});
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));
const mockApp: any = {};
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../../../hooks/useRevisionDay', () => ({ useRevisionDay: () => ({ day: '2026-11-15', date: new Date(2026, 10, 15) }) }));

import LastRevisedScreen from '../LastRevisedScreen';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { LAST_REVISED_VIEW_KEY } from '../../../lib/lastRevised';
import { plainText } from '../../../lib/passages';
import type { User, UserPage } from '../../../types';

const user = { id: 'u1', createdAt: '2026-09-01T12:00:00.000Z', smartTrackingEnabled: false, fajrBoundaryEnabled: false } as unknown as User;
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

async function open() {
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <LastRevisedScreen />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => undefined);
}
const label = (testID: string) => plainText(screen.getByTestId(testID).props.accessibilityLabel as string);

describe('Last revised', () => {
  beforeEach(async () => {
    mockNavigate.mockClear();
    await AsyncStorage.removeItem(LAST_REVISED_VIEW_KEY);
    mockApp.user = user;
    mockApp.pages = [page(1, '2026-11-15'), page(2, '2026-10-24'), page(3, '2026-10-24'), page(4, '2026-11-09'), page(582, '2026-11-09')];
  });

  it('opens on Surah, longest waiting first, each with its oldest page’s date', async () => {
    await open();
    const rows = screen.getAllByTestId(/^last-revised-row-surah-/).map((r) => r.props.testID);
    expect(rows).toEqual(['last-revised-row-surah-2', 'last-revised-row-surah-78', 'last-revised-row-surah-1']);
    expect(label('last-revised-row-surah-2')).toBe('Al-Baqarah. 24 Oct · 22 days ago. Shows its pages');
    expect(label('last-revised-row-surah-1')).toBe('Al-Fatihah. Today. Shows its pages');
  });

  it('a surah opens to its pages; a page opens the reader there', async () => {
    await open();
    await act(async () => {
      fireEvent.press(screen.getByTestId('last-revised-row-surah-2'));
    });
    const pages = screen.getAllByTestId(/^last-revised-page-surah-2-/).map((r) => r.props.testID);
    expect(pages).toEqual(['last-revised-page-surah-2-2', 'last-revised-page-surah-2-3', 'last-revised-page-surah-2-4']);
    expect(label('last-revised-page-surah-2-4')).toMatch(/, page 4\. 9 Nov · 6 days ago\. Opens it in the reader$/);
    fireEvent.press(screen.getByTestId('last-revised-page-surah-2-4'));
    expect(mockNavigate).toHaveBeenCalledWith('QuranReader', { pageNumber: 4 });
  });

  it('Juz, Hizb and Page; the view is kept on the phone', async () => {
    await open();
    await act(async () => {
      fireEvent.press(screen.getByText('Juz'));
    });
    expect(screen.getAllByTestId(/^last-revised-row-juz-/).map((r) => r.props.testID)).toEqual(['last-revised-row-juz-1', 'last-revised-row-juz-30']);
    await act(async () => {
      fireEvent.press(screen.getByText('Hizb'));
    });
    expect(screen.getAllByTestId(/^last-revised-row-hizb-/).map((r) => r.props.testID)).toEqual(['last-revised-row-hizb-1', 'last-revised-row-hizb-59']);
    await act(async () => {
      fireEvent.press(screen.getByText('Page'));
    });
    expect(screen.getAllByTestId(/^last-revised-row-page-/).map((r) => r.props.testID)).toEqual([
      'last-revised-row-page-2',
      'last-revised-row-page-3',
      'last-revised-row-page-4',
      'last-revised-row-page-582',
      'last-revised-row-page-1',
    ]);
    fireEvent.press(screen.getByTestId('last-revised-row-page-582'));
    expect(mockNavigate).toHaveBeenCalledWith('QuranReader', { pageNumber: 582 });
    expect(await AsyncStorage.getItem(LAST_REVISED_VIEW_KEY)).toBe('page');
  });

  it('nothing memorized: says so', async () => {
    mockApp.pages = [];
    await open();
    expect(screen.getByTestId('last-revised-empty')).toBeTruthy();
  });
});

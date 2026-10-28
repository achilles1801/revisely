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
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const mockNavigation = { navigate: jest.fn() };
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => mockNavigation,
    useScrollToTop: () => undefined,
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});

import ReadIndexScreen from '../ReadIndexScreen';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { DEFAULT_ACCENT, paletteV2 } from '../../../theme/v2';

const palette = paletteV2(false, DEFAULT_ACCENT);
const flat = (style: unknown) => Object.assign({}, ...[style].flat(5).filter(Boolean));

const v2 = (ui: React.ReactElement) => (
  <DesignProvider initial={{}}>
    <ThemeProvider>{ui}</ThemeProvider>
  </DesignProvider>
);

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
});

async function renderIndex() {
  render(v2(<ReadIndexScreen />));
  await act(async () => {});
}

describe('the Read index in the new design', () => {
  it('a large title, then juz headers in sentence case over flat rows', async () => {
    await renderIndex();
    expect(screen.getByTestId('read-index-v2')).toBeTruthy();
    expect(flat(screen.getByText('Surahs').props.style)).toMatchObject({ fontSize: 28, color: palette.text });
    expect(screen.getByText("Juz' 1")).toBeTruthy();
    expect(screen.queryByText("JUZ' 1")).toBeNull();
    // No recent pages yet: no section.
    expect(screen.queryByTestId('read-recent')).toBeNull();
  });

  it('a surah: its number in a mark, the name, where it is revealed, the Arabic name in Amiri', async () => {
    await renderIndex();
    const baqarah = screen.getByTestId('surah-2');
    expect(within(baqarah).getByText('2', { includeHiddenElements: true })).toBeTruthy();
    expect(within(baqarah).getByText('Al-Baqarah')).toBeTruthy();
    expect(within(baqarah).getByText('Madani · 286 verses · page 2')).toBeTruthy();
    const arabic = within(baqarah).getByText('الْبَقَرَة');
    expect(flat(arabic.props.style)).toMatchObject({ fontFamily: 'Amiri-Regular', color: palette.text });
    // No card behind the rows.
    expect(flat(baqarah.props.style)).toMatchObject({ borderBottomWidth: 0.5, borderBottomColor: palette.separator });
    expect(flat(baqarah.props.style).borderRadius).toBeUndefined();
    fireEvent.press(baqarah);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('QuranReader', { pageNumber: 2, source: 'index' });
  });

  it('recent pages: a section with the page and when', async () => {
    await AsyncStorage.setItem(
      '@revisely_reading_history',
      JSON.stringify([{ pageNumber: 50, lastReadAt: new Date().toISOString() }]),
    );
    await renderIndex();
    expect(screen.getByText('Recent pages')).toBeTruthy();
    const row = screen.getByTestId('recent-50');
    expect(within(row).getByText(/^Page 50 · /)).toBeTruthy();
    fireEvent.press(row);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('QuranReader', { pageNumber: 50, source: 'index' });
  });
});

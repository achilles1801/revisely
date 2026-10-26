import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QuranReaderScreen from '../QuranReaderScreen';

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
// The page: a tap toggles the controls, and the test can swipe it.
const mockPager: { onUserSwipe?: () => void; onLongPressAyah?: unknown } = {};
jest.mock('../../../components/MushafPager', () => {
  const { Pressable } = require('react-native');
  const React = require('react');
  return {
    MushafPager: React.forwardRef(
      (props: { onTap?: () => void; onUserSwipe?: () => void; onLongPressAyah?: unknown }, _ref: unknown) => {
        mockPager.onUserSwipe = props.onUserSwipe;
        mockPager.onLongPressAyah = props.onLongPressAyah;
        return <Pressable accessibilityLabel="The page" onPress={props.onTap} />;
      },
    ),
  };
});
const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ key: 'QuranReader-1', name: 'QuranReader', params: { pageNumber: 3 } }),
  useIsFocused: () => true,
}));
jest.mock('../../../navigation/navigationRef', () => ({ navigateToActivityDay: jest.fn() }));
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
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
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ user: null, saveUser: jest.fn() }) }));
jest.mock('../../../context/ThemeContext', () => {
  const { colors } = require('../../../theme/colors');
  return { useTheme: () => ({ theme: colors, isDark: false }) };
});
jest.mock('../../../hooks/useVoiceRecorder', () => ({
  useVoiceRecorder: () => ({
    phase: 'idle',
    baseMs: 0,
    segmentStartedAt: null,
    interrupted: false,
    start: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    finish: jest.fn(),
  }),
}));
jest.mock('../../../hooks/useKeepScreenOn', () => ({ useKeepScreenOn: () => {} }));
jest.mock('../../../lib/readingHistory', () => ({ appendReadingHistory: jest.fn() }));

const byTestId = (id: string) => screen.getByTestId(id, { includeHiddenElements: true });

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  // The guide was seen.
  await AsyncStorage.setItem('@revisley_reader_guide_dismissed', 'true');
});

async function open() {
  render(<QuranReaderScreen />);
  await act(async () => {});
}

describe('QuranReaderScreen: reading, and the controls on a tap', () => {
  it('opens on the page alone: its number below, the juz and surah above; no controls', async () => {
    await open();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Juz 1')).toBeTruthy();
    expect(screen.getAllByText('Al-Baqarah').length).toBeGreaterThan(0);
    expect(byTestId('reader-header').props.accessibilityElementsHidden).toBe(true);
    expect(byTestId('reader-footer').props.pointerEvents).toBe('none');
    expect(screen.queryByLabelText('Play from this page')).toBeNull();
  });

  it('a tap shows everything: back, the title with the page, the page bar, ▶, record, timer', async () => {
    await open();
    fireEvent.press(screen.getByLabelText('The page'));
    expect(byTestId('reader-header').props.accessibilityElementsHidden).toBe(false);
    expect(screen.getByText(/Page 3 · Juz 1/)).toBeTruthy();
    expect(screen.getByLabelText('Page position')).toBeTruthy();
    expect(screen.getByLabelText('Play from this page')).toBeTruthy();
    expect(screen.getByLabelText('Record your recitation')).toBeTruthy();
    expect(screen.getByLabelText('Open timer')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Back'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('turning the page, or another tap, puts them away', async () => {
    await open();
    fireEvent.press(screen.getByLabelText('The page'));
    act(() => mockPager.onUserSwipe?.());
    expect(byTestId('reader-header').props.accessibilityElementsHidden).toBe(true);
    fireEvent.press(screen.getByLabelText('The page'));
    fireEvent.press(screen.getByLabelText('The page'));
    expect(byTestId('reader-header').props.accessibilityElementsHidden).toBe(true);
  });

  it('says once, under the page number, to tap the page for the controls', async () => {
    await open();
    expect(screen.getByText('Tap the page for the controls')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('The page'));
    expect(screen.queryByText('Tap the page for the controls', { includeHiddenElements: true })).toBeNull();
    expect(await AsyncStorage.getItem('@revisely_reader_tap_hint_seen')).toBe('true');
  });

  it('a tap above or below the page toggles the controls too', async () => {
    await open();
    fireEvent.press(byTestId('reader-background'));
    expect(byTestId('reader-header').props.accessibilityElementsHidden).toBe(false);
  });

  it('holding a verse still works (the page passes it on)', async () => {
    await open();
    expect(typeof mockPager.onLongPressAyah).toBe('function');
  });
});

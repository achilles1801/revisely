import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QuranReaderScreen from '../QuranReaderScreen';
import { pageOfVerse } from '../../../lib/verses';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's' },
}));
// The page: a tap toggles the controls, and the test can swipe it.
const mockPager: {
  onUserSwipe?: () => void;
  onLongPressAyah?: unknown;
  onPageChange?: (page: number) => void;
  highlightedAyah?: unknown;
} = {};
jest.mock('../../../components/MushafPager', () => {
  const { Pressable } = require('react-native');
  const React = require('react');
  return {
    MushafPager: React.forwardRef(
      (
        props: {
          onTap?: () => void;
          onUserSwipe?: () => void;
          onLongPressAyah?: unknown;
          onPageChange?: (page: number) => void;
          highlightedAyah?: unknown;
        },
        _ref: unknown,
      ) => {
        mockPager.onUserSwipe = props.onUserSwipe;
        mockPager.onLongPressAyah = props.onLongPressAyah;
        mockPager.onPageChange = props.onPageChange;
        mockPager.highlightedAyah = props.highlightedAyah;
        return <Pressable accessibilityLabel="The page" onPress={props.onTap} />;
      },
    ),
  };
});
const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
let mockParams: { pageNumber: number; highlight?: { sura: number; ayah: number; last?: { sura: number; ayah: number } } } = {
  pageNumber: 3,
};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ key: 'QuranReader-1', name: 'QuranReader', params: mockParams }),
  useIsFocused: () => true,
}));
jest.mock('../../../navigation/navigationRef', () => ({ navigateToActivityDay: jest.fn() }));
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
// What a test sets: the account, the timer, the recorder's phase; and what End calls, in order.
const mockState: {
  user: { previewTester?: boolean; id?: string } | null;
  timer: unknown;
  phase: string;
  calls: string[];
  onFinished?: (info: { day: string; recordingId: string }) => void;
} = { user: null, timer: null, phase: 'idle', calls: [] };
jest.mock('../../../context/ReadingTimerContext', () => ({
  useReadingTimer: () => ({
    timer: mockState.timer,
    start: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    finish: jest.fn(async () => {
      mockState.calls.push('timer saved');
      return true;
    }),
    discard: jest.fn(),
    notePage: jest.fn(),
    noteRevisedPages: jest.fn(),
  }),
  useNow: () => Date.now(),
}));
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ user: mockState.user, saveUser: jest.fn() }) }));
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});
jest.mock('../../../hooks/useVoiceRecorder', () => ({
  useVoiceRecorder: (opts: { onFinished?: (info: { day: string; recordingId: string }) => void }) => {
    mockState.onFinished = opts.onFinished;
    return {
      phase: mockState.phase,
      baseMs: 0,
      segmentStartedAt: null,
      interrupted: false,
      start: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      // Stopping saves the recording and tells the screen, as the hook does.
      finish: jest.fn(async () => {
        mockState.calls.push('recording saved');
        mockState.onFinished?.({ day: '2026-11-03', recordingId: 'r1' });
      }),
    };
  },
}));
jest.mock('../../../hooks/useKeepScreenOn', () => ({ useKeepScreenOn: () => {} }));
jest.mock('../../../lib/readingHistory', () => ({ appendReadingHistory: jest.fn() }));

const byTestId = (id: string) => screen.getByTestId(id, { includeHiddenElements: true });

beforeEach(async () => {
  jest.clearAllMocks();
  mockState.user = null;
  mockState.timer = null;
  mockState.phase = 'idle';
  mockState.calls = [];
  mockParams = { pageNumber: 3 };
  await AsyncStorage.clear();
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

  it('a tester’s header has a round ? at its right, which opens How the reader works (HELP-1)', async () => {
    mockState.user = { previewTester: true, id: 'u1' };
    await open();
    fireEvent.press(screen.getByLabelText('The page'));
    fireEvent.press(await screen.findByTestId('help-button-reader'));
    expect(await screen.findByTestId('help-sheet-reader')).toBeTruthy();
    expect(screen.getByText('How the reader works')).toBeTruthy();
    expect(screen.getByTestId('help-topic-reader.hold')).toBeTruthy();
  });

  it('no ? for anyone else: the same room keeps the title centred', async () => {
    await open();
    expect(screen.queryByTestId('help-button-reader')).toBeNull();
  });

  it('holding a verse still works (the page passes it on)', async () => {
    await open();
    expect(typeof mockPager.onLongPressAyah).toBe('function');
  });

  it('opened from search, the verse found is highlighted until the page is turned', async () => {
    const page = pageOfVerse({ sura: 10, ayah: 16 });
    mockParams = { pageNumber: page, highlight: { sura: 10, ayah: 16 } };
    await open();
    expect(mockPager.highlightedAyah).toEqual([{ page, sura: 10, ayah: 16 }]);
    await act(async () => mockPager.onPageChange?.(page + 2));
    expect(mockPager.highlightedAyah).toBeNull();
  });

  it('opened from search on a phrase across two ayat, both are highlighted until neither is on the page', async () => {
    const page = pageOfVerse({ sura: 22, ayah: 49 });
    mockParams = { pageNumber: page, highlight: { sura: 22, ayah: 49, last: { sura: 22, ayah: 50 } } };
    await open();
    expect(mockPager.highlightedAyah).toEqual([
      { page, sura: 22, ayah: 49 },
      { page: pageOfVerse({ sura: 22, ayah: 50 }), sura: 22, ayah: 50 },
    ]);
    await act(async () => mockPager.onPageChange?.(page + 2));
    expect(mockPager.highlightedAyah).toBeNull();
  });

  it('opened any other way, nothing is highlighted', async () => {
    await open();
    expect(mockPager.highlightedAyah).toBeNull();
  });
});

describe('QuranReaderScreen: a sitting, the timer and a recording (REC-1)', () => {
  const MIN = 60_000;
  const runningOn = (page: number) => ({
    mode: 'stopwatch',
    targetSeconds: null,
    startedAt: Date.now() - 41 * MIN,
    runningSince: Date.now() - 41 * MIN,
    accumulatedMs: 0,
    date: '2026-11-03',
    pagesVisited: [page],
    pageTimes: { [String(page)]: 41 * MIN },
  });

  async function endTheTimer() {
    await open();
    fireEvent.press(screen.getByLabelText('The page'));
    fireEvent.press(screen.getByLabelText(/Open timer controls/));
    await act(async () => {});
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Stop and save timer'));
    });
  }

  it('[REC-1] for a tester, End saves the recording first, then the sitting, and one note says what was saved', async () => {
    mockState.user = { previewTester: true };
    mockState.phase = 'recording';
    mockState.timer = runningOn(3);
    await endTheTimer();
    expect(mockState.calls).toEqual(['recording saved', 'timer saved']);
    expect(screen.getByText(/^Saved to (today|Tuesday): Al.Baqarah, ayahs 6–16, 41 min$/)).toBeTruthy();
    expect(screen.queryByText('Recording saved')).toBeNull();
  });

  it('[REC-1] with no recording on, End saves the sitting and says so; for anyone else the recording is left as it was', async () => {
    mockState.user = { previewTester: true };
    mockState.timer = runningOn(3);
    await endTheTimer();
    expect(mockState.calls).toEqual(['timer saved']);
    expect(screen.getByText(/^Saved to (today|Tuesday): /)).toBeTruthy();
  });

  it('[REC-1] not a tester: End leaves a running recording alone, as before', async () => {
    mockState.phase = 'recording';
    mockState.timer = runningOn(3);
    await endTheTimer();
    expect(mockState.calls).toEqual(['timer saved']);
    expect(screen.queryByText(/^Saved to /)).toBeNull();
  });
});

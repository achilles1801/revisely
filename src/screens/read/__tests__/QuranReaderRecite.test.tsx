// The reader's one mic (Revisely Dev): Record, Recite, Check; the recite bar; marks and the hidden view.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QuranReaderScreen from '../QuranReaderScreen';
import { resetReciteCheckSettingsForTests, setReciteCheckSettings } from '../../../lib/reciteCheck/settings';
import type { LiveEvent } from '../../../lib/reciteLive/contract';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children?: React.ReactNode }) => children ?? null }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's' },
}));

// The page: draws what the screen puts behind and over it, so the test can see the marks and covers.
const mockPager: { onPageChange?: (page: number) => void; onTapVerse?: (a: unknown) => boolean } = {};
jest.mock('../../../components/MushafPager', () => {
  const { Pressable, View } = require('react-native');
  const React = require('react');
  return {
    MushafPager: React.forwardRef(
      (
        props: {
          onTap?: () => void;
          onPageChange?: (page: number) => void;
          onTapVerse?: (a: unknown) => boolean;
          pageUnderlay?: (page: number, scale: number) => React.ReactNode;
          pageOverlay?: (page: number, scale: number, image: unknown) => React.ReactNode;
        },
        ref: React.Ref<{ scrollToPage: (p: number) => boolean }>,
      ) => {
        mockPager.onPageChange = props.onPageChange;
        mockPager.onTapVerse = props.onTapVerse;
        React.useImperativeHandle(ref, () => ({ scrollToPage: (p: number) => (props.onPageChange?.(p), true) }));
        return (
          <View>
            <Pressable accessibilityLabel="The page" onPress={props.onTap} />
            {props.pageUnderlay?.(379, 0.38)}
            {props.pageOverlay?.(379, 0.38, { uri: 'file:///379.png', width: 389, height: 629 })}
          </View>
        );
      },
    ),
  };
});
const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ key: 'QuranReader-1', name: 'QuranReader', params: { pageNumber: 379 } }),
  useIsFocused: () => true,
}));
jest.mock('../../../navigation/navigationRef', () => ({ navigateToActivityDay: jest.fn() }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockState: { user: { previewTester?: boolean; id?: string } | null; dev: boolean; recordStart: jest.Mock } = {
  user: null,
  dev: true,
  recordStart: jest.fn(),
};
jest.mock('../../../lib/variant', () => ({ ...jest.requireActual('../../../lib/variant'), isDevVariant: () => mockState.dev }));
jest.mock('../../../context/ReadingTimerContext', () => ({
  useReadingTimer: () => ({
    timer: null,
    start: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    finish: jest.fn(async () => true),
    discard: jest.fn(),
    notePage: jest.fn(),
    noteRevisedPages: jest.fn(),
  }),
  useNow: () => Date.now(),
}));
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ user: mockState.user, saveUser: jest.fn() }) }));
jest.mock('../../../context/ThemeContext', () => {
  const { paletteV2, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false, 'indigo'), isDark: false, palette: paletteV2(false, 'indigo') }) };
});
jest.mock('../../../hooks/useVoiceRecorder', () => ({
  useVoiceRecorder: () => ({
    phase: 'idle',
    baseMs: 0,
    segmentStartedAt: null,
    interrupted: false,
    start: mockState.recordStart,
    pause: jest.fn(),
    resume: jest.fn(),
    finish: jest.fn(async () => undefined),
  }),
}));
jest.mock('../../../hooks/useKeepScreenOn', () => ({ useKeepScreenOn: () => {} }));
jest.mock('../../../lib/readingHistory', () => ({ appendReadingHistory: jest.fn() }));

// The microphone streams; the word data is the real asset.
let mockMic: { onAudio: (s: Int16Array) => void; onStop: (r: string) => void } | null = null;
jest.mock('../../../lib/recite/micSource', () => ({
  isMicStreamAvailable: () => true,
  startMicStream: jest.fn(async (h: never) => {
    mockMic = h;
    return { stop: jest.fn(async () => undefined) };
  }),
}));
jest.mock('../../../lib/recite/quranWords', () => {
  const actual = jest.requireActual('../../../lib/recite/quranWords');
  const fixture = () => require('../../../lib/recite/__fixtures__/quranWords').quranWords();
  return { ...actual, loadQuranWords: async () => fixture(), getQuranWords: () => null };
});

// The checker: the test sends its events.
const mockLive: { start?: Record<string, unknown>; onEvent?: (e: LiveEvent) => void; onClose?: () => void; sent: unknown[]; audio: number } = {
  sent: [],
  audio: 0,
};
jest.mock('../../../lib/reciteLive/socket', () => ({
  socketFeed: () => (start: Record<string, unknown>, handlers: { onEvent: (e: LiveEvent) => void; onClose: () => void }) => {
    mockLive.start = start;
    mockLive.onEvent = handlers.onEvent;
    mockLive.onClose = handlers.onClose;
    return {
      sendAudio: (pcm: Int16Array) => (mockLive.audio += pcm.length),
      send: (f: unknown) => mockLive.sent.push(f),
      close: jest.fn(),
    };
  },
}));

const words = require('../../../lib/recite/__fixtures__/quranWords').quranWords();
const A23 = words.verseFirstWord(27, 23);
const UTIYAT = A23 + 4;

const flush = () => act(async () => {});
const event = (e: LiveEvent) => act(async () => mockLive.onEvent?.(e));

beforeEach(async () => {
  jest.clearAllMocks();
  mockState.user = { previewTester: true, id: 'u1' };
  mockState.dev = true;
  mockLive.sent = [];
  mockLive.audio = 0;
  mockLive.start = undefined;
  mockMic = null;
  resetReciteCheckSettingsForTests();
  await AsyncStorage.clear();
  const audio = jest.requireMock('expo-audio');
  audio.getRecordingPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false });
});

async function open() {
  render(<QuranReaderScreen />);
  await flush();
  await flush();
  fireEvent.press(screen.getByLabelText('The page'));
}

async function startTake(mode: 'recite' | 'check') {
  setReciteCheckSettings('u1', { noticeSeen: true, mode });
  await open();
  fireEvent.press(screen.getByTestId('recite-mic'));
  await flush();
  await flush();
  await event({ type: 'ready', take: 't1' });
}

describe('the one mic (Revisely Dev)', () => {
  it('outside the Dev app, or for non-testers, the reader keeps today’s record button', async () => {
    mockState.dev = false;
    await open();
    expect(screen.getByLabelText('Record your recitation')).toBeTruthy();
    expect(screen.queryByTestId('recite-mic')).toBeNull();
    expect(screen.queryByTestId('reader-eye')).toBeNull();
  });

  it('a tester in the Dev app: one mic (no record button) and the eye; never two mics', async () => {
    await open();
    expect(screen.getByTestId('recite-mic')).toBeTruthy();
    expect(screen.getByLabelText('Recite')).toBeTruthy();
    expect(screen.getByTestId('reader-eye')).toBeTruthy();
    expect(screen.queryByLabelText('Record your recitation')).toBeNull();
  });

  it('holding the mic: Record, Recite and Check (its own colours, no lock for a tester); Record starts the recorder and stays', async () => {
    await open();
    fireEvent(screen.getByTestId('recite-mic'), 'longPress');
    expect(screen.getByTestId('recite-mode-menu')).toBeTruthy();
    expect(screen.getByText('Just record your recitation')).toBeTruthy();
    expect(screen.getByText('The page follows you')).toBeTruthy();
    expect(screen.getByText('Follows you and marks your mistakes')).toBeTruthy();
    expect(screen.queryByTestId('check-locked')).toBeNull();
    fireEvent.press(screen.getByTestId('recite-mode-record'));
    expect(mockState.recordStart).toHaveBeenCalled();
    expect(screen.queryByTestId('recite-mode-menu')).toBeNull();
    expect(screen.getByLabelText('Record')).toBeTruthy();
    expect(screen.getByTestId('recite-mic-badge-record')).toBeTruthy();
  });

  it('the first take shows the AI notice; after I understand, it listens', async () => {
    await open();
    fireEvent.press(screen.getByTestId('recite-mic'));
    await flush();
    expect(screen.getByTestId('recite-notice-sheet')).toBeTruthy();
    expect(mockLive.start).toBeUndefined();
    fireEvent.press(screen.getByTestId('recite-notice-agree'));
    await flush();
    await flush();
    expect(mockLive.start).toMatchObject({ type: 'start', s: 27, a: 23, mode: 'recite', letters: true, tajweed: false });
  });
});

describe('Recite: following along', () => {
  it('the bar: the time, the last two words heard beside it, Stop; the page follows; no marks or score', async () => {
    await startTake('recite');
    expect(screen.getByTestId('recite-bar')).toBeTruthy();
    expect(screen.getByTestId('recite-status').props.children).toBe('Listening…');
    await act(async () => mockMic!.onAudio(new Int16Array(16000)));
    expect(mockLive.audio).toBe(16000);
    expect(screen.getByTestId('recite-time').props.children).toBe('0:01');
    await event({ type: 'at', w: A23 + 3 });
    await event({ type: 'mark', mark: { id: 'a', w: UTIYAT, ayah: [27, 23], kind: 'word', sure: 'likely', heard: 'وَأُوهِيَتْ', heardExact: false } });
    await event({ type: 'at', w: UTIYAT + 1 });
    expect(screen.getByTestId('recite-words')).toBeTruthy();
    expect(screen.getByTestId('live-word-box')).toBeTruthy();
    expect(screen.getAllByTestId('live-ayah-band').length).toBe(2);
    expect(screen.queryByTestId('recite-score')).toBeNull();
    expect(screen.queryByTestId('live-mark-word')).toBeNull();
  });

  it('Stop: the checker’s final answer comes, then ✕ goes back to the player', async () => {
    await startTake('recite');
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    expect(mockLive.sent).toContainEqual({ type: 'end' });
    expect(screen.getByLabelText('Checking')).toBeTruthy();
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, secs: 12, marks: [], score: null } });
    fireEvent.press(screen.getByTestId('recite-close'));
    expect(screen.queryByTestId('recite-bar')).toBeNull();
    expect(screen.getByTestId('recite-mic')).toBeTruthy();
  });
});

describe('Check: marks as you recite', () => {
  it('a wrong word is marked on the page and shows red, as heard, in the bar; the score by the page', async () => {
    await startTake('check');
    expect(mockLive.start).toMatchObject({ mode: 'check' });
    expect(screen.getByTestId('recite-score')).toBeTruthy();
    await event({ type: 'said', upTo: UTIYAT });
    await event({ type: 'mark', mark: { id: 'a', w: UTIYAT, ayah: [27, 23], kind: 'word', sure: 'likely', heard: 'وَأُوهِيَتْ', heardExact: false } });
    await event({ type: 'at', w: UTIYAT + 1 });
    expect(screen.getByTestId('live-mark-word')).toBeTruthy();
    expect(screen.getByText('99.2%')).toBeTruthy();
    expect(screen.getByText('وَأُوهِيَتْ')).toBeTruthy();
    await event({ type: 'mark', mark: { id: 'b', w: A23 + 7, ayah: [27, 23], kind: 'harakat', sure: 'clear', slip: { expected: 'ٍ', heard: 'ٌّ' } } });
    expect(screen.getByText('98.5%')).toBeTruthy();
    expect(screen.getByTestId('live-mark-harakat')).toBeTruthy();
  });
});

describe('the hidden view (the eye on the bar)', () => {
  it('covers the page; ‹ shows the next word, ‹‹ the whole ayah', async () => {
    await startTake('recite');
    fireEvent.press(screen.getByTestId('recite-eye'));
    expect(screen.getByTestId('recite-eye-group')).toBeTruthy();
    expect(screen.getByTestId('hidden-page-379')).toBeTruthy();
    const covered = () => screen.getAllByTestId('hidden-cover').length;
    const before = covered();
    fireEvent.press(screen.getByTestId('recite-whole-ayah'));
    expect(covered()).toBeLessThan(before);
    fireEvent.press(screen.getByTestId('recite-next-word'));
    fireEvent.press(screen.getByTestId('recite-eye'));
    expect(screen.queryByTestId('hidden-page-379')).toBeNull();
  });

  it('not reciting: the eye hides the page and a tap on a verse shows it', async () => {
    await open();
    fireEvent.press(screen.getByTestId('reader-eye'));
    expect(screen.getByTestId('hidden-page-379')).toBeTruthy();
    const before = screen.getAllByTestId('hidden-cover').length;
    act(() => {
      mockPager.onTapVerse?.({ page: 379, sura: 27, ayah: 23 });
    });
    expect(screen.getAllByTestId('hidden-cover').length).toBeLessThan(before);
  });
});

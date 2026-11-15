// Recite's memory on the reader (Revisely Dev): words missed in past takes stay marked outside takes. The mocks are
// QuranReaderRecite.test's (the page draws what the screen puts behind and beside it; the test sends the checker's events).
import React from 'react';
import { AccessibilityInfo, Alert, Modal } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QuranReaderScreen from '../QuranReaderScreen';
import { resetReciteCheckSettingsForTests, setReciteCheckSettings } from '../../../lib/reciteCheck/settings';
import type { LiveEvent } from '../../../lib/reciteLive/contract';
import { STOP_TRACE_KEY } from '../../../lib/reciteLive/stopTrace';
import { versesOnPage } from '../../../lib/ayahBounds';
import { paletteV2 } from '../../../theme/v2';

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
const mockPager: {
  /** Pages the screen turned to (scrollToPage). */
  scrolled: number[];
  onPageChange?: (page: number) => void;
  onTapVerse?: (a: unknown) => boolean;
  onTapPoint?: (page: number, x: number, y: number, toWindow: (r: { x0: number; y0: number; x1: number; y1: number }) => unknown) => boolean;
} = { scrolled: [] };
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
          onTapPoint?: (page: number, x: number, y: number, toWindow: (r: unknown) => unknown) => boolean;
          pageUnderlay?: (page: number, scale: number) => React.ReactNode;
          pageOverlay?: (page: number, scale: number, image: unknown) => React.ReactNode;
          pageAccessories?: (page: number, scale: number) => React.ReactNode;
        },
        ref: React.Ref<{ scrollToPage: (p: number) => boolean }>,
      ) => {
        mockPager.onPageChange = props.onPageChange;
        mockPager.onTapVerse = props.onTapVerse;
        mockPager.onTapPoint = props.onTapPoint as never;
        React.useImperativeHandle(ref, () => ({
          scrollToPage: (p: number) => (mockPager.scrolled.push(p), props.onPageChange?.(p), true),
        }));
        return (
          <View>
            <Pressable accessibilityLabel="The page" onPress={props.onTap} />
            {props.pageUnderlay?.(379, 0.38)}
            {props.pageOverlay?.(379, 0.38, { uri: 'file:///379.png', width: 389, height: 629 })}
            {props.pageAccessories?.(379, 0.38)}
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
const mockLive: {
  start?: Record<string, unknown>;
  onEvent?: (e: LiveEvent) => void;
  onClose?: () => void;
  sent: unknown[];
  audio: number;
  clips: [number, number][];
} = {
  sent: [],
  audio: 0,
  clips: [],
};
jest.mock('../../../lib/reciteCheck/service', () => ({
  ...jest.requireActual('../../../lib/reciteCheck/service'),
  warmUpReciteCheck: jest.fn(),
  sendLabel: jest.fn(async () => true),
}));
jest.mock('../../../lib/reciteLive/socket', () => ({
  socketFeed: () => (start: Record<string, unknown>, handlers: { onEvent: (e: LiveEvent) => void; onClose: () => void }) => {
    mockLive.start = start;
    mockLive.onEvent = handlers.onEvent;
    mockLive.onClose = handlers.onClose;
    return {
      sendAudio: (pcm: Int16Array) => (mockLive.audio += pcm.length),
      send: (f: unknown) => mockLive.sent.push(f),
      close: jest.fn(),
      // The take's audio held on the phone (lib/reciteLive/socket's own test cuts it): the seconds asked for, as samples.
      audioClip: (from: number, to: number) => {
        mockLive.clips.push([from, to]);
        return new Int16Array(Math.round((to - from) * 16000));
      },
    };
  },
}));

// Your recitation's clip as a file (lib/reciteLive/clipFile).
jest.mock('../../../lib/reciteLive/clipFile', () => ({ writeClip: jest.fn(() => 'file:///cache/recite-your-recitation.wav') }));

// A take kept as a recording: the file side is lib/reciteLive/takeRecording's own test.
const mockTake: { started: { day: string; page: number } | null; added: number; finished: number } = { started: null, added: 0, finished: 0 };
// Premium: the account's grant (lib/premium, its own test). A tester here has it unless a test says not.
const mockPremium = { has: true };
jest.mock('../../../lib/premium', () => ({
  usePremium: () => ({ has: mockPremium.has, known: true, grant: null }),
  setDevPremium: jest.fn(async (on: boolean) => {
    mockPremium.has = on;
    return on;
  }),
  supportLinkUrl: jest.fn(async () => 'https://dev.revisely.app/apply/#c=one-time'),
  premiumErrorText: () => 'Something went wrong. Try again.',
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'opened' })) }));

jest.mock('../../../lib/reciteLive/takeRecording', () => ({
  startTakeRecording: (opts: { day: string; page: number }) => {
    mockTake.started = opts;
    return {
      add: (pcm: Int16Array) => (mockTake.added += pcm.length),
      pageAt: () => undefined,
      finish: async () => {
        mockTake.finished += 1;
        return { day: opts.day, recordingId: 'rec-1' };
      },
    };
  },
}));

const words = require('../../../lib/recite/__fixtures__/quranWords').quranWords();
const A23 = words.verseFirstWord(27, 23);
const UTIYAT = A23 + 4;

const flush = () => act(async () => {});
const event = (e: LiveEvent) => act(async () => mockLive.onEvent?.(e));
/** An element's style, flattened. */
const flatStyle = (el: { props: { style?: unknown } }): Record<string, unknown> => {
  const flat = (st: unknown): Record<string, unknown> => (Array.isArray(st) ? Object.assign({}, ...st.map(flat)) : ((st as Record<string, unknown>) ?? {}));
  return flat(el.props.style);
};
/** The card's player (lib/reciteLive/hearAudio): what it was given to play, and the last one made. */
const createdPlayers = () => (jest.requireMock('expo-audio').createAudioPlayer as jest.Mock).mock;
const playerUris = () => createdPlayers().calls.map((c: unknown[]) => (c[0] as { uri?: string } | null)?.uri).filter(Boolean);
const lastPlayer = () => createdPlayers().results.at(-1)!.value as { remove: jest.Mock; pause: jest.Mock; play: jest.Mock };

beforeEach(async () => {
  jest.clearAllMocks();
  mockState.user = { previewTester: true, id: 'u1' };
  mockState.dev = true;
  mockLive.sent = [];
  mockLive.audio = 0;
  mockLive.clips = [];
  mockLive.start = undefined;
  mockPager.scrolled = [];
  mockMic = null;
  mockPremium.has = true;
  mockTake.started = null;
  mockTake.added = 0;
  mockTake.finished = 0;
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

/**
 * A take: 'check' is Recite with Mark mistakes on. The checker finds the reciter started at the top of page 379
 * (An-Naml 23) unless `lock` says elsewhere, or null: still looking.
 */
async function startTake(mode: 'recite' | 'check', lock: number | null = A23) {
  setReciteCheckSettings('u1', { noticeSeen: true, mode: 'recite', markMistakes: mode === 'check' });
  await open();
  fireEvent.press(screen.getByTestId('recite-mic'));
  await flush();
  await flush();
  await event({ type: 'ready', take: 't1', protocol: 6 });
  if (lock != null) {
    const r = words.ref(lock);
    await event({ type: 'locked', w: lock, s: r.sura, a: r.ayah });
  }
}

// Recite's memory: the account's records come from the test (lib/reciteMemory/store's own test covers the store).
const mockMemory: { records: unknown[]; remembered: unknown[] } = { records: [], remembered: [] };
jest.mock('../../../lib/reciteMemory/store', () => ({
  useMemoryRecords: () => mockMemory.records,
  remember: jest.fn(async (_uid: string, r: unknown) => {
    mockMemory.remembered.push(r);
  }),
}));
jest.mock('../../../lib/reciteMemory/takeAudio', () => ({
  useTakeRecordings: () => new Set(['rec-old']),
  clipOfTake: jest.fn(async () => new Int16Array(16000)),
}));

const NOW = Date.now();
/** A take on page 379 a day ago that said UTIYAT wrong. */
function pastTake(over: Record<string, unknown> = {}) {
  return {
    id: 'past1',
    kind: 'take',
    take: null,
    createdAt: NOW - 86_400_000,
    rev: 1,
    day: '2026-11-14',
    level: 'words',
    hidden: false,
    from: A23,
    to: UTIYAT + 20,
    secs: 60,
    mistakes: 1,
    tajweed: 0,
    unclear: 0,
    accuracy: 0.99,
    marks: [{ id: `${UTIYAT}:word:sound`, w: UTIYAT, ayah: [27, 23], kind: 'word', detail: 'sound', heard: 'وَأُوهِيَتْ', heardExact: false, t: [3, 4], sure: 'clear' }],
    passed: [],
    recordingId: 'rec-old',
    ...over,
  };
}

/** A tap at the middle of a word (the page's tap, in its bounds units). */
async function tapWord(w: number) {
  const box = require('../../../lib/reciteLive/geometry').wordBox(words, w);
  await act(async () => {
    mockPager.onTapPoint?.(379, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (r) => ({ x: r.x0, y: r.y0, width: r.x1 - r.x0, height: r.y1 - r.y0 }));
  });
}

describe("Recite's memory on the page", () => {
  beforeEach(() => {
    mockMemory.records = [pastTake()];
    mockMemory.remembered = [];
  });

  it('a word missed before is marked, lighter, outside a take; its card lists the take with ▶ and the clear rule', async () => {
    await open();
    const hl = screen.getByTestId('past-highlight-word');
    expect(flatStyle(hl)).toMatchObject({ backgroundColor: paletteV2(false, 'indigo').markWord, opacity: 0.48 });
    expect(screen.getByTestId('past-mark-word').props.accessibilityLabel).toBe(`Past mistake: Wrong word, ${words.uthmani(UTIYAT)}`);
    await tapWord(UTIYAT);
    expect(screen.getByTestId('past-card')).toBeTruthy();
    // The card is modal for VoiceOver, so the page behind it counts as hidden.
    expect(screen.getByTestId('past-highlight-word-picked', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getAllByTestId('past-try-wrong')).toHaveLength(1);
    expect(screen.getByText('Say it right on 2 different days to clear it.')).toBeTruthy();
    // ▶ plays your voice there, cut from that take's recording on the phone.
    fireEvent.press(screen.getByTestId('past-try-play'));
    await flush();
    expect(jest.requireMock('../../../lib/reciteMemory/takeAudio').clipOfTake).toHaveBeenCalledWith('rec-old', 3);
  });

  it('Clear now keeps a clear record and takes the mark off, with Undo', async () => {
    await open();
    await tapWord(UTIYAT);
    fireEvent.press(screen.getByTestId('past-card-clear'));
    await flush();
    expect(mockMemory.remembered[0]).toMatchObject({ kind: 'clear', w: UTIYAT, group: 'word' });
    expect(screen.queryByTestId('past-card')).toBeNull();
    expect(screen.getByText('Cleared from the page')).toBeTruthy();
    fireEvent.press(screen.getByText('Undo'));
    await flush();
    expect(mockMemory.remembered[1]).toMatchObject({ kind: 'clear', w: UTIYAT, deleted: true });
  });

  it('during a take the remembered marks step aside: the page shows only that take’s marks', async () => {
    await startTake('check');
    expect(screen.queryByTestId('past-highlight-word')).toBeNull();
    expect(screen.queryByTestId('past-mark-word')).toBeNull();
    // A tap on the word during the take is the take's (nothing there yet), never the past card.
    await tapWord(UTIYAT);
    expect(screen.queryByTestId('past-card')).toBeNull();
  });

  it('not on a hidden page, nor with Show past mistakes off, nor outside Revisely Dev', async () => {
    await open();
    fireEvent.press(screen.getByTestId('reader-eye'));
    await flush();
    expect(screen.queryByTestId('past-highlight-word')).toBeNull();
    fireEvent.press(screen.getByTestId('reader-eye'));
    await flush();
    expect(screen.getByTestId('past-highlight-word')).toBeTruthy();
    await act(async () => setReciteCheckSettings('u1', { showPast: false }));
    expect(screen.queryByTestId('past-highlight-word')).toBeNull();
  });

  it('outside Revisely Dev nothing is drawn', async () => {
    mockState.dev = false;
    await open();
    expect(screen.queryByTestId('past-highlight-word')).toBeNull();
  });

  it('a word said right on two days since is no longer marked', async () => {
    const right = (id: string, days: number, day: string) => pastTake({ id, createdAt: NOW - days * 3_600_000, day, marks: [], mistakes: 0 });
    mockMemory.records = [pastTake(), right('r1', 20, '2026-11-14'), right('r2', 2, '2026-11-15')];
    await open();
    expect(screen.queryByTestId('past-highlight-word')).toBeNull();
  });
});

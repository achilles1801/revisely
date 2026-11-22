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
import { setMistakeDetectionReleasedForTests } from '../../../lib/release/mistakeDetection';

// The release's switch is the kill switch: these tests run with it as each says, and back to as it ships.
afterEach(() => setMistakeDetectionReleasedForTests(undefined));

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
const mockRoute: { params: Record<string, unknown> } = { params: { pageNumber: 379 } };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ key: 'QuranReader-1', name: 'QuranReader', params: mockRoute.params }),
  useIsFocused: () => true,
  // The shown take's ▶ (useRecordingPlayback) pauses when the screen loses focus; the reader keeps it here.
  useFocusEffect: () => {},
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
/**
 * What was remembered of one kind or id. An earlier test's reader that a cleanup unmounted mid-take keeps its take
 * (unfinished, RECITE-12), and that write can land during a later test: never read `remembered` by position.
 */
const rememberedWhere = (match: (r: { id?: string; kind?: string }) => boolean) =>
  (mockMemory.remembered as { id?: string; kind?: string }[]).find(match);
jest.mock('../../../lib/reciteMemory/store', () => ({
  useMemoryRecords: () => mockMemory.records,
  remember: jest.fn(async (_uid: string, r: unknown) => {
    mockMemory.remembered.push(r);
  }),
}));
const mockTakeRecording = {
  id: 'rec-old',
  day: '2026-11-14',
  kind: 'revision',
  createdAt: 0,
  durationMs: 60_000,
  uri: 'file:///recordings/rec-old.wav',
  segments: [{ uri: 'file:///recordings/rec-old.wav', durationMs: 60_000, fileName: 'rec-old.wav', local: true }],
};
const mockTakeAudio = { recordingOnPhone: true };
jest.mock('../../../lib/reciteMemory/takeAudio', () => ({
  useTakeRecordings: () => new Set(['rec-old']),
  useTakeRecording: (id?: string) => (id === 'rec-old' && mockTakeAudio.recordingOnPhone ? mockTakeRecording : null),
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
    // What was said, on the mark's highlight (WordChip: no fixed lineHeight, so its harakat aren't cut off).
    const heard = screen.getByTestId('past-try-heard');
    expect(flatStyle(heard).backgroundColor).toBe(flatStyle(screen.getByTestId('past-card-swatch-word')).backgroundColor);
    expect(flatStyle(screen.getByText('وَأُوهِيَتْ')).lineHeight).toBeUndefined();
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
    expect(rememberedWhere((r) => r.kind === 'clear')).toMatchObject({ kind: 'clear', w: UTIYAT, group: 'word' });
    expect(screen.queryByTestId('past-card')).toBeNull();
    expect(screen.getByText('Cleared from the page')).toBeTruthy();
    fireEvent.press(screen.getByText('Undo'));
    await flush();
    expect(rememberedWhere((r) => r.kind === 'clear' && (r as { deleted?: boolean }).deleted === true)).toMatchObject({ kind: 'clear', w: UTIYAT });
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

  it('with the release switched off: outside Revisely Dev nothing is drawn', async () => {
    setMistakeDetectionReleasedForTests(false);
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

describe("Recite's memory in the take's summary", () => {
  beforeEach(() => {
    mockMemory.records = [pastTake()];
    mockMemory.remembered = [];
  });

  it('a take that said a past mistake right: its summary shows the trend; Your progress here opens the passage’s progress, and Done comes back', async () => {
    await startTake('check');
    await event({ type: 'at', w: UTIYAT + 25 });
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: UTIYAT + 25, secs: 12, marks: [], score: { reached: 30, mistakes: 0, tajweed: 0, accuracy: 1 }, start: A23 } });
    expect(screen.getByTestId('take-summary')).toBeTruthy();
    // One right take so far: nothing cleared yet (it needs a second day).
    expect(screen.queryByTestId('take-summary-cleared')).toBeNull();
    expect(screen.getByTestId('take-summary-progress').props.accessibilityLabel).toMatch(/^Your progress here\. Up from 99\.\d% yesterday · 2 takes$/);
    fireEvent.press(screen.getByTestId('take-summary-progress'));
    // One sheet at a time (v2/modalTurn): the progress waits for the summary to go.
    await waitFor(() => expect(screen.getByTestId('progress-sheet')).toBeTruthy(), { timeout: 3000 });
    expect(screen.getAllByTestId('progress-take')).toHaveLength(2);
    fireEvent.press(screen.getByText('Done'));
    await waitFor(() => expect(screen.getByTestId('take-summary')).toBeTruthy(), { timeout: 3000 });
    expect(screen.queryByTestId('progress-sheet')).toBeNull();
  });

  it('[RMEM-7] the summary lists this passage’s earlier take, in words for VoiceOver; a tap shows it on the page', async () => {
    await startTake('check');
    await event({ type: 'at', w: UTIYAT + 25 });
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: UTIYAT + 25, secs: 12, marks: [], score: { reached: 30, mistakes: 0, tajweed: 0, accuracy: 1 }, start: A23 } });
    expect(screen.getByText('This passage: your last take')).toBeTruthy();
    const rows = screen.getAllByTestId('take-summary-history-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].props.accessibilityLabel).toMatch(/^Yesterday: 99\.0%, (.+, )?1 mistake\. Show it on the page$/);
    fireEvent.press(rows[0]);
    await waitFor(() => expect(screen.getByTestId('shown-take-bar')).toBeTruthy(), { timeout: 3000 });
    // The summary closes (its sheet animates away).
    await waitFor(() => expect(screen.queryByTestId('take-summary')).toBeNull(), { timeout: 3000 });
  });

  it('[RMEM-7] the store app has no passage history yet (Revisely Dev’s until the next release); the trend is there', async () => {
    mockState.dev = false;
    await startTake('check');
    await event({ type: 'at', w: UTIYAT + 25 });
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: UTIYAT + 25, secs: 12, marks: [], score: { reached: 30, mistakes: 0, tajweed: 0, accuracy: 1 }, start: A23 } });
    expect(screen.getByTestId('take-summary-progress')).toBeTruthy();
    expect(screen.queryByTestId('take-summary-history')).toBeNull();
  });

  it('a second right day clears the word: the summary says so', async () => {
    mockMemory.records = [pastTake({ createdAt: NOW - 2 * 86_400_000, day: '2026-11-13' }), pastTake({ id: 'right1', createdAt: NOW - 86_400_000, day: '2026-11-14', marks: [], mistakes: 0, accuracy: 1 })];
    await startTake('check');
    await event({ type: 'at', w: UTIYAT + 25 });
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: UTIYAT + 25, secs: 12, marks: [], score: { reached: 30, mistakes: 0, tajweed: 0, accuracy: 1 }, start: A23 } });
    expect(screen.getByText('1 cleared from the page')).toBeTruthy();
  });
});

describe('Show on the page', () => {
  beforeEach(() => {
    mockMemory.records = [pastTake()];
    mockMemory.remembered = [];
    mockRoute.params = { pageNumber: 379, showTake: 'past1' };
  });
  afterEach(() => {
    mockRoute.params = { pageNumber: 379 };
  });

  it('the take’s marks at full strength with its bar; Not a mistake keeps the take without that mark; Done ends it', async () => {
    await open();
    expect(screen.getByTestId('shown-take-bar')).toBeTruthy();
    expect(screen.getByTestId('live-highlight-word')).toBeTruthy();
    expect(screen.queryByTestId('past-highlight-word')).toBeNull();
    await tapWord(UTIYAT);
    fireEvent.press(screen.getByTestId('mark-card-dismiss'));
    await flush();
    expect(rememberedWhere((r) => r.id === 'past1')).toMatchObject({ id: 'past1', marks: [], mistakes: 0, accuracy: 1 });
    expect(jest.requireMock('../../../lib/reciteCheck/service').sendLabel).not.toHaveBeenCalled();
    // (The store here doesn't change, so the card stays open over the bar: modal for VoiceOver.)
    fireEvent.press(screen.getByTestId('shown-take-done', { includeHiddenElements: true }));
    await flush();
    expect(screen.queryByTestId('shown-take-bar')).toBeNull();
    expect(screen.getByTestId('past-highlight-word')).toBeTruthy();
  });

  it('▶ plays the take’s recording from its start, ❚❚ pauses it; Done stops it', async () => {
    await open();
    fireEvent.press(screen.getByTestId('shown-take-play'));
    await flush();
    const player = lastPlayer() as ReturnType<typeof lastPlayer> & { replace: jest.Mock };
    expect(player.replace).toHaveBeenCalledWith({ uri: 'file:///recordings/rec-old.wav' });
    expect(screen.getByLabelText('Pause your take')).toBeTruthy();
    fireEvent.press(screen.getByTestId('shown-take-play'));
    expect(player.pause).toHaveBeenCalled();
    expect(screen.getByLabelText('Play your take')).toBeTruthy();
    fireEvent.press(screen.getByTestId('shown-take-done'));
    await flush();
    expect(player.remove).toHaveBeenCalled();
  });

  it('no ▶ when the take’s recording isn’t on this phone (deleted, or never kept)', async () => {
    mockTakeAudio.recordingOnPhone = false;
    try {
      await open();
      expect(screen.getByTestId('shown-take-bar')).toBeTruthy();
      expect(screen.queryByTestId('shown-take-play')).toBeNull();
    } finally {
      mockTakeAudio.recordingOnPhone = true;
    }
  });
});

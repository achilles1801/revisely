// The reader's one mic (Revisely Dev): Record, Recite, Check; the recite bar; marks and the hidden view.
import React from 'react';
import { AccessibilityInfo, Alert, Modal, StatusBar } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QuranReaderScreen from '../QuranReaderScreen';
import { Sheet } from '../../../components/v2/Sheet';
import { resetReciteCheckSettingsForTests, setReciteCheckSettings } from '../../../lib/reciteCheck/settings';
import type { LiveEvent } from '../../../lib/reciteLive/contract';
import { STOP_TRACE_KEY } from '../../../lib/reciteLive/stopTrace';
import { revealDelay, wordLetters } from '../../../lib/reciteLive/state';
import { versesOnPage } from '../../../lib/ayahBounds';
import { paletteV2 } from '../../../theme/v2';
import { setMistakeDetectionReleasedForTests } from '../../../lib/release/mistakeDetection';

// The release's switch is the kill switch: these tests run with it as each says, and back to as it ships.
afterEach(() => setMistakeDetectionReleasedForTests(undefined));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
// What a take tells Sentry (lib/reciteLive/takeReport, the Stop trace): watched, never sent.
jest.mock('@sentry/react-native', () => ({ ...jest.requireActual('@sentry/react-native'), captureMessage: jest.fn(), addBreadcrumb: jest.fn() }));
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
  /** The verses it highlights (a search result, a held verse, an ayah a take slipped into). */
  highlighted?: unknown;
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
          highlightedAyah?: unknown;
        },
        ref: React.Ref<{ scrollToPage: (p: number) => boolean }>,
      ) => {
        mockPager.onPageChange = props.onPageChange;
        mockPager.highlighted = props.highlightedAyah;
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
const mockNavigation = { goBack: jest.fn(), navigate: jest.fn(), push: jest.fn() };
// The reader's params: page 379 unless a test opens it otherwise (a search's result).
const mockRoute: { params: Record<string, unknown> } = { params: { pageNumber: 379 } };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ key: 'QuranReader-1', name: 'QuranReader', params: mockRoute.params }),
  useIsFocused: () => true,
}));
jest.mock('../../../navigation/navigationRef', () => ({ navigateToActivityDay: jest.fn() }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockState: {
  user: { previewTester?: boolean; id?: string } | null;
  dev: boolean;
  recordStart: jest.Mock;
  pages: { pageNumber: number; status: string }[];
} = {
  user: null,
  dev: true,
  recordStart: jest.fn(),
  pages: [],
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
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ user: mockState.user, pages: mockState.pages, saveUser: jest.fn() }) }));
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
// The word data: the fixture, loaded as the screens load it. Read at once (getQuranWords) only where a test says it has
// loaded (Your recitation's phrase, RECITE-18).
const mockWordsLoaded = { on: false };
jest.mock('../../../lib/recite/quranWords', () => {
  const actual = jest.requireActual('../../../lib/recite/quranWords');
  const fixture = () => require('../../../lib/recite/__fixtures__/quranWords').quranWords();
  return { ...actual, loadQuranWords: async () => fixture(), getQuranWords: () => (mockWordsLoaded.on ? fixture() : null) };
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
      hold: (on: boolean) => mockLive.sent.push({ hold: on }),
      close: jest.fn(),
      // The take's audio held on the phone (lib/reciteLive/socket's own test cuts it): the seconds asked for, as samples.
      audioClip: (from: number, to: number) => {
        mockLive.clips.push([from, to]);
        return new Int16Array(Math.round((to - from) * 16000));
      },
    };
  },
}));

// The mistake sound (lib/reciteLive/mistakeCue): when it plays is the module's own; its sound and tap are watched here.
jest.mock('../../../lib/reciteLive/mistakeCue', () => ({
  ...jest.requireActual('../../../lib/reciteLive/mistakeCue'),
  playCueSound: jest.fn(),
  playCueTap: jest.fn(),
}));

// Your recitation's clip as a file (lib/reciteLive/clipFile).
jest.mock('../../../lib/reciteLive/clipFile', () => ({ writeClip: jest.fn(() => 'file:///cache/recite-your-recitation.wav') }));

// A take kept as a recording: the file side is lib/reciteLive/takeRecording's own test.
const mockTake: { started: { day: string; page: number } | null; added: number; finished: number } = { started: null, added: 0, finished: 0 };
// Premium: the account's grant (lib/premium, its own test). A tester here has it unless a test says not.
const mockPremium = { has: true };
// Premium early access (PREM-1): config/app's switch, and the claim the intro's Get Premium makes while it's on.
const mockEarly = { on: false };
jest.mock('../../../lib/earlyAccess', () => ({
  ...jest.requireActual('../../../lib/earlyAccess'),
  useEarlyAccess: () => mockEarly.on,
  claimEarlyAccess: jest.fn(async () => {
    mockPremium.has = true;
  mockEarly.on = false;
    return true;
  }),
}));
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
/**
 * Waits for `check` to pass, 50 ms at a time inside act, as everything else here runs. waitFor polls outside act, where
 * this screen's re-renders through a sheet's 180 ms closing animation took 1.5 s on a laptop and past 4 s on a loaded CI
 * runner (the RMEM-6 delete test, Nov 17–18 2026). Inside act the same close takes about 0.1 s.
 */
async function settle(check: () => void, timeout = 5000): Promise<void> {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      check();
      return;
    } catch (e) {
      if (Date.now() > end) throw e;
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  }
}
/**
 * The app goes to the background: every AppState listener hears it, as on a phone. (Taking the last one registered was
 * order-dependent: other hooks register theirs too, some after a promise.)
 */
const toBackground = () =>
  act(async () => {
    const { AppState } = require('react-native');
    for (const [type, listener] of (AppState.addEventListener as jest.Mock).mock.calls as [string, (s: string) => void][]) {
      if (type === 'change') listener('background');
    }
  });
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
  mockState.pages = [];
  mockLive.sent = [];
  mockLive.audio = 0;
  mockLive.clips = [];
  mockWordsLoaded.on = false;
  mockLive.start = undefined;
  mockPager.scrolled = [];
  mockRoute.params = { pageNumber: 379 };
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

describe('the one mic (Revisely Dev)', () => {
  it('with the release switched off: outside the Dev app, or for non-testers, the reader keeps today’s record button', async () => {
    setMistakeDetectionReleasedForTests(false);
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

  it('holding the mic: Record and Recite, with Mark mistakes under Recite (off, no lock for a tester); Record starts the recorder and stays', async () => {
    await open();
    fireEvent(screen.getByTestId('recite-mic'), 'longPress');
    expect(screen.getByTestId('recite-mode-menu')).toBeTruthy();
    expect(screen.getByText('Just record your recitation')).toBeTruthy();
    expect(screen.getByText('The page follows you')).toBeTruthy();
    expect(screen.queryByTestId('recite-mode-check')).toBeNull();
    expect(screen.getByText('Mark mistakes')).toBeTruthy();
    expect(screen.getByTestId('recite-mistakes-off')).toBeTruthy();
    expect(screen.queryByTestId('recite-mistakes-locked')).toBeNull();
    fireEvent.press(screen.getByTestId('recite-mode-record'));
    expect(mockState.recordStart).toHaveBeenCalled();
    expect(screen.queryByTestId('recite-mode-menu')).toBeNull();
    expect(screen.getByLabelText('Record')).toBeTruthy();
    expect(screen.getByTestId('recite-mic-badge-record')).toBeTruthy();
  });

  it('opening the reader wakes the checker (and keeps it awake while it waits: useKeepCheckerWarm)', async () => {
    const { warmUpReciteCheck } = jest.requireMock('../../../lib/reciteCheck/service');
    (warmUpReciteCheck as jest.Mock).mockClear();
    await open();
    expect(warmUpReciteCheck).toHaveBeenCalledTimes(1);
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
    expect(mockLive.start).toMatchObject({ type: 'start', s: 27, a: 23, follow: true, letters: true, tajweed: false });
  });
});

describe('Recite: following along', () => {
  it('the bar: the time, the last two words heard beside it, Stop; the page follows; no marks or score', async () => {
    await startTake('recite', null);
    expect(screen.getByTestId('recite-bar')).toBeTruthy();
    expect(screen.getByTestId('recite-status').props.children).toBe('Listening…');
    await act(async () => mockMic!.onAudio(new Int16Array(16000)));
    expect(mockLive.audio).toBe(16000);
    expect(screen.getByTestId('recite-time').props.children).toBe('0:01');
    await event({ type: 'locked', w: A23, s: 27, a: 23 });
    await event({ type: 'at', w: A23 + 3 });
    await event({ type: 'mark', mark: { id: 'a', w: UTIYAT, ayah: [27, 23], kind: 'word', sure: 'likely', heard: 'وَأُوهِيَتْ', heardExact: false } });
    await event({ type: 'at', w: UTIYAT + 1 });
    expect(screen.getByTestId('recite-words')).toBeTruthy();
    // Where the reciter is (Majd's Dev take, Nov 15 2026): a quiet band on its line only. Not a band over the whole ayah,
    // which covered lines not yet said and read as running ahead. With the page shown no word is washed (Majd, Nov 21
    // 2026: "They dont even use shades when ur reciting with the page shown ie not hidden, which is actually really nice").
    expect(screen.queryByTestId('live-word-box')).toBeNull();
    expect(screen.queryAllByTestId('live-ayah-band')).toHaveLength(0);
    const band = flatStyle(screen.getByTestId('live-line-band'));
    const { wordBox } = require('../../../lib/reciteLive/geometry');
    const line = wordBox(words, UTIYAT + 1);
    expect(band.top as number).toBeLessThanOrEqual(line.y0 * 0.38);
    expect((band.top as number) + (band.height as number)).toBeGreaterThanOrEqual(line.y1 * 0.38);
    expect(screen.queryByTestId('recite-score')).toBeNull();
    expect(screen.queryByTestId('live-mark-word')).toBeNull();
  });

  it('Stop: the checker’s final answer comes, then ✕ goes back to the player', async () => {
    await startTake('recite');
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    expect(mockLive.sent).toContainEqual(expect.objectContaining({ type: 'end' }));
    expect(screen.getByLabelText('Checking')).toBeTruthy();
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, secs: 12, marks: [], score: null } });
    fireEvent.press(screen.getByTestId('recite-close'));
    expect(screen.queryByTestId('recite-bar')).toBeNull();
    expect(screen.getByTestId('recite-mic')).toBeTruthy();
  });
});

describe('a checker whose said follows the voice, and a slow connection (Nov 22 2026)', () => {
  const barSays = () => screen.getByTestId('recite-middle').props.accessibilityLabel as string;

  const beginReady = async (ready: Record<string, unknown>) => {
    setReciteCheckSettings('u1', { noticeSeen: true, mode: 'recite', markMistakes: true });
    await open();
    fireEvent.press(screen.getByTestId('recite-mic'));
    await flush();
    await flush();
    await event({ type: 'ready', take: 't1', ...ready } as never);
    await event({ type: 'locked', w: A23, s: 27, a: 23 });
    fireEvent.press(screen.getByTestId('recite-eye'));
    await event({ type: 'at', w: A23 + 1 });
  };
  const wait = (ms: number) =>
    act(async () => {
      await new Promise((r) => setTimeout(r, ms));
    });

  it('[RECITE-6] a checker whose said follows the voice (ready.said "voice"): the word being said waits only as a late backstop (1.5–4 s)', async () => {
    await beginReady({ protocol: 9, said: 'voice' });
    const w = words.uthmani(A23 + 1);
    await wait(revealDelay(wordLetters(w), null) + 100);
    expect(barSays()).not.toContain(w);
    await wait(revealDelay(wordLetters(w), null, true) - revealDelay(wordLetters(w), null));
    expect(barSays()).toContain(w);
  });

  it('[RECITE-6] protocol 9 without it (a rollback) keeps the ordinary wait', async () => {
    await beginReady({ protocol: 9 });
    const w = words.uthmani(A23 + 1);
    await wait(revealDelay(wordLetters(w), null) + 100);
    expect(barSays()).toContain(w);
  });

  it('[RECITE-5] the bar says "Slow connection" once the checker is 3 s behind and falling behind, and stops once it catches up', async () => {
    await startTake('check');
    await act(async () => mockMic!.onAudio(new Int16Array(16000 * 5)));
    await event({ type: 'beat', t: 1, rx: 1 } as LiveEvent);
    expect(screen.queryByText('Slow connection: checking is behind')).toBeNull();
    await act(async () => mockMic!.onAudio(new Int16Array(16000)));
    await event({ type: 'beat', t: 1.5, rx: 1.5 } as LiveEvent);
    expect(screen.getByText('Slow connection: checking is behind')).toBeTruthy();
    await event({ type: 'beat', t: 5, rx: 5.5 } as LiveEvent);
    expect(screen.queryByText('Slow connection: checking is behind')).toBeNull();
  });
});

describe('a take’s audio stays with the take, never a recording (RMEM-6)', () => {
  it('with Mark mistakes: the red dot while it records; Stop keeps it with the take, and no note says Recording saved', async () => {
    await startTake('check');
    await act(async () => mockMic!.onAudio(new Int16Array(16000)));
    expect(mockTake.started?.page).toBe(379);
    expect(mockTake.started?.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mockTake.added).toBe(16000);
    expect(screen.getByTestId('recite-recording')).toBeTruthy();
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    expect(mockTake.finished).toBe(1);
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, secs: 12, marks: [], score: null } });
    expect(screen.getByTestId('take-summary')).toBeTruthy();
    fireEvent.press(screen.getByTestId('take-summary-done'));
    await flush();
    fireEvent.press(screen.getByTestId('recite-close'));
    await flush();
    expect(screen.queryByText('Recording saved')).toBeNull();
    expect(screen.queryByTestId('recording-saved-undo')).toBeNull();
  });

  it('Recite alone keeps nothing: no audio, no dot, no note', async () => {
    await startTake('recite');
    await act(async () => mockMic!.onAudio(new Int16Array(16000)));
    expect(mockTake.started).toBeNull();
    expect(screen.queryByTestId('recite-recording')).toBeNull();
    fireEvent.press(screen.getByTestId('recite-stop'));
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, secs: 12, marks: [], score: null } });
    fireEvent.press(screen.getByTestId('take-summary-done'));
    await flush();
    fireEvent.press(screen.getByTestId('recite-close'));
    await flush();
    expect(screen.queryByText('Recording saved')).toBeNull();
  });

  // What reaches the account (nothing, or a tombstone) is useRememberTake's own test.
  it('the summary’s ⋯ deletes the take, after a confirm: its audio, and the summary closes', async () => {
    const recordings = require('../../../lib/recordings');
    const del = jest.spyOn(recordings, 'deleteRecording').mockResolvedValue(1);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    await startTake('check');
    await act(async () => mockMic!.onAudio(new Int16Array(16000)));
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, secs: 12, marks: [], score: null } });
    fireEvent.press(screen.getByTestId('take-summary-more'));
    // An ActionSheet runs its action once the sheet has closed (iOS reports it).
    fireEvent.press(await screen.findByTestId('sheet-action-delete'));
    await act(async () => {
      screen.UNSAFE_getAllByType(Modal).forEach((m) => m.props.onDismiss?.());
    });
    await flush();
    expect(alert).toHaveBeenCalledWith('Delete this take?', expect.any(String), expect.any(Array));
    expect(del).toHaveBeenCalledWith('rec-1');
    // The summary is closed at once. Its sheet's own going (the closing animation, then the modal) is v2/Sheet's to
    // test: waiting for it here timed this screen's re-renders, about 1.5 s on a laptop and past the 4 s allowed on a
    // loaded CI runner (Nov 17–18 2026).
    const summary = screen.UNSAFE_getAllByType(Sheet).find((s) => s.props.testID === 'take-summary');
    expect(summary?.props.visible).toBe(false);
    del.mockRestore();
    alert.mockRestore();
  }, 15_000);

  it('“In today’s Recited” opens the take’s day in Activity, at its takes', async () => {
    await startTake('check');
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, secs: 12, marks: [], score: null } });
    fireEvent.press(screen.getByTestId('take-summary-recited'));
    await flush();
    const { navigateToActivityDay } = jest.requireMock('../../../navigation/navigationRef');
    expect(navigateToActivityDay).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), undefined, 'recited');
  });

  it('the reader’s help tells of Recite (holding the mic), in place of its recording topic', async () => {
    setReciteCheckSettings('u1', { noticeSeen: true, mode: 'recite', markMistakes: false });
    await open();
    fireEvent.press(await screen.findByTestId('help-button-reader'));
    expect(await screen.findByTestId('help-sheet-reader')).toBeTruthy();
    expect(screen.getByTestId('help-topic-reader.recite')).toBeTruthy();
    expect(screen.queryByTestId('help-topic-reader.sitting')).toBeNull();
  });

  it('with no take open, the reader’s help leads to every Recite sheet, each shown in its place (Nov 16 2026)', async () => {
    setReciteCheckSettings('u1', { noticeSeen: true, mode: 'recite', markMistakes: false });
    await open();
    fireEvent.press(await screen.findByTestId('help-button-reader'));
    expect(await screen.findByTestId('help-sheet-reader')).toBeTruthy();
    for (const to of ['recite', 'reciteTake', 'reciteMemory', 'reciteTest']) expect(screen.getByTestId(`help-link-${to}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId('help-link-reciteTest'));
    expect(await screen.findByTestId('help-sheet-reciteTest')).toBeTruthy();
    expect(screen.getByText('Test me and voice search')).toBeTruthy();
    expect(screen.getByTestId('help-topic-reciteTest.start')).toBeTruthy();
    // From there, the other Recite sheets; never Ask Revo (the reader's help, REVO-25).
    fireEvent.press(screen.getByTestId('help-link-reciteMemory'));
    expect(await screen.findByTestId('help-topic-reciteMemory.page')).toBeTruthy();
    expect(screen.queryByTestId('help-ask-revo')).toBeNull();
  });

  it('while a take is open, the ? tells how Recite works', async () => {
    await startTake('check');
    fireEvent.press(await screen.findByTestId('help-button-reader'));
    expect(await screen.findByTestId('help-sheet-recite')).toBeTruthy();
    expect(screen.getByText('How Recite works')).toBeTruthy();
    for (const id of ['recite.start', 'recite.marks', 'recite.card', 'recite.after']) {
      expect(screen.getByTestId(`help-topic-${id}`)).toBeTruthy();
    }
    // It's the reader's help: no "Ask Revo" (REVO-25), as flow 18's first shot of it showed there was.
    expect(jest.requireActual('../../../components/help/HelpSheet').NO_REVO.has('recite')).toBe(true);
    expect(screen.queryByTestId('help-ask-revo')).toBeNull();
  });

  it('Save recordings off: nothing is kept and there is no dot', async () => {
    setReciteCheckSettings('u1', { saveRecording: false });
    await startTake('recite');
    await act(async () => mockMic!.onAudio(new Int16Array(16000)));
    expect(mockTake.started).toBeNull();
    expect(screen.queryByTestId('recite-recording')).toBeNull();
    fireEvent.press(screen.getByTestId('recite-stop'));
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, secs: 12, marks: [], score: null } });
    fireEvent.press(screen.getByTestId('take-summary-done'));
    fireEvent.press(screen.getByTestId('recite-close'));
    await flush();
    expect(screen.queryByText('Recording saved')).toBeNull();
  });

  it('Recite again: the next take starts at once, with no note between', async () => {
    await startTake('recite');
    await act(async () => mockMic!.onAudio(new Int16Array(16000)));
    fireEvent.press(screen.getByTestId('recite-stop'));
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, secs: 12, marks: [], score: null } });
    fireEvent.press(screen.getByTestId('take-summary-again'));
    await flush();
    await flush();
    expect(screen.getByTestId('recite-bar')).toBeTruthy();
    expect(screen.queryByText('Recording saved')).toBeNull();
  });
});

describe('Check: marks as you recite', () => {
  it('a wrong word is highlighted on the page and, as heard, in the bar; the score by the page', async () => {
    await startTake('check');
    expect(mockLive.start).toMatchObject({ follow: false });
    expect(screen.getByTestId('recite-score')).toBeTruthy();
    await event({ type: 'said', upTo: UTIYAT });
    await event({ type: 'mark', mark: { id: 'a', w: UTIYAT, ayah: [27, 23], kind: 'word', sure: 'likely', heard: 'وَأُوهِيَتْ', heardExact: false } });
    await event({ type: 'at', w: UTIYAT + 1 });
    expect(screen.getByTestId('live-highlight-word')).toBeTruthy();
    expect(screen.getByTestId('live-mark-word').props.accessibilityLabel).toBe('Wrong word, وَأُوتِيَتْ');
    expect(screen.getByText('99.2%')).toBeTruthy();
    expect(screen.getByText('وَأُوهِيَتْ')).toBeTruthy();
    await event({ type: 'mark', mark: { id: 'b', w: A23 + 7, ayah: [27, 23], kind: 'harakat', sure: 'clear', slip: { expected: 'ٍ', heard: 'ٌّ' } } });
    expect(screen.getByText('98.5%')).toBeTruthy();
    expect(screen.getByTestId('live-mark-harakat')).toBeTruthy();
  });
});

describe('mistakes are highlights (Majd, Nov 15 2026: “only things we should show are highlites for mistakes 3 colors max”)', () => {
  const p = paletteV2(false, 'indigo');
  // With a card open the page is hidden from queries (accessibilityViewIsModal): look at hidden elements too.
  const bg = (testID: string) => flatStyle(screen.getByTestId(testID, { includeHiddenElements: true })).backgroundColor;

  it('behind the word in three colours: red for words, amber for slips, violet for tajweed; no red ink, dots or + discs', async () => {
    await startTake('check');
    await event({ type: 'mark', mark: { id: 'w', w: UTIYAT, ayah: [27, 23], kind: 'word', sure: 'clear', heard: 'وَأُوهِيَتْ', heardExact: false } });
    await event({ type: 'mark', mark: { id: 'h', w: A23 + 7, ayah: [27, 23], kind: 'harakat', sure: 'clear', slip: { expected: 'ٍ', heard: 'ٌّ' } } });
    await event({ type: 'mark', mark: { id: 't', w: A23 + 1, ayah: [27, 23], kind: 'tajweed', rule: 'qalqalah', sure: 'clear' } });
    expect(bg('live-highlight-word')).toBe(p.markWord);
    expect(bg('live-highlight-slip')).toBe(p.markSlip);
    expect(bg('live-highlight-tajweed')).toBe(p.markTajweed);
    for (const kind of ['word', 'harakat', 'tajweed', 'skipped', 'letter']) expect(screen.queryByTestId(`live-ink-${kind}`)).toBeNull();
    expect(screen.queryByTestId('live-ink-gap')).toBeNull();
  });

  it('a word with a slip and a tajweed note shows the slip; an extra word is highlighted on the word before it', async () => {
    await startTake('check');
    await event({ type: 'mark', mark: { id: 'h', w: A23 + 7, ayah: [27, 23], kind: 'harakat', sure: 'clear', slip: { expected: 'ٍ', heard: 'ٌّ' } } });
    await event({ type: 'mark', mark: { id: 't', w: A23 + 7, ayah: [27, 23], kind: 'tajweed', rule: 'qalqalah', sure: 'clear' } });
    expect(screen.getAllByTestId('live-highlight-slip')).toHaveLength(1);
    expect(screen.queryByTestId('live-highlight-tajweed')).toBeNull();
    await event({ type: 'mark', mark: { id: 'x', w: A23 + 2, ayah: [27, 23], kind: 'added', sure: 'clear', heard: 'وَ' } });
    expect(bg('live-highlight-word')).toBe(p.markWord);
    expect(screen.getByTestId('live-mark-added').props.accessibilityLabel).toBe(`Extra word, after ${words.uthmani(A23 + 2)}`);
  });

  it('the bar: a mistake is the page’s highlight behind the word in ink; blue is only the word being said', async () => {
    await startTake('check');
    await event({ type: 'said', upTo: UTIYAT });
    await event({ type: 'mark', mark: { id: 'a', w: UTIYAT, ayah: [27, 23], kind: 'word', sure: 'clear', heard: 'وَأُوهِيَتْ', heardExact: false } });
    await event({ type: 'at', w: UTIYAT + 1 });
    const wrong = flatStyle(screen.getByTestId('recite-word-wrong'));
    expect(wrong.backgroundColor).toBe(p.markWord);
    expect(wrong.color).toBe(p.text);
    expect(flatStyle(screen.getByTestId('recite-word-current')).color).toBe(p.followInk);
  });

  it('the mark a card is open for: a firmer shade of its own colour, back to its own when the card closes', async () => {
    await startTake('check');
    await event({ type: 'mark', mark: { id: 'h', w: A23 + 7, ayah: [27, 23], kind: 'harakat', sure: 'clear', slip: { expected: 'ٍ', heard: 'ٌّ' } } });
    const { wordBox } = require('../../../lib/reciteLive/geometry');
    const b = wordBox(words, A23 + 7);
    await act(async () => {
      mockPager.onTapPoint?.(379, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (r: { x0: number; y0: number; x1: number; y1: number }) => ({
        x: r.x0,
        y: r.y0 + 100,
        width: r.x1 - r.x0,
        height: r.y1 - r.y0,
      }));
    });
    expect(screen.getByTestId('mark-card')).toBeTruthy();
    expect(bg('live-highlight-slip-picked')).toBe(p.markSlipFirm);
    await act(async () => fireEvent(screen.getByTestId('mark-card-backdrop'), 'responderGrant'));
    expect(bg('live-highlight-slip')).toBe(p.markSlip);
    // A soft wash, not a box (Majd, Nov 21 2026: Tarteel's "blurb or splash"): a pill whose edge fades out in its own
    // colour, wider than the word.
    const wash = flatStyle(screen.getByTestId('live-highlight-slip', { includeHiddenElements: true }));
    expect(wash.borderRadius).toBeCloseTo((wash.height as number) / 2);
    expect(wash.boxShadow).toEqual([expect.objectContaining({ offsetX: 0, offsetY: 0, color: p.markSlip })]);
    const shadow = (wash.boxShadow as { blurRadius: number; spreadDistance: number }[])[0];
    expect((wash.left as number) - shadow.spreadDistance - shadow.blurRadius).toBeLessThan(b.x0 * 0.38);
    expect((wash.left as number) + (wash.width as number) + shadow.spreadDistance + shadow.blurRadius).toBeGreaterThan(b.x1 * 0.38);
  });

  it('[RECITE-20] the hidden view: the newest word shown in the following ink over its own, the ones before in the page’s ink; no band or wash', async () => {
    await startTake('check', null);
    fireEvent.press(screen.getByTestId('recite-eye'));
    await event({ type: 'locked', w: A23, s: 27, a: 23 });
    await event({ type: 'said', upTo: A23 + 2 });
    await event({ type: 'at', w: A23 + 3 });
    const { wordBox } = require('../../../lib/reciteLive/geometry');
    // Majd, Nov 22 2026: "i dont see the words being a different color as its recited with page hidden". The page's own
    // image, tinted, seen through the newest word's box only (the word before it isn't inked).
    const ink = flatStyle(screen.getByTestId('live-follow-ink'));
    const box = wordBox(words, A23 + 2);
    expect(ink.left).toBeCloseTo((box.x0 - 1) * 0.38);
    expect(ink.width).toBeCloseTo((box.x1 - box.x0 + 2) * 0.38);
    expect(ink.overflow).toBe('hidden');
    const image = screen.getByTestId('live-follow-ink-image');
    expect(image.props.source).toEqual({ uri: 'file:///379.png' });
    expect(flatStyle(image)).toMatchObject({ tintColor: p.followInk, width: 389, height: 629, left: -(box.x0 - 1) * 0.38 });
    expect(screen.queryAllByTestId('live-follow-ink')).toHaveLength(1);
    expect(screen.queryByTestId('live-word-box')).toBeNull();
    expect(screen.queryByTestId('live-line-band')).toBeNull();
    expect(screen.queryAllByTestId('hidden-band')).toHaveLength(0);
    // A word with a mark keeps its wash, in the page's ink: the mark says more than where the reciter is.
    await event({ type: 'mark', mark: { id: 'm', w: A23 + 2, ayah: [27, 23], kind: 'word', sure: 'clear', heard: 'x', heardExact: false } });
    expect(screen.queryByTestId('live-follow-ink')).toBeNull();
    expect(bg('live-highlight-word')).toBe(p.markWord);
    // The next word said: it takes the ink.
    await event({ type: 'said', upTo: A23 + 3 });
    expect(flatStyle(screen.getByTestId('live-follow-ink')).left).toBeCloseTo((wordBox(words, A23 + 3).x0 - 1) * 0.38);
    // The page shown: no ink, only the band.
    fireEvent.press(screen.getByTestId('recite-eye'));
    expect(screen.queryByTestId('live-follow-ink')).toBeNull();
    expect(screen.getByTestId('live-line-band')).toBeTruthy();
  });

  it('something else said in the next word’s slot (`off`): its cover turns red, its text still hidden, until it’s said', async () => {
    await startTake('recite', null);
    fireEvent.press(screen.getByTestId('recite-eye'));
    await event({ type: 'locked', w: A23, s: 27, a: 23 });
    await event({ type: 'at', w: A23 + 3 });
    await event({ type: 'said', upTo: A23 + 3 });
    expect(screen.queryByTestId('live-off')).toBeNull();
    await event({ type: 'off', w: A23 + 4 });
    // Recite's red (the word-mistake highlight), over the cover: no new colour, never a mark.
    expect(bg('live-off')).toBe(p.markWord);
    expect(screen.queryAllByTestId(/^live-mark-/)).toHaveLength(0);
    // Said right: it goes.
    await event({ type: 'at', w: A23 + 4 });
    expect(screen.queryByTestId('live-off')).toBeNull();
  });

  it('`off` with the page shown draws nothing (you see the words there)', async () => {
    await startTake('recite', null);
    await event({ type: 'locked', w: A23, s: 27, a: 23 });
    await event({ type: 'at', w: A23 + 3 });
    await event({ type: 'off', w: A23 + 4 });
    expect(screen.queryByTestId('live-off')).toBeNull();
  });
});

describe('a take starts anywhere on the page (Majd, Nov 14 2026)', () => {
  // "it should assume it's anywhere on that page and so when the user starts reciting maybe midway through the page it
  // should start from there." Page 379 runs An-Naml 23 to its last ayah; An-Naml 25 is its third.
  const A25 = words.verseFirstWord(27, 25);
  const A26 = words.verseFirstWord(27, 26);
  const lastAyah = (page: number) => {
    const v = versesOnPage(page);
    return [v[v.length - 1].sura, v[v.length - 1].ayah];
  };
  const done = (extra: Record<string, unknown> = {}) =>
    event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A26 + 3, secs: 12, marks: [], score: null, ...extra } });

  it('the start frame names the page (its first ayah to its last), so the checker looks for where the reciter started', async () => {
    await startTake('recite', null);
    expect(mockLive.start).toMatchObject({ s: 27, a: 23, startBy: lastAyah(379) });
  });

  it('until the start is found: Listening…, no cursor or highlight, no score', async () => {
    await startTake('check', null);
    expect(screen.getByTestId('recite-status').props.children).toBe('Listening…');
    expect(screen.queryByTestId('recite-words')).toBeNull();
    expect(screen.queryByTestId('live-word-box')).toBeNull();
    // Never on the page's top line by default: the checker hasn't said where the reciter is.
    expect(screen.queryByTestId('live-line-band')).toBeNull();
    expect(screen.queryByTestId('recite-score')).toBeNull();
  });

  it('found in the middle of the page: the cursor shows there, the score begins there, VoiceOver hears where; the page stays', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await startTake('check', null);
    await event({ type: 'locked', w: A25, s: 27, a: 25 });
    // The page shown: the band on the line found, no word washed.
    expect(screen.getByTestId('live-line-band')).toBeTruthy();
    expect(screen.queryByTestId('live-word-box')).toBeNull();
    expect(screen.getByTestId('recite-words')).toBeTruthy();
    expect(screen.getByTestId('recite-score')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('Started at An-Naml, ayah 25');
    expect(mockPager.scrolled).toEqual([]);
  });

  it('found on the page before: the page turns to it', async () => {
    await startTake('recite', null);
    const a22 = words.verseFirstWord(27, 22);
    expect(words.pageOf(a22)).toBe(378);
    await event({ type: 'locked', w: a22, s: 27, a: 22 });
    expect(mockPager.scrolled).toEqual([378]);
  });

  it('nothing before the start is skipped, and the summary names the passage from where the reciter started', async () => {
    await startTake('check', null);
    await event({ type: 'locked', w: A25, s: 27, a: 25 });
    const skipped = { id: 'k', w: A23 + 2, ayah: [27, 23] as [number, number], kind: 'skipped' as const, sure: 'clear' as const };
    await event({ type: 'mark', mark: skipped });
    expect(screen.queryByTestId('live-mark-skipped')).toBeNull();
    await event({ type: 'at', w: A26 + 1 });
    fireEvent.press(screen.getByTestId('recite-stop'));
    await done({ start: A25, marks: [skipped] });
    const passage = String(screen.getByTestId('take-summary-passage').props.children);
    expect(passage).toMatch(/^An.Naml,\sayahs\s25.26\s·\s/);
    expect(screen.queryByTestId('take-summary-finding-skipped')).toBeNull();
  });

  it('a checker that doesn’t look for the start (protocol 5) begins at the page’s first ayah at once, as before', async () => {
    setReciteCheckSettings('u1', { noticeSeen: true, mode: 'recite', markMistakes: true });
    await open();
    fireEvent.press(screen.getByTestId('recite-mic'));
    await flush();
    await flush();
    await event({ type: 'ready', take: 't1', protocol: 5 });
    expect(screen.getByTestId('recite-score')).toBeTruthy();
    await event({ type: 'at', w: A23 + 2 });
    fireEvent.press(screen.getByTestId('recite-stop'));
    await done();
    expect(String(screen.getByTestId('take-summary-passage').props.children)).toMatch(/^An.Naml,\sayah\s23\s·\s/);
  });

  it('never found: it fails silently (Majd, Nov 14 2026): Stop just ends the take, with no summary or message', async () => {
    const spoken = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions');
    await startTake('recite', null);
    expect(screen.getByTestId('recite-status').props.children).toBe('Listening…');
    fireEvent.press(screen.getByTestId('recite-stop'));
    await done({ start: null });
    await flush();
    expect(screen.queryByTestId('take-summary')).toBeNull();
    expect(screen.queryByTestId('recite-bar')).toBeNull();
    expect(screen.getByTestId('recite-mic')).toBeTruthy();
    expect(spoken).not.toHaveBeenCalled();
  });

  it('never found, with VoiceOver or TalkBack: one line is said once the microphone is off; the screen is the same (Majd, Nov 15 2026)', async () => {
    const enabled = AccessibilityInfo.isScreenReaderEnabled as jest.Mock;
    enabled.mockImplementation(async () => true);
    const spoken = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions');
    try {
      await startTake('recite', null);
      await act(async () => mockMic!.onAudio(new Int16Array(16000)));
      expect(spoken).not.toHaveBeenCalled();
      fireEvent.press(screen.getByTestId('recite-stop'));
      await done({ start: null });
      await flush();
      // Once (the take's recording is announced after it, as after any take).
      expect(spoken.mock.calls.map((c) => c[0]).filter((t) => t === 'Couldn’t follow that take. Try starting at the top of the page.')).toHaveLength(1);
      expect(screen.queryByTestId('take-summary')).toBeNull();
      expect(screen.queryByTestId('recite-bar')).toBeNull();
      expect(screen.getByTestId('recite-mic')).toBeTruthy();
    } finally {
      enabled.mockImplementation(async () => false);
    }
  });

  it('found, with VoiceOver: nothing of the kind is said', async () => {
    const enabled = AccessibilityInfo.isScreenReaderEnabled as jest.Mock;
    enabled.mockImplementation(async () => true);
    const spoken = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions');
    try {
      await startTake('recite');
      fireEvent.press(screen.getByTestId('recite-stop'));
      await done({ start: A23 });
      await flush();
      expect(spoken.mock.calls.map((c) => c[0])).not.toContain('Couldn’t follow that take. Try starting at the top of the page.');
    } finally {
      enabled.mockImplementation(async () => false);
    }
  });

  it('a page turned by hand before the start is found: the checker looks on that page instead', async () => {
    await startTake('recite', null);
    await act(async () => mockPager.onPageChange?.(380));
    expect(mockLive.sent).toContainEqual({ type: 'seek', w: words.pageRange(380)[0], startBy: lastAyah(380) });
  });

  it('a page turned by hand once reciting: Listening… while the checker looks on that page, then the cursor where it finds you', async () => {
    await startTake('recite', A25);
    await event({ type: 'at', w: A25 + 2 });
    await act(async () => mockPager.onPageChange?.(380));
    expect(mockLive.sent).toContainEqual({ type: 'seek', w: words.pageRange(380)[0], startBy: lastAyah(380) });
    expect(screen.getByTestId('recite-status').props.children).toBe('Listening…');
    await event({ type: 'locked', w: words.pageRange(380)[0] + 20, s: 27, a: 40 });
    expect(screen.getByTestId('recite-words')).toBeTruthy();
  });

  it('a checker that doesn’t look: a page turned by hand only says where the page starts, as before', async () => {
    setReciteCheckSettings('u1', { noticeSeen: true, mode: 'recite', markMistakes: false });
    await open();
    fireEvent.press(screen.getByTestId('recite-mic'));
    await flush();
    await flush();
    await event({ type: 'ready', take: 't1', protocol: 5 });
    await act(async () => mockPager.onPageChange?.(380));
    expect(mockLive.sent).toContainEqual({ type: 'seek', w: words.pageRange(380)[0] });
  });


  it('‹ on a hidden page after a start mid-page shows the reciter’s word, not the page’s first', async () => {
    await startTake('recite', null);
    await event({ type: 'locked', w: A25, s: 27, a: 25 });
    fireEvent.press(screen.getByTestId('recite-eye'));
    fireEvent.press(screen.getByTestId('recite-next-word'));
    // The word being recited stays hidden until it's said (RECITE-6), so ‹ shows it; An-Naml 23 and 24 stay hidden.
    expect(mockLive.sent).toEqual([{ type: 'hint', w: A25, what: 'word' }]);
  });
});

describe('the hidden view (the eye on the bar)', () => {
  it('covers the page; ‹ shows the next word, ‹‹ the whole ayah', async () => {
    await startTake('recite');
    fireEvent.press(screen.getByTestId('recite-eye'));
    expect(screen.getByTestId('recite-eye-group')).toBeTruthy();
    expect(screen.getByTestId('hidden-page-379')).toBeTruthy();
    // Every line is covered, and what shows is drawn again in the page's ink (Majd, Nov 22 2026: an empty page with
    // faint rules, the words appearing in their own ink).
    const drawn = () => screen.queryAllByTestId('hidden-shown').length;
    // How much of the page's lines still shows a rule (a word shown takes its stretch of rule).
    const rules = () => screen.queryAllByTestId('hidden-guide').reduce((n, r) => n + (flatStyle(r).width as number), 0);
    const [before, rulesBefore] = [drawn(), rules()];
    fireEvent.press(screen.getByTestId('recite-whole-ayah'));
    expect(drawn()).toBeGreaterThan(before);
    expect(rules()).toBeLessThan(rulesBefore);
    fireEvent.press(screen.getByTestId('recite-next-word'));
    // The checker is told (contract draft 5): a shown word counts as helped, never as a mistake for being shown.
    const [from, to] = words.verseRange(27, 23);
    expect(mockLive.sent).toEqual([
      { type: 'hint', w: from, what: 'ayah' },
      { type: 'hint', w: to, what: 'word' },
    ]);
    fireEvent.press(screen.getByTestId('recite-eye'));
    expect(screen.queryByTestId('hidden-page-379')).toBeNull();
  });

  it('no band on any line: nothing but the covers before the start is found, the words recited after (Majd, Nov 15 2026)', async () => {
    // Majd: "there shouldn't be an always there highlight at the top when the verses are hidden".
    await startTake('recite', null);
    fireEvent.press(screen.getByTestId('recite-eye'));
    expect(screen.getByTestId('hidden-page-379')).toBeTruthy();
    const covered = screen.getAllByTestId('hidden-cover').length;
    expect(screen.queryAllByTestId('hidden-band')).toHaveLength(0);
    expect(screen.queryByTestId('live-line-band')).toBeNull();
    expect(screen.queryByTestId('live-word-box')).toBeNull();
    // Found: the words recited show in place, and still no band.
    await event({ type: 'locked', w: A23, s: 27, a: 23 });
    await event({ type: 'at', w: A23 + 3 });
    expect(screen.getAllByTestId('hidden-cover')).toHaveLength(covered);
    expect(screen.queryAllByTestId('hidden-shown').length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId('hidden-band')).toHaveLength(0);
  });

  it('nor with no take: the eye alone covers the page with no band', async () => {
    await open();
    fireEvent.press(screen.getByTestId('reader-eye'));
    expect(screen.getByTestId('hidden-page-379')).toBeTruthy();
    expect(screen.queryAllByTestId('hidden-band')).toHaveLength(0);
  });

  it('a tap on a hidden page shows nothing: the pager gets no verse tap, so it brings the controls (Majd, Nov 14 2026)', async () => {
    await open();
    fireEvent.press(screen.getByTestId('reader-eye'));
    expect(screen.getByTestId('hidden-page-379')).toBeTruthy();
    expect(mockPager.onTapVerse).toBeUndefined();
  });

  it('nor during a take: only ‹, ‹‹ and the recitation itself show words', async () => {
    await startTake('recite');
    fireEvent.press(screen.getByTestId('recite-eye'));
    expect(screen.getByTestId('hidden-page-379')).toBeTruthy();
    expect(mockPager.onTapVerse).toBeUndefined();
  });
});

describe('no word shows before it is said (Majd, Nov 21 2026)', () => {
  it('[RECITE-6] a hidden page and its bar hold back the word being said until it is decided, the next word begins, or it has been said for its length', async () => {
    await startTake('check');
    fireEvent.press(screen.getByTestId('recite-eye'));
    // The reciter is on An-Naml 23's third word: nothing decided yet, so it stays covered, and the bar doesn't name it.
    await event({ type: 'at', w: A23 + 2 });
    await event({ type: 'said', upTo: A23 + 1 });
    // What the bar says (its words as VoiceOver reads them); the page's covers follow the same word (liveInfo).
    const barSays = () => screen.getByTestId('recite-middle').props.accessibilityLabel as string;
    expect(barSays()).not.toContain(words.uthmani(A23 + 2));
    // Where they are, still covered: the word being said has its cover lightly marked, and the newest shown word is in the
    // following ink.
    expect(screen.getByTestId('live-cover-current')).toBeTruthy();
    expect(screen.getByTestId('live-follow-ink')).toBeTruthy();
    // The next word begins: the third shows.
    await event({ type: 'at', w: A23 + 3 });
    expect(barSays()).toContain(words.uthmani(A23 + 2));
    expect(barSays()).not.toContain(words.uthmani(A23 + 3));
    // Decided in full (said), it shows though the cursor hasn't moved on.
    await event({ type: 'said', upTo: A23 + 3 });
    expect(barSays()).toContain(words.uthmani(A23 + 3));
    // Under the cursor about as long as it takes to say (Majd, Nov 22 2026: "under one second max"), it shows too.
    await event({ type: 'at', w: A23 + 4 });
    expect(barSays()).not.toContain(words.uthmani(A23 + 4));
    await act(async () => {
      await new Promise((r) => setTimeout(r, revealDelay(wordLetters(words.uthmani(A23 + 4)), null) + 100));
    });
    expect(barSays()).toContain(words.uthmani(A23 + 4));
    expect(screen.queryByTestId('live-cover-current')).toBeNull();
  });
});

describe('the guess before the lock (contract draft 11, protocol 9; Majd: the cursor within 2 s of the first word)', () => {
  const begin = async (protocol: number) => {
    setReciteCheckSettings('u1', { noticeSeen: true, mode: 'recite', markMistakes: true });
    await open();
    fireEvent.press(screen.getByTestId('recite-mic'));
    await flush();
    await flush();
    await event({ type: 'ready', take: 't1', protocol });
  };

  it('[RECITE-1] the start frame asks for guesses; a guess shows as the cursor on the page shown, Listening… stays, and the lock takes over', async () => {
    await begin(9);
    expect(mockLive.start).toMatchObject({ guess: true });
    expect(screen.queryByTestId('live-line-band')).toBeNull();
    await event({ type: 'guess', w: A23 + 2 } as LiveEvent);
    // The cursor on a shown page is the band on its line, no word washed (RECITE-19).
    expect(screen.getByTestId('live-line-band')).toBeTruthy();
    expect(screen.queryByTestId('live-word-box')).toBeNull();
    expect(screen.getByTestId('recite-status').props.children).toBe('Listening…');
    // Sure now, somewhere else: the cursor jumps there; a guess after the lock is ignored.
    await event({ type: 'locked', w: A23 + 5, s: 27, a: 23 });
    await event({ type: 'guess', w: A23 + 1 } as LiveEvent);
    expect(screen.getByTestId('live-line-band')).toBeTruthy();
    expect(screen.queryByTestId('recite-status')).toBeNull();
  });

  it('[RECITE-1] a hidden page shows nothing for a guess; shown again, the page draws it', async () => {
    await begin(9);
    fireEvent.press(screen.getByTestId('recite-eye'));
    await event({ type: 'guess', w: A23 + 2 } as LiveEvent);
    expect(screen.queryByTestId('live-word-box')).toBeNull();
    expect(screen.queryByTestId('live-line-band')).toBeNull();
    expect(screen.queryByTestId('live-cover-current')).toBeNull();
    fireEvent.press(screen.getByTestId('recite-eye'));
    expect(screen.getByTestId('live-line-band')).toBeTruthy();
  });

  it('a checker before protocol 9: its guesses are ignored', async () => {
    await begin(8);
    await event({ type: 'guess', w: A23 + 2 } as LiveEvent);
    expect(screen.queryByTestId('live-line-band')).toBeNull();
    expect(screen.queryByTestId('live-word-box')).toBeNull();
  });
});

describe('Check: a mark’s card, the summary, and Check’s page', () => {
  const tapWord = (w: number) => {
    const { wordBox } = require('../../../lib/reciteLive/geometry');
    const b = wordBox(words, w);
    return act(async () => {
      mockPager.onTapPoint?.(379, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (r: { x0: number; y0: number; x1: number; y1: number }) => ({
        x: r.x0,
        y: r.y0 + 100,
        width: r.x1 - r.x0,
        height: r.y1 - r.y0,
      }));
    });
  };

  it('tapping a marked word opens its card: Expected and As heard; Not a mistake takes it off and tells the checker', async () => {
    await startTake('check');
    await event({ type: 'mark', mark: { id: 'a', w: UTIYAT, ayah: [27, 23], kind: 'word', sure: 'likely', heard: 'وَأُوهِيَتْ', heardExact: false } });
    await event({ type: 'mark', mark: { id: 'n', w: UTIYAT, ayah: [27, 23], kind: 'tajweed', rule: 'qalqalah', sure: 'clear' } });
    await tapWord(UTIYAT);
    expect(screen.getByTestId('mark-card')).toBeTruthy();
    expect(screen.getByText('Wrong word')).toBeTruthy();
    expect(screen.getByText('As heard')).toBeTruthy();
    // Highlights, as on the page (Majd, Nov 15 2026): a flat swatch by each kind's name, what was recited on its colour,
    // what was expected on quiet grey; no red or green text.
    const p = paletteV2(false, 'indigo');
    const style = (id: string) => flatStyle(screen.getAllByTestId(id)[0]);
    expect(style('mark-card-swatch-word').backgroundColor).toBe(p.markWord);
    expect(style('mark-card-swatch-tajweed').backgroundColor).toBe(p.markTajweed);
    expect(style('mark-card-recited').backgroundColor).toBe(p.markWord);
    expect(style('mark-card-expected').backgroundColor).toBe(p.highlight);
    expect(style('mark-card-expected').color).toBeUndefined();
    // Both marks on the word, each with its own Not a mistake.
    expect(screen.getByTestId('mark-card-tajweed')).toBeTruthy();
    // Similar phrases: An-Naml 16 reads almost the same.
    expect(screen.getByTestId('mark-card-similar')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('mark-card-hear')));
    expect(playerUris()).toEqual([expect.stringMatching(/^https:\/\/everyayah\.com\/data\/.+\/027023\.mp3$/)]);
    fireEvent.press(screen.getAllByTestId('mark-card-dismiss')[0]);
    expect(mockLive.sent).toContainEqual({ type: 'dismiss', id: 'a' });
    expect(screen.queryByTestId('live-mark-word')).toBeNull();
  });

  describe('“Not a mistake” can be undone (Majd, Nov 15 2026)', () => {
    const sendLabel = () => jest.requireMock('../../../lib/reciteCheck/service').sendLabel as jest.Mock;
    const wrongMark = { id: 'a', w: UTIYAT, ayah: [27, 23], kind: 'word', sure: 'clear', heard: 'وَأُوهِيَتْ', heardExact: false };

    it('during the take: Undo on the toast puts it back, and the checker is told both (dismiss, then undismiss)', async () => {
      await startTake('check');
      await event({ type: 'mark', mark: wrongMark as never });
      await tapWord(UTIYAT);
      fireEvent.press(screen.getByTestId('mark-card-dismiss'));
      expect(screen.queryByTestId('live-mark-word')).toBeNull();
      expect(screen.getByText('Marked not a mistake')).toBeTruthy();
      fireEvent.press(screen.getByTestId('undo-toast-action'));
      expect(screen.getByTestId('live-mark-word')).toBeTruthy();
      expect(mockLive.sent).toEqual(expect.arrayContaining([{ type: 'dismiss', id: 'a' }, { type: 'undismiss', id: 'a' }]));
      const types = (mockLive.sent as { type: string }[]).map((f) => f.type);
      expect(types.indexOf('dismiss')).toBeLessThan(types.indexOf('undismiss'));
      expect(sendLabel()).not.toHaveBeenCalled();
    });

    it('[RECITE-4] Stop sends the take’s counts with its end (Recite due diligence row 2): numbers only, no words or ids', async () => {
      await startTake('check');
      await event({ type: 'mark', mark: wrongMark as never });
      await tapWord(UTIYAT);
      fireEvent.press(screen.getByTestId('mark-card-dismiss'));
      fireEvent.press(screen.getByTestId('undo-toast-action'));
      fireEvent.press(screen.getByTestId('recite-eye'));
      fireEvent.press(screen.getByTestId('recite-next-word'));
      fireEvent.press(screen.getByTestId('recite-stop'));
      await flush();
      const end = (mockLive.sent as { type: string; counts?: unknown }[]).find((f) => f.type === 'end');
      expect(end?.counts).toEqual({ shown: 1, notMistake: 1, putBack: 1, peeks: 1, resumes: 0 });
    });

    it('after the final answer: the label goes over HTTP (the connection has gone), Undo too', async () => {
      await startTake('check');
      fireEvent.press(screen.getByTestId('recite-stop'));
      await event({
        type: 'done',
        result: { v: 2, take: 't1', from: A23, to: A23 + 10, secs: 12, marks: [wrongMark], score: { reached: 11, mistakes: 1, tajweed: 0, accuracy: 0.9 } } as never,
      });
      // From the summary to the word's card: Not a mistake there.
      fireEvent.press(screen.getByTestId('take-summary-finding-word'));
      await flush();
      fireEvent.press(screen.getByTestId('mark-card-dismiss'));
      expect(sendLabel()).toHaveBeenCalledWith('dismiss', 't1', 'a', expect.any(Number));
      expect(mockLive.sent).not.toContainEqual({ type: 'dismiss', id: 'a' });
      fireEvent.press(screen.getByTestId('undo-toast-action'));
      expect(sendLabel()).toHaveBeenLastCalledWith('undismiss', 't1', 'a', expect.any(Number));
    });

    it('taken off during the take: the summary lists it under “1 marked not a mistake”, with Put back', async () => {
      await startTake('check');
      await event({ type: 'mark', mark: wrongMark as never });
      await tapWord(UTIYAT);
      fireEvent.press(screen.getByTestId('mark-card-dismiss'));
      fireEvent.press(screen.getByTestId('recite-stop'));
      await event({
        type: 'done',
        result: { v: 2, take: 't1', from: A23, to: A23 + 10, secs: 12, marks: [wrongMark], score: { reached: 11, mistakes: 0, tajweed: 0, accuracy: 1 } } as never,
      });
      expect(screen.queryByTestId('take-summary-finding-word')).toBeNull();
      expect(screen.getByText('1 marked not a mistake')).toBeTruthy();
      fireEvent.press(screen.getByTestId('take-summary-removed-toggle'));
      fireEvent.press(screen.getByTestId('take-summary-put-back'));
      // Back among the findings, counted again, and the checker takes the label back.
      expect(screen.getByTestId('take-summary-finding-word')).toBeTruthy();
      expect(screen.queryByTestId('take-summary-removed')).toBeNull();
      expect(screen.getByLabelText(/Score .*, 1 mistake$/)).toBeTruthy();
      expect(sendLabel()).toHaveBeenLastCalledWith('undismiss', 't1', 'a', expect.any(Number));
    });

    it('with a screen reader: Not a mistake after the take is said, and so is Put back; nothing is said while the mic is on', async () => {
      const spoken = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions');
      // During the take: the microphone would record it.
      await startTake('check');
      await event({ type: 'mark', mark: wrongMark as never });
      await tapWord(UTIYAT);
      fireEvent.press(screen.getByTestId('mark-card-dismiss'));
      expect(spoken.mock.calls.map((c) => c[0])).not.toContain('Marked not a mistake. Undo is at the bottom of the screen.');
      fireEvent.press(screen.getByTestId('recite-stop'));
      await event({
        type: 'done',
        result: { v: 2, take: 't1', from: A23, to: A23 + 10, secs: 12, marks: [wrongMark], score: { reached: 11, mistakes: 0, tajweed: 0, accuracy: 1 } } as never,
      });
      fireEvent.press(screen.getByTestId('take-summary-removed-toggle'));
      fireEvent.press(screen.getByTestId('take-summary-put-back'));
      expect(spoken).toHaveBeenCalledWith('Wrong word put back', { queue: true });
      // After the take, from the summary to the card: said at once.
      fireEvent.press(screen.getByTestId('take-summary-finding-word'));
      await flush();
      fireEvent.press(screen.getByTestId('mark-card-dismiss'));
      expect(spoken).toHaveBeenCalledWith('Marked not a mistake. Undo is at the bottom of the screen.', { queue: true });
    });
  });

  it('the bar says each word’s mark in words, not by colour alone', async () => {
    await startTake('check');
    await event({ type: 'said', upTo: UTIYAT });
    await event({ type: 'mark', mark: { id: 'a', w: UTIYAT, ayah: [27, 23], kind: 'word', sure: 'clear', heard: 'وَأُوهِيَتْ', heardExact: false } });
    await event({ type: 'at', w: UTIYAT + 1 });
    expect(screen.getByTestId('recite-middle').props.accessibilityLabel).toContain('وَأُوهِيَتْ, wrong word,');
  });

  it('a “not clear” haraka’s card: Not clear, say it more clearly; what was expected, not a guess at what was heard', async () => {
    await startTake('check');
    await event({
      type: 'mark',
      mark: { id: 'h', w: UTIYAT, ayah: [27, 23], kind: 'harakat', sure: 'likely', slip: { expected: 'ُ', heard: 'َ' }, heard: 'وَأَوتِيَتْ', heardExact: true },
    });
    // Not counted: the score stays at 100%.
    expect(screen.getByTestId('recite-score')).toHaveTextContent('100%');
    await tapWord(UTIYAT);
    expect(screen.getByText('Not clear')).toBeTruthy();
    expect(screen.getByTestId('mark-card-slip').props.children).toBe('Say it more clearly. Not counted in the score.');
    expect(screen.getByText('Expected')).toBeTruthy();
    expect(screen.queryByText('Recited')).toBeNull();
  });

  describe('Hear it during a take (Majd, Nov 15 2026: it ended the take, and Husary played on past it)', () => {
    // Any touch outside the card closes it (the bar is hidden from VoiceOver while it's open: accessibilityViewIsModal).
    const closeCard = () => act(async () => fireEvent(screen.getByTestId('mark-card-backdrop'), 'responderGrant'));
    const openCard = async () => {
      await startTake('check');
      await event({ type: 'mark', mark: { id: 'a', w: UTIYAT, ayah: [27, 23], kind: 'word', sure: 'clear', heard: 'وَأُوهِيَتْ', heardExact: false } });
      await tapWord(UTIYAT);
    };

    it('pauses the take, never ends it, and plays on the card’s own player, not the app’s recitation', async () => {
      const recitation = jest.spyOn(require('../../../lib/recitation').getRecitation(), 'play');
      await openCard();
      await act(async () => fireEvent.press(screen.getByTestId('mark-card-hear')));
      expect(recitation).not.toHaveBeenCalled();
      expect(playerUris()).toEqual([expect.stringMatching(/\/027023\.mp3$/)]);
      expect(mockLive.sent).not.toContainEqual(expect.objectContaining({ type: 'end' }));
      await closeCard();
      expect(screen.getByTestId('recite-status').props.children).toBe('Paused');
      expect(screen.getByTestId('recite-resume')).toBeTruthy();
      recitation.mockRestore();
    });

    it('Resume carries on the same take: the microphone again, its audio to the same connection, no new take', async () => {
      const { startMicStream } = jest.requireMock('../../../lib/recite/micSource');
      await openCard();
      const start = mockLive.start;
      await act(async () => fireEvent.press(screen.getByTestId('mark-card-hear')));
      const before = mockLive.audio;
      await closeCard();
      await act(async () => fireEvent.press(screen.getByTestId('recite-resume')));
      expect(startMicStream).toHaveBeenCalledTimes(2);
      expect(mockLive.start).toBe(start);
      await act(async () => mockMic!.onAudio(new Int16Array(16000)));
      expect(mockLive.audio).toBe(before + 16000);
      expect(screen.getByTestId('recite-pause')).toBeTruthy();
    });

    it('the ayah stops when the card closes', async () => {
      await openCard();
      await act(async () => fireEvent.press(screen.getByTestId('mark-card-hear')));
      const player = lastPlayer();
      expect(player.play).toHaveBeenCalled();
      await closeCard();
      expect(player.remove).toHaveBeenCalled();
    });

    it('and when the reader is left', async () => {
      await openCard();
      await act(async () => fireEvent.press(screen.getByTestId('mark-card-hear')));
      const player = lastPlayer();
      screen.unmount();
      expect(player.remove).toHaveBeenCalled();
    });

  });

  describe('Your recitation (Majd, Nov 15 2026: Tarteel plays what you said and the reference)', () => {
    const closeCard = () => act(async () => fireEvent(screen.getByTestId('mark-card-backdrop'), 'responderGrant'));

    it('the card plays your own voice at the mark, a little before and after; a take still listening pauses first', async () => {
      await startTake('check');
      await event({
        type: 'mark',
        mark: { id: 'a', w: UTIYAT, ayah: [27, 23], kind: 'word', sure: 'clear', heard: 'وَأُوهِيَتْ', heardExact: false, t: [8.1, 8.5] },
      });
      await tapWord(UTIYAT);
      await act(async () => fireEvent.press(screen.getByTestId('mark-card-yours')));
      expect(mockLive.clips).toEqual([[expect.closeTo(7.5, 5), expect.closeTo(8.9, 5)]]);
      const { writeClip } = jest.requireMock('../../../lib/reciteLive/clipFile');
      expect((writeClip as jest.Mock).mock.calls[0][0]).toHaveLength(Math.round(1.4 * 16000));
      expect(playerUris().at(-1)).toBe('file:///cache/recite-your-recitation.wav');
      expect(mockLive.sent).not.toContainEqual(expect.objectContaining({ type: 'end' }));
      await closeCard();
      expect(screen.getByTestId('recite-resume')).toBeTruthy();
    });

    it('after the take too, from its summary', async () => {
      await startTake('check');
      const mark = { id: 'a', w: UTIYAT, ayah: [27, 23] as [number, number], kind: 'word' as const, sure: 'clear' as const, t: [8.1, 8.5] as [number, number] };
      await event({ type: 'mark', mark });
      fireEvent.press(screen.getByTestId('recite-stop'));
      await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, start: A23, secs: 12, marks: [mark], score: null } });
      await act(async () => mockLive.onClose?.());
      fireEvent.press(screen.getByTestId('take-summary-finding-word'));
      await flush();
      await act(async () => fireEvent.press(screen.getByTestId('mark-card-yours')));
      expect(mockLive.clips).toHaveLength(1);
      expect(playerUris().at(-1)).toBe('file:///cache/recite-your-recitation.wav');
    });

    it('a mark with no time of its own (a skipped word): around when the cursor reached the word before', async () => {
      await startTake('check');
      await event({ type: 'at', w: UTIYAT - 1, t: 6 } as LiveEvent);
      await event({ type: 'mark', mark: { id: 's', w: UTIYAT, ayah: [27, 23], kind: 'skipped', sure: 'clear' } });
      await tapWord(UTIYAT);
      await act(async () => fireEvent.press(screen.getByTestId('mark-card-yours')));
      expect(mockLive.clips).toEqual([[expect.closeTo(4.8, 5), expect.closeTo(7.2, 5)]]);
    });

    it('[RECITE-18] plays the phrase the mistake is in: a short ayah whole, from its first word to the next ayah’s', async () => {
      mockWordsLoaded.on = true;
      await startTake('check');
      await act(async () => mockMic!.onAudio(new Int16Array(16000 * 14)));
      // 27:23 (11 words) and 27:24's first word, a word every 0.7 s from 2 s.
      const [a0, a1] = words.verseRange(27, 23);
      const at = (w: number) => 2 + (w - a0) * 0.7;
      for (let w = a0; w <= a1; w++) await event({ type: 'at', w, t: at(w) } as LiveEvent);
      await event({
        type: 'mark',
        mark: { id: 'a', w: UTIYAT, ayah: [27, 23], kind: 'word', sure: 'clear', heard: 'وَأُوهِيَتْ', heardExact: false, t: [at(UTIYAT) - 0.3, at(UTIYAT) + 0.2] },
      });
      await tapWord(UTIYAT);
      await act(async () => fireEvent.press(screen.getByTestId('mark-card-yours')));
      // From 0.75 s before the cursor reached its first word (it does about 0.45 s after the word starts) to 27:24's.
      expect(mockLive.clips).toEqual([[expect.closeTo(at(a0) - 0.75, 5), expect.closeTo(at(a1) + 0.05, 5)]]);
    });

    it('no button when the moment isn’t known', async () => {
      await startTake('check');
      await event({ type: 'mark', mark: { id: 's', w: UTIYAT + 3, ayah: [27, 23], kind: 'skipped', sure: 'clear' } });
      await tapWord(UTIYAT + 3);
      expect(screen.getByTestId('mark-card')).toBeTruthy();
      expect(screen.queryByTestId('mark-card-yours')).toBeNull();
    });
  });

  describe('Pause and Resume on the bar', () => {
    it('Pause turns the microphone off and keeps the take; Stop while paused still ends it, and keeps its recording', async () => {
      await startTake('check');
      const mic = (await jest.requireMock('../../../lib/recite/micSource').startMicStream.mock.results[0].value) as { stop: jest.Mock };
      await act(async () => fireEvent.press(screen.getByTestId('recite-pause')));
      expect(mic.stop).toHaveBeenCalled();
      expect(mockLive.sent).not.toContainEqual(expect.objectContaining({ type: 'end' }));
      expect(screen.getByTestId('recite-status').props.children).toBe('Paused');
      expect(screen.queryByTestId('recite-recording')).toBeNull();
      fireEvent.press(screen.getByTestId('recite-stop'));
      await flush();
      expect(mockLive.sent).toContainEqual(expect.objectContaining({ type: 'end' }));
      expect(mockTake.finished).toBe(1);
    });

    it('leaving the app while paused ends the take, as it does while reciting', async () => {
      await startTake('recite');
      await act(async () => fireEvent.press(screen.getByTestId('recite-pause')));
      await toBackground();
      expect(mockLive.sent).toContainEqual(expect.objectContaining({ type: 'end' }));
    });
  });

  it('tapping where there is no mark leaves the page to its own tap', async () => {
    await startTake('check');
    await event({ type: 'mark', mark: { id: 'a', w: UTIYAT, ayah: [27, 23], kind: 'word', sure: 'likely' } });
    let taken = true;
    await act(async () => {
      taken = mockPager.onTapPoint?.(379, 1000, 1500, () => ({ x: 0, y: 0, width: 1, height: 1 })) ?? false;
    });
    expect(taken).toBe(false);
    expect(screen.queryByTestId('mark-card')).toBeNull();
  });

  it('Similar phrases opens the sheet with An-Naml 16', async () => {
    await startTake('check');
    await event({ type: 'mark', mark: { id: 'a', w: UTIYAT, ayah: [27, 23], kind: 'word', sure: 'likely' } });
    await tapWord(UTIYAT);
    fireEvent.press(screen.getByTestId('mark-card-similar'));
    expect(screen.getByTestId('similar-sheet')).toBeTruthy();
    expect(screen.getByTestId('similar-27-16')).toBeTruthy();
    // A tap opens it over this reader, highlighted (READ-2).
    mockNavigation.push.mockClear();
    fireEvent.press(screen.getByTestId('similar-27-16'));
    await flush();
    expect(mockNavigation.push).toHaveBeenCalledWith('QuranReader', expect.objectContaining({ highlight: { sura: 27, ayah: 16 } }));
  });

  it('the final answer brings the summary: the score, the passage, each finding', async () => {
    await startTake('check');
    const mark = { id: 'a', w: UTIYAT, ayah: [27, 23] as [number, number], kind: 'word' as const, sure: 'likely' as const, heard: 'وَأُوهِيَتْ', heardExact: false };
    await event({ type: 'mark', mark });
    fireEvent.press(screen.getByTestId('recite-stop'));
    // As the checker answers since Nov 14 2026: `done` at once, without `kept` (a `kept` event follows the hang-up).
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, secs: 12, marks: [mark], score: null } });
    expect(screen.getByTestId('take-summary')).toBeTruthy();
    expect(screen.getByTestId('take-summary-finding-word')).toBeTruthy();
    // No line about test data or Premium under it (Majd, Nov 21 2026; RECITE-17).
    expect(screen.queryByText('Kept as test data. Software checks it; nobody listens.')).toBeNull();
    fireEvent.press(screen.getByTestId('take-summary-done'));
    expect(screen.getByTestId('recite-close')).toBeTruthy();
  });

  it('a slip into a similar ayah: the summary says where it went, and a tap opens that ayah, highlighted', async () => {
    await startTake('check');
    const into = { w: words.verseFirstWord(27, 16), ayah: [27, 16] as [number, number] };
    const mark = { id: 'a', w: UTIYAT, ayah: [27, 23] as [number, number], kind: 'word' as const, sure: 'clear' as const, into };
    fireEvent.press(screen.getByTestId('recite-stop'));
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, secs: 12, marks: [mark], score: null } });
    const row = screen.getByTestId('take-summary-into');
    mockNavigation.push.mockClear();
    fireEvent.press(row);
    await flush();
    const page = words.pageOf(into.w);
    // In a reader of its own over this one, so Back comes back to this page (READ-2).
    expect(mockNavigation.push).toHaveBeenCalledWith('QuranReader', { pageNumber: page, highlight: { sura: 27, ayah: 16 }, showTake: undefined });
    expect(mockPager.scrolled).not.toContain(page);
  });

  it('the summary names what was recited, not the passage’s end (the checker’s `to` is the end of the surah)', async () => {
    await startTake('recite');
    await event({ type: 'at', w: A23 + 3 });
    await event({ type: 'said', upTo: A23 + 12 });
    fireEvent.press(screen.getByTestId('recite-stop'));
    // As the checker answers a take with no end ayah: from the start to the end of An-Naml, exclusive.
    const [, end] = words.verseRange(27, 93);
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: end, secs: 12, marks: [], score: null } });
    const passage = String(screen.getByTestId('take-summary-passage').props.children);
    expect(passage).toMatch(/^An.Naml,\sayahs\s23.24\s·\s/);
    expect(passage).not.toMatch(/Qasas/);
  });

  it('[SHEET-1] See your mistakes: the Premium page waits for the summary to go, so iOS never refuses it (Majd’s Dev freeze, Nov 15 2026)', async () => {
    // Majd: "i ended the session then the pop up came up and i clicked see your mistakes and now the screen froze".
    // The Premium page opened while the summary was still closing: iOS presents one modal at a time, refused it, and
    // its invisible host took every touch. React Native's jest Modal never reports a dismissal, so the summary goes
    // by the fallback (v2/Sheet), about a second after its closing.
    mockPremium.has = false;
    await startTake('recite');
    fireEvent.press(screen.getByTestId('recite-stop'));
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, secs: 12, marks: [], score: null } });
    expect(screen.getByTestId('take-summary')).toBeTruthy();
    fireEvent.press(screen.getByTestId('take-summary-check'));
    await flush();
    expect(screen.queryByTestId('check-intro')).toBeNull();
    await settle(() => expect(screen.getByTestId('check-intro')).toBeTruthy());
    expect(screen.queryByTestId('take-summary')).toBeNull();
  });

  it('Keep as test data off: the summary doesn’t say the take was kept', async () => {
    setReciteCheckSettings('u1', { keep: false });
    await startTake('recite');
    fireEvent.press(screen.getByTestId('recite-stop'));
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, secs: 12, marks: [], score: null } });
    expect(screen.getByTestId('take-summary')).toBeTruthy();
    expect(screen.queryByText('Kept as test data. Software checks it; nobody listens.')).toBeNull();
    expect(mockLive.start?.keep).toBe(false);
  });

  it.each(['check_locked', 'premium_required'] as const)(
    'the checker’s Premium gate refuses (%s): the Premium page opens and the take goes',
    async (reason) => {
      await startTake('check');
      await event({ type: 'error', reason });
      await flush();
      expect(screen.getByTestId('check-intro')).toBeTruthy();
      expect(screen.queryByTestId('recite-bar')).toBeNull();
      expect(screen.getByTestId('recite-mic')).toBeTruthy();
    },
  );

  it('Mark mistakes: the switch stays on, the mic says so, and the next take marks mistakes', async () => {
    setReciteCheckSettings('u1', { noticeSeen: true });
    await open();
    fireEvent(screen.getByTestId('recite-mic'), 'longPress');
    fireEvent.press(screen.getByTestId('recite-mistakes'));
    // The menu stays open, the switch on; the mic now starts Recite marking mistakes.
    expect(screen.getByTestId('recite-mistakes-on')).toBeTruthy();
    expect(screen.getByTestId('recite-mic', { includeHiddenElements: true }).props.accessibilityLabel).toBe('Recite and mark mistakes');
    expect(screen.getByTestId('recite-mic-badge-check', { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(screen.getByTestId('recite-mode-recite'));
    await flush();
    await flush();
    expect(mockLive.start).toMatchObject({ follow: false });
    // Off again: a plain Recite take.
    fireEvent.press(screen.getByTestId('recite-stop'));
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, secs: 12, marks: [], score: null, start: A23 } });
    fireEvent.press(screen.getByTestId('take-summary-done'));
    fireEvent.press(screen.getByTestId('recite-close'));
    fireEvent(screen.getByTestId('recite-mic'), 'longPress');
    expect(screen.getByTestId('recite-mistakes-on')).toBeTruthy();
    fireEvent.press(screen.getByTestId('recite-mistakes'));
    expect(screen.getByTestId('recite-mistakes-off')).toBeTruthy();
    expect(screen.getByTestId('recite-mic', { includeHiddenElements: true }).props.accessibilityLabel).toBe('Recite');
  });

  it('without Premium: Mark mistakes is off with a lock, and a tap opens the Premium page, not a take', async () => {
    mockPremium.has = false;
    setReciteCheckSettings('u1', { noticeSeen: true, markMistakes: true });
    await open();
    // Kept on, but the account doesn't have it: the mic starts a plain Recite.
    expect(screen.getByLabelText('Recite')).toBeTruthy();
    fireEvent(screen.getByTestId('recite-mic'), 'longPress');
    expect(screen.getByTestId('recite-mistakes-locked')).toBeTruthy();
    expect(screen.getByLabelText('Mark mistakes, part of Premium, locked')).toBeTruthy();
    fireEvent.press(screen.getByTestId('recite-mistakes'));
    await flush();
    expect(screen.queryByTestId('recite-mode-menu')).toBeNull();
    expect(screen.getByTestId('check-intro')).toBeTruthy();
    // The paid side is Premium, with no feature name and no price (Majd, Nov 14 2026).
    expect(screen.getByText('Mark my mistakes')).toBeTruthy();
    expect(screen.getByText('Get Premium')).toBeTruthy();
    expect(screen.getByText('For recitation in Hafs ʿan ʿĀṣim. Part of Premium; following along stays free. It’s AI and can make mistakes.')).toBeTruthy();
    expect(screen.queryByText(/[$€£]|\d+(\.\d+)? ?(USD|a month|\/mo)/)).toBeNull();
    expect(screen.getByText('Can’t afford it? Apply for support')).toBeTruthy();
    expect(mockLive.start).toBeUndefined();
  });

  it('Get Premium in Revisely Dev: it says it is free, then turns Premium on and the switch unlocks', async () => {
    mockPremium.has = false;
    const alert = jest.spyOn(Alert, 'alert');
    setReciteCheckSettings('u1', { noticeSeen: true });
    await open();
    fireEvent(screen.getByTestId('recite-mic'), 'longPress');
    fireEvent.press(screen.getByTestId('recite-mistakes'));
    await flush();
    fireEvent.press(screen.getByTestId('check-intro-get'));
    const [title, message, buttons] = alert.mock.calls[alert.mock.calls.length - 1];
    expect(title).toBe('Premium in Revisely Dev');
    expect(message).toMatch(/Free while testing: nothing is charged/);
    const { setDevPremium } = jest.requireMock('../../../lib/premium');
    await act(async () => buttons!.find((b) => b.text === 'Turn on')!.onPress!());
    expect(setDevPremium).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId('check-intro')).toBeNull();
    fireEvent(screen.getByTestId('recite-mic'), 'longPress');
    expect(screen.getByTestId('recite-mistakes-off')).toBeTruthy();
    expect(screen.queryByTestId('recite-mistakes-locked')).toBeNull();
    alert.mockRestore();
  });

  it('[PREM-1] in early access the intro says Premium is free now, with no end date yet, and kept for life, hides Apply for support, and Get Premium gives it', async () => {
    mockPremium.has = false;
    mockEarly.on = true;
    const alert = jest.spyOn(Alert, 'alert');
    setReciteCheckSettings('u1', { noticeSeen: true });
    await open();
    fireEvent(screen.getByTestId('recite-mic'), 'longPress');
    fireEvent.press(screen.getByTestId('recite-mistakes'));
    await flush();
    expect(screen.getByTestId('check-intro-early')).toBeTruthy();
    expect(screen.getByText(/Premium is free for everyone during early access, which has no end date yet\. After it ends, Premium will be paid, and you’ll keep it for life, bi-idhnillah\./)).toBeTruthy();
    expect(screen.queryByText('Can’t afford it? Apply for support')).toBeNull();
    expect(screen.queryByText(/trial/i)).toBeNull();
    const { claimEarlyAccess } = jest.requireMock('../../../lib/earlyAccess');
    await act(async () => fireEvent.press(screen.getByTestId('check-intro-get')));
    expect(claimEarlyAccess).toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalledWith('Premium in Revisely Dev', expect.anything(), expect.anything());
    expect(screen.queryByTestId('check-intro')).toBeNull();
    alert.mockRestore();
  });

  it('Apply for support opens the program’s page with the account’s one-time link', async () => {
    mockPremium.has = false;
    setReciteCheckSettings('u1', { noticeSeen: true });
    await open();
    fireEvent(screen.getByTestId('recite-mic'), 'longPress');
    fireEvent.press(screen.getByTestId('recite-mistakes'));
    await flush();
    await act(async () => fireEvent.press(screen.getByTestId('check-intro-support')));
    const { openBrowserAsync } = jest.requireMock('expo-web-browser');
    expect(openBrowserAsync).toHaveBeenCalledWith('https://dev.revisely.app/apply/#c=one-time');
  });
});

describe('the Stop trace (Revisely Dev: a freeze after Stop leaves a trace for the next launch)', () => {
  const trace = async () => {
    const raw = await AsyncStorage.getItem(STOP_TRACE_KEY);
    return raw ? (JSON.parse(raw) as { mode: string; status: string; take: string; steps: { s: string }[] }) : null;
  };
  /** iOS presents the summary's modal (React Native's jest Modal never calls onShow). */
  const presented = () =>
    act(async () => {
      for (const m of screen.UNSAFE_getAllByType(Modal)) if (m.props.visible !== false) m.props.onShow?.();
    });

  it('Stop writes it, each step to the summary adds to it, and the summary on screen removes it', async () => {
    await startTake('check');
    expect(await trace()).toBeNull();
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    const atStop = await trace();
    expect(atStop).toMatchObject({ mode: 'check', status: 'listening', take: 't1' });
    expect(atStop!.steps.map((s) => s.s)).toEqual(expect.arrayContaining(['stop', 'mic-off', 'audio-mode']));
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, start: A23, secs: 12, marks: [], score: null } });
    await flush();
    expect(screen.getByTestId('take-summary')).toBeTruthy();
    const steps = (await trace())!.steps.map((s) => s.s);
    expect(steps).toEqual(expect.arrayContaining(['ev:done', 'done', 'summary-asked']));
    await presented();
    await flush();
    expect(await trace()).toBeNull();
  });

  it('a take that ends without a summary (its start never found) removes it too', async () => {
    await startTake('recite', null);
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    expect(await trace()).not.toBeNull();
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, start: null, secs: 12, marks: [], score: null } });
    await flush();
    expect(screen.queryByTestId('take-summary')).toBeNull();
    expect(await trace()).toBeNull();
  });

  it('leaving the reader before the answer removes it', async () => {
    await startTake('recite');
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    expect(await trace()).not.toBeNull();
    screen.unmount();
    await flush();
    expect(await trace()).toBeNull();
  });
});

describe('screen readers during a take', () => {
  it('the bar is not a live region (its clock would be spoken every second over the recitation); only where the take started is said', async () => {
    await startTake('check');
    const announce = AccessibilityInfo.announceForAccessibility as jest.Mock;
    const said = announce.mock.calls.map((c) => String(c[0]));
    expect(said).toEqual([expect.stringMatching(/^Started at An.Naml, ayah 23$/)]);
    expect(screen.getByTestId('recite-middle').props.accessibilityLiveRegion).toBeUndefined();
    for (let i = 0; i < 3; i++) {
      await act(async () => mockMic!.onAudio(new Int16Array(16000)));
      await event({ type: 'at', w: A23 + i });
    }
    expect(screen.getByTestId('recite-time').props.children).toBe('0:03');
    expect(announce.mock.calls).toHaveLength(1);
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).not.toHaveBeenCalled();
  });
});

describe('Recite the mistakes again (Majd, Nov 15 2026: one take from the first mistake to the last)', () => {
  const finish = async (marks: object[], start = A23) => {
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 40, start, secs: 30, marks, score: null } } as LiveEvent);
    await flush();
  };
  const wrongAt = (s: number, a: number) => ({ id: `${s}:${a}`, w: words.verseFirstWord(s, a) + 1, ayah: [s, a], kind: 'word', sure: 'clear', heard: 'x', heardExact: false });

  it('a Check take with mistakes offers it; it runs from the ayah before the first to the last, with no search for the start', async () => {
    await startTake('check');
    const marks = [wrongAt(27, 24), wrongAt(27, 26)];
    for (const mark of marks) await event({ type: 'mark', mark } as LiveEvent);
    await finish(marks);
    fireEvent.press(screen.getByTestId('take-summary-drill'));
    await flush();
    await flush();
    expect(mockLive.start).toMatchObject({ s: 27, a: 23, s2: 27, a2: 26, follow: false });
    expect(mockLive.start?.startBy).toBeUndefined();
    expect(mockLive.start?.startIn).toBeUndefined();
    // The stretch is known: the take begins there at once, with no search for the start (the score shows from the
    // first moment; a search shows none until it finds the reciter).
    await event({ type: 'ready', take: 't2', protocol: 6 });
    expect(screen.getByTestId('recite-score')).toHaveTextContent('100%');
    await event({ type: 'at', w: A23 });
    expect(screen.getByTestId('recite-words')).toBeTruthy();
  });

  it('it stops by itself once the checker has decided the stretch’s last word; its summary says what the take before found there', async () => {
    await startTake('check');
    const marks = [wrongAt(27, 24)];
    await event({ type: 'mark', mark: marks[0] } as LiveEvent);
    await finish(marks);
    fireEvent.press(screen.getByTestId('take-summary-drill'));
    await flush();
    await flush();
    await event({ type: 'ready', take: 't2', protocol: 6 });
    mockLive.sent = [];
    const last = words.verseFirstWord(27, 25) - 1;
    await event({ type: 'at', w: last - 1 });
    await event({ type: 'said', upTo: last - 2 } as LiveEvent);
    expect(mockLive.sent).not.toContainEqual(expect.objectContaining({ type: 'end' }));
    await event({ type: 'said', upTo: last } as LiveEvent);
    await flush();
    expect(mockLive.sent).toContainEqual(expect.objectContaining({ type: 'end' }));
    await event({ type: 'done', result: { v: 2, take: 't2', from: A23, to: last + 1, start: words.verseFirstWord(27, 23), secs: 9, marks: [], score: null } } as LiveEvent);
    await flush();
    expect(screen.getByTestId('take-summary-before').props.children).toBe('Before: 1 wrong word');
    expect(screen.queryByTestId('take-summary-drill')).toBeNull();
  });

  it('its summary shows even when the checker gives it the take id of the one before (E2E’s recorded takes do)', async () => {
    await startTake('check');
    const marks = [wrongAt(27, 24)];
    await event({ type: 'mark', mark: marks[0] } as LiveEvent);
    await finish(marks);
    fireEvent.press(screen.getByTestId('take-summary-drill'));
    await flush();
    await flush();
    await event({ type: 'ready', take: 't1', protocol: 6 });
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 20, start: words.verseFirstWord(27, 23), secs: 9, marks: [], score: null } } as LiveEvent);
    await flush();
    expect(screen.getByTestId('take-summary-before')).toBeTruthy();
  });

  it('a stretch on another page turns the page to it', async () => {
    await startTake('check');
    const marks = [wrongAt(27, 14)];
    await event({ type: 'mark', mark: marks[0] } as LiveEvent);
    await finish(marks);
    mockPager.scrolled = [];
    fireEvent.press(screen.getByTestId('take-summary-drill'));
    await flush();
    await flush();
    expect(mockLive.start).toMatchObject({ s: 27, a: 13, s2: 27, a2: 14 });
    expect(mockPager.scrolled).toContain(words.pageOf(words.verseFirstWord(27, 13)));
  });

  it('not offered without mistakes, for tajweed notes alone, or when following along', async () => {
    await startTake('check');
    const note = { id: 'n', w: A23 + 2, ayah: [27, 23], kind: 'tajweed', rule: 'qalqalah', sure: 'clear' };
    await event({ type: 'mark', mark: note } as LiveEvent);
    await finish([note]);
    expect(screen.getByTestId('take-summary')).toBeTruthy();
    expect(screen.queryByTestId('take-summary-drill')).toBeNull();
    fireEvent.press(screen.getByTestId('take-summary-done'));
    fireEvent.press(screen.getByTestId('recite-close'));
    await flush();
    screen.unmount();
    await startTake('recite');
    await finish([]);
    expect(screen.queryByTestId('take-summary-drill')).toBeNull();
  });
});

describe('Recite your mistakes here (the held mic: the page’s remembered mistakes as one take)', () => {
  const { remember, resetMemoryForTests } = jest.requireActual('../../../lib/reciteMemory/store');
  const wrongAt = (s: number, a: number) => ({ id: `${s}:${a}:word`, w: words.verseFirstWord(s, a) + 1, ayah: [s, a], kind: 'word', sure: 'clear', heard: 'x' });
  const PAGE_FROM = words.pageRange(379)[0];
  const PAGE_TO = words.pageRange(379)[1] - 1;
  const takeWith = (marks: object[]) => ({
    id: 'mem-1',
    kind: 'take',
    take: 'old',
    createdAt: Date.UTC(2026, 10, 14, 18),
    rev: Date.UTC(2026, 10, 14, 18),
    day: '2026-11-14',
    level: 'words',
    hidden: false,
    from: PAGE_FROM,
    to: PAGE_TO,
    secs: 60,
    mistakes: marks.length,
    tajweed: 0,
    unclear: 0,
    accuracy: 0.9,
    marks,
    passed: [],
    recordingId: null,
  });
  const holdMic = async () => {
    fireEvent(screen.getByTestId('recite-mic'), 'longPress');
    await flush();
  };

  beforeEach(() => resetMemoryForTests());

  it('offers the page’s words still to fix, named by their stretch, and recites it as one take that stops at its end', async () => {
    await remember('u1', takeWith([wrongAt(27, 24), wrongAt(27, 26)]));
    setReciteCheckSettings('u1', { noticeSeen: true, mode: 'recite', markMistakes: true });
    await open();
    await holdMic();
    const row = screen.getByTestId('recite-mode-drill');
    expect(row).toHaveTextContent(/Recite your 2 mistakes here/);
    // VoiceOver hears the stretch as words ("23 to 26").
    expect(row.props.accessibilityLabel).toBe('Recite your 2 mistakes here, An-Naml, ayahs 23 to 26');
    fireEvent.press(row);
    await flush();
    await flush();
    expect(screen.queryByTestId('recite-mode-menu')).toBeNull();
    // From the ayah before the first word to the last word's ayah, as Recite the mistakes again (#594), checked.
    expect(mockLive.start).toMatchObject({ s: 27, a: 23, s2: 27, a2: 26, follow: false });
    await event({ type: 'ready', take: 't2', protocol: 6 });
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    await event({ type: 'done', result: { v: 2, take: 't2', from: A23, to: A23 + 40, start: A23, secs: 20, marks: [], score: null } } as LiveEvent);
    await flush();
    // Its summary says what those words were last time.
    expect(screen.getByTestId('take-summary-before').props.children).toBe('Before: 2 wrong words');
  });

  it('one word: “Recite your 1 mistake here”', async () => {
    await remember('u1', takeWith([wrongAt(27, 25)]));
    setReciteCheckSettings('u1', { noticeSeen: true, mode: 'recite', markMistakes: true });
    await open();
    await holdMic();
    expect(screen.getByTestId('recite-mode-drill')).toHaveTextContent(/Recite your 1 mistake here/);
  });

  it('not with Settings → Recite → “Show past mistakes” off (the page doesn’t show them then)', async () => {
    await remember('u1', takeWith([wrongAt(27, 24)]));
    setReciteCheckSettings('u1', { noticeSeen: true, mode: 'recite', markMistakes: true, showPast: false });
    await open();
    await holdMic();
    expect(screen.getByTestId('recite-mode-menu')).toBeTruthy();
    expect(screen.queryByTestId('recite-mode-drill')).toBeNull();
  });

  it('not offered without Premium, when the page has nothing to fix, or for tajweed notes alone', async () => {
    setReciteCheckSettings('u1', { noticeSeen: true, mode: 'recite', markMistakes: true });
    await open();
    await holdMic();
    expect(screen.getByTestId('recite-mode-menu')).toBeTruthy();
    expect(screen.queryByTestId('recite-mode-drill')).toBeNull();
    screen.unmount();

    await remember('u1', takeWith([{ id: 'n', w: A23 + 2, ayah: [27, 23], kind: 'tajweed', rule: 'qalqalah', sure: 'clear' }]));
    await open();
    await holdMic();
    expect(screen.queryByTestId('recite-mode-drill')).toBeNull();
    screen.unmount();

    await remember('u1', { ...takeWith([wrongAt(27, 24)]), id: 'mem-2' });
    mockPremium.has = false;
    await open();
    await holdMic();
    expect(screen.getByTestId('recite-mode-menu')).toBeTruthy();
    expect(screen.queryByTestId('recite-mode-drill')).toBeNull();
  });

  it('on a phone that hasn’t seen the notice: the notice first, then the same stretch', async () => {
    await remember('u1', takeWith([wrongAt(27, 24)]));
    setReciteCheckSettings('u1', { noticeSeen: false, mode: 'recite', markMistakes: true });
    await open();
    await holdMic();
    fireEvent.press(screen.getByTestId('recite-mode-drill'));
    await flush();
    expect(mockLive.start).toBeUndefined();
    fireEvent.press(screen.getByTestId('recite-notice-agree'));
    await flush();
    await flush();
    expect(mockLive.start).toMatchObject({ s: 27, a: 23, s2: 27, a2: 24 });
  });
});

describe('a voice search with one result opens the reader at the ayah, nothing listening (SEARCH-4)', () => {
  // Majd, Nov 17 2026: "it takes me to the mushaf with the verse highlighted without it still recording".
  it('the reader opens on the ayah found, highlighted, and starts no take: the mic waits for a tap', async () => {
    setReciteCheckSettings('u1', { noticeSeen: true });
    mockRoute.params = { pageNumber: 379, source: 'search', highlight: { sura: 27, ayah: 25, last: { sura: 27, ayah: 25 } } };
    render(<QuranReaderScreen />);
    await flush();
    await flush();
    await flush();
    expect(mockLive.start).toBeFalsy();
    expect(mockMic).toBeNull();
    expect(screen.queryByTestId('recite-bar')).toBeNull();
  });
});

describe('Test me (Majd, Nov 15 2026: random within what’s memorized, with an optional juz pick)', () => {
  // Al-Mulk (pages 562–564, juz 29) and page 604 (juz 30) memorized. Math.random at 0 takes the first start left each
  // time: Al-Mulk 1, 4, 7, 10 and 13.
  beforeEach(() => {
    mockState.pages = [562, 563, 564, 604].map((pageNumber) => ({ pageNumber, status: 'memorized' }));
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });
  afterEach(() => (Math.random as jest.Mock).mockRestore());

  const placeAt = (a: number) => {
    const first = words.verseFirstWord(67, a);
    return { first, last: words.verseRange(67, a + 2)[1] - 1 };
  };
  async function openTest(pick: 'all' | 'juz-30' = 'all') {
    setReciteCheckSettings('u1', { noticeSeen: true });
    await open();
    fireEvent(screen.getByTestId('recite-mic'), 'longPress');
    fireEvent.press(screen.getByTestId('recite-mode-test'));
    await flush();
    expect(screen.getByTestId('test-me-sheet')).toBeTruthy();
    fireEvent.press(screen.getByTestId(`test-me-${pick}`));
    await flush();
    await flush();
  }
  /** The place's take: found where the reciter carried on, said to its end (stopping by itself), the final answer. */
  async function finishPlace(take: string, a: number, marks: object[] = []) {
    const { first, last } = placeAt(a);
    await event({ type: 'ready', take, protocol: 6 });
    await event({ type: 'locked', w: first + 2, s: 67, a });
    for (const mark of marks) await event({ type: 'mark', mark } as LiveEvent);
    await event({ type: 'said', upTo: last } as LiveEvent);
    await flush();
    await event({ type: 'done', result: { v: 2, take, from: first, to: last + 1, start: first + 2, secs: 12, marks, score: null } } as LiveEvent);
    await flush();
  }

  it('in the mic’s menu: locked without Premium (a tap opens the Premium page); with nothing memorized it says so', async () => {
    mockPremium.has = false;
    await open();
    fireEvent(screen.getByTestId('recite-mic'), 'longPress');
    expect(screen.getByLabelText('Test me, part of Premium, locked')).toBeTruthy();
    fireEvent.press(screen.getByTestId('recite-mode-test'));
    await flush();
    expect(screen.getByTestId('check-intro')).toBeTruthy();
    expect(screen.queryByTestId('test-me-sheet')).toBeNull();
    screen.unmount();
    mockPremium.has = true;
    mockState.pages = [];
    await open();
    fireEvent(screen.getByTestId('recite-mic'), 'longPress');
    expect(screen.getByText('Mark what you’ve memorized first')).toBeTruthy();
    fireEvent.press(screen.getByTestId('recite-mode-test'));
    expect(screen.queryByTestId('test-me-sheet')).toBeNull();
  });

  it('where from: everything memorized, or a juz of it', async () => {
    setReciteCheckSettings('u1', { noticeSeen: true });
    await open();
    fireEvent(screen.getByTestId('recite-mic'), 'longPress');
    fireEvent.press(screen.getByTestId('recite-mode-test'));
    await flush();
    expect(screen.getByText('Everything you’ve memorized')).toBeTruthy();
    expect(screen.getByTestId('test-me-juz-29')).toBeTruthy();
    expect(screen.getByTestId('test-me-juz-30')).toBeTruthy();
    expect(screen.queryByTestId('test-me-juz-1')).toBeNull();
  });

  it('a place: the page turned to it and hidden but for its first two words, a Mark mistakes take over its three ayahs, looking only in the first', async () => {
    await openTest();
    expect(mockLive.start).toMatchObject({ type: 'start', s: 67, a: 1, startBy: [67, 1], s2: 67, a2: 3, follow: false });
    expect(mockLive.start?.startIn).toBeUndefined();
    expect(mockPager.scrolled).toContain(562);
    expect(screen.getByTestId('recite-eye-group')).toBeTruthy();
    expect(screen.getByTestId('recite-status').props.children).toBe('1 of 5');
    await event({ type: 'ready', take: 't1', protocol: 6 });
    expect(screen.getByTestId('recite-status').props.children).toBe('1 of 5');
    // The two words are shown already: ‹ shows the third.
    mockLive.sent = [];
    fireEvent.press(screen.getByTestId('recite-next-word'));
    expect(mockLive.sent).toContainEqual({ type: 'hint', w: placeAt(1).first + 2, what: 'word' });
  });

  it('a juz picked: its places only', async () => {
    await openTest('juz-30');
    expect(mockLive.start).toMatchObject({ s: 112, a: 1, startBy: [112, 1] });
  });

  it('it stops by itself at the place’s end; the bar says how it went, then Next goes to the next place', async () => {
    await openTest();
    const { first, last } = placeAt(1);
    await event({ type: 'ready', take: 't1', protocol: 6 });
    await event({ type: 'locked', w: first, s: 67, a: 1 });
    mockLive.sent = [];
    await event({ type: 'said', upTo: last } as LiveEvent);
    await flush();
    expect(mockLive.sent).toContainEqual(expect.objectContaining({ type: 'end' }));
    await event({ type: 'done', result: { v: 2, take: 't1', from: first, to: last + 1, start: first, secs: 12, marks: [], score: null } } as LiveEvent);
    await flush();
    expect(screen.queryByTestId('take-summary')).toBeNull();
    expect(screen.getByTestId('recite-status').props.children).toBe('Clean');
    // The outcome in words, no score pill: an SE at the largest text had no room for both.
    expect(screen.queryByTestId('recite-score')).toBeNull();
    expect(screen.getByLabelText('Next place, 2 of 5')).toBeTruthy();
    fireEvent.press(screen.getByTestId('recite-next'));
    await flush();
    await flush();
    expect(mockLive.start).toMatchObject({ s: 67, a: 4, startBy: [67, 4], s2: 67, a2: 6 });
    expect(screen.getByTestId('recite-eye-group')).toBeTruthy();
  });

  it('after the fifth place: the summary, how many were clean and how each went; Test me again starts a new test', async () => {
    await openTest();
    const wrong = { id: 'w', w: placeAt(4).first + 3, ayah: [67, 4], kind: 'word', sure: 'clear', heard: 'x', heardExact: false };
    const places = [1, 4, 7, 10, 13];
    for (let i = 0; i < places.length; i++) {
      await finishPlace(`t${i + 1}`, places[i], places[i] === 4 ? [wrong] : []);
      if (i < places.length - 1) {
        fireEvent.press(screen.getByTestId('recite-next'));
        await flush();
        await flush();
      }
    }
    expect(screen.getByTestId('test-summary')).toBeTruthy();
    expect(screen.getByTestId('test-summary-headline')).toHaveTextContent('4 of 5 continued cleanly');
    expect(screen.getAllByTestId('test-summary-place-clean')).toHaveLength(4);
    expect(screen.getByTestId('test-summary-place-mistakes')).toHaveTextContent(/ayahs 4.6.*1 wrong word$/);
    // The take is gone, and the page as it was (not hidden).
    expect(screen.queryByTestId('recite-bar')).toBeNull();
    fireEvent.press(screen.getByTestId('test-summary-again'));
    await flush();
    await flush();
    expect(mockLive.start).toMatchObject({ s: 67, a: 1, s2: 67, a2: 3 });
    expect(screen.getByTestId('recite-status').props.children).toBe('1 of 5');
  });

  it('✕ ends the test early: the summary of the places done', async () => {
    await openTest();
    await finishPlace('t1', 1);
    fireEvent.press(screen.getByTestId('recite-close'));
    await flush();
    expect(screen.getByTestId('test-summary-headline')).toHaveTextContent('1 of 1 continued cleanly');
    fireEvent.press(screen.getByTestId('test-summary-done'));
    await flush();
    expect(screen.getByTestId('recite-mic')).toBeTruthy();
  });

  it('the notice closed without agreeing: the test ends, and the next take is an ordinary one', async () => {
    await open();
    fireEvent(screen.getByTestId('recite-mic'), 'longPress');
    fireEvent.press(screen.getByTestId('recite-mode-test'));
    await flush();
    fireEvent.press(screen.getByTestId('test-me-all'));
    // The notice takes its turn once the where-from sheet has gone (SHEET-1; in Jest, the fallback about a second on).
    await settle(() => expect(screen.getByTestId('recite-notice-sheet')).toBeTruthy());
    expect(mockLive.start).toBeUndefined();
    const { ReciteNoticeSheet } = require('../../../components/reciteLive/ReciteNoticeSheet');
    await act(async () => screen.UNSAFE_getByType(ReciteNoticeSheet).props.onClose());
    await flush();
    // The page as it was, and a tap on the mic is a Recite take on the page.
    expect(screen.queryByTestId('recite-eye-group')).toBeNull();
    await act(async () => setReciteCheckSettings('u1', { noticeSeen: true }));
    fireEvent.press(screen.getByTestId('recite-mic'));
    await flush();
    await flush();
    expect(mockLive.start).toMatchObject({ s: 27, a: 23, startBy: expect.any(Array), follow: true });
    expect(screen.getByTestId('recite-status').props.children).toBe('Starting…');
  });

  it('a place whose start is never found: “Not continued”, and the test goes on', async () => {
    await openTest();
    const { first, last } = placeAt(1);
    await event({ type: 'ready', take: 't1', protocol: 6 });
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    await event({ type: 'done', result: { v: 2, take: 't1', from: first, to: last + 1, start: null, secs: 6, marks: [], score: null } } as LiveEvent);
    await flush();
    expect(screen.getByTestId('recite-status').props.children).toBe('Not continued');
    expect(screen.getByTestId('recite-next')).toBeTruthy();
  });
});

describe('an immersive page during a take (Majd, Nov 15 2026: a tap hides the header and the bar)', () => {
  const statusBarHidden = () => screen.UNSAFE_getByType(StatusBar).props.hidden;
  const tapPage = () => act(async () => fireEvent.press(screen.getByLabelText('The page', { includeHiddenElements: true })));

  it('a tap on the page puts the header and the bar away, the status bar stays and the take’s time shows by the page number; a tap brings them back', async () => {
    await startTake('recite');
    expect(screen.getByTestId('recite-bar')).toBeTruthy();
    await tapPage();
    expect(screen.queryByTestId('recite-bar')).toBeNull();
    expect(screen.getByTestId('recite-bar', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('reader-back')).toBeNull();
    expect(statusBarHidden()).toBe(false);
    expect(screen.getByTestId('reader-take-time')).toHaveTextContent('0:00');
    // The take goes on underneath.
    await act(async () => mockMic!.onAudio(new Int16Array(16000)));
    expect(mockLive.audio).toBe(16000);
    expect(screen.getByTestId('reader-take-time')).toHaveTextContent('0:01');
    await tapPage();
    expect(screen.getByTestId('recite-bar')).toBeTruthy();
    expect(screen.getByTestId('reader-back')).toBeTruthy();
  });

  it('the take’s time brings them back too', async () => {
    await startTake('recite');
    await tapPage();
    fireEvent.press(screen.getByTestId('reader-take-activity'));
    expect(screen.getByTestId('recite-bar')).toBeTruthy();
  });

  it('a mark’s card brings them back', async () => {
    await startTake('check');
    await event({ type: 'mark', mark: { id: 'a', w: UTIYAT, ayah: [27, 23], kind: 'word', sure: 'likely', heard: 'وَأُوهِيَتْ', heardExact: false } });
    await tapPage();
    expect(screen.queryByTestId('recite-bar')).toBeNull();
    const { wordBox } = require('../../../lib/reciteLive/geometry');
    const b = wordBox(words, UTIYAT);
    await act(async () => {
      mockPager.onTapPoint?.(379, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (r: { x0: number; y0: number; x1: number; y1: number }) => ({
        x: r.x0,
        y: r.y0 + 100,
        width: r.x1 - r.x0,
        height: r.y1 - r.y0,
      }));
    });
    expect(screen.getByTestId('mark-card', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('recite-bar', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.UNSAFE_getByProps({ testID: 'reader-quiet-header' }).props.accessibilityElementsHidden).toBe(true);
  });

  it('the take’s end brings them back (leaving the app ends it)', async () => {
    await startTake('recite');
    await tapPage();
    await toBackground();
    expect(mockLive.sent).toContainEqual(expect.objectContaining({ type: 'end' }));
    expect(screen.getByTestId('recite-bar')).toBeTruthy();
  });

  it('with VoiceOver or TalkBack the bar never goes: Stop is always there', async () => {
    // React Native's jest setup mocks it (false); on for this test only.
    const enabled = AccessibilityInfo.isScreenReaderEnabled as jest.Mock;
    enabled.mockImplementation(async () => true);
    try {
      await startTake('recite');
      await tapPage();
      expect(screen.getByTestId('recite-bar')).toBeTruthy();
      expect(screen.getByTestId('recite-stop')).toBeTruthy();
    } finally {
      enabled.mockImplementation(async () => false);
    }
  });

  it('outside a take the page’s tap is as before: the controls come and go, and the status bar with them', async () => {
    await open();
    expect(screen.getByTestId('recite-mic')).toBeTruthy();
    expect(statusBarHidden()).toBe(false);
    await tapPage();
    expect(screen.queryByTestId('recite-mic')).toBeNull();
    expect(statusBarHidden()).toBe(true);
  });
});

describe('peeked words (Majd, Nov 15 2026: on the page in quiet grey, in the summary, drilled)', () => {
  const hide = () => fireEvent.press(screen.getByTestId('recite-eye'));
  const peek = () => fireEvent.press(screen.getByTestId('recite-next-word'));
  const finish = async (marks: object[] = [], start = A23) => {
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 40, start, secs: 30, marks, score: null } } as LiveEvent);
    await flush();
  };

  it('a word shown with ‹ stays in quiet grey on the page: shown again, and once recited', async () => {
    await startTake('recite');
    expect(screen.queryAllByTestId('live-peeked')).toHaveLength(0);
    hide();
    peek();
    peek();
    expect(screen.getAllByTestId('live-peeked')).toHaveLength(2);
    hide();
    expect(screen.getAllByTestId('live-peeked')).toHaveLength(2);
    await event({ type: 'said', upTo: A23 + 5 } as LiveEvent);
    expect(screen.getAllByTestId('live-peeked')).toHaveLength(2);
  });

  it('‹‹: every word of the ayah not yet shown is a peek; words already recited aren’t', async () => {
    await startTake('recite');
    await event({ type: 'said', upTo: A23 + 1 } as LiveEvent);
    hide();
    fireEvent.press(screen.getByTestId('recite-whole-ayah'));
    const [from, to] = words.verseRange(27, 23);
    expect(screen.getAllByTestId('live-peeked')).toHaveLength(to - from - 2);
  });

  it('a peeked word with a mistake keeps its highlight, unveiled', async () => {
    await startTake('check');
    hide();
    peek();
    expect(screen.getAllByTestId('live-peeked')).toHaveLength(1);
    // The reciter's word (still hidden until it's said, RECITE-6).
    await event({ type: 'mark', mark: { id: 'p', w: A23, ayah: [27, 23], kind: 'word', sure: 'clear', heard: 'x', heardExact: false } });
    expect(screen.queryAllByTestId('live-peeked')).toHaveLength(0);
  });

  it('the summary: “2 words peeked” and a row per ayah, which shows it on the page', async () => {
    await startTake('recite');
    hide();
    peek();
    peek();
    await finish();
    expect(screen.getByTestId('take-summary-peeked')).toHaveTextContent('2 words peeked');
    const rows = screen.getAllByTestId('take-summary-peeked-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent(/Peeked · ayah 23/);
    mockPager.scrolled = [];
    fireEvent.press(rows[0]);
    expect(mockPager.scrolled).toContain(379);
  });

  it('a Check take with only peeks offers Recite the mistakes again, over the peeked ayahs; its summary says so', async () => {
    const a25 = words.verseFirstWord(27, 25);
    await startTake('check', a25);
    hide();
    peek();
    await finish([], a25);
    fireEvent.press(screen.getByTestId('take-summary-drill'));
    await flush();
    await flush();
    expect(mockLive.start).toMatchObject({ s: 27, a: 24, s2: 27, a2: 25, follow: false });
    // The next take starts with nothing peeked.
    await event({ type: 'ready', take: 't2', protocol: 6 });
    expect(screen.queryAllByTestId('live-peeked')).toHaveLength(0);
    const last = words.verseFirstWord(27, 26) - 1;
    await event({ type: 'said', upTo: last } as LiveEvent);
    await flush();
    await event({ type: 'done', result: { v: 2, take: 't2', from: A23, to: last + 1, start: words.verseFirstWord(27, 24), secs: 9, marks: [], score: null } } as LiveEvent);
    await flush();
    expect(screen.getByTestId('take-summary-before').props.children).toBe('Before: 1 word peeked');
  });

  it('Test me: a place said to its end with a word peeked is “1 word peeked”, not clean', async () => {
    mockState.pages = [562, 563, 564].map((pageNumber) => ({ pageNumber, status: 'memorized' }));
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      setReciteCheckSettings('u1', { noticeSeen: true });
      await open();
      fireEvent(screen.getByTestId('recite-mic'), 'longPress');
      fireEvent.press(screen.getByTestId('recite-mode-test'));
      await flush();
      fireEvent.press(screen.getByTestId('test-me-all'));
      await flush();
      await flush();
      const first = words.verseFirstWord(67, 1);
      const last = words.verseRange(67, 3)[1] - 1;
      await event({ type: 'ready', take: 't1', protocol: 6 });
      peek();
      await event({ type: 'locked', w: first, s: 67, a: 1 });
      await event({ type: 'said', upTo: last } as LiveEvent);
      await flush();
      await event({ type: 'done', result: { v: 2, take: 't1', from: first, to: last + 1, start: first, secs: 12, marks: [], score: null } } as LiveEvent);
      await flush();
      expect(screen.getByTestId('recite-status').props.children).toBe('1 word peeked');
    } finally {
      random.mockRestore();
    }
  });

  it('peeks never count in the score', async () => {
    await startTake('check');
    hide();
    peek();
    peek();
    await event({ type: 'said', upTo: A23 + 3 } as LiveEvent);
    expect(screen.getByTestId('recite-score')).toHaveTextContent('100%');
  });
});

describe('recite anywhere in the Qur’an (Majd, Nov 15 2026: step 2; protocol 7)', () => {
  it('a take from the mic lets the checker look in the whole Qur’an too, beside the page', async () => {
    await startTake('recite', null);
    expect(mockLive.start).toMatchObject({ startBy: expect.any(Array), startIn: 'quran' });
  });

  it('found elsewhere in the Qur’an: the reader turns there, the cursor shows, VoiceOver hears where', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await startTake('recite', null);
    const a1 = words.verseFirstWord(67, 1);
    mockPager.scrolled = [];
    await event({ type: 'locked', w: a1 + 2, s: 67, a: 1, where: 'quran' } as LiveEvent);
    expect(mockPager.scrolled).toEqual([words.pageOf(a1)]);
    expect(announce).toHaveBeenCalledWith('Started at Al-Mulk');
    await event({ type: 'at', w: a1 + 3 });
    expect(screen.getByTestId('recite-words')).toBeTruthy();
    // The page turned by the take sends no `seek` (only a hand turn does).
    expect(mockLive.sent.filter((f) => (f as { type: string }).type === 'seek')).toEqual([]);
  });

  it('never found anywhere: still silent', async () => {
    await startTake('recite', null);
    fireEvent.press(screen.getByTestId('recite-stop'));
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, start: null, secs: 6, marks: [], score: null } } as LiveEvent);
    await flush();
    expect(screen.queryByTestId('take-summary')).toBeNull();
    expect(screen.getByTestId('recite-mic')).toBeTruthy();
  });
});

describe('long takes (Nov 20 2026): Stop always ends in a summary, and the take is kept', () => {
  const { memoryRecords, resetMemoryForTests } = jest.requireActual('../../../lib/reciteMemory/store');
  const { setStopBudgetForTests, setLiveBatchForTests } = jest.requireActual('../../../components/reciteLive/useLiveRecitation');
  const captured = jest.requireMock('@sentry/react-native').captureMessage as jest.Mock;
  beforeEach(() => {
    resetMemoryForTests();
    captured.mockClear();
  });
  afterEach(() => {
    setStopBudgetForTests();
    setLiveBatchForTests(0);
  });
  // Each waits for Recite's memory to write the take (800 ms to settle), on a loaded runner too.
  jest.setTimeout(20_000);
  const wrong = { id: `${UTIYAT}:word:sound`, w: UTIYAT, ayah: [27, 23], kind: 'word', heard: 'وَأُوهِيَتْ', sure: 'clear' };
  // This test's take: the newest. (An earlier test's reader, cleaned up mid-take, keeps its take too, RECITE-12, and
  // that write may land after this test's reset.)
  const taken = () =>
    (memoryRecords('u1') as { kind: string; createdAt: number; unfinished?: boolean; mistakes: number; recordingId: string | null; to: number }[])
      .filter((r) => r.kind === 'take')
      .sort((a, b) => b.createdAt - a.createdAt)[0];
  /** A take that reached An-Naml 23's seventh word, with one wrong word. */
  async function reciteSome() {
    await startTake('check');
    await event({ type: 'at', w: A23 + 7 });
    await event({ type: 'said', upTo: A23 + 6 });
    await event({ type: 'mark', mark: wrong as never });
    await event({ type: 'score', reached: 7, mistakes: 1, tajweed: 0, accuracy: 6 / 7 } as never);
  }
  const messages = () => captured.mock.calls.map((c) => c[0]);

  it('[RECITE-11] no final answer within the budget: the summary shows what the take found, says its end wasn’t checked, and the take is kept unfinished', async () => {
    setStopBudgetForTests(40);
    await reciteSome();
    fireEvent.press(screen.getByTestId('recite-stop'));
    // (Whether it's up before the budget runs out depends on the runner's speed: not asserted.)
    await settle(() => expect(screen.getByTestId('take-summary-unfinished')).toBeTruthy());
    expect(screen.getByTestId('take-summary-score')).toBeTruthy();
    await settle(() => expect(taken()).toMatchObject({ unfinished: true, mistakes: 1, recordingId: 'rec-1' }));
    expect(messages()).toContain('Recite: a take ended without its final answer');
    // The final answer after all: the summary and the take become the finished ones.
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 8, start: A23, secs: 12, marks: [wrong], score: { reached: 7, mistakes: 1, tajweed: 0, accuracy: 6 / 7 } } as never });
    await settle(() => expect(screen.queryByTestId('take-summary-unfinished')).toBeNull());
    await settle(() => expect(taken()?.unfinished).toBeUndefined());
  });

  it('[RECITE-11] the connection lost after the start was found: the same summary, the take kept, Sentry told', async () => {
    await reciteSome();
    await event({ type: 'error', reason: 'offline' });
    await act(async () => mockLive.onClose?.());
    await settle(() => expect(screen.getByTestId('take-summary-unfinished')).toBeTruthy());
    await settle(() => expect(taken()).toMatchObject({ unfinished: true, mistakes: 1 }));
    const call = captured.mock.calls.find((c) => c[0] === 'Recite: a take ended without its final answer');
    expect(call?.[1]).toMatchObject({ tags: { recite_unfinished: 'failed', recite_failure: 'offline' } });
  });

  it('[RECITE-12] leaving the reader while Stop waits keeps the take (with its recording) and sends its Stop trace to Sentry', async () => {
    setStopBudgetForTests(60_000);
    await reciteSome();
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    await flush();
    expect(await AsyncStorage.getItem(STOP_TRACE_KEY)).not.toBeNull();
    screen.unmount();
    await settle(() => expect(taken()).toMatchObject({ unfinished: true, mistakes: 1, recordingId: 'rec-1' }));
    const call = captured.mock.calls.find((c) => c[0] === "Recite: a take's Stop never reached the summary");
    expect(call).toBeTruthy();
    const trace = (call![1] as { extra: { trace: { steps: { s: string }[]; stats?: { events: number } } } }).extra.trace;
    expect(trace.steps.map((s) => s.s)).toContain('left');
    expect(trace.stats?.events).toBeGreaterThan(0);
    await settle(async () => expect(await AsyncStorage.getItem(STOP_TRACE_KEY)).toBeNull());
  });

  it('[RECITE-12] leaving mid-take keeps it too; a take whose start was never found leaves nothing', async () => {
    await reciteSome();
    screen.unmount();
    await settle(() => expect(taken()).toMatchObject({ unfinished: true, mistakes: 1 }));
    const since = Date.now();
    await startTake('check', null);
    screen.unmount();
    await flush();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(taken().createdAt).toBeLessThan(since);
  });

  it('[RECITE-10] events that come close together are applied together (a resume replays a whole take at once)', async () => {
    await startTake('check');
    // A window wide enough that a slow runner's acts all fall in it (the app's is 100 ms).
    setLiveBatchForTests(1500);
    // The first after a quiet moment shows at once; the rest wait for one update together.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1600));
    });
    await event({ type: 'at', w: A23 + 1 });
    await event({ type: 'at', w: A23 + 2 });
    await event({ type: 'said', upTo: A23 + 1 });
    expect(screen.getByTestId('recite-words')).toBeTruthy();
    const bar = () => screen.getByTestId('recite-middle').props.accessibilityLabel as string;
    expect(bar()).toContain(words.uthmani(A23 + 1));
    expect(bar()).not.toContain(words.uthmani(A23 + 2));
    await settle(() => expect(bar()).toContain(words.uthmani(A23 + 2)));
  });
});

describe('a resume the checker didn’t hold (long takes, Nov 20 2026)', () => {
  it('[RECITE-10] its re-check from the start never moves the page back: the cursor shows again once it passes where it was', async () => {
    await startTake('check');
    await event({ type: 'at', w: A23 + 8, t: 30 });
    await event({ type: 'said', upTo: A23 + 7 });
    const bar = () => screen.getByTestId('recite-middle').props.accessibilityLabel as string;
    expect(bar()).toContain(words.uthmani(A23 + 8));
    // Another instance: it holds nothing, and checks the take again from its start.
    await event({ type: 'ready', take: 't1', protocol: 8, from: 0 });
    await event({ type: 'locked', w: A23, s: 27, a: 23, t: 0.8 });
    await event({ type: 'at', w: A23 + 1, t: 2 });
    await event({ type: 'said', upTo: A23 });
    await event({ type: 'score', reached: 1, mistakes: 0, tajweed: 0, accuracy: 1 } as never);
    expect(bar()).toContain(words.uthmani(A23 + 8));
    expect(bar()).not.toContain(words.uthmani(A23 + 1));
    // A mark it finds again applies (by id).
    await event({ type: 'mark', mark: { id: `${A23 + 4}:word:sound`, w: A23 + 4, ayah: [27, 23], kind: 'word', heard: 'وَأُوهِيَتْ', sure: 'clear' } as never });
    expect(screen.getAllByTestId('live-mark-word').length).toBe(1);
    // Past where the page was: it follows again.
    await event({ type: 'at', w: A23 + 9, t: 31 });
    expect(bar()).toContain(words.uthmani(A23 + 9));
  });
});


describe('Majd’s Nov 20 asks: the mistake sound, and mistakes on a hidden page (Revisely Dev)', () => {
  const cue = jest.requireMock('../../../lib/reciteLive/mistakeCue') as { playCueSound: jest.Mock; playCueTap: jest.Mock };
  const { remember, resetMemoryForTests } = jest.requireActual('../../../lib/reciteMemory/store');
  const wrong = (w: number, id = `${w}:word:sound`) => ({ id, w, ayah: [27, 23], kind: 'word', heard: 'كذا', sure: 'clear' });
  beforeEach(() => {
    resetMemoryForTests();
    cue.playCueSound.mockClear();
    cue.playCueTap.mockClear();
  });

  it('[RECITE-15] a new mistake plays the sound and a tap at once; Not clear, a tajweed note and a mark sent again don’t', async () => {
    await startTake('check');
    await event({ type: 'mark', mark: wrong(UTIYAT) as never });
    expect(cue.playCueSound).toHaveBeenCalledTimes(1);
    expect(cue.playCueTap).toHaveBeenCalledTimes(1);
    // The same mark again (a resume), Not clear, and a tajweed note: nothing.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 750));
    });
    await event({ type: 'mark', mark: wrong(UTIYAT) as never });
    await event({ type: 'mark', mark: { id: 'n', w: A23 + 7, ayah: [27, 23], kind: 'harakat', sure: 'likely', slip: { expected: 'ٍ', heard: 'ٌّ' } } as never });
    await event({ type: 'mark', mark: { id: 'q', w: A23 + 8, ayah: [27, 23], kind: 'tajweed', rule: 'qalqalah', sure: 'clear' } as never });
    expect(cue.playCueSound).toHaveBeenCalledTimes(1);
    // A second mistake: its own sound.
    await event({ type: 'mark', mark: wrong(A23 + 9) as never });
    expect(cue.playCueSound).toHaveBeenCalledTimes(2);
  });

  it('[RECITE-15] off in Settings → Recite: no sound and no tap; Recite alone (no marks) has none either', async () => {
    setReciteCheckSettings('u1', { noticeSeen: true, mode: 'recite', markMistakes: true, mistakeSound: false });
    await open();
    fireEvent.press(screen.getByTestId('recite-mic'));
    await flush();
    await flush();
    await event({ type: 'ready', take: 't1', protocol: 6 });
    await event({ type: 'locked', w: A23, s: 27, a: 23 });
    await event({ type: 'mark', mark: wrong(UTIYAT) as never });
    expect(cue.playCueSound).not.toHaveBeenCalled();
    expect(cue.playCueTap).not.toHaveBeenCalled();
  });

  it('[RECITE-13] a hidden page keeps a take’s mark on a word still covered, in its colour, the word still hidden', async () => {
    await startTake('check');
    fireEvent.press(screen.getByTestId('recite-eye'));
    await event({ type: 'at', w: A23 + 2 });
    await event({ type: 'said', upTo: A23 + 1 });
    // A mark on a word the page still covers.
    await event({ type: 'mark', mark: wrong(A23 + 6) as never });
    expect(screen.getByTestId('cover-highlight-word')).toBeTruthy();
    // Once the word shows, its highlight is behind its ink instead.
    await event({ type: 'said', upTo: A23 + 7 });
    expect(screen.queryByTestId('cover-highlight-word')).toBeNull();
    expect(screen.getByTestId('live-highlight-word')).toBeTruthy();
  });

  /**
   * The tests before this one leave takes listening. Their reader keeps each as an unfinished take when it goes
   * (RECITE-12), and writes it again with its recording 800 ms after that comes (useRememberTake's SETTLE_MS): on a slow
   * runner, into the next test's memory, after its reset, with that take's marks on page 379 (develop's CI, Nov 20 2026:
   * "Found multiple elements with testID: cover-past-word"). This lets those writes land, then starts Recite's memory
   * empty, on the phone too.
   */
  async function afterLeftTakes() {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2000));
    });
    resetMemoryForTests();
    await AsyncStorage.clear();
  }

  it('[RECITE-13] and the words Recite’s memory holds on the page, lighter, with no take and during one; not with Show past mistakes off', async () => {
    await afterLeftTakes();
    const [from, to] = words.pageRange(379);
    await remember('u1', {
      id: 'mem-1',
      kind: 'take',
      take: 'old',
      createdAt: Date.UTC(2026, 10, 14, 18),
      rev: Date.UTC(2026, 10, 14, 18),
      day: '2026-11-14',
      level: 'words',
      hidden: false,
      from,
      to: to - 1,
      secs: 60,
      mistakes: 1,
      tajweed: 0,
      unclear: 0,
      accuracy: 0.9,
      marks: [wrong(A23 + 12, 'old:word')],
      passed: [],
      recordingId: null,
    });
    setReciteCheckSettings('u1', { noticeSeen: true, mode: 'recite', markMistakes: true });
    await open();
    await flush();
    expect(screen.queryByTestId('cover-past-word')).toBeNull();
    fireEvent.press(screen.getByTestId('reader-eye'));
    await settle(() => expect(screen.getByTestId('cover-past-word')).toBeTruthy());
    // During a take, before the word is recited.
    fireEvent.press(screen.getByTestId('recite-mic'));
    await flush();
    await flush();
    await event({ type: 'ready', take: 't1', protocol: 6 });
    await event({ type: 'locked', w: A23, s: 27, a: 23 });
    expect(screen.getByTestId('cover-past-word')).toBeTruthy();
    // Show past mistakes off: none.
    await act(async () => setReciteCheckSettings('u1', { showPast: false }));
    expect(screen.queryByTestId('cover-past-word')).toBeNull();
  });
});

describe('Majd’s Nov 21 asks: Pause keeps the take, the score opens what it has found, a hidden page’s mistakes open (Revisely Dev)', () => {
  const { remember, resetMemoryForTests } = jest.requireActual('../../../lib/reciteMemory/store');
  const wrong = (w: number, id = `${w}:word:sound`) => ({ id, w, ayah: [27, 23], kind: 'word', heard: 'كذا', sure: 'clear' });
  const tapWord = (w: number) => {
    const { wordBox } = require('../../../lib/reciteLive/geometry');
    const b = wordBox(words, w);
    return act(async () => {
      mockPager.onTapPoint?.(379, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (r: { x0: number; y0: number; x1: number; y1: number }) => ({
        x: r.x0,
        y: r.y0 + 100,
        width: r.x1 - r.x0,
        height: r.y1 - r.y0,
      }));
    });
  };

  it('[RECITE-16] Pause asks the connection to hold the take open, Resume lets it go; no summary meanwhile', async () => {
    await startTake('check');
    await act(async () => fireEvent.press(screen.getByTestId('recite-pause')));
    expect(mockLive.sent).toContainEqual({ hold: true });
    expect(screen.queryByTestId('take-summary')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('recite-resume')));
    expect(mockLive.sent).toContainEqual({ hold: false });
    expect(screen.queryByTestId('take-summary')).toBeNull();
  });

  it('[RECITE-17] the score during a take opens what it has found so far, Done only, and the take goes on; after it, the summary again', async () => {
    const summaryVisible = () => screen.UNSAFE_getAllByType(Sheet).find((x) => x.props.testID === 'take-summary')?.props.visible;
    await startTake('check');
    await event({ type: 'said', upTo: A23 + 8 });
    await event({ type: 'mark', mark: wrong(A23 + 6) as never });
    fireEvent.press(screen.getByTestId('recite-score-tap'));
    await flush();
    expect(screen.getByTestId('take-summary')).toBeTruthy();
    expect(screen.getByTestId('take-summary-finding-word')).toBeTruthy();
    expect(screen.queryByTestId('take-summary-again')).toBeNull();
    expect(screen.queryByTestId('take-summary-more')).toBeNull();
    expect(mockLive.sent).not.toContainEqual(expect.objectContaining({ type: 'end' }));
    fireEvent.press(screen.getByTestId('take-summary-done'));
    await flush();
    // Asked to close (whether iOS has finished its animation and turn is the sheet's business, SHEET-1).
    expect(summaryVisible()).toBe(false);
    expect(screen.getByTestId('recite-stop')).toBeTruthy();
    // Stopped and answered: the summary; closed, the score opens it again.
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, secs: 12, marks: [wrong(A23 + 6) as never], score: null } });
    expect(screen.getByTestId('take-summary-again')).toBeTruthy();
    fireEvent.press(screen.getByTestId('take-summary-done'));
    await flush();
    // Asked to close (whether iOS has finished its animation and turn is the sheet's business, SHEET-1).
    expect(summaryVisible()).toBe(false);
    fireEvent.press(screen.getByTestId('recite-score-tap'));
    await flush();
    expect(screen.getByTestId('take-summary-again')).toBeTruthy();
  });

  it('[RECITE-13] a past mistake on a hidden page’s cover opens its card', async () => {
    // Earlier tests’ takes are written again 800 ms after their recording: let them land, then start empty.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2000));
    });
    resetMemoryForTests();
    await AsyncStorage.clear();
    const [from, to] = words.pageRange(379);
    await remember('u1', {
      id: 'mem-1',
      kind: 'take',
      take: 'old',
      createdAt: Date.UTC(2026, 10, 14, 18),
      rev: Date.UTC(2026, 10, 14, 18),
      day: '2026-11-14',
      level: 'words',
      hidden: false,
      from,
      to: to - 1,
      secs: 60,
      mistakes: 1,
      tajweed: 0,
      unclear: 0,
      accuracy: 0.9,
      marks: [wrong(A23 + 12, 'old:word')],
      passed: [],
      recordingId: null,
    });
    setReciteCheckSettings('u1', { noticeSeen: true, mode: 'recite', markMistakes: true });
    await open();
    await flush();
    fireEvent.press(screen.getByTestId('reader-eye'));
    await settle(() => expect(screen.getByTestId('cover-past-word')).toBeTruthy());
    await tapWord(A23 + 12);
    expect(screen.getByTestId('past-card-layer')).toBeTruthy();
  });
});

describe('a refused or failed microphone says so (Majd’s Android store build, Nov 22 2026: a tap did nothing)', () => {
  it('[RECITE-1] refused: "Microphone access is off" with Open Settings; failing to start: a short message', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const audio = jest.requireMock('expo-audio');
    audio.getRecordingPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    setReciteCheckSettings('u1', { noticeSeen: true, mode: 'recite', markMistakes: true });
    await open();
    fireEvent.press(screen.getByTestId('recite-mic'));
    await flush();
    await flush();
    expect(alert).toHaveBeenCalledWith('Microphone access is off', expect.stringContaining('Settings'), expect.any(Array));
    const buttons = alert.mock.calls[0][2] as { text: string }[];
    expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Open Settings']);
    // Allowed, but the microphone can't start.
    alert.mockClear();
    audio.getRecordingPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false });
    const mic = jest.requireMock('../../../lib/recite/micSource');
    mic.startMicStream.mockRejectedValueOnce(new Error('busy'));
    fireEvent.press(screen.getByTestId('recite-mic'));
    await flush();
    await flush();
    expect(alert).toHaveBeenCalledWith('Couldn’t start the microphone. Try again.');
    alert.mockRestore();
  });
});

describe('the audio 4:1 (contract "ADPCM uplink", Nov 22 2026)', () => {
  it('[RECITE-5] Revisely Dev’s start frame asks to send the audio as ADPCM (the checker’s ready decides)', async () => {
    await startTake('check');
    expect(mockLive.start).toMatchObject({ audio: 'adpcm' });
  });
});

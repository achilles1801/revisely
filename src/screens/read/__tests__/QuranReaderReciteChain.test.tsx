// A recitation past the checker's 15 minutes (Revisely Dev, RECITE-22): the reader chains takes and shows one. The mocks
// are QuranReaderRecite.test's, but the checker's socket keeps every connection, so the test can speak for each take.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QuranReaderScreen from '../QuranReaderScreen';
import { resetReciteCheckSettingsForTests, setReciteCheckSettings } from '../../../lib/reciteCheck/settings';
import type { LiveEvent, Mark } from '../../../lib/reciteLive/contract';
import { setMistakeDetectionReleasedForTests } from '../../../lib/release/mistakeDetection';
import { setStopBudgetForTests } from '../../../components/reciteLive/useLiveRecitation';

afterEach(() => setMistakeDetectionReleasedForTests(undefined));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
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

// The page: draws what the screen puts behind and over it (page 379), so the test can see the marks and tap them.
const mockPager: {
  onTapPoint?: (page: number, x: number, y: number, toWindow: (r: { x0: number; y0: number; x1: number; y1: number }) => unknown) => boolean;
} = {};
jest.mock('../../../components/MushafPager', () => {
  const { Pressable, View } = require('react-native');
  const React = require('react');
  return {
    MushafPager: React.forwardRef(
      (
        props: {
          onTap?: () => void;
          onPageChange?: (page: number) => void;
          onTapPoint?: (page: number, x: number, y: number, toWindow: (r: unknown) => unknown) => boolean;
          pageUnderlay?: (page: number, scale: number) => React.ReactNode;
          pageOverlay?: (page: number, scale: number, image: unknown) => React.ReactNode;
          pageAccessories?: (page: number, scale: number) => React.ReactNode;
        },
        ref: React.Ref<{ scrollToPage: (p: number) => boolean }>,
      ) => {
        mockPager.onTapPoint = props.onTapPoint as never;
        React.useImperativeHandle(ref, () => ({ scrollToPage: (p: number) => (props.onPageChange?.(p), true) }));
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
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn(), push: jest.fn() }),
  useRoute: () => ({ key: 'QuranReader-1', name: 'QuranReader', params: { pageNumber: 379 } }),
  useIsFocused: () => true,
}));
jest.mock('../../../navigation/navigationRef', () => ({ navigateToActivityDay: jest.fn() }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../lib/variant', () => ({ ...jest.requireActual('../../../lib/variant'), isDevVariant: () => true }));
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
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ user: { previewTester: true, id: 'u1' }, pages: [], saveUser: jest.fn() }) }));
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
    start: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    finish: jest.fn(async () => undefined),
  }),
}));
jest.mock('../../../hooks/useKeepScreenOn', () => ({ useKeepScreenOn: () => {} }));
jest.mock('../../../lib/readingHistory', () => ({ appendReadingHistory: jest.fn() }));

// The microphone streams; the word data is the fixture (read at once, as once it has loaded on a phone).
let mockMic: { onAudio: (s: Int16Array) => void; onStop: (r: string) => void } | null = null;
const mockMicStops = { count: 0 };
jest.mock('../../../lib/recite/micSource', () => ({
  isMicStreamAvailable: () => true,
  startMicStream: jest.fn(async (h: never) => {
    mockMic = h;
    return { stop: jest.fn(async () => void mockMicStops.count++) };
  }),
}));
jest.mock('../../../lib/recite/quranWords', () => {
  const actual = jest.requireActual('../../../lib/recite/quranWords');
  const fixture = () => require('../../../lib/recite/__fixtures__/quranWords').quranWords();
  return { ...actual, loadQuranWords: async () => fixture(), getQuranWords: () => fixture() };
});

// The checker: every take's connection, each with what it was sent (audio after `end` goes nowhere, as on the socket).
interface MockConn {
  start: Record<string, unknown>;
  onEvent: (e: LiveEvent) => void;
  sent: { type?: string; id?: string }[];
  audio: number;
  closed: boolean;
}
const mockConns: MockConn[] = [];
jest.mock('../../../lib/reciteCheck/service', () => ({
  ...jest.requireActual('../../../lib/reciteCheck/service'),
  warmUpReciteCheck: jest.fn(),
  sendLabel: jest.fn(async () => true),
}));
jest.mock('../../../lib/reciteLive/socket', () => ({
  socketFeed: () => (start: Record<string, unknown>, handlers: { onEvent: (e: LiveEvent) => void; onClose: () => void }) => {
    const c: MockConn = { start, onEvent: handlers.onEvent, sent: [], audio: 0, closed: false };
    mockConns.push(c);
    return {
      sendAudio: (pcm: Int16Array) => {
        if (!c.sent.some((f) => f.type === 'end')) c.audio += pcm.length;
      },
      send: (f: { type?: string }) => c.sent.push(f),
      hold: () => undefined,
      close: () => {
        c.closed = true;
      },
      audioClip: (from: number, to: number) => new Int16Array(Math.max(0, Math.round((to - from) * 16000))),
    };
  },
}));
jest.mock('../../../lib/reciteLive/mistakeCue', () => ({
  ...jest.requireActual('../../../lib/reciteLive/mistakeCue'),
  playCueSound: jest.fn(),
  playCueTap: jest.fn(),
}));
jest.mock('../../../lib/reciteLive/clipFile', () => ({ writeClip: jest.fn(() => 'file:///cache/recite-your-recitation.wav') }));
jest.mock('../../../lib/earlyAccess', () => ({ ...jest.requireActual('../../../lib/earlyAccess'), useEarlyAccess: () => false }));
jest.mock('../../../lib/premium', () => ({
  usePremium: () => ({ has: true, known: true, grant: null }),
  setDevPremium: jest.fn(async () => true),
  supportLinkUrl: jest.fn(async () => 'https://dev.revisely.app/apply/#c=one-time'),
  premiumErrorText: () => 'Something went wrong. Try again.',
}));
// The take's recording: one for the whole recitation, across its takes.
const mockTake = { started: 0, added: 0, finished: 0, clips: [] as [number, number][] };
jest.mock('../../../lib/reciteLive/takeRecording', () => ({
  startTakeRecording: (opts: { day: string; page: number }) => {
    mockTake.started += 1;
    return {
      add: (pcm: Int16Array) => (mockTake.added += pcm.length),
      pageAt: () => undefined,
      clip: (from: number, to: number) => (mockTake.clips.push([from, to]), new Int16Array(Math.round((to - from) * 16000))),
      finish: async () => {
        mockTake.finished += 1;
        return { day: opts.day, recordingId: 'rec-1' };
      },
    };
  },
}));
// Recite's memory: what the reader keeps of the recitation.
const mockMemory: { remembered: { kind?: string; links?: unknown; marks?: Mark[]; take?: string | null; from?: number; to?: number }[] } = { remembered: [] };
jest.mock('../../../lib/reciteMemory/store', () => ({
  useMemoryRecords: () => [],
  remember: jest.fn(async (_uid: string, r: never) => {
    mockMemory.remembered.push(r);
  }),
}));

const words = require('../../../lib/recite/__fixtures__/quranWords').quranWords();
const A23 = words.verseFirstWord(27, 23);
const A24 = words.verseFirstWord(27, 24);
const SR = 16000;

const flush = () => act(async () => {});
const say = (c: MockConn, e: LiveEvent) => act(async () => c.onEvent(e));
/** `secs` of the microphone's audio, a minute at a time. */
async function recite(secs: number) {
  for (let left = secs; left > 0; left -= 60) {
    const n = Math.min(60, left);
    await act(async () => mockMic!.onAudio(new Int16Array(n * SR)));
  }
}
const wrong = (w: number): Mark => ({ id: `${w}:word:sound`, w, ayah: [27, words.ref(w).ayah], kind: 'word', detail: 'sound', heard: 'كذا', heardExact: false, sure: 'clear' });
const doneOf = (take: string, start: number, marks: Mark[], why: 'end' | 'too_long' = 'end', secs = 900): LiveEvent => ({
  type: 'done',
  result: { v: 2, take, from: start, to: start + 40, secs, marks, score: { reached: 20, mistakes: marks.length, tajweed: 0, unclear: 0, accuracy: 1 - marks.length / 20 }, start, why },
});
/** A tap on a word of page 379 (its card, when it has a mark). */
function tapWord(w: number) {
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
}
/** After Stop the summary: by itself, or (Majd's quiet end) a tap on the bar's result. */
async function openSummary() {
  const result = screen.queryByTestId('recite-result');
  if (result) fireEvent.press(result);
  await flush();
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockConns.length = 0;
  mockMic = null;
  mockMicStops.count = 0;
  mockTake.started = 0;
  mockTake.added = 0;
  mockTake.finished = 0;
  mockTake.clips = [];
  mockMemory.remembered = [];
  setStopBudgetForTests(300);
  resetReciteCheckSettingsForTests();
  await AsyncStorage.clear();
  jest.requireMock('expo-audio').getRecordingPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false });
});
afterEach(() => setStopBudgetForTests());

/** A take with Mark mistakes from An-Naml 23, its first mistake on page 379 already shown. */
async function startLong() {
  setReciteCheckSettings('u1', { noticeSeen: true, mode: 'recite', markMistakes: true });
  render(<QuranReaderScreen />);
  await flush();
  await flush();
  fireEvent.press(screen.getByLabelText('The page'));
  fireEvent.press(screen.getByTestId('recite-mic'));
  await flush();
  await flush();
  const a = mockConns[0];
  await say(a, { type: 'ready', take: 'take-a', protocol: 9, said: 'voice' });
  await say(a, { type: 'locked', w: A23, s: 27, a: 23 });
  await say(a, { type: 'mark', mark: wrong(A23 + 4) });
  await say(a, { type: 'at', w: A23 + 8 });
  await say(a, { type: 'said', upTo: A23 + 7 });
  expect(screen.getAllByTestId('live-mark-word')).toHaveLength(1);
  return a;
}

describe('[RECITE-22] a recitation past the checker’s 15 minutes is one take on the screen', () => {
  it('the checker’s cap (done, too_long) starts the next take at once, with no tap: the bar listens on, the clock runs on, the marks stay', async () => {
    const a = await startLong();
    await recite(890);
    // Mid-word at 14:50: not yet.
    expect(mockConns).toHaveLength(1);
    await say(a, doneOf('take-a', A23, [wrong(A23 + 4)], 'too_long'));
    expect(mockConns).toHaveLength(2);
    const b = mockConns[1];
    // The next take starts on the page on screen, looking for the reciter there and in the whole Qur'an.
    expect(b.start).toMatchObject({ type: 'start', s: 27, a: 23, startBy: expect.any(Array), startIn: 'quran', guess: true });
    expect(b.start.resume).toBeUndefined();
    // The checker ended the first take itself: the phone sends it nothing more.
    expect(a.sent.some((f) => f.type === 'end')).toBe(false);
    // One recitation on the screen: no result, no summary; the bar listens (Pause) with the first take's words and marks.
    expect(screen.queryByTestId('take-summary')).toBeNull();
    expect(screen.queryByTestId('recite-result')).toBeNull();
    expect(screen.getByTestId('recite-pause')).toBeTruthy();
    expect(screen.getByTestId('recite-words')).toBeTruthy();
    expect(screen.getAllByTestId('live-mark-word')).toHaveLength(1);
    expect(mockMicStops.count).toBe(0);
    // The microphone goes on, into the next take; the clock past 15:00.
    await recite(20);
    expect(a.audio).toBe(890 * SR);
    expect(b.audio).toBe(20 * SR);
    expect(screen.getByTestId('recite-time').props.children).toBe('15:10');
    // The next take finds the reciter and marks a mistake: both takes' marks on the page.
    await say(b, { type: 'ready', take: 'take-b', protocol: 9, said: 'voice' });
    await say(b, { type: 'locked', w: A23 + 9, s: 27, a: 23 });
    await say(b, { type: 'mark', mark: wrong(A24 + 1) });
    await say(b, { type: 'at', w: A24 + 3 });
    expect(screen.getAllByTestId('live-mark-word')).toHaveLength(2);
    // Stop ends the recitation: the last take's end, its answer, and one summary for all of it.
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    expect(b.sent.some((f) => f.type === 'end')).toBe(true);
    expect(mockConns).toHaveLength(2);
    await say(b, doneOf('take-b', A23 + 9, [wrong(A24 + 1)], 'end', 20));
    await openSummary();
    expect(screen.getByTestId('take-summary')).toBeTruthy();
    expect(String(screen.getByTestId('take-summary-passage').props.children)).toMatch(/^An.Naml,\sayahs\s23.24\s·\s/);
    // One recording for the recitation, and Recite's memory keeps one take, with each link's checker take.
    expect(mockTake.started).toBe(1);
    expect(mockTake.added).toBe(910 * SR);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 900));
    });
    const takes = mockMemory.remembered.filter((r) => r.kind === 'take');
    expect(new Set(takes.map((r) => (r as { id?: string }).id)).size).toBe(1);
    expect(takes.at(-1)).toMatchObject({
      take: 'take-a',
      from: A23,
      links: [
        { take: 'take-a', from: A23 },
        { take: 'take-b', from: A23 + 9 },
      ],
    });
    expect(takes.at(-1)!.marks!.map((m) => m.w)).toEqual([A23 + 4, A24 + 1]);
  });

  it('before the cap, at a pause after an ayah: the take ends there and the next carries on from the next sample, none sent twice or lost', async () => {
    const a = await startLong();
    const { warmUpReciteCheck } = jest.requireMock('../../../lib/reciteCheck/service');
    await recite(805);
    const warmed = (warmUpReciteCheck as jest.Mock).mock.calls.length;
    // At 13:30 the next take's instance is woken, once.
    await recite(10);
    expect(warmUpReciteCheck).toHaveBeenCalledTimes(warmed + 1);
    await recite(30);
    expect(warmUpReciteCheck).toHaveBeenCalledTimes(warmed + 1);
    // At a pause mid-ayah: not an ayah's end.
    await say(a, { type: 'at', w: A23 + 9 });
    await say(a, { type: 'said', upTo: A23 + 9 });
    await recite(1);
    expect(mockConns).toHaveLength(1);
    // The ayah's last word, the voice stopped: the take rolls over with the next frame.
    await say(a, { type: 'at', w: A24 - 1 });
    await say(a, { type: 'said', upTo: A24 - 1 });
    await recite(1);
    expect(mockConns).toHaveLength(2);
    expect(a.sent.filter((f) => f.type === 'end')).toHaveLength(1);
    const b = mockConns[1];
    await recite(30);
    expect(a.audio).toBe(847 * SR);
    expect(b.audio).toBe(30 * SR);
    expect(a.audio + b.audio).toBe(mockTake.added);
    // Until the next take finds the place, the cursor stays where the reciter was: the bar keeps its words.
    expect(screen.getByTestId('recite-words')).toBeTruthy();
    // The first take's answer comes after the next has begun: the recitation listens on.
    await say(a, doneOf('take-a', A23, [wrong(A23 + 4)], 'end', 847));
    expect(screen.getByTestId('recite-pause')).toBeTruthy();
    expect(screen.queryByTestId('take-summary')).toBeNull();
    expect(screen.getAllByTestId('live-mark-word')).toHaveLength(1);
  });

  it('Not a mistake on the first take’s marks, after the roll-over, goes to that take: on its connection, or by its id once answered', async () => {
    const a = await startLong();
    await say(a, { type: 'mark', mark: wrong(A23 + 6) });
    await recite(850);
    await say(a, { type: 'at', w: A24 - 1 });
    await say(a, { type: 'said', upTo: A24 - 1 });
    await recite(1);
    expect(mockConns).toHaveLength(2);
    const b = mockConns[1];
    const { sendLabel } = jest.requireMock('../../../lib/reciteCheck/service');
    // Its audio isn't held in memory any more: Your recitation reads it back from the recording, in the chain's seconds.
    await tapWord(A23 + 4);
    await act(async () => fireEvent.press(screen.getByTestId('mark-card-yours')));
    expect(mockTake.clips.length).toBe(1);
    expect(mockTake.clips[0][1]).toBeLessThan(851);
    // Its answer still to come: Not a mistake on its own connection, never the next take's.
    fireEvent.press(screen.getByTestId('mark-card-dismiss'));
    await flush();
    expect(a.sent).toContainEqual({ type: 'dismiss', id: wrong(A23 + 4).id });
    expect(b.sent.some((f) => f.type === 'dismiss')).toBe(false);
    expect(screen.getAllByTestId('live-mark-word')).toHaveLength(1);
    // Answered: the lab's label goes over HTTP by the first take's id (the take was kept as test data).
    await say(a, doneOf('take-a', A23, [wrong(A23 + 4), wrong(A23 + 6)], 'end', 851));
    expect(screen.getAllByTestId('live-mark-word')).toHaveLength(1);
    await tapWord(A23 + 6);
    fireEvent.press(screen.getByTestId('mark-card-dismiss'));
    await flush();
    expect(sendLabel).toHaveBeenCalledWith('dismiss', 'take-a', wrong(A23 + 6).id, expect.any(Number));
    expect(b.sent.some((f) => f.type === 'dismiss')).toBe(false);
    expect(screen.queryByTestId('live-mark-word')).toBeNull();
  });

  it('Stop before the roll-over ends the take: no next take, even if the checker’s cap comes with the answer', async () => {
    const a = await startLong();
    await recite(850);
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    expect(a.sent.some((f) => f.type === 'end')).toBe(true);
    await say(a, doneOf('take-a', A23, [wrong(A23 + 4)], 'too_long', 850));
    await recite(10);
    expect(mockConns).toHaveLength(1);
    await openSummary();
    expect(screen.getByTestId('take-summary')).toBeTruthy();
  });
});

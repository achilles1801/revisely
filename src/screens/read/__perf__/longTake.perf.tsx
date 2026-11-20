// A profile of a long take on the real reader (long takes, Nov 20 2026), not part of the test run: what each checker
// event and microphone frame costs, minute by minute, for TAKE_MINUTES (10 by default). Majd's 3.5-minute take of
// Nov 19 lagged; this showed the phone's cost per event flat from minute 1 to 10 (about 3.5 ms in Jest), so what grew
// was elsewhere (a resume's replay, a quiet connection). Run it with
//   TAKE_MINUTES=10 npx jest --testRegex 'longTake\.perf\.tsx$' --testPathIgnorePatterns /node_modules/
// and REAL_PAGER=1 to draw the real MushafPager instead of a stand-in. The mocks are QuranReaderRecite.test's.
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
  /** The verses it highlights (a search result, a held verse, an ayah a take slipped into). */
  highlighted?: unknown;
  onPageChange?: (page: number) => void;
  onTapVerse?: (a: unknown) => boolean;
  onTapPoint?: (page: number, x: number, y: number, toWindow: (r: { x0: number; y0: number; x1: number; y1: number }) => unknown) => boolean;
  page?: number;
  setShown?: (p: number) => void;
} = { scrolled: [] };
jest.mock('../../../lib/pageCache', () =>
  process.env.REAL_PAGER
    ? {
        ...jest.requireActual('../../../lib/pageCache'),
        getCachedPageUri: () => 'file:///p.png',
        cachePage: () => Promise.resolve('file:///p.png'),
        evictCachedPage: () => false,
        prefetchPages: jest.fn(),
        pagesAround: (pages: number[]) => pages.slice(0, 1),
      }
    : jest.requireActual('../../../lib/pageCache'),
);
jest.mock('../../../components/MushafPager', () => {
  if (process.env.REAL_PAGER) return jest.requireActual('../../../components/MushafPager');
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
        const [shown, setShown] = React.useState(mockPager.page ?? 379);
        mockPager.setShown = setShown;
        React.useImperativeHandle(ref, () => ({
          scrollToPage: (p: number) => (mockPager.scrolled.push(p), setShown(p), props.onPageChange?.(p), true),
        }));
        return (
          <View>
            <Pressable accessibilityLabel="The page" onPress={props.onTap} />
            {[shown - 1, shown, shown + 1].map((page) => (
              <View key={page}>
                {props.pageUnderlay?.(page, 0.38)}
                {props.pageOverlay?.(page, 0.38, { uri: 'file:///p.png', width: 389, height: 629 })}
                {props.pageAccessories?.(page, 0.38)}
              </View>
            ))}
          </View>
        );
      },
    ),
  };
});
const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
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
const event = (e: LiveEvent) => act(async () => mockLive.onEvent?.(e));

beforeEach(async () => {
  mockState.user = { previewTester: true, id: 'u1' };
  mockState.dev = true;
  mockPremium.has = true;
  resetReciteCheckSettingsForTests();
  await AsyncStorage.clear();
  const audio = jest.requireMock('expo-audio');
  audio.getRecordingPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false });
});

const { Profiler } = React;

/**
 * A long take on the real reader, the checker's events at Majd's cadence (Nov 19: ~1.7 a second, a word every ~1.1 s)
 * and the microphone's frames at 10 a second, in the hidden view with Mark mistakes. Measures, per minute of the take:
 * React commits, their render time, and how long each event and each audio frame held the JavaScript thread.
 */
it('a 10-minute take: what each event and frame costs, minute by minute', async () => {
  const minutes = Number(process.env.TAKE_MINUTES ?? 10);
  mockRoute.params = { pageNumber: 3 };
  mockPager.page = 3;
  setReciteCheckSettings('u1', { noticeSeen: true, mode: 'recite', markMistakes: true });
  const commits: { at: number; ms: number }[] = [];
  let now = 0;
  render(
    <Profiler id="reader" onRender={(_id, _phase, actual) => commits.push({ at: now, ms: actual })}>
      <QuranReaderScreen />
    </Profiler>,
  );
  await flush();
  await flush();
  const thePage = screen.queryByLabelText('The page') ?? screen.queryAllByLabelText('Page 3')[0];
  if (thePage) fireEvent.press(thePage);
  fireEvent.press(screen.getByTestId('recite-mic'));
  await flush();
  await flush();
  await event({ type: 'ready', take: 't1', protocol: 7 });
  const start = words.verseFirstWord(2, 6);
  await event({ type: 'locked', w: start, s: 2, a: 6 });
  fireEvent.press(screen.getByTestId('recite-eye'));
  await flush();

  const frame = new Int16Array(1600);
  const perMinute: { events: number; eventMs: number; frames: number; frameMs: number; worst: number }[] = [];
  let w = start;
  let mistakes = 0;
  let nextWordAt = 1.1;
  for (let tenth = 0; tenth < minutes * 600; tenth++) {
    now = tenth / 10;
    const m = Math.floor(now / 60);
    perMinute[m] ??= { events: 0, eventMs: 0, frames: 0, frameMs: 0, worst: 0 };
    const b = perMinute[m];
    let t0 = performance.now();
    await act(async () => mockMic?.onAudio(frame));
    let dt = performance.now() - t0;
    b.frames++;
    b.frameMs += dt;
    b.worst = Math.max(b.worst, dt);
    if (now >= nextWordAt) {
      nextWordAt += 1.1;
      w++;
      const r = words.ref(w);
      const evs: LiveEvent[] = [{ type: 'at', w }, { type: 'said', upTo: w - 2 }];
      if (w % 37 === 0) {
        mistakes++;
        evs.push({ type: 'mark', mark: { id: `${w - 2}:word:`, w: w - 2, ayah: [r.sura, r.ayah], kind: 'word', heard: 'كذا', sure: 'clear' } as never });
      }
      evs.push({ type: 'score', score: { reached: w - start, mistakes, tajweed: 0, accuracy: 1 - mistakes / Math.max(1, w - start) } } as never);
      const [vf] = words.verseRange(r.sura, r.ayah);
      if (vf === w) evs.push({ type: 'ayah', s: r.sura, a: r.ayah - 1 } as never);
      for (const e of evs) {
        t0 = performance.now();
        await event(e);
        dt = performance.now() - t0;
        b.events++;
        b.eventMs += dt;
        b.worst = Math.max(b.worst, dt);
      }
    }
  }
  const rows = perMinute.map((b, i) => {
    const c = commits.filter((x) => x.at >= i * 60 && x.at < (i + 1) * 60);
    return {
      minute: i + 1,
      page: '',
      events: b.events,
      'ms/event': +(b.eventMs / Math.max(1, b.events)).toFixed(1),
      'ms/frame': +(b.frameMs / b.frames).toFixed(2),
      commits: c.length,
      'render ms/commit': +(c.reduce((n, x) => n + x.ms, 0) / Math.max(1, c.length)).toFixed(1),
      'busy % of the minute': +(((b.eventMs + b.frameMs) / 60000) * 100).toFixed(1),
      worst: +b.worst.toFixed(0),
    };
  });
  // eslint-disable-next-line no-console
  console.log(`last word ${w} on page ${words.pageOf(w)}\n` + JSON.stringify(rows, null, 1));
}, 1_800_000);

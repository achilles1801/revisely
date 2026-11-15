// The reader's one mic (Revisely Dev): Record, Recite, Check; the recite bar; marks and the hidden view.
import React from 'react';
import { AccessibilityInfo, Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QuranReaderScreen from '../QuranReaderScreen';
import { resetReciteCheckSettingsForTests, setReciteCheckSettings } from '../../../lib/reciteCheck/settings';
import type { LiveEvent } from '../../../lib/reciteLive/contract';
import { versesOnPage } from '../../../lib/ayahBounds';

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
const mockLive: { start?: Record<string, unknown>; onEvent?: (e: LiveEvent) => void; onClose?: () => void; sent: unknown[]; audio: number } = {
  sent: [],
  audio: 0,
};
jest.mock('../../../lib/reciteCheck/service', () => ({ ...jest.requireActual('../../../lib/reciteCheck/service'), warmUpReciteCheck: jest.fn() }));
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

beforeEach(async () => {
  jest.clearAllMocks();
  mockState.user = { previewTester: true, id: 'u1' };
  mockState.dev = true;
  mockLive.sent = [];
  mockLive.audio = 0;
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

describe('a take kept as a recording (Save recordings, on by default)', () => {
  it('the red dot while it records; Stop keeps it, and once the take is closed: Recording saved · View', async () => {
    await startTake('recite');
    await act(async () => mockMic!.onAudio(new Int16Array(16000)));
    expect(mockTake.started?.page).toBe(379);
    expect(mockTake.started?.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mockTake.added).toBe(16000);
    expect(screen.getByTestId('recite-recording')).toBeTruthy();
    fireEvent.press(screen.getByTestId('recite-stop'));
    await flush();
    expect(mockTake.finished).toBe(1);
    // Not while the checker still answers, nor over the summary or the recite bar.
    expect(screen.queryByText('Recording saved')).toBeNull();
    await event({ type: 'done', result: { v: 2, take: 't1', from: A23, to: A23 + 10, secs: 12, marks: [], score: null } });
    expect(screen.getByTestId('take-summary')).toBeTruthy();
    expect(screen.queryByText('Recording saved')).toBeNull();
    fireEvent.press(screen.getByTestId('take-summary-done'));
    await flush();
    expect(screen.queryByText('Recording saved')).toBeNull();
    fireEvent.press(screen.getByTestId('recite-close'));
    await flush();
    expect(screen.getByText('Recording saved')).toBeTruthy();
    fireEvent.press(screen.getByText('View'));
    const { navigateToActivityDay } = jest.requireMock('../../../navigation/navigationRef');
    expect(navigateToActivityDay).toHaveBeenCalledWith(mockTake.started?.day, 'rec-1');
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

  it('Recite again: the next take starts at once, and the note waits for its end', async () => {
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
  it('a wrong word is marked on the page and shows red, as heard, in the bar; the score by the page', async () => {
    await startTake('check');
    expect(mockLive.start).toMatchObject({ follow: false });
    expect(screen.getByTestId('recite-score')).toBeTruthy();
    await event({ type: 'said', upTo: UTIYAT });
    await event({ type: 'mark', mark: { id: 'a', w: UTIYAT, ayah: [27, 23], kind: 'word', sure: 'likely', heard: 'وَأُوهِيَتْ', heardExact: false } });
    await event({ type: 'at', w: UTIYAT + 1 });
    expect(screen.getByTestId('live-ink-word')).toBeTruthy();
    expect(screen.getByTestId('live-mark-word').props.accessibilityLabel).toBe('Wrong word, وَأُوتِيَتْ');
    expect(screen.getByText('99.2%')).toBeTruthy();
    expect(screen.getByText('وَأُوهِيَتْ')).toBeTruthy();
    await event({ type: 'mark', mark: { id: 'b', w: A23 + 7, ayah: [27, 23], kind: 'harakat', sure: 'clear', slip: { expected: 'ٍ', heard: 'ٌّ' } } });
    expect(screen.getByText('98.5%')).toBeTruthy();
    expect(screen.getByTestId('live-mark-harakat')).toBeTruthy();
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
    expect(screen.queryAllByTestId('live-ayah-band')).toHaveLength(0);
    expect(screen.queryByTestId('recite-score')).toBeNull();
  });

  it('found in the middle of the page: the cursor shows there, the score begins there, VoiceOver hears where; the page stays', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await startTake('check', null);
    await event({ type: 'locked', w: A25, s: 27, a: 25 });
    expect(screen.getByTestId('live-word-box')).toBeTruthy();
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
    await startTake('recite', null);
    expect(screen.getByTestId('recite-status').props.children).toBe('Listening…');
    fireEvent.press(screen.getByTestId('recite-stop'));
    await done({ start: null });
    await flush();
    expect(screen.queryByTestId('take-summary')).toBeNull();
    expect(screen.queryByTestId('recite-bar')).toBeNull();
    expect(screen.getByTestId('recite-mic')).toBeTruthy();
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


  it('‹ on a hidden page after a start mid-page shows the word after the reciter’s, not the page’s first', async () => {
    await startTake('recite', null);
    await event({ type: 'locked', w: A25, s: 27, a: 25 });
    fireEvent.press(screen.getByTestId('recite-eye'));
    fireEvent.press(screen.getByTestId('recite-next-word'));
    // The word being recited shows already (as from the page's top); An-Naml 23 and 24 stay hidden.
    expect(mockLive.sent).toEqual([{ type: 'hint', w: A25 + 1, what: 'word' }]);
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
    // The checker is told (contract draft 5): a shown word counts as helped, never as a mistake for being shown.
    const [from, to] = words.verseRange(27, 23);
    expect(mockLive.sent).toEqual([
      { type: 'hint', w: from, what: 'ayah' },
      { type: 'hint', w: to, what: 'word' },
    ]);
    fireEvent.press(screen.getByTestId('recite-eye'));
    expect(screen.queryByTestId('hidden-page-379')).toBeNull();
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
    // Both marks on the word, each with its own Not a mistake.
    expect(screen.getByTestId('mark-card-tajweed')).toBeTruthy();
    // Similar phrases: An-Naml 16 reads almost the same.
    expect(screen.getByTestId('mark-card-similar')).toBeTruthy();
    const play = jest.spyOn(require('../../../lib/recitation').getRecitation(), 'play').mockImplementation(() => undefined);
    fireEvent.press(screen.getByTestId('mark-card-hear'));
    expect(play).toHaveBeenCalledWith({ sura: 27, ayah: 23 }, expect.any(Function));
    play.mockRestore();
    fireEvent.press(screen.getAllByTestId('mark-card-dismiss')[0]);
    expect(mockLive.sent).toContainEqual({ type: 'dismiss', id: 'a' });
    expect(screen.queryByTestId('live-mark-word')).toBeNull();
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
    // Keep as test data is on by default: the take went to be kept, and the summary says so.
    expect(screen.getByText('Kept as test data. Software checks it; nobody listens.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('take-summary-done'));
    expect(screen.getByTestId('recite-close')).toBeTruthy();
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
    expect(screen.getByText('Part of Premium. Following along stays free. It’s AI and can make mistakes.')).toBeTruthy();
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

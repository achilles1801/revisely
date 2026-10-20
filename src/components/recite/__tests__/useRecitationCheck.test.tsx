import { act, renderHook } from '@testing-library/react-native';
import { Alert, AppState } from 'react-native';
import { quranWords, say, verse } from '../../../lib/recite/__fixtures__/quranWords';

const mockModelPath = jest.fn<string | null, []>(() => '/models/model.bin');
jest.mock('../../../lib/recite/speechModel', () => ({ downloadedModelPath: () => mockModelPath() }));

let mockHeard: string[] = [];
const mockCloseEngine = jest.fn();
jest.mock('../../../lib/recite/speechEngine', () => ({
  openSpeechEngine: jest.fn(async () => ({ transcribe: async () => mockHeard.shift() ?? '' })),
  closeSpeechEngine: () => mockCloseEngine(),
}));

let mockHandlers: { onAudio: (s: Int16Array) => void; onStop: (r: string) => void } | null = null;
const mockSourceStop = jest.fn(async () => undefined);
let mockStartGate: Promise<void> = Promise.resolve();
jest.mock('../../../lib/recite/micSource', () => ({
  isMicStreamAvailable: () => true,
  startMicStream: jest.fn(async (h: any) => {
    await mockStartGate;
    mockHandlers = h;
    return { stop: mockSourceStop };
  }),
}));

jest.mock('../../../lib/recite/quranWords', () => {
  const actual = jest.requireActual('../../../lib/recite/quranWords');
  const fixture = jest.requireActual('../../../lib/recite/__fixtures__/quranWords');
  return { ...actual, loadQuranWords: async () => fixture.quranWords(), getQuranWords: () => null };
});

const mockSave = jest.fn(async () => undefined);
jest.mock('../../../lib/recite/checkHistory', () => ({
  saveCheck: (...a: any[]) => (mockSave as any)(...a),
  dismissMistakes: jest.fn(async () => undefined),
  onChecksChanged: () => () => undefined,
  pastMistakes: async () => new Map(),
}));

jest.mock('../../../lib/recite/recitePrefs', () => ({
  useRecitePrefs: () => ({ hideWords: false, vibrate: true, showPastMistakes: false }),
  setRecitePrefs: jest.fn(),
}));

const mockClaim = jest.fn();
let mockClaimListeners: Array<(a: string, o: string) => void> = [];
const mockSetAudioMode = jest.fn();
jest.mock('../../../lib/audioFocus', () => ({
  claimAudio: (...a: any[]) => mockClaim(...a),
  onAudioClaimed: (l: any) => {
    mockClaimListeners.push(l);
    return () => undefined;
  },
  enterRecordingMode: jest.fn(async () => undefined),
  setAudioMode: (...a: any[]) => mockSetAudioMode(...a),
  isAudioSessionError: () => false,
}));

const mockRecording = jest.fn(() => false);
jest.mock('../../../lib/recordings', () => ({ isRecordingActive: () => mockRecording() }));
jest.mock('../../../lib/recitation', () => ({ getRecitation: () => ({ stop: jest.fn() }) }));
jest.mock('../../../lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('expo-audio', () => ({
  getRecordingPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
  requestRecordingPermissionsAsync: async () => ({ granted: true }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'm' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('../../../context/ThemeContext', () => ({
  useTheme: () => ({ isDark: true, theme: require('../../../theme/colors').darkColors }),
}));

import { useRecitationCheck } from '../useRecitationCheck';
import { isCheckListening } from '../../../lib/recite/checkState';

const words = quranWords();
const SAMPLE_RATE = 16000;

/** Half a second of "speech" then a second of quiet, per utterance, in 100 ms chunks. */
async function speak(utterances: number) {
  const chunk = SAMPLE_RATE / 10;
  for (let u = 0; u < utterances; u++) {
    for (let c = 0; c < 15; c++) {
      const a = new Int16Array(chunk);
      if (c < 5) for (let i = 0; i < chunk; i++) a[i] = Math.round(Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) * 6000);
      await act(async () => mockHandlers!.onAudio(a));
    }
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHeard = [];
  mockHandlers = null;
  mockClaimListeners = [];
  mockStartGate = Promise.resolve();
  mockModelPath.mockReturnValue('/models/model.bin');
  mockRecording.mockReturnValue(false);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: () => undefined }) as any);
});

const setup = (onPageRecited = jest.fn()) =>
  renderHook(() =>
    useRecitationCheck({
      kind: 'revision',
      day: '2026-10-20',
      pages: [2, 3],
      currentPage: 2,
      onShowPage: jest.fn(),
      onPageRecited,
    }),
  );

const press = (el: any) => el.props.onPress();
const overlayPart = (result: any, i: number) => result.current.overlay.props.children[i];

describe('useRecitationCheck', () => {
  it('asks to download the speech model the first time', async () => {
    mockModelPath.mockReturnValue(null);
    const { result } = setup();
    await act(async () => press(result.current.button));
    expect(overlayPart(result, 0).props.visible).toBe(true);
    expect(result.current.phase).toBe('idle');
  });

  it('does not listen while a recording is capturing', async () => {
    mockRecording.mockReturnValue(true);
    const { result } = setup();
    await act(async () => press(result.current.button));
    expect(Alert.alert).toHaveBeenCalledWith('Recording in progress', expect.any(String));
    expect(result.current.phase).toBe('idle');
  });

  it('listens, follows the page, and on Stop saves the check and shows it', async () => {
    const onPageRecited = jest.fn();
    const { result } = setup(onPageRecited);
    await act(async () => press(result.current.button));
    expect(result.current.phase).toBe('listening');
    expect(mockClaim).toHaveBeenCalledWith('recitation-check', expect.any(String));
    expect(isCheckListening()).toBe(true);
    expect(result.current.bar).not.toBeNull();
    expect(result.current.button).toBeNull();

    // Partial results arrive as well; the script answers in order.
    mockHeard = [1, 2, 3, 4, 5].flatMap((a) => [say(verse(2, a)), say(verse(2, a))]);
    await speak(5);
    await act(async () => press({ props: { onPress: result.current.bar!.props.onStop } }));

    expect(result.current.phase).toBe('idle');
    expect(isCheckListening()).toBe(false);
    expect(mockSourceStop).toHaveBeenCalled();
    expect(mockCloseEngine).toHaveBeenCalled();
    expect(mockSetAudioMode).toHaveBeenLastCalledWith(false);
    expect(mockSave).toHaveBeenCalledTimes(1);
    const saved = (mockSave.mock.calls[0] as any[])[0];
    expect(saved).toMatchObject({ kind: 'revision', day: '2026-10-20', mistakes: [] });
    expect(saved.from).toBe(words.verseFirstWord(2, 1));
    // Page 2 (2:1-2:5) was recited through.
    expect(onPageRecited).toHaveBeenCalledWith(2);
    expect(overlayPart(result, 1).props.record).toBe(saved);
  });

  it('stops when something else takes the audio', async () => {
    const { result } = setup();
    await act(async () => press(result.current.button));
    await act(async () => mockClaimListeners.forEach((l) => l('recorder', 'someone-else')));
    expect(result.current.phase).toBe('idle');
    expect(mockSourceStop).toHaveBeenCalled();
  });

  it('a screen closed while the microphone was starting does not leave it listening', async () => {
    let open: () => void = () => undefined;
    mockStartGate = new Promise((r) => (open = r));
    const { result, unmount } = setup();
    let started: Promise<void> = Promise.resolve();
    act(() => {
      started = press(result.current.button);
    });
    await act(async () => undefined);
    unmount();
    await act(async () => {
      open();
      await started;
    });
    expect(mockSourceStop).toHaveBeenCalled();
    expect(isCheckListening()).toBe(false);
  });
});

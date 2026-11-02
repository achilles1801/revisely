import { act, renderHook } from '@testing-library/react-native';

jest.mock('../../../lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
let mockAvailable = true;
let mockHandlers: { onAudio: (s: Int16Array) => void; onStop: (r: string) => void } | null = null;
const mockStopMic = jest.fn(async () => undefined);
jest.mock('../../../lib/recite/micSource', () => ({
  isMicStreamAvailable: () => mockAvailable,
  startMicStream: jest.fn(async (h: never) => {
    mockHandlers = h;
    return { stop: mockStopMic };
  }),
}));
let mockHeard: string[] = [];
const mockClose = jest.fn();
jest.mock('../../../lib/recite/speechEngine', () => ({
  openSpeechEngine: jest.fn(async () => {
    let n = 0;
    return { transcribe: async () => mockHeard[n++] ?? '' };
  }),
  closeSpeechEngine: () => mockClose(),
}));
let mockModel = { status: 'ready', bytes: 1 } as Record<string, unknown>;
jest.mock('../../../lib/recite/speechModelStore', () => ({ useSpeechModelState: () => mockModel }));
jest.mock('../../../lib/recite/speechModel', () => ({ downloadedModelPath: () => '/models/m.bin' }));
jest.mock('../../../lib/recite/quranWords', () => {
  const actual = jest.requireActual('../../../lib/recite/quranWords');
  return { ...actual, loadQuranWords: async () => require('../../../lib/recite/__fixtures__/quranWords').quranWords() };
});
let mockMicGranted = true;
jest.mock('expo-audio', () => ({
  getRecordingPermissionsAsync: jest.fn(async () => ({ granted: mockMicGranted, canAskAgain: false })),
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: mockMicGranted, canAskAgain: false })),
  setAudioModeAsync: jest.fn(async () => undefined),
  setIsAudioActiveAsync: jest.fn(async () => undefined),
}));
const mockStopRecitation = jest.fn();
jest.mock('../../../lib/recitation', () => ({ getRecitation: () => ({ stop: mockStopRecitation }) }));

import { useReciteFollow } from '../useReciteFollow';
import { claimAudio } from '../../../lib/audioFocus';
import { SAMPLE_RATE } from '../../../lib/recite/segmenter';
import { quranWords, say, verse } from '../../../lib/recite/__fixtures__/quranWords';

const words = quranWords();

/** Half a second of "speech" then a second of quiet, per utterance. */
function utterances(n: number): Int16Array[] {
  const chunks: Int16Array[] = [];
  const chunk = SAMPLE_RATE / 10;
  for (let u = 0; u < n; u++) {
    for (let c = 0; c < 5; c++) {
      const a = new Int16Array(chunk);
      for (let i = 0; i < chunk; i++) a[i] = Math.round(Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) * 6000);
      chunks.push(a);
    }
    for (let c = 0; c < 10; c++) chunks.push(new Int16Array(chunk).map(() => Math.round(Math.random() * 40 - 20)));
  }
  return chunks;
}

const flush = () => act(async () => {});

function setup(active = true, pages = [2, 3], currentPage = 2) {
  const onShowPage = jest.fn();
  const onPageDone = jest.fn();
  const hook = renderHook(
    (p: { active: boolean; round?: number }) =>
      useReciteFollow({ active: p.active, round: p.round, pages, currentPage, onShowPage, onPageDone }),
    { initialProps: { active } as { active: boolean; round?: number } },
  );
  return { ...hook, onShowPage, onPageDone };
}

async function recite(n: number) {
  for (const c of utterances(n)) {
    await act(async () => {
      mockHandlers!.onAudio(c);
      await new Promise((r) => setImmediate(r));
    });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable = true;
  mockModel = { status: 'ready', bytes: 1 };
  mockMicGranted = true;
  mockHeard = [];
  mockHandlers = null;
});

describe('useReciteFollow', () => {
  it('a binary without the mic module: unavailable; no model: no-model; neither listens', async () => {
    mockAvailable = false;
    const a = setup();
    await flush();
    expect(a.result.current.status).toBe('unavailable');
    expect(mockHandlers).toBeNull();
    a.unmount();
    mockAvailable = true;
    mockModel = { status: 'missing', error: null };
    const b = setup();
    await flush();
    expect(b.result.current.status).toBe('no-model');
    expect(mockHandlers).toBeNull();
  });

  it('listening: finds the reciter, shows the words recited, turns the page and credits it', async () => {
    mockHeard = [1, 2, 3, 4, 5, 6].map((a) => say(verse(2, a)));
    const { result, onShowPage, onPageDone } = setup(true, [2, 3], 2);
    await flush();
    expect(result.current.status).toBe('finding');
    expect(mockStopRecitation).toHaveBeenCalled();
    for (const c of utterances(mockHeard.length)) {
      await act(async () => {
        mockHandlers!.onAudio(c);
        await new Promise((r) => setImmediate(r));
      });
    }
    expect(result.current.status).toBe('following');
    const follow = result.current.follow!;
    expect(follow.shown(words.verseFirstWord(2, 2))).toBe(true);
    expect(follow.shown(words.verseFirstWord(2, 5))).toBe(true);
    expect(follow.shown(words.verseFirstWord(2, 8))).toBe(false);
    // Page 2 ends with 2:5: reaching 2:6 turns to page 3, and page 2 counts.
    expect(onShowPage).toHaveBeenCalledWith(3);
    expect(onPageDone).toHaveBeenCalledWith(2);
  });

  it('listening stops: what was recited stays shown, and listening again carries on from there', async () => {
    const first = (a: number) => words.verseFirstWord(2, a);
    mockHeard = [say(verse(2, 2)), say(verse(2, 2)), say(verse(2, 3)), say(verse(2, 3))];
    const { result, rerender, onPageDone } = setup(true, [2, 3], 2);
    await flush();
    await recite(2);
    expect(result.current.follow!.shown(first(3))).toBe(true);
    // Paused (a recording, the screen left, the mic turned off): the words stay.
    rerender({ active: false });
    await flush();
    expect(mockStopMic).toHaveBeenCalled();
    expect(result.current.follow!.shown(first(2))).toBe(true);
    expect(result.current.follow!.shown(first(3))).toBe(true);
    expect(result.current.follow!.next).toBe(first(4));
    // Listening again goes on from 2:4, with 2:2-2:3 still shown.
    mockHeard = [say(verse(2, 4)), say(verse(2, 4)), say(verse(2, 5)), say(verse(2, 5))];
    rerender({ active: true });
    await flush();
    expect(result.current.status).toBe('following');
    await recite(2);
    expect(result.current.follow!.shown(first(2))).toBe(true);
    expect(result.current.follow!.shown(first(5))).toBe(true);
    expect(onPageDone.mock.calls.filter(([p]) => p === 2)).toHaveLength(1);
    // The page hidden again (a new round): everything is covered again.
    rerender({ active: true, round: 1 });
    await flush();
    expect(result.current.follow?.shown(first(2)) ?? false).toBe(false);
  });

  it('no microphone access: says so, doesn’t listen', async () => {
    mockMicGranted = false;
    const { result } = setup();
    await flush();
    expect(result.current.status).toBe('denied');
    expect(mockHandlers).toBeNull();
  });

  it('something else takes the audio: steps aside until resumed', async () => {
    const { result } = setup();
    await flush();
    expect(result.current.status).toBe('finding');
    await act(async () => claimAudio('recitation', 'someone-else'));
    await flush();
    expect(result.current.status).toBe('paused');
    expect(mockStopMic).toHaveBeenCalled();
    await act(async () => result.current.resume());
    await flush();
    expect(result.current.status).toBe('finding');
  });

  it('not active any more: the mic stops and the model is let go', async () => {
    const { rerender, result } = setup();
    await flush();
    rerender({ active: false });
    await flush();
    expect(mockStopMic).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
    expect(result.current.status).toBe('off');
  });
});

import { act, renderHook } from '@testing-library/react-native';

let mockDb = -60;
let mockGranted = true;
const mockRecorder = {
  uri: 'file:///listen.m4a',
  prepareToRecordAsync: jest.fn(async () => undefined),
  record: jest.fn(),
  stop: jest.fn(async () => undefined),
  getStatus: jest.fn(() => ({ isRecording: true, metering: mockDb })),
};
jest.mock('expo-audio', () => ({
  AudioQuality: { LOW: 0 },
  IOSOutputFormat: { MPEG4AAC: 'aac' },
  useAudioRecorder: () => mockRecorder,
  getRecordingPermissionsAsync: jest.fn(async () => ({ granted: mockGranted, canAskAgain: false })),
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: mockGranted, canAskAgain: false })),
  setAudioModeAsync: jest.fn(async () => undefined),
  setIsAudioActiveAsync: jest.fn(async () => undefined),
}));
const mockDeleted: string[] = [];
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    exists = true;
    constructor(uri: string) {
      this.uri = uri;
    }
    delete() {
      mockDeleted.push(this.uri);
    }
  },
}));
let mockCapturing = false;
jest.mock('../../../lib/recordings', () => ({ isRecordingActive: () => mockCapturing }));
const mockStopRecitation = jest.fn();
jest.mock('../../../lib/recitation', () => ({ getRecitation: () => ({ stop: mockStopRecitation }) }));

import { usePauseListener } from '../usePauseListener';
import { claimAudio } from '../../../lib/audioFocus';

// Settle the async start (permission, prepare) between ticks.
const flush = () => act(async () => {});
async function tick(ms: number) {
  for (let t = 0; t < ms; t += 100) {
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
  }
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockDb = -60;
  mockGranted = true;
  mockCapturing = false;
  mockDeleted.length = 0;
});
afterEach(() => jest.useRealTimers());

function setup(externalLevel: () => number | null = () => null, active = true) {
  const onPause = jest.fn();
  const hook = renderHook((p: { active: boolean }) => usePauseListener({ active: p.active, externalLevel, onPause }), {
    initialProps: { active },
  });
  return { ...hook, onPause };
}

describe('usePauseListener', () => {
  it('opens its own microphone for the level, stops recitation, and finds a pause after a verse', async () => {
    const { result, onPause } = setup();
    await tick(200);
    await flush();
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalled();
    expect(mockRecorder.record).toHaveBeenCalled();
    expect(mockStopRecitation).toHaveBeenCalled();
    await tick(1000);
    expect(result.current.status).toBe('listening');
    mockDb = -22;
    await tick(2500);
    expect(result.current.hearing).toBe(true);
    mockDb = -60;
    await tick(1500);
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('while the session records, listens through it and opens no microphone of its own', async () => {
    let level: number | null = -60;
    const { onPause } = setup(() => level);
    await tick(1000);
    expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();
    level = -20;
    await tick(2000);
    level = -60;
    await tick(1500);
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('yields to the user’s recorder, then takes the microphone back if it didn’t start', async () => {
    const { result } = setup();
    await tick(300);
    await flush();
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.yieldMic();
    });
    expect(mockRecorder.stop).toHaveBeenCalled();
    expect(mockDeleted).toEqual(['file:///listen.m4a']);
    await tick(2000);
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    await tick(1500);
    await flush();
    expect(mockRecorder.record).toHaveBeenCalledTimes(2);
  });

  it('playback takes the audio: it stops and waits for the user', async () => {
    const { result } = setup();
    await tick(300);
    await flush();
    act(() => claimAudio('recitation', 'someone'));
    await flush();
    expect(result.current.status).toBe('paused');
    expect(mockRecorder.stop).toHaveBeenCalled();
    await tick(5000);
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    act(() => result.current.resume());
    await tick(300);
    await flush();
    expect(mockRecorder.record).toHaveBeenCalledTimes(2);
  });

  it('another screen capturing: waits, never opens a second microphone', async () => {
    mockCapturing = true;
    setup();
    await tick(2000);
    expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();
  });

  it('no microphone access: says so and stops asking', async () => {
    mockGranted = false;
    const { result } = setup();
    await tick(500);
    await flush();
    expect(result.current.status).toBe('denied');
    const asked = (require('expo-audio').getRecordingPermissionsAsync as jest.Mock).mock.calls.length;
    await tick(5000);
    expect((require('expo-audio').getRecordingPermissionsAsync as jest.Mock).mock.calls.length).toBe(asked);
  });

  it('turned off: the microphone closes and its file is deleted', async () => {
    const { rerender, result } = setup();
    await tick(300);
    await flush();
    rerender({ active: false });
    await flush();
    expect(mockRecorder.stop).toHaveBeenCalled();
    expect(mockDeleted).toEqual(['file:///listen.m4a']);
    expect(result.current.status).toBe('off');
  });
});

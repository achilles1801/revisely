import { act, renderHook } from '@testing-library/react-native';
import { Alert, AppState } from 'react-native';

let mockUri = 0;
const mockRecorder: any = {
  uri: null as string | null,
  prepareToRecordAsync: jest.fn(() => {
    mockUri += 1;
    mockRecorder.uri = `cache/seg-${mockUri}.m4a`;
    return Promise.resolve();
  }),
  record: jest.fn(),
  stop: jest.fn(() => Promise.resolve()),
  getStatus: jest.fn(() => ({ isRecording: true })),
};
let mockStatusListener: ((s: any) => void) | undefined;
const mockPerms = { get: jest.fn(), request: jest.fn() };
const mockSetAudioMode = jest.fn();

jest.mock('expo-audio', () => ({
  AudioQuality: { MAX: 127 },
  IOSOutputFormat: { MPEG4AAC: 'aac ' },
  useAudioRecorder: (_opts: any, listener: (s: any) => void) => {
    mockStatusListener = listener;
    return mockRecorder;
  },
  getRecordingPermissionsAsync: () => mockPerms.get(),
  requestRecordingPermissionsAsync: () => mockPerms.request(),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'm', Light: 'l' },
  NotificationFeedbackType: { Success: 's' },
}));
const mockStopRecitation = jest.fn();
jest.mock('../../lib/recitation', () => ({ getRecitation: () => ({ stop: mockStopRecitation }) }));
const mockAppend = jest.fn();
const mockFind = jest.fn();
jest.mock('../../lib/recordings', () => {
  const actual = jest.requireActual('../../lib/recordings');
  return {
    appendSegment: (...a: any[]) => mockAppend(...a),
    findRevisionRecording: (...a: any[]) => mockFind(...a),
    acquireRecording: actual.acquireRecording,
    releaseRecording: actual.releaseRecording,
    setCapturing: actual.setCapturing,
    isRecordingActive: actual.isRecordingActive,
  };
});
const mockClaim = jest.fn();
jest.mock('../../lib/audioFocus', () => ({
  claimAudio: (...a: any[]) => mockClaim(...a),
  setAudioMode: (recording: boolean) => {
    mockSetAudioMode(recording);
    return Promise.resolve();
  },
}));
jest.mock('../../lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));

import { useVoiceRecorder, VOICE_PRESET } from '../useVoiceRecorder';
import { isRecordingActive } from '../../lib/recordings';

let appStateListeners: Array<(s: string) => void> = [];
beforeEach(() => {
  jest.clearAllMocks();
  mockUri = 0;
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_e: any, l: any) => {
    appStateListeners.push(l);
    return { remove: () => undefined } as any;
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockPerms.get.mockResolvedValue({ granted: true, canAskAgain: true });
  mockPerms.request.mockResolvedValue({ granted: true });
  mockRecorder.getStatus.mockImplementation(() => ({ isRecording: true }));
  mockAppend.mockImplementation((id: string | null) => Promise.resolve(id ?? 'rec-1'));
  mockFind.mockResolvedValue(null);
});

const setup = (props: Partial<Parameters<typeof useVoiceRecorder>[0]> = {}) =>
  renderHook((p: Parameters<typeof useVoiceRecorder>[0]) => useVoiceRecorder(p), {
    initialProps: { kind: 'reading', day: '2026-10-20', currentPage: 12, ...props } as any,
  });

describe('recording quality', () => {
  it('records like Voice Memos: AAC 48 kHz mono at a high bitrate', () => {
    expect(VOICE_PRESET).toMatchObject({ extension: '.m4a', sampleRate: 48000, numberOfChannels: 1 });
    expect(VOICE_PRESET.bitRate).toBeGreaterThanOrEqual(96000);
    expect(VOICE_PRESET.ios).toMatchObject({ outputFormat: 'aac ', audioQuality: 127 });
  });
});

describe('useVoiceRecorder sessions', () => {
  it('pause and resume add to one recording; Done finishes it', async () => {
    const onSaved = jest.fn();
    const { result, rerender } = setup({ onSaved });
    await act(() => result.current.start());
    expect(result.current.phase).toBe('recording');
    expect(mockStopRecitation).toHaveBeenCalled();
    expect(mockSetAudioMode).toHaveBeenLastCalledWith(true);

    await act(() => result.current.pause());
    expect(result.current.phase).toBe('paused');
    expect(result.current.interrupted).toBe(false);
    expect(mockSetAudioMode).toHaveBeenLastCalledWith(false); // playback via the speaker meanwhile
    expect(mockAppend).toHaveBeenNthCalledWith(1, null, 'cache/seg-1.m4a', expect.objectContaining({ kind: 'reading' }));

    rerender({ kind: 'reading', day: '2026-10-20', currentPage: 13, onSaved } as any);
    await act(() => result.current.resume());
    expect(result.current.phase).toBe('recording');
    await act(() => result.current.finish());

    expect(mockAppend).toHaveBeenCalledTimes(2);
    const [id2, uri2, info2] = mockAppend.mock.calls[1];
    expect(id2).toBe('rec-1'); // same recording
    expect(uri2).toBe('cache/seg-2.m4a');
    expect(info2.pageMarks.map((m: any) => m.page)).toEqual([12, 13]);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('idle');
  });

  it('a revision session carries on that day’s recording', async () => {
    mockFind.mockResolvedValue({ id: 'old', durationMs: 60_000, pageMarks: [{ atMs: 0, page: 3 }] });
    const { result } = setup({ kind: 'revision' });
    await act(() => result.current.start());
    expect(mockFind).toHaveBeenCalledWith('2026-10-20');
    expect(result.current.baseMs).toBe(60_000);
    await act(() => result.current.finish());
    const [id, , info] = mockAppend.mock.calls[0];
    expect(id).toBe('old');
    expect(info.pageMarks).toEqual([
      { atMs: 0, page: 3 },
      { atMs: 60_000, page: 12 },
    ]);
  });

  it('a reading recording starts fresh each time', async () => {
    const { result } = setup({ kind: 'reading' });
    await act(() => result.current.start());
    expect(mockFind).not.toHaveBeenCalled();
    await act(() => result.current.finish());
  });

  it('a call pauses it (keeping what was recorded); it can be resumed', async () => {
    const { result } = setup();
    await act(() => result.current.start());
    await act(async () => mockStatusListener?.({ hasError: true, error: 'interrupted', isFinished: false }));
    expect(result.current.phase).toBe('paused');
    expect(result.current.interrupted).toBe(true);
    expect(mockAppend).toHaveBeenCalledTimes(1);
    await act(() => result.current.resume());
    expect(result.current.phase).toBe('recording');
    expect(result.current.interrupted).toBe(false);
    await act(() => result.current.finish());
  });

  it('going to the background pauses it; Control Center does not', async () => {
    const { result } = setup();
    await act(() => result.current.start());
    await act(async () => appStateListeners.forEach((l) => l('inactive')));
    expect(result.current.phase).toBe('recording');
    await act(async () => appStateListeners.forEach((l) => l('background')));
    expect(result.current.phase).toBe('paused');
    expect(mockAppend).toHaveBeenCalledTimes(1);
    await act(() => result.current.finish());
    expect(mockAppend).toHaveBeenCalledTimes(1); // nothing more to save
  });

  it('an alarm or Siri pausing it silently pauses the session', async () => {
    jest.useFakeTimers();
    try {
      const { result } = setup();
      await act(() => result.current.start());
      mockRecorder.getStatus.mockImplementation(() => ({ isRecording: false }));
      await act(async () => {
        jest.advanceTimersByTime(2100);
      });
      expect(result.current.phase).toBe('paused');
      expect(result.current.interrupted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('closing the screen saves the stretch in progress', async () => {
    const { result, unmount } = setup();
    await act(() => result.current.start());
    // The library releases the recorder; reading it throws, stop fails.
    mockRecorder.stop.mockImplementationOnce(() => {
      throw new Error('released');
    });
    await act(async () => unmount());
    expect(mockAppend).toHaveBeenCalledWith(null, 'cache/seg-1.m4a', expect.any(Object));
  });

  it('closing the screen while paused saves nothing more', async () => {
    const { result, unmount } = setup();
    await act(() => result.current.start());
    await act(() => result.current.pause());
    await act(async () => unmount());
    expect(mockAppend).toHaveBeenCalledTimes(1);
  });

  it('quick pause, resume, pause saves both stretches to one recording', async () => {
    let resolveFirst: (v: string) => void = () => undefined;
    mockAppend.mockImplementationOnce(() => new Promise<string>((r) => (resolveFirst = r)));
    const { result } = setup();
    await act(() => result.current.start());
    act(() => {
      result.current.pause();
    });
    await act(() => result.current.resume());
    const second = result.current.pause();
    await act(async () => resolveFirst('rec-9'));
    await act(() => second);
    expect(mockAppend.mock.calls[1][0]).toBe('rec-9');
    await act(() => result.current.finish());
  });

  it('recitation may play while paused, not while recording', async () => {
    const { result } = setup();
    await act(() => result.current.start());
    expect(isRecordingActive()).toBe(true);
    await act(() => result.current.pause());
    expect(isRecordingActive()).toBe(false);
    await act(() => result.current.finish());
  });

  it('points to Settings when the microphone was refused, and does not record', async () => {
    mockPerms.get.mockResolvedValue({ granted: false, canAskAgain: false });
    const { result } = setup();
    await act(() => result.current.start());
    expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Microphone access is off', expect.any(String), expect.any(Array));
    expect(result.current.phase).toBe('idle');
  });

  it('asks for the microphone the first time', async () => {
    mockPerms.get.mockResolvedValue({ granted: false, canAskAgain: true });
    const { result } = setup();
    await act(() => result.current.start());
    expect(mockPerms.request).toHaveBeenCalled();
    expect(result.current.phase).toBe('recording');
    await act(() => result.current.finish());
  });

  it('allows one recording session at a time across screens', async () => {
    const a = setup();
    const b = setup();
    await act(() => a.result.current.start());
    await act(() => a.result.current.pause()); // paused still holds the session
    await act(() => b.result.current.start());
    expect(b.result.current.phase).toBe('idle');
    expect(Alert.alert).toHaveBeenCalledWith('Already recording', expect.any(String));
    await act(() => a.result.current.finish());
    await act(() => b.result.current.start());
    expect(b.result.current.phase).toBe('recording');
    await act(() => b.result.current.finish());
  });

  it('Done twice finishes once', async () => {
    const { result } = setup();
    await act(() => result.current.start());
    await act(async () => {
      await Promise.all([result.current.finish(), result.current.finish()]);
    });
    expect(mockAppend).toHaveBeenCalledTimes(1);
  });

  it('explains when saving fails (e.g. storage full)', async () => {
    mockAppend.mockRejectedValueOnce(new Error('ENOSPC'));
    const { result } = setup();
    await act(() => result.current.start());
    await act(() => result.current.finish());
    expect(Alert.alert).toHaveBeenCalledWith("Couldn't save the recording", expect.any(String));
    expect(result.current.phase).toBe('idle');
  });

  it('does nothing without a revision day', async () => {
    const { result } = setup({ day: null });
    await act(() => result.current.start());
    expect(mockRecorder.record).not.toHaveBeenCalled();
  });
});

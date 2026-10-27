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
const mockClose = jest.fn(() => Promise.resolve());
jest.mock('../../lib/recordings', () => {
  const actual = jest.requireActual('../../lib/recordings');
  return {
    appendSegment: (...a: any[]) => mockAppend(...a),
    findRevisionRecording: (...a: any[]) => mockFind(...a),
    closeRecording: (...a: any[]) => (mockClose as any)(...a),
    rebaseMarks: actual.rebaseMarks,
    acquireRecording: actual.acquireRecording,
    releaseRecording: actual.releaseRecording,
    setCapturing: actual.setCapturing,
    isRecordingActive: actual.isRecordingActive,
    hasRecordingSession: actual.hasRecordingSession,
  };
});
const mockClaim = jest.fn();
jest.mock('../../lib/audioFocus', () => ({
  claimAudio: (...a: any[]) => mockClaim(...a),
  isAudioSessionError: jest.requireActual('../../lib/audioFocus').isAudioSessionError,
  enterRecordingMode: () => {
    mockSetAudioMode(true);
    return Promise.resolve();
  },
  setAudioMode: (recording: boolean) => {
    mockSetAudioMode(recording);
    return Promise.resolve();
  },
}));
jest.mock('../../lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
// The design state: haptics on unless a test turns
// them off (Settings → Haptics).
const mockDesign = { hapticsOn: true };
jest.mock('../../design/DesignContext', () => ({ useDesign: () => mockDesign }));

import * as Haptics from 'expo-haptics';
import { useVoiceRecorder, VOICE_PRESET } from '../useVoiceRecorder';
import { LEVEL_SAMPLE_MS } from '../../lib/waveform';
import { hasRecordingSession, isRecordingActive } from '../../lib/recordings';

let appStateListeners: Array<(s: string) => void> = [];
beforeEach(() => {
  jest.clearAllMocks();
  mockDesign.hapticsOn = true;
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
  mockAppend.mockImplementation((id: string | null) =>
    Promise.resolve({ id: id ?? 'rec-1', kept: true, restarted: false }),
  );
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
    expect(onSaved).toHaveBeenCalledTimes(2); // after each saved stretch
    expect(result.current.phase).toBe('idle');
  });

  it('records each stretch to a new file (prepare gets the options)', async () => {
    const { result } = setup();
    await act(() => result.current.start());
    await act(() => result.current.pause());
    await act(() => result.current.resume());
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(2);
    for (const call of mockRecorder.prepareToRecordAsync.mock.calls) {
      expect(call[0]).toBe(VOICE_PRESET);
    }
    await act(() => result.current.finish());
  });

  it('a resume waits for the previous stretch to be saved', async () => {
    let resolveFirst: () => void = () => undefined;
    mockAppend.mockImplementationOnce(
      () => new Promise((r) => (resolveFirst = () => r({ id: 'rec-1', kept: true, restarted: false }))),
    );
    const { result } = setup();
    await act(() => result.current.start());
    act(() => {
      result.current.pause();
    });
    let resumed = false;
    act(() => {
      result.current.resume().then(() => (resumed = true));
    });
    await act(async () => undefined);
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    await act(async () => resolveFirst());
    await act(async () => undefined);
    expect(resumed).toBe(true);
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(2);
    await act(() => result.current.finish());
  });

  it('takes a dropped stretch back off the timeline', async () => {
    mockAppend.mockImplementationOnce(() => Promise.resolve({ id: null, kept: false, restarted: false }));
    const { result } = setup();
    await act(() => result.current.start());
    await act(() => result.current.pause());
    expect(result.current.baseMs).toBe(0);
    await act(() => result.current.finish());
  });

  it('restarts the timeline when the recording being continued was deleted', async () => {
    mockFind.mockResolvedValue({ id: 'old', durationMs: 60_000, pageMarks: [{ atMs: 0, page: 3 }] });
    mockAppend.mockImplementationOnce(() => Promise.resolve({ id: 'new', kept: true, restarted: true }));
    const { result } = setup({ kind: 'revision' });
    await act(() => result.current.start());
    await act(() => result.current.pause());
    expect(result.current.baseMs).toBeLessThan(1_000); // just this stretch
    await act(() => result.current.resume());
    await act(() => result.current.finish());
    const [id, , info] = mockAppend.mock.calls[1];
    expect(id).toBe('new');
    expect(info.pageMarks[0]).toEqual({ atMs: 0, page: 12 });
  });

  it('leaving the screen while resuming ends the session (the microphone is free again)', async () => {
    const a = setup();
    await act(() => a.result.current.start());
    await act(() => a.result.current.pause());
    mockRecorder.prepareToRecordAsync.mockImplementationOnce(() => Promise.reject(new Error('released')));
    const resuming = a.result.current.resume();
    a.unmount();
    await act(() => resuming);
    expect(mockSetAudioMode).toHaveBeenLastCalledWith(false);
    const b = setup();
    await act(() => b.result.current.start());
    expect(b.result.current.phase).toBe('recording');
    await act(() => b.result.current.finish());
  });

  it('a failed resume goes back to playback mode', async () => {
    const { result } = setup();
    await act(() => result.current.start());
    await act(() => result.current.pause());
    mockRecorder.prepareToRecordAsync.mockImplementationOnce(() => Promise.reject(new Error('busy')));
    await act(() => result.current.resume());
    expect(result.current.phase).toBe('paused');
    expect(mockSetAudioMode).toHaveBeenLastCalledWith(false);
    expect(isRecordingActive()).toBe(false);
    await act(() => result.current.finish());
  });

  it('going to the background while starting pauses once started', async () => {
    let release: () => void = () => undefined;
    mockRecorder.prepareToRecordAsync.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          mockUri += 1;
          mockRecorder.uri = `cache/seg-${mockUri}.m4a`;
          release = r;
        }),
    );
    const { result } = setup();
    let started: Promise<void> = Promise.resolve();
    act(() => {
      started = result.current.start();
    });
    await act(async () => undefined);
    await act(async () => appStateListeners.forEach((l) => l('background')));
    await act(async () => release());
    await act(() => started);
    expect(result.current.phase).toBe('paused');
    expect(result.current.interrupted).toBe(true);
    await act(() => result.current.finish());
  });

  it('tells the screen the recording was saved when the user ends it (to offer "View")', async () => {
    const onFinished = jest.fn();
    const { result } = setup({ onFinished });
    await act(() => result.current.start());
    await act(() => result.current.finish());
    expect(onFinished).toHaveBeenCalledWith({ day: '2026-10-20', recordingId: 'rec-1' });
  });

  it('does not offer "View" when the screen closes (no one to show it)', async () => {
    const onFinished = jest.fn();
    const { result, unmount } = setup({ onFinished });
    await act(() => result.current.start());
    await act(async () => unmount());
    expect(onFinished).not.toHaveBeenCalled();
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
    mockAppend.mockImplementationOnce(
      () => new Promise((r) => (resolveFirst = (id: string) => r({ id, kept: true, restarted: false }))),
    );
    const { result } = setup();
    await act(() => result.current.start());
    act(() => {
      result.current.pause();
    });
    // Resume waits for the first stretch to be saved before recording again.
    let resuming: Promise<void> = Promise.resolve();
    act(() => {
      resuming = result.current.resume();
    });
    await act(async () => undefined); // let the first save start
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1); // still waiting
    await act(async () => resolveFirst('rec-9'));
    await act(() => resuming);
    await act(() => result.current.pause());
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

  it('retries once when iOS refuses to activate the audio session', async () => {
    const sessionError = Object.assign(new Error("Calling the 'prepareToRecordAsync' function has failed"), {
      cause: new Error('Audio recording error: Failed to configure audio session: Session activation failed'),
    });
    mockRecorder.prepareToRecordAsync.mockImplementationOnce(() => Promise.reject(sessionError));
    const { result } = setup();
    await act(() => result.current.start());
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(2);
    expect(result.current.phase).toBe('recording');
    await act(() => result.current.finish());
  });

  it('explains a busy microphone when activation keeps failing', async () => {
    const sessionError = new Error('Failed to configure audio session: Session activation failed');
    mockRecorder.prepareToRecordAsync.mockImplementation(() => Promise.reject(sessionError));
    const { result } = setup();
    await act(() => result.current.start());
    expect(result.current.phase).toBe('idle');
    expect(Alert.alert).toHaveBeenCalledWith("Couldn't start recording", expect.stringMatching(/microphone is busy/));
    mockRecorder.prepareToRecordAsync.mockReset();
    mockRecorder.prepareToRecordAsync.mockImplementation(() => {
      mockUri += 1;
      mockRecorder.uri = `cache/seg-${mockUri}.m4a`;
      return Promise.resolve();
    });
  });
});

describe('a revision recording stays open until Stop', () => {
  const OPEN = { id: 'open-1', durationMs: 42_000, pageMarks: [{ atMs: 0, page: 5 }], createdAt: 111, open: true };
  const revision = (props: any = {}) => setup({ kind: 'revision', ...props });
  const settle = () => act(async () => undefined);

  it('each saved stretch is marked open; Stop closes it', async () => {
    const { result } = revision();
    await settle();
    await act(() => result.current.start());
    await act(() => result.current.pause());
    expect(mockAppend.mock.calls[0][2]).toMatchObject({ open: true });
    expect(mockClose).not.toHaveBeenCalled();
    await act(() => result.current.finish());
    expect(mockClose).toHaveBeenCalledWith('rec-1');
  });

  it('a reading recording is never marked open', async () => {
    const { result } = setup({ kind: 'reading' });
    await act(() => result.current.start());
    await act(() => result.current.pause());
    expect(mockAppend.mock.calls[0][2]).toMatchObject({ open: false });
  });

  it('leaving the screen while paused keeps the session (no finish, no "View")', async () => {
    const onFinished = jest.fn();
    const { result, unmount } = revision({ onFinished });
    await settle();
    await act(() => result.current.start());
    await act(() => result.current.pause());
    await act(async () => unmount());
    expect(mockClose).not.toHaveBeenCalled();
    expect(onFinished).not.toHaveBeenCalled();
    expect(mockAppend).toHaveBeenCalledTimes(1);
    expect(hasRecordingSession()).toBe(false); // other screens may record meanwhile
  });

  it('leaving while recording saves the stretch as open', async () => {
    const { result, unmount } = revision();
    await settle();
    await act(() => result.current.start());
    await act(async () => unmount());
    expect(mockRecorder.stop).toHaveBeenCalled();
    expect(mockAppend).toHaveBeenCalledTimes(1);
    expect(mockAppend.mock.calls[0][2]).toMatchObject({ open: true });
    expect(mockClose).not.toHaveBeenCalled();
    expect(isRecordingActive()).toBe(false);
    expect(hasRecordingSession()).toBe(false);
  });

  it('reopening the screen shows the open session paused, with its time', async () => {
    mockFind.mockResolvedValue(OPEN);
    const { result } = revision();
    await settle();
    expect(result.current.phase).toBe('paused');
    expect(result.current.baseMs).toBe(42_000);
    expect(result.current.interrupted).toBe(false);
    expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled(); // not recording by itself
  });

  it('resuming a reopened session adds to the same recording and timeline', async () => {
    mockFind.mockResolvedValue(OPEN);
    const onFinished = jest.fn();
    const { result } = revision({ onFinished });
    await settle();
    await act(() => result.current.resume());
    expect(result.current.phase).toBe('recording');
    await act(() => result.current.finish());
    const [id, , info] = mockAppend.mock.calls[0];
    expect(id).toBe('open-1');
    expect(info).toMatchObject({ segmentStartMs: 42_000, createdAt: 111 });
    expect(info.pageMarks).toEqual([
      { atMs: 0, page: 5 },
      { atMs: 42_000, page: 12 },
    ]);
    expect(mockClose).toHaveBeenCalledWith('open-1');
    expect(onFinished).toHaveBeenCalledWith({ day: '2026-10-20', recordingId: 'open-1' });
    expect(result.current.phase).toBe('idle');
  });

  it('Stop on a reopened session closes it without recording', async () => {
    mockFind.mockResolvedValue(OPEN);
    const { result } = revision();
    await settle();
    await act(() => result.current.finish());
    expect(mockAppend).not.toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalledWith('open-1');
    expect(result.current.phase).toBe('idle');
  });

  it('a stopped recording is not restored (the mic shows; Record continues the day)', async () => {
    mockFind.mockResolvedValue({ ...OPEN, open: false });
    const { result } = revision();
    await settle();
    expect(result.current.phase).toBe('idle');
  });

  it('a reading recording is not restored, and leaving the reader finishes it', async () => {
    mockFind.mockResolvedValue(OPEN);
    const { result, unmount } = setup({ kind: 'reading' });
    await settle();
    expect(result.current.phase).toBe('idle');
    await act(() => result.current.start());
    await act(async () => unmount());
    expect(mockAppend.mock.calls[0][2]).toMatchObject({ open: false });
  });

  it('only restores the session of the screen’s day', async () => {
    mockFind.mockImplementation((day: string) => Promise.resolve(day === '2026-10-19' ? OPEN : null));
    const { result } = revision({ day: '2026-10-20' });
    await settle();
    expect(mockFind).toHaveBeenCalledWith('2026-10-20');
    expect(result.current.phase).toBe('idle');
  });

  it('a session restored while another screen records waits to resume', async () => {
    const other = setup({ kind: 'reading' });
    await act(() => other.result.current.start());
    mockFind.mockResolvedValue(OPEN);
    const { result } = revision();
    await settle();
    expect(result.current.phase).toBe('paused');
    await act(() => result.current.resume());
    expect(Alert.alert).toHaveBeenCalledWith('Already recording', expect.any(String));
    expect(result.current.phase).toBe('paused');
    await act(() => other.result.current.finish());
    await act(() => result.current.resume());
    expect(result.current.phase).toBe('recording');
    await act(() => result.current.finish());
  });

  it('a tap on Record before the restore finishes does not start twice', async () => {
    let resolveFind: (v: any) => void = () => undefined;
    mockFind.mockImplementationOnce(() => new Promise((r) => (resolveFind = r)));
    mockFind.mockResolvedValue(OPEN);
    const { result } = revision();
    await act(() => result.current.start()); // continues the open recording
    await act(async () => resolveFind(OPEN));
    expect(result.current.phase).toBe('recording');
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    await act(() => result.current.finish());
    expect(mockAppend.mock.calls[0][0]).toBe('open-1');
  });

  it('going to the background pauses and keeps it open; it is still paused after', async () => {
    const { result } = revision();
    await settle();
    await act(() => result.current.start());
    await act(async () => appStateListeners.forEach((l) => l('background')));
    expect(result.current.phase).toBe('paused');
    expect(mockAppend.mock.calls[0][2]).toMatchObject({ open: true });
    await act(async () => appStateListeners.forEach((l) => l('active')));
    expect(result.current.phase).toBe('paused');
    expect(mockClose).not.toHaveBeenCalled();
    await act(() => result.current.finish());
  });

  it('Stop while the start is in progress finishes it (and closes it) once started', async () => {
    let release: () => void = () => undefined;
    mockRecorder.prepareToRecordAsync.mockImplementationOnce(() => {
      mockUri += 1;
      mockRecorder.uri = `cache/seg-${mockUri}.m4a`;
      return new Promise<void>((r) => (release = r));
    });
    const { result, unmount } = revision();
    await settle();
    let started: Promise<void> = Promise.resolve();
    act(() => {
      started = result.current.start();
    });
    await settle();
    expect(result.current.phase).toBe('starting');
    await act(() => result.current.finish()); // the session was ended
    await act(async () => unmount());
    await act(async () => {
      release();
      await started;
    });
    expect(mockClose).toHaveBeenCalledWith('rec-1');
    expect(hasRecordingSession()).toBe(false);
  });

  it('Stop before the reopened session is restored closes it instead', async () => {
    let resolveFind: (v: any) => void = () => undefined;
    mockFind.mockImplementationOnce(() => new Promise((r) => (resolveFind = r)));
    const { result, unmount } = revision();
    await act(() => result.current.finish());
    await act(async () => unmount());
    await act(async () => resolveFind(OPEN));
    expect(mockClose).toHaveBeenCalledWith('open-1');
  });
});

describe('waveform levels', () => {
  it('meters while recording and keeps each stretch’s levels with it', async () => {
    // Metering on: the recorder reports its level (it changes nothing recorded).
    expect(VOICE_PRESET.isMeteringEnabled).toBe(true);
    jest.useFakeTimers();
    try {
      const { result } = setup();
      await act(() => result.current.start());
      let db = -25; // half way up the voice range
      mockRecorder.getStatus.mockImplementation(() => ({ isRecording: true, metering: db }));
      await act(async () => {
        jest.advanceTimersByTime(LEVEL_SAMPLE_MS * 3);
      });
      db = 0;
      await act(async () => {
        jest.advanceTimersByTime(LEVEL_SAMPLE_MS * 2);
      });
      await act(() => result.current.pause());
      expect(mockAppend.mock.calls[0][2].levels).toEqual([50, 50, 50, 100, 100]);

      // While paused nothing is read; the next stretch starts afresh, and a
      // recorder that reports no level leaves it without levels (drawn flat).
      await act(async () => {
        jest.advanceTimersByTime(LEVEL_SAMPLE_MS * 5);
      });
      mockRecorder.getStatus.mockImplementation(() => ({ isRecording: true }));
      await act(() => result.current.resume());
      await act(async () => {
        jest.advanceTimersByTime(LEVEL_SAMPLE_MS * 3);
      });
      await act(() => result.current.finish());
      expect(mockAppend).toHaveBeenCalledTimes(2);
      expect(mockAppend.mock.calls[1][2]).not.toHaveProperty('levels');
    } finally {
      jest.useRealTimers();
    }
  });

  it('a recorder that throws when read (released) just stops adding levels', async () => {
    jest.useFakeTimers();
    try {
      const { result } = setup();
      await act(() => result.current.start());
      mockRecorder.getStatus.mockImplementation(() => {
        throw new Error('released');
      });
      await act(async () => {
        jest.advanceTimersByTime(LEVEL_SAMPLE_MS * 3);
      });
      expect(result.current.phase).toBe('recording');
      mockRecorder.getStatus.mockImplementation(() => ({ isRecording: true }));
      await act(() => result.current.finish());
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('haptics', () => {
  const run = async () => {
    const { result } = setup();
    await act(() => result.current.start());
    const afterStart = (Haptics.impactAsync as jest.Mock).mock.calls.length;
    await act(() => result.current.pause());
    await act(() => result.current.resume());
    const afterTaps = (Haptics.impactAsync as jest.Mock).mock.calls.length;
    await act(() => result.current.finish());
    return { afterStart, afterTaps };
  };

  it('one impact on start and on stop; pause and resume are taps, which do not buzz', async () => {
    const { afterStart, afterTaps } = await run();
    expect(afterStart).toBe(1);
    expect(afterTaps).toBe(1);
    expect(mockAppend).toHaveBeenCalledTimes(2); // it really recorded both stretches
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('with Settings → Haptics off: none', async () => {
    mockDesign.hapticsOn = false;
    await run();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });
});

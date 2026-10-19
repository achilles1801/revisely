// Reproduces "Couldn't start recording" (Sentry adac3b30…: prepareToRecordAsync →
// "Failed to configure audio session: Session activation failed") with the
// real audio coordinator, recitation player and recorder hook against a
// simulated iOS audio session: activating right after the app deactivated it
// (which also notified other apps to take the audio back) fails.
import { act, renderHook } from '@testing-library/react-native';
import { Alert, AppState } from 'react-native';

const mockLog: string[] = [];
const mockSession = { active: false, deactivatedSinceActivation: false };
const mockActivate = () => {
  if (mockSession.deactivatedSinceActivation) {
    throw new Error('Audio recording error: Failed to configure audio session: Session activation failed');
  }
  mockSession.active = true;
};
let mockUriN = 0;
const mockRecorder: any = {
  uri: null,
  prepareToRecordAsync: jest.fn(async () => {
    mockLog.push('prepare');
    mockActivate(); // native prepare: setCategory(.playAndRecord) + setActive(true)
    mockUriN += 1;
    mockRecorder.uri = `cache/seg-${mockUriN}.m4a`;
  }),
  record: jest.fn(() => mockLog.push('record')),
  stop: jest.fn(async () => mockLog.push('stop')),
  getStatus: () => ({ isRecording: true }),
};

jest.mock('expo-audio', () => ({
  AudioQuality: { MAX: 127 },
  IOSOutputFormat: { MPEG4AAC: 'aac ' },
  useAudioRecorder: () => mockRecorder,
  getRecordingPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
  requestRecordingPermissionsAsync: async () => ({ granted: true }),
  setAudioModeAsync: async (m: any) => {
    mockLog.push(`mode:${m.allowsRecording ? 'record' : 'play'}`);
  },
  setIsAudioActiveAsync: async (a: boolean) => {
    mockLog.push(`active:${a}`);
    if (a) mockActivate();
    else {
      mockSession.active = false;
      mockSession.deactivatedSinceActivation = true;
    }
  },
  createAudioPlayer: (_src: any, opts: any) => ({
    opts,
    replace: jest.fn(),
    play: jest.fn(() => mockLog.push('player.play')),
    // Without keepAudioSessionActive, native pause deactivates the session.
    pause: jest.fn(() => {
      mockLog.push('player.pause');
      if (!opts?.keepAudioSessionActive) {
        mockSession.active = false;
        mockSession.deactivatedSinceActivation = true;
      }
    }),
    remove: jest.fn(),
    addListener: jest.fn(),
  }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'm', Light: 'l' },
  NotificationFeedbackType: { Success: 's' },
}));
jest.mock('../../lib/recordings', () => {
  const actual = jest.requireActual('../../lib/recordings');
  return {
    ...actual,
    appendSegment: async (id: string | null) => ({ id: id ?? 'rec-1', kept: true, restarted: false }),
    findRevisionRecording: async () => null,
  };
});
jest.mock('../../lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), log: jest.fn() } }));

import { useVoiceRecorder } from '../useVoiceRecorder';
import { getRecitation } from '../../lib/recitation';
import { claimAudio } from '../../lib/audioFocus';

beforeEach(() => {
  mockLog.length = 0;
  mockSession.active = false;
  mockSession.deactivatedSinceActivation = false;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: () => undefined }) as any);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

const setup = () =>
  renderHook(() => useVoiceRecorder({ kind: 'revision', day: '2026-10-20', currentPage: 3 }));

const expectRecordingStarted = (result: any) => {
  expect(result.current.phase).toBe('recording');
  expect(Alert.alert).not.toHaveBeenCalled();
  // Recording mode and an active session come before every prepare.
  const prepares = mockLog.reduce<number[]>((acc, e, i) => (e === 'prepare' ? [...acc, i] : acc), []);
  for (const i of prepares) {
    const before = mockLog.slice(0, i);
    expect(before.lastIndexOf('mode:record')).toBeGreaterThan(before.lastIndexOf('mode:play'));
    expect(before.lastIndexOf('active:true')).toBeGreaterThan(before.lastIndexOf('mode:record'));
  }
  expect(mockLog).not.toContain('active:false');
};

describe('starting a recording', () => {
  it('works on the first tap from a cold start', async () => {
    const { result } = setup();
    await act(() => result.current.start());
    expectRecordingStarted(result);
    await act(() => result.current.finish());
  });

  it('works after a recitation played and stopped', async () => {
    const r = getRecitation();
    r.play({ sura: 1, ayah: 1 });
    r.stop();
    const { result } = setup();
    await act(() => result.current.start());
    expectRecordingStarted(result);
    await act(() => result.current.finish());
  });

  it('works while a recitation is still playing (it is stopped first)', async () => {
    getRecitation().play({ sura: 1, ayah: 2 });
    const { result } = setup();
    await act(() => result.current.start());
    expectRecordingStarted(result);
    expect(getRecitation().getState().status).toBe('idle');
    await act(() => result.current.finish());
  });

  it('works after a recording was played back', async () => {
    claimAudio('recording-playback', 'activity-list');
    const { result } = setup();
    await act(() => result.current.start());
    expectRecordingStarted(result);
    await act(() => result.current.finish());
  });

  it('works after pause and resume, and when recording again after finishing', async () => {
    const { result } = setup();
    await act(() => result.current.start());
    await act(() => result.current.pause());
    await act(() => result.current.resume());
    expectRecordingStarted(result);
    await act(() => result.current.finish());
    await act(() => result.current.start());
    expectRecordingStarted(result);
    await act(() => result.current.finish());
  });
});

const mockCalls: string[] = [];
jest.mock('expo-audio', () => ({
  setAudioModeAsync: (m: any) => {
    mockCalls.push(`mode:${m.allowsRecording ? 'record' : 'play'}`);
    return Promise.resolve();
  },
  setIsAudioActiveAsync: (a: boolean) => {
    mockCalls.push(`active:${a}`);
    return Promise.resolve();
  },
}));

import { claimAudio, enterRecordingMode, isAudioSessionError, onAudioClaimed } from '../audioFocus';

beforeEach(() => (mockCalls.length = 0));

describe('audio focus', () => {
  it('tells everyone else who has taken the audio', () => {
    const heard: string[] = [];
    const off = onAudioClaimed((activity, owner) => heard.push(`${activity}:${owner}`));
    claimAudio('recorder', 'revision');
    off();
    claimAudio('recitation', 'reader');
    expect(heard).toEqual(['recorder:revision']);
  });

  it('enters recording mode before activating, and never deactivates', async () => {
    await enterRecordingMode();
    expect(mockCalls).toEqual(['mode:record', 'active:true']);
  });

  it('recognises the session refusing to activate', () => {
    const native = new Error("Calling the 'prepareToRecordAsync' function has failed");
    (native as any).cause = new Error(
      'Audio recording error: Failed to configure audio session: Session activation failed',
    );
    expect(isAudioSessionError(native)).toBe(true);
    expect(isAudioSessionError(new Error('Failed to prepare recorder'))).toBe(false);
    expect(isAudioSessionError(undefined)).toBe(false);
  });
});

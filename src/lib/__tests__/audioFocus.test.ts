const mockSetActive = jest.fn((_a: boolean) => Promise.resolve());
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  setIsAudioActiveAsync: (a: boolean) => mockSetActive(a),
}));

import { claimAudio, onAudioClaimed, releaseAudioSession } from '../audioFocus';

beforeEach(() => mockSetActive.mockClear());

describe('audio focus', () => {
  it('tells everyone else who has taken the audio', () => {
    const heard: string[] = [];
    const off = onAudioClaimed((activity, owner) => heard.push(`${activity}:${owner}`));
    claimAudio('recorder', 'revision');
    off();
    claimAudio('recitation', 'reader');
    expect(heard).toEqual(['recorder:revision']);
  });

  it('only whoever has the audio can release the session (which pauses every player)', () => {
    claimAudio('recorder', 'revision');
    claimAudio('recording-playback', 'activity-list'); // paused recording, now playing one back
    releaseAudioSession('revision'); // the paused recording ends: must not stop the playback
    expect(mockSetActive).not.toHaveBeenCalled();
    releaseAudioSession('activity-list');
    expect(mockSetActive).toHaveBeenCalledWith(false);
    mockSetActive.mockClear();
    releaseAudioSession('activity-list'); // already released
    expect(mockSetActive).not.toHaveBeenCalled();
  });
});

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { claimAudio } from '../../audioFocus';
import { hearingNow, playReference, stopHearing } from '../hearAudio';

const made = () => (createAudioPlayer as jest.Mock).mock.results.map((r) => r.value as { play: jest.Mock; pause: jest.Mock; remove: jest.Mock; addListener: jest.Mock });

beforeEach(() => {
  stopHearing();
  jest.clearAllMocks();
});

describe('what a mark’s card plays (Hear it): a player of its own (Majd, Nov 15 2026)', () => {
  it('the reciter’s ayah, once, from the speaker (playback mode first)', async () => {
    await playReference({ sura: 12, ayah: 87 });
    expect((createAudioPlayer as jest.Mock).mock.calls[0][0]).toEqual({ uri: expect.stringMatching(/\/012087\.mp3$/) });
    expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsRecording: false }));
    expect(made()[0].play).toHaveBeenCalled();
    expect(hearingNow()).toBe(true);
  });

  it('stops: by itself at the end of the ayah, or when told', async () => {
    await playReference({ sura: 12, ayah: 87 });
    const p = made()[0];
    const onStatus = p.addListener.mock.calls[0][1] as (s: { didJustFinish?: boolean }) => void;
    onStatus({ didJustFinish: true });
    expect(p.remove).toHaveBeenCalled();
    expect(hearingNow()).toBe(false);
    await playReference({ sura: 12, ayah: 88 });
    stopHearing();
    expect(made()[1].remove).toHaveBeenCalled();
  });

  it('anything else taking the audio stops it: a take’s microphone, the player’s ▶, a recording', async () => {
    for (const activity of ['recorder', 'recitation', 'recording-playback'] as const) {
      await playReference({ sura: 12, ayah: 87 });
      const p = made().at(-1)!;
      claimAudio(activity, 'someone-else');
      expect(p.remove).toHaveBeenCalled();
      expect(hearingNow()).toBe(false);
    }
  });

  it('a second ayah replaces the first; never two at once', async () => {
    await playReference({ sura: 12, ayah: 87 });
    await playReference({ sura: 12, ayah: 88 });
    expect(made()[0].remove).toHaveBeenCalled();
    expect(made()[1].remove).not.toHaveBeenCalled();
  });
});

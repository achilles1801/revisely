import AsyncStorage from '@react-native-async-storage/async-storage';
import { audioOptionsKey, getAudioOptions, loadAudioOptions, updateAudioOptions } from '../audioOptions';
import { DEFAULT_PLAYBACK } from '../playbackPlan';

beforeEach(async () => {
  await AsyncStorage.clear();
  await loadAudioOptions(null);
});

describe('Audio Options per account', () => {
  it('a new account starts from the defaults', async () => {
    expect(await loadAudioOptions('a')).toEqual(DEFAULT_PLAYBACK);
  });

  it('are kept for the account and come back for it, not for another', async () => {
    await loadAudioOptions('a');
    updateAudioOptions({ speed: 1.25, repeat: Infinity, pauseFactor: 1, playUpTo: 'surah' });
    await new Promise((r) => setTimeout(r, 0));
    expect(await loadAudioOptions('b')).toEqual(DEFAULT_PLAYBACK);
    expect(await loadAudioOptions('a')).toEqual({ speed: 1.25, repeat: Infinity, pauseFactor: 1, playUpTo: 'surah' });
  });

  it('values not on the menus are not kept', async () => {
    await loadAudioOptions('a');
    updateAudioOptions({ speed: 3 });
    expect(getAudioOptions().speed).toBe(1);
  });

  it('an unreadable save falls back to the defaults', async () => {
    await AsyncStorage.setItem(audioOptionsKey('a'), '{nope');
    expect(await loadAudioOptions('a')).toEqual(DEFAULT_PLAYBACK);
  });
});

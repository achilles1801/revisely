const mockPlayers: any[] = [];
const mockSetActive = jest.fn((_active: boolean) => Promise.resolve());
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  setIsAudioActiveAsync: (active: boolean) => mockSetActive(active),
  createAudioPlayer: jest.fn((_src: any, mockOpts: any) => {
    const listeners: Array<(s: any) => void> = [];
    const p: any = {
      source: null as any,
      replace: jest.fn((src: any) => (p.source = src)),
      play: jest.fn(),
      pause: jest.fn(),
      setPlaybackRate: jest.fn(),
      shouldCorrectPitch: false,
      remove: jest.fn(),
      addListener: jest.fn((_: string, l: (s: any) => void) => listeners.push(l)),
      opts: mockOpts,
      emit: (s: any) => listeners.forEach((l) => l({ playing: false, didJustFinish: false, isBuffering: false, playbackState: '', ...s })),
    };
    mockPlayers.push(p);
    return p;
  }),
}));

const mockAppState: Array<(s: string) => void> = [];
jest.mock('react-native', () => ({
  AppState: { addEventListener: (_: string, l: (s: string) => void) => { mockAppState.push(l); return { remove() {} }; } },
}));

jest.mock('../logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), log: jest.fn() } }));

import {
  LOAD_TIMEOUT_MS,
  RECITERS,
  Recitation,
  recitationUrl,
  resolveVoice,
  voiceLabel,
  shortVoiceLabel,
} from '../recitation';

beforeEach(() => {
  mockPlayers.length = 0;
  mockAppState.length = 0;
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

describe('recitation', () => {
  it('builds the EveryAyah file URL for the chosen reciter and style', () => {
    expect(recitationUrl({ sura: 2, ayah: 255 })).toBe('https://everyayah.com/data/Husary_64kbps/002255.mp3');
    expect(recitationUrl({ sura: 18, ayah: 1 }, 'minshawi:mujawwad')).toBe(
      'https://everyayah.com/data/Minshawy_Mujawwad_192kbps/018001.mp3',
    );
    expect(recitationUrl({ sura: 114, ayah: 6 }, 'husary:muallim')).toBe(
      'https://everyayah.com/data/Husary_Muallim_128kbps/114006.mp3',
    );
  });

  it('plays a verse, follows on through the juz, and stops at its end', () => {
    const r = new Recitation();
    r.play({ sura: 2, ayah: 140 });
    const p = mockPlayers[0];
    expect(r.getState().status).toBe('loading');
    p.emit({ playing: true });
    expect(r.getState()).toEqual({ status: 'playing', verse: { sura: 2, ayah: 140 } });
    p.emit({ didJustFinish: true });
    expect(r.getState().verse).toEqual({ sura: 2, ayah: 141 });
    expect(p.source.uri).toMatch(/\/002141\.mp3$/);
    p.emit({ playing: true });
    p.emit({ didJustFinish: true }); // 2:141 is the last verse of juz 1
    expect(r.getState()).toEqual({ status: 'idle', verse: null });
  });

  it('playing another verse replaces the current one on the same player', () => {
    const r = new Recitation();
    r.play({ sura: 1, ayah: 1 });
    r.play({ sura: 2, ayah: 1 });
    expect(mockPlayers).toHaveLength(1);
    expect(r.getState().verse).toEqual({ sura: 2, ayah: 1 });
  });

  it('pauses when the app goes to the background, and resumes', () => {
    const r = new Recitation();
    r.play({ sura: 1, ayah: 1 });
    mockPlayers[0].emit({ playing: true });
    mockAppState.forEach((l) => l('background'));
    expect(r.getState().status).toBe('paused');
    r.resume();
    expect(r.getState().status).toBe('playing');
  });

  it('shows paused when iOS interrupts playback (a call)', () => {
    const r = new Recitation();
    r.play({ sura: 1, ayah: 1 });
    mockPlayers[0].emit({ playing: true });
    mockPlayers[0].emit({ playing: false });
    expect(r.getState().status).toBe('paused');
  });

  it('ignores a pause while buffering', () => {
    const r = new Recitation();
    r.play({ sura: 1, ayah: 1 });
    mockPlayers[0].emit({ playing: true });
    mockPlayers[0].emit({ playing: false, isBuffering: true });
    expect(r.getState().status).toBe('playing');
  });

  it('reports an error when a verse never starts (offline), and retries on resume', () => {
    const r = new Recitation();
    r.play({ sura: 1, ayah: 1 });
    jest.advanceTimersByTime(LOAD_TIMEOUT_MS + 1);
    expect(r.getState().status).toBe('error');
    r.resume();
    expect(r.getState().status).toBe('loading');
  });

  it('stop ends playback and ignores late events', () => {
    const r = new Recitation();
    r.play({ sura: 1, ayah: 1 });
    r.stop();
    mockPlayers[0].emit({ didJustFinish: true });
    expect(r.getState()).toEqual({ status: 'idle', verse: null });
  });

  it('belongs to the screen that started it', () => {
    const r = new Recitation();
    r.play({ sura: 1, ayah: 1 }, undefined, 'reader');
    mockPlayers[0].emit({ playing: true });
    expect(r.getState().owner).toBe('reader');
    r.stop('revision'); // another screen leaving does not stop it
    expect(r.getState().status).toBe('playing');
    mockPlayers[0].emit({ didJustFinish: true }); // follows on, same owner
    expect(r.getState().owner).toBe('reader');
    r.stop('reader');
    expect(r.getState().status).toBe('idle');
  });

  it('tells subscribers which screen owns the recitation', () => {
    const r = new Recitation();
    const seen: any[] = [];
    r.subscribe((s) => seen.push(s));
    r.play({ sura: 1, ayah: 1 }, undefined, 'reader');
    mockPlayers[0].emit({ playing: true });
    expect(seen.map((s) => s.owner)).toEqual(['reader', 'reader']);
  });

  it('a pause just before the end does not move on to the next verse', () => {
    const r = new Recitation();
    r.play({ sura: 1, ayah: 1 });
    mockPlayers[0].emit({ playing: true });
    r.pause();
    mockPlayers[0].emit({ didJustFinish: true });
    expect(r.getState()).toMatchObject({ status: 'paused', verse: { sura: 1, ayah: 1 } });
  });

  it('a verse paused while loading loads again on resume (and can still time out)', () => {
    const r = new Recitation();
    r.play({ sura: 1, ayah: 1 });
    mockAppState.forEach((l) => l('background'));
    expect(r.getState().status).toBe('paused');
    r.resume();
    expect(r.getState().status).toBe('loading');
    jest.advanceTimersByTime(LOAD_TIMEOUT_MS + 1);
    expect(r.getState().status).toBe('error');
  });

  it('stops when a recording starts or plays', () => {
    const { claimAudio } = require('../audioFocus');
    const r = new Recitation();
    r.play({ sura: 1, ayah: 1 });
    mockPlayers[0].emit({ playing: true });
    claimAudio('recorder', 'revision-screen');
    expect(r.getState().status).toBe('idle');
  });

  it('changing the reciter restarts the verse in progress in the new voice', () => {
    const r = new Recitation();
    r.play({ sura: 1, ayah: 1 });
    mockPlayers[0].emit({ playing: true });
    r.setVoice('abdulbasit:mujawwad');
    expect(mockPlayers[0].source.uri).toBe('https://everyayah.com/data/Abdul_Basit_Mujawwad_128kbps/001001.mp3');
    expect(r.getState().status).toBe('loading');
  });

  it('a verse paused when the reciter changes resumes in the new voice', () => {
    const r = new Recitation();
    r.play({ sura: 1, ayah: 1 });
    mockPlayers[0].emit({ playing: true });
    r.pause();
    r.setVoice('minshawi:murattal');
    r.resume();
    expect(mockPlayers[0].source.uri).toBe('https://everyayah.com/data/Minshawy_Murattal_128kbps/001001.mp3');
  });

  it('changing the reciter while idle or paused just remembers it', () => {
    const r = new Recitation();
    r.setVoice('alafasy:murattal');
    expect(r.getVoice()).toBe('alafasy:murattal');
    expect(mockPlayers).toHaveLength(0);
  });
  it('keeps the audio session active and never deactivates it (deactivating broke the next recording)', () => {
    const { claimAudio } = require('../audioFocus');
    const r = new Recitation();
    r.play({ sura: 1, ayah: 1 });
    expect(mockPlayers[0].opts).toMatchObject({ keepAudioSessionActive: true });
    r.stop();
    r.play({ sura: 1, ayah: 2 });
    claimAudio('recorder', 'revision');
    expect(r.getState().status).toBe('idle');
    expect(mockSetActive).not.toHaveBeenCalledWith(false);
  });
});

describe('reciters', () => {
  it('fall back to Husary (murattal) for unknown choices, and to a reciter’s first style', () => {
    expect(resolveVoice(undefined).id).toBe('husary:murattal');
    expect(resolveVoice('nobody:murattal').id).toBe('husary:murattal');
    expect(resolveVoice('alafasy:mujawwad').id).toBe('alafasy:murattal'); // Alafasy has one style
    expect(resolveVoice('minshawi:mujawwad').id).toBe('minshawi:mujawwad');
  });

  it('are listed once each, every style with its own folder', () => {
    const ids = RECITERS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const folders = RECITERS.flatMap((r) => r.styles.map((s) => s.folder));
    expect(new Set(folders).size).toBe(folders.length);
    for (const r of RECITERS) {
      expect(r.styles.length).toBeGreaterThan(0);
      expect(new Set(r.styles.map((s) => s.style)).size).toBe(r.styles.length);
      expect(r.short.length).toBeGreaterThan(0);
    }
  });

  it('labels the style only when a reciter has more than one', () => {
    expect(voiceLabel(resolveVoice('husary:mujawwad'))).toBe('Mahmoud Khalil Al-Husary · Mujawwad');
    expect(voiceLabel(resolveVoice('alafasy:murattal'))).toBe('Mishary Rashid Alafasy');
    expect(shortVoiceLabel(resolveVoice('husary:muallim'))).toBe("Al-Husary (Mu'allim)");
    expect(shortVoiceLabel(resolveVoice('alafasy:murattal'))).toBe('Alafasy');
  });
});

describe('Audio Options: repeats, pauses, speed', () => {
  const v = (sura: number, ayah: number) => ({ sura, ayah });
  const uri = (p: any) => String(p.source?.uri ?? '');
  /** The verse plays and ends, `seconds` long. */
  function playThrough(p: any, seconds = 4) {
    p.emit({ playing: true, duration: seconds });
    p.emit({ didJustFinish: true, duration: seconds });
  }

  it('plays each verse as many times as asked, then the next', () => {
    const r = new Recitation();
    r.setOptions({ repeat: 3 });
    r.play(v(2, 1));
    const p = mockPlayers[0];
    playThrough(p);
    playThrough(p);
    expect(r.getState().verse).toEqual(v(2, 1));
    expect(p.replace).toHaveBeenCalledTimes(3);
    playThrough(p);
    expect(r.getState().verse).toEqual(v(2, 2));
    expect(uri(p)).toMatch(/002002\.mp3$/);
  });

  it('a loop keeps repeating the verse until stopped', () => {
    const r = new Recitation();
    r.setOptions({ repeat: Infinity });
    r.play(v(1, 1));
    const p = mockPlayers[0];
    for (let i = 0; i < 12; i++) playThrough(p);
    expect(r.getState()).toMatchObject({ status: 'loading', verse: v(1, 1) });
    r.stop();
    playThrough(p);
    expect(r.getState().status).toBe('idle');
  });

  it('pauses after each verse for its own length times the setting, scaled by the speed', () => {
    const r = new Recitation();
    r.setOptions({ pauseFactor: 1, speed: 2 });
    r.play(v(2, 1));
    const p = mockPlayers[0];
    playThrough(p, 4); // 4 s of audio at 2x took 2 s: a 2 s pause
    expect(r.getState()).toMatchObject({ status: 'playing', verse: v(2, 1) });
    jest.advanceTimersByTime(1999);
    expect(r.getState().verse).toEqual(v(2, 1));
    jest.advanceTimersByTime(1);
    expect(r.getState().verse).toEqual(v(2, 2));
  });

  it('the pause comes between repeats too', () => {
    const r = new Recitation();
    r.setOptions({ repeat: 2, pauseFactor: 0.5 });
    r.play(v(2, 1));
    const p = mockPlayers[0];
    playThrough(p, 6);
    expect(p.replace).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(3000);
    expect(p.replace).toHaveBeenCalledTimes(2);
    expect(r.getState().verse).toEqual(v(2, 1));
  });

  it('speed changes at once and keeps the pitch; every new verse plays at it', () => {
    const r = new Recitation();
    r.play(v(2, 1));
    const p = mockPlayers[0];
    r.setOptions({ speed: 1.5 });
    expect(p.setPlaybackRate).toHaveBeenLastCalledWith(1.5, 'high');
    expect(p.shouldCorrectPitch).toBe(true);
    p.setPlaybackRate.mockClear();
    playThrough(p);
    expect(p.setPlaybackRate).toHaveBeenCalledWith(1.5, 'high');
  });

  it('Pause during the pause after a verse holds it; Play goes straight on', () => {
    const r = new Recitation();
    r.setOptions({ pauseFactor: 2 });
    r.play(v(2, 1));
    const p = mockPlayers[0];
    playThrough(p, 5);
    r.pause();
    expect(r.getState()).toMatchObject({ status: 'paused', verse: v(2, 1) });
    jest.advanceTimersByTime(60_000);
    expect(r.getState().verse).toEqual(v(2, 1));
    r.resume();
    expect(r.getState()).toMatchObject({ status: 'loading', verse: v(2, 2) });
  });

  it('an interruption between verses (the app goes to the background) pauses, and resumes on', () => {
    const r = new Recitation();
    r.setOptions({ pauseFactor: 1 });
    r.play(v(2, 1));
    const p = mockPlayers[0];
    playThrough(p, 3);
    // The finished player reports it stopped: not an interruption.
    p.emit({ playing: false });
    expect(r.getState().status).toBe('playing');
    mockAppState.forEach((l) => l('background'));
    expect(r.getState().status).toBe('paused');
    r.resume();
    expect(r.getState().verse).toEqual(v(2, 2));
  });

  it('Stop during the pause after a verse ends it', () => {
    const r = new Recitation();
    r.setOptions({ pauseFactor: 1 });
    r.play(v(2, 1));
    playThrough(mockPlayers[0], 3);
    r.stop();
    jest.advanceTimersByTime(10_000);
    expect(r.getState().status).toBe('idle');
  });

  it('a range ends after its last verse, repeats included', () => {
    const r = new Recitation();
    r.setOptions({ repeat: 2 });
    const last = v(2, 3);
    r.play(v(2, 2), (x) => (x.ayah < last.ayah ? v(2, x.ayah + 1) : null));
    const p = mockPlayers[0];
    playThrough(p);
    playThrough(p);
    expect(r.getState().verse).toEqual(last);
    playThrough(p);
    expect(r.getState().verse).toEqual(last);
    playThrough(p);
    expect(r.getState().status).toBe('idle');
  });
});

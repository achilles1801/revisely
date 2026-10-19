const mockPlayers: any[] = [];
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  createAudioPlayer: jest.fn(() => {
    const listeners: Array<(s: any) => void> = [];
    const p: any = {
      source: null as any,
      replace: jest.fn((src: any) => (p.source = src)),
      play: jest.fn(),
      pause: jest.fn(),
      remove: jest.fn(),
      addListener: jest.fn((_: string, l: (s: any) => void) => listeners.push(l)),
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

import { LOAD_TIMEOUT_MS, Recitation, recitationUrl } from '../recitation';

beforeEach(() => {
  mockPlayers.length = 0;
  mockAppState.length = 0;
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

describe('recitation', () => {
  it('builds Husary’s file URL from the verse’s global number', () => {
    expect(recitationUrl({ sura: 2, ayah: 255 })).toBe(
      'https://cdn.islamic.network/quran/audio/64/ar.husary/262.mp3',
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
    expect(p.source.uri).toMatch(/\/148\.mp3$/);
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
});

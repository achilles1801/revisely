// Verse-by-verse recitation for "Play" on a held verse.
//
// One player for the whole app: starting a verse stops whatever was playing.
// Playback continues verse by verse to the end of the juz (the default `advance`),
// pauses when the app leaves the foreground or iOS interrupts audio (a call,
// another app), and gives up on a verse that does not start within
// LOAD_TIMEOUT_MS (offline). Audio comes from the alquran.cloud CDN, one file per
// verse, named by the verse's position in the whole Qur'an.

import { AppState } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { globalVerseNumber, nextVerseInJuz, VerseKey } from './verses';
import { logger } from './logger';

export interface ReciterInfo {
  id: string;
  name: string;
  url: (globalVerse: number) => string;
}

export const RECITERS: ReciterInfo[] = [
  {
    id: 'husary',
    name: 'Mahmoud Khalil Al-Husary',
    url: (n) => `https://cdn.islamic.network/quran/audio/64/ar.husary/${n}.mp3`,
  },
];
export const DEFAULT_RECITER_ID = 'husary';

export function recitationUrl(v: VerseKey, reciterId: string = DEFAULT_RECITER_ID): string {
  const reciter = RECITERS.find((r) => r.id === reciterId) ?? RECITERS[0];
  return reciter.url(globalVerseNumber(v));
}

export type RecitationStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface RecitationState {
  status: RecitationStatus;
  verse: VerseKey | null;
}

export const LOAD_TIMEOUT_MS = 15_000;

type Listener = (state: RecitationState) => void;

export class Recitation {
  private player: AudioPlayer | null = null;
  private state: RecitationState = { status: 'idle', verse: null };
  private listeners = new Set<Listener>();
  private advance: (v: VerseKey) => VerseKey | null = nextVerseInJuz;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private audioModeSet = false;

  constructor(private reciterId: string = DEFAULT_RECITER_ID) {
    AppState.addEventListener('change', (s) => {
      if (s !== 'active') this.pause();
    });
  }

  getState(): RecitationState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private set(state: RecitationState) {
    this.state = state;
    this.listeners.forEach((l) => l(state));
  }

  private ensurePlayer(): AudioPlayer {
    if (!this.audioModeSet) {
      this.audioModeSet = true;
      setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
      }).catch((err) => logger.warn('Audio mode failed', err));
    }
    if (!this.player) {
      this.player = createAudioPlayer(null);
      this.player.addListener('playbackStatusUpdate', (s) => this.onStatus(s));
    }
    return this.player;
  }

  private clearLoadTimer() {
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.loadTimer = null;
  }

  /** Play `verse`, then (by default) the following verses to the end of its juz. */
  play(verse: VerseKey, advance: (v: VerseKey) => VerseKey | null = nextVerseInJuz) {
    this.advance = advance;
    const player = this.ensurePlayer();
    this.clearLoadTimer();
    this.set({ status: 'loading', verse });
    try {
      player.replace({ uri: recitationUrl(verse, this.reciterId) });
      player.play();
    } catch (err) {
      logger.warn('Recitation failed to start', err);
      this.set({ status: 'error', verse });
      return;
    }
    this.loadTimer = setTimeout(() => {
      if (this.state.status === 'loading' && this.state.verse === verse) {
        this.player?.pause();
        this.set({ status: 'error', verse });
      }
    }, LOAD_TIMEOUT_MS);
  }

  pause() {
    if (this.state.status !== 'playing' && this.state.status !== 'loading') return;
    this.clearLoadTimer();
    this.player?.pause();
    this.set({ status: 'paused', verse: this.state.verse });
  }

  resume() {
    const { status, verse } = this.state;
    if (!verse) return;
    if (status === 'error') return this.play(verse, this.advance);
    if (status !== 'paused') return;
    this.player?.play();
    this.set({ status: 'playing', verse });
  }

  stop() {
    this.clearLoadTimer();
    this.player?.pause();
    if (this.state.status !== 'idle') this.set({ status: 'idle', verse: null });
  }

  private onStatus(s: AudioStatus) {
    const { status, verse } = this.state;
    if (!verse || status === 'idle' || status === 'error') return;
    if (s.didJustFinish) {
      const next = this.advance(verse);
      if (next) this.play(next, this.advance);
      else this.stop();
      return;
    }
    if (s.playbackState === 'failed') {
      this.clearLoadTimer();
      this.set({ status: 'error', verse });
      return;
    }
    if (s.playing && status !== 'playing') {
      this.clearLoadTimer();
      this.set({ status: 'playing', verse });
    } else if (!s.playing && status === 'playing' && !s.isBuffering) {
      // Paused from outside: an interruption (call, Siri, another app).
      this.set({ status: 'paused', verse });
    }
  }
}

let shared: Recitation | null = null;
/** The app-wide recitation player. */
export function getRecitation(): Recitation {
  if (!shared) shared = new Recitation();
  return shared;
}

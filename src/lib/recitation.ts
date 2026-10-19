// Verse-by-verse recitation for "Play" on a held verse.
//
// One player for the whole app: starting a verse stops whatever was playing.
// Playback continues verse by verse to the end of the juz (the default `advance`),
// pauses when the app leaves the foreground or iOS interrupts audio (a call,
// another app), and gives up on a verse that does not start within
// LOAD_TIMEOUT_MS (offline).
//
// Audio comes from EveryAyah (everyayah.com), one file per verse named
// SSSAAA.mp3, in a folder per reciter and style. Every folder listed was checked
// to have the first and last verse of all 114 surahs plus a random sample.

import { AppState } from 'react-native';
import { createAudioPlayer, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { claimAudio, onAudioClaimed, setAudioMode } from './audioFocus';
import { nextVerseInJuz, VerseKey } from './verses';
import { logger } from './logger';

/**
 * How a reciter recites. Per-verse audio is organised by these styles, not by
 * maqam (a reciter moves between maqamat within one recitation).
 */
export type RecitationStyle = 'murattal' | 'mujawwad' | 'muallim';

export const STYLE_INFO: Record<RecitationStyle, { label: string; description: string }> = {
  murattal: { label: 'Murattal', description: 'Measured, at a steady pace' },
  mujawwad: { label: 'Mujawwad', description: 'Melodic, slower, with longer pauses' },
  muallim: { label: "Mu'allim", description: 'Teaching: each verse with a pause to repeat' },
};

export interface ReciterInfo {
  id: string;
  name: string;
  /** For tight spaces, e.g. "Al-Husary". */
  short: string;
  styles: { style: RecitationStyle; folder: string }[];
}

export const RECITERS: ReciterInfo[] = [
  {
    id: 'husary',
    name: 'Mahmoud Khalil Al-Husary',
    short: 'Al-Husary',
    styles: [
      { style: 'murattal', folder: 'Husary_64kbps' },
      { style: 'mujawwad', folder: 'Husary_Mujawwad_64kbps' },
      { style: 'muallim', folder: 'Husary_Muallim_128kbps' },
    ],
  },
  {
    id: 'minshawi',
    name: 'Muhammad Siddiq Al-Minshawi',
    short: 'Al-Minshawi',
    styles: [
      { style: 'murattal', folder: 'Minshawy_Murattal_128kbps' },
      // The 64 kbps folder is missing surahs 44-46.
      { style: 'mujawwad', folder: 'Minshawy_Mujawwad_192kbps' },
    ],
  },
  {
    id: 'abdulbasit',
    name: 'Abdul Basit Abdul Samad',
    short: 'Abdul Basit',
    styles: [
      { style: 'murattal', folder: 'Abdul_Basit_Murattal_64kbps' },
      { style: 'mujawwad', folder: 'Abdul_Basit_Mujawwad_128kbps' },
    ],
  },
  {
    id: 'alafasy',
    name: 'Mishary Rashid Alafasy',
    short: 'Alafasy',
    styles: [{ style: 'murattal', folder: 'Alafasy_64kbps' }],
  },
  {
    id: 'sudais',
    name: 'Abdur-Rahman As-Sudais',
    short: 'As-Sudais',
    styles: [{ style: 'murattal', folder: 'Abdurrahmaan_As-Sudais_64kbps' }],
  },
  {
    id: 'shuraim',
    name: "Sa'ud Ash-Shuraim",
    short: 'Ash-Shuraim',
    styles: [{ style: 'murattal', folder: 'Saood_ash-Shuraym_64kbps' }],
  },
  {
    id: 'muaiqly',
    name: 'Maher Al-Muaiqly',
    short: 'Al-Muaiqly',
    styles: [{ style: 'murattal', folder: 'MaherAlMuaiqly128kbps' }],
  },
  {
    id: 'ghamdi',
    name: "Sa'ad Al-Ghamdi",
    short: 'Al-Ghamdi',
    styles: [{ style: 'murattal', folder: 'Ghamadi_40kbps' }],
  },
  {
    id: 'ajamy',
    name: 'Ahmed ibn Ali Al-Ajamy',
    short: 'Al-Ajamy',
    styles: [{ style: 'murattal', folder: 'ahmed_ibn_ali_al_ajamy_128kbps' }],
  },
  {
    id: 'shatri',
    name: 'Abu Bakr Ash-Shatri',
    short: 'Ash-Shatri',
    styles: [{ style: 'murattal', folder: 'Abu_Bakr_Ash-Shaatree_64kbps' }],
  },
  {
    id: 'hudhaify',
    name: 'Ali Al-Hudhaify',
    short: 'Al-Hudhaify',
    styles: [{ style: 'murattal', folder: 'Hudhaify_128kbps' }],
  },
  {
    id: 'ayyub',
    name: 'Muhammad Ayyub',
    short: 'Muhammad Ayyub',
    styles: [{ style: 'murattal', folder: 'Muhammad_Ayyoub_64kbps' }],
  },
  {
    id: 'tablawi',
    name: 'Mohammad Al-Tablawi',
    short: 'Al-Tablawi',
    styles: [{ style: 'murattal', folder: 'Mohammad_al_Tablaway_64kbps' }],
  },
  {
    id: 'dossari',
    name: 'Yasser Ad-Dossari',
    short: 'Ad-Dossari',
    styles: [{ style: 'murattal', folder: 'Yasser_Ad-Dussary_128kbps' }],
  },
];

/** A saved choice: `<reciter id>:<style>`, e.g. 'husary:mujawwad'. */
export const DEFAULT_VOICE = 'husary:murattal';

export interface Voice {
  reciter: ReciterInfo;
  style: RecitationStyle;
  folder: string;
  /** The choice as saved. */
  id: string;
}

/** The voice for a saved choice; unknown reciters or styles fall back sensibly. */
export function resolveVoice(choice: string | null | undefined): Voice {
  const [reciterId, style] = (choice ?? '').split(':');
  const reciter = RECITERS.find((r) => r.id === reciterId) ?? RECITERS[0];
  const entry = reciter.styles.find((s) => s.style === style) ?? reciter.styles[0];
  return { reciter, style: entry.style, folder: entry.folder, id: `${reciter.id}:${entry.style}` };
}

export function voiceLabel(voice: Voice): string {
  return voice.reciter.styles.length > 1
    ? `${voice.reciter.name} · ${STYLE_INFO[voice.style].label}`
    : voice.reciter.name;
}

export function recitationUrl(
  v: VerseKey,
  choice: string | null | undefined = DEFAULT_VOICE,
): string {
  const pad = (n: number) => String(n).padStart(3, '0');
  return `https://everyayah.com/data/${resolveVoice(choice).folder}/${pad(v.sura)}${pad(v.ayah)}.mp3`;
}

export type RecitationStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface RecitationState {
  status: RecitationStatus;
  verse: VerseKey | null;
  /** Which screen started it: screens stay mounted under other tabs, and each
   *  reacts only to its own recitation. */
  owner?: string;
}

export const LOAD_TIMEOUT_MS = 15_000;

type Listener = (state: RecitationState) => void;

export class Recitation {
  private player: AudioPlayer | null = null;
  private state: RecitationState = { status: 'idle', verse: null };
  private listeners = new Set<Listener>();
  private advance: (v: VerseKey) => VerseKey | null = nextVerseInJuz;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private owner: string | undefined;
  // Whether the current verse has started playing; a pause before that (e.g.
  // backgrounded while loading) resumes by loading it again.
  private started = false;

  private voice: string = DEFAULT_VOICE;

  constructor() {
    AppState.addEventListener('change', (s) => {
      if (s !== 'active') this.pause();
    });
    // A recording starting or playing takes over the audio.
    onAudioClaimed((activity) => {
      if (activity !== 'recitation') this.stop();
    });
  }

  getVoice(): string {
    return this.voice;
  }

  /** Choose the reciter and style; a verse in progress restarts in the new voice. */
  setVoice(choice: string | null | undefined) {
    const next = resolveVoice(choice).id;
    if (next === this.voice) return;
    this.voice = next;
    const { status, verse } = this.state;
    if (verse && (status === 'playing' || status === 'loading')) this.play(verse, this.advance);
    // A paused verse resumes in the new voice (resume reloads it).
    else if (status === 'paused') this.started = false;
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
    this.state = state.status === 'idle' ? state : { ...state, owner: this.owner };
    const current = this.state;
    this.listeners.forEach((l) => l(current));
  }

  private ensurePlayer(): AudioPlayer {
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
  play(
    verse: VerseKey,
    advance: (v: VerseKey) => VerseKey | null = nextVerseInJuz,
    owner: string | undefined = this.owner,
  ) {
    this.advance = advance;
    this.owner = owner;
    // Every time: recording or playing a recording may have changed the mode.
    setAudioMode(false);
    claimAudio('recitation', owner ?? 'recitation');
    const player = this.ensurePlayer();
    this.clearLoadTimer();
    this.started = false;
    this.set({ status: 'loading', verse });
    try {
      player.replace({ uri: recitationUrl(verse, this.voice) });
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
    if (!this.started) return this.play(verse, this.advance);
    this.player?.play();
    this.set({ status: 'playing', verse });
  }

  /** Stop playback; with `owner`, only if that screen started it. */
  stop(owner?: string) {
    if (owner !== undefined && this.state.owner !== owner) return;
    this.clearLoadTimer();
    this.player?.pause();
    if (this.state.status !== 'idle') this.set({ status: 'idle', verse: null });
  }

  private onStatus(s: AudioStatus) {
    const { status, verse } = this.state;
    if (!verse || status === 'idle' || status === 'error') return;
    if (s.didJustFinish) {
      // Only a verse that is playing moves on: a pause just before the end
      // stays paused.
      if (status !== 'playing') return;
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
    if (s.playing && status === 'loading') {
      this.started = true;
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

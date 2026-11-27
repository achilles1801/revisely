// A sound and a tap when a take marks a mistake (Revisely Dev; Majd, Nov 20 2026: "there should be some like error
// sound ... I can audibly hear the issue or that sound. So I know I just made a mistake").
//
// - What: two soft notes falling a fifth, 0.16 s, pure tones with no speech-like harmonics (assets/audio/mistake-cue.wav),
//   and a warning tap. Only for a mistake that counts (a word wrong, skipped or added; a haraka or letter slip): never a
//   "Not clear" or a tajweed note, and never for a mark the checker sends again (a resume) or one already cued.
// - Not too often: at most one cue every CUE_GAP_MS, so a burst of marks is one sound.
// - The microphone is on while it plays, so the sound must never be heard as recitation: it is short and quiet, and
//   played without taking the audio (claimAudio would stop the take). While iOS records it plays from the earpiece;
//   with headphones, in them.
// - Settings → Mushaf and Recite → "Sound on a mistake" turns it off (sound and tap). It plays in silent mode, as the take's audio
//   session does; the volume buttons set how loud.

import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { hapticOf } from '../../design/haptics';
import { isMistake, type Mark } from './contract';
import { logger } from '../logger';

/** Two cues at least this far apart (ms). */
export const CUE_GAP_MS = 700;
/** How loud the cue plays (0–1): heard over a reciter's own voice, never much in the microphone. */
const CUE_VOLUME = 0.7;

/** Whether a mark gets the cue: a mistake that counts, never Not clear, a corrected word (RECITE-33) or a tajweed note. */
export function cuesMark(m: Pick<Mark, 'kind' | 'sure' | 'corrected'>): boolean {
  return isMistake(m);
}

export interface CueDeps {
  now: () => number;
  sound: () => void;
  tap: () => void;
}

/**
 * The cue for a take: `mark` for each mark the take receives; it sounds once for each new mistake (by id), at most every
 * CUE_GAP_MS. `reset` for a new take.
 */
export function createMistakeCue(deps: CueDeps) {
  const cued = new Set<string>();
  let last = -Infinity;
  return {
    mark(m: Mark, on: boolean): boolean {
      if (!on || cued.has(m.id) || !cuesMark(m)) return false;
      cued.add(m.id);
      const now = deps.now();
      if (now - last < CUE_GAP_MS) return false;
      last = now;
      deps.sound();
      deps.tap();
      return true;
    },
    reset() {
      cued.clear();
      last = -Infinity;
    },
  };
}

let player: AudioPlayer | null = null;

/** The cue's sound, from a player made once and kept (playing it again is a seek and a play). */
export function playCueSound(): void {
  try {
    if (!player) {
      player = createAudioPlayer(require('../../../assets/audio/mistake-cue.wav'), { keepAudioSessionActive: true });
      player.volume = CUE_VOLUME;
    }
    const p = player;
    void p.seekTo(0).then(
      () => p.play(),
      () => p.play(),
    );
  } catch (err) {
    logger.warn('The mistake sound did not play', err);
  }
}

/** The cue's tap. */
export function playCueTap(): void {
  hapticOf('warning').catch(() => undefined);
}

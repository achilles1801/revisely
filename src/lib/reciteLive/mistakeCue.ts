// A sound and a tap when a take marks a mistake (Revisely Dev; Majd, Nov 20 2026: "there should be some like error
// sound ... I can audibly hear the issue or that sound. So I know I just made a mistake").
//
// - What: a red mark's sound or an amber mark's, and a warning tap (Majd, Nov 27 2026: "different mistakes should have
//   different sounds like red vs yellow"). A word wrong, skipped or added (red): two bell notes falling, G6 then D6,
//   0.34 s (assets/audio/mistake-word.wav). A wrong haraka or letter (amber): one lighter, higher note, A6, 0.22 s
//   (mistake-slip.wav). Both made from sine waves by scripts/make-mistake-cues.js, so they are ours. Only for a mistake
//   that counts: never a "Not clear" or a tajweed note, and never for a mark the checker sends again (a resume) or one
//   already cued.
// - Not too often: at most one cue every CUE_GAP_MS, so a burst of marks is one sound (the first mark's).
// - Loud enough (Majd, Nov 27 2026: "SUPER quiet i can barely hear it even with my max volume on"): while iOS records,
//   playback comes from the earpiece, which gives little below about 1 kHz and is quiet held away from the ear. The old
//   sound was 780 Hz then 520 Hz at -16 dBFS, played at 0.7, in the range the earpiece drops and the reciter's own voice
//   covers. These are at 1.2–1.8 kHz, where the earpiece and the ear are strongest, at -1 dBFS (amber -4), played at
//   full volume: 17 dB(A) louder in the file, about 22 dB through the earpiece (the script's model; measured by
//   `node scripts/make-mistake-cues.js --measure`). The speaker would be louder still, but it is an audio session change.
// - The microphone is on while it plays, so the sound must never be heard as recitation: short bell notes with no
//   speech-like run of harmonics, from the earpiece at the top of the phone, played without taking the audio
//   (claimAudio would stop the take). With headphones, in them.
// - Settings → Mushaf and Recite → "Sound on a mistake" turns it off (sound and tap). It plays in silent mode, as the take's audio
//   session does; the volume buttons set how loud.

import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { hapticOf } from '../../design/haptics';
import { isMistake, markGroup, type Mark } from './contract';
import { logger } from '../logger';

/** Two cues at least this far apart (ms). */
export const CUE_GAP_MS = 700;
/** How loud the cue plays (0–1): full, as the files are made at the level they should be heard at. */
const CUE_VOLUME = 1;

/** Which sound: a red mark's (a word wrong, skipped or added) or an amber mark's (a wrong haraka or letter). */
export type CueSound = 'word' | 'slip';

/** Whether a mark gets the cue: a mistake that counts, never Not clear, a corrected word (RECITE-33) or a tajweed note. */
export function cuesMark(m: Pick<Mark, 'kind' | 'sure' | 'corrected'>): boolean {
  return isMistake(m);
}

/**
 * A mark's sound, by the colour it shows (components/reciteLive/markColours' `colourGroup`, which is `markGroup` for a
 * mistake while COLOURS_FOLLOW_TIERS is off; a test holds them together), or null when it gets none.
 */
export function cueSoundOf(m: Pick<Mark, 'kind' | 'sure' | 'corrected'>): CueSound | null {
  if (!cuesMark(m)) return null;
  return markGroup(m) === 'word' ? 'word' : 'slip';
}

export interface CueDeps {
  now: () => number;
  sound: (which: CueSound) => void;
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
      const which = on && !cued.has(m.id) ? cueSoundOf(m) : null;
      if (!which) return false;
      cued.add(m.id);
      const now = deps.now();
      if (now - last < CUE_GAP_MS) return false;
      last = now;
      deps.sound(which);
      deps.tap();
      return true;
    },
    reset() {
      cued.clear();
      last = -Infinity;
    },
  };
}

const FILES: Record<CueSound, () => number> = {
  word: () => require('../../../assets/audio/mistake-word.wav'),
  slip: () => require('../../../assets/audio/mistake-slip.wav'),
};
const players: Partial<Record<CueSound, AudioPlayer>> = {};

/** A cue's sound, from a player made once for each sound and kept (playing it again is a seek and a play). */
export function playCueSound(which: CueSound): void {
  try {
    let p = players[which];
    if (!p) {
      p = createAudioPlayer(FILES[which](), { keepAudioSessionActive: true });
      p.volume = CUE_VOLUME;
      players[which] = p;
    }
    const player = p;
    void player.seekTo(0).then(
      () => player.play(),
      () => player.play(),
    );
  } catch (err) {
    logger.warn('The mistake sound did not play', err);
  }
}

/** The cue's tap. */
export function playCueTap(): void {
  hapticOf('warning').catch(() => undefined);
}

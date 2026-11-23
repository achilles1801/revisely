// What a mark's card plays (Revisely Dev): the reciter's ayah ("Hear it") or the reciter's own voice there ("Your
// recitation"), on a player of its own.
//
// Not the app's recitation (lib/recitation). That one is app-wide: the reader adopts it (its verse highlight, in the
// accent: a dark red band in Crimson that read as a mistake), it shows on the lock screen and the mini player, and it
// played on past the take, the card and the reader (Majd's Dev take, Nov 15 2026). This plays one ayah and stops when
// the card closes, the take is closed or a new one starts, or the reader goes (components/reciteLive and the reader).

import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { claimAudio, onAudioClaimed, setAudioMode } from '../audioFocus';
import { getRecitation, recitationUrl } from '../recitation';
import type { VerseKey } from '../verses';
import { logger } from '../logger';
import { writeClip } from './clipFile';

const OWNER = 'recite-hear';

let player: AudioPlayer | null = null;
let finished: { remove: () => void } | null = null;

// Anything else taking the audio (the player's ▶, a recording, a take's microphone) stops what the card plays.
onAudioClaimed((_activity, owner) => {
  if (owner !== OWNER) stopHearing();
});

/** Stop whatever the card is playing (nothing to stop is fine). */
export function stopHearing(): void {
  finished?.remove();
  finished = null;
  const p = player;
  player = null;
  if (!p) return;
  try {
    p.pause();
    p.remove();
  } catch {
    // Already gone.
  }
}

/** Whether the card is playing something now. */
export function hearingNow(): boolean {
  return player != null;
}

/** Play a file once on the card's player (playback mode first). */
async function playUri(uri: string, what: string): Promise<void> {
  stopHearing();
  // One audio at a time: the app's recitation and a recording's playback stop.
  claimAudio('recording-playback', OWNER);
  await setAudioMode(false);
  try {
    const p = createAudioPlayer({ uri }, { keepAudioSessionActive: true });
    player = p;
    finished = p.addListener('playbackStatusUpdate', (s: { didJustFinish?: boolean }) => {
      if (s.didJustFinish && player === p) stopHearing();
    });
    p.play();
  } catch (err) {
    logger.warn(`${what} did not play`, err);
    stopHearing();
  }
}

/**
 * "Your recitation": a moment of the take, the reciter's own voice at a mark (16 kHz mono, from the take kept on the
 * phone). Nothing leaves the phone.
 */
export async function playClip(pcm: Int16Array): Promise<void> {
  let uri: string;
  try {
    uri = writeClip(pcm);
  } catch (err) {
    logger.warn('Your recitation: the clip could not be written', err);
    return;
  }
  await playUri(uri, 'Your recitation'); // i18n-ignore (a name for the log)
}

/**
 * The reciter's `verse`, once, in the account's reciter. Playback mode first, so it comes from the speaker rather than
 * the earpiece; the take's microphone must already be paused (a recording session would hear it).
 */
export async function playReference(verse: VerseKey): Promise<void> {
  // i18n-ignore (a name for the log)
  await playUri(recitationUrl(verse, getRecitation().getVoice()), 'Hear it: the reciter’s ayah');
}

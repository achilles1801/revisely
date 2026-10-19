// One audio activity at a time: recitation, playing a recording, or recording.
// Starting one tells the others to stop (screens stay mounted under other
// tabs, so they can't rely on unmounting). Also the one place the app's audio
// mode is set, so every switch keeps the same settings.

import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';

export type AudioActivity = 'recitation' | 'recording-playback' | 'recorder';

type Listener = (claimedBy: AudioActivity, owner: string) => void;
const listeners = new Set<Listener>();

// Who has the audio now: only they may release the session.
let currentOwner: string | null = null;

/** Announce that `activity` (started by `owner`) is taking the audio. */
export function claimAudio(activity: AudioActivity, owner: string): void {
  currentOwner = owner;
  listeners.forEach((l) => l(activity, owner));
}

/** Be told when something else takes the audio; returns an unsubscribe. */
export function onAudioClaimed(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Players are created with keepAudioSessionActive: by default expo-audio
 * deactivates the audio session 0.1 s after any player pauses or finishes
 * unless a player is already *playing* — and one that was just told to play is
 * still loading then, so it fell silent (a recording right after a recitation
 * was stopped, and every segment after the first). The app releases the
 * session itself, here, when playback really ends, so other apps can resume.
 */
export function releaseAudioSession(owner: string): void {
  // Deactivating pauses every player, so only whoever has the audio may: a
  // screen that has since lost it must not stop the new playback.
  if (owner !== currentOwner) return;
  currentOwner = null;
  setIsAudioActiveAsync(false).catch(() => undefined);
}

/**
 * Playback or recording mode. Always `doNotMix` (other apps pause) and audible
 * in silent mode; recording mode is needed only while recording, since iOS then
 * routes playback to the earpiece.
 */
export function setAudioMode(recording: boolean): Promise<void> {
  return setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
    shouldPlayInBackground: false,
    allowsRecording: recording,
  }).catch(() => undefined);
}

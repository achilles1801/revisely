// One audio activity at a time: recitation, playing a recording, or recording.
// Starting one tells the others to stop (screens stay mounted under other
// tabs, so they can't rely on unmounting). Also the one place the app's audio
// mode is set, so every switch keeps the same settings.

import { setAudioModeAsync } from 'expo-audio';

export type AudioActivity = 'recitation' | 'recording-playback' | 'recorder';

type Listener = (claimedBy: AudioActivity, owner: string) => void;
const listeners = new Set<Listener>();

/** Announce that `activity` (started by `owner`) is taking the audio. */
export function claimAudio(activity: AudioActivity, owner: string): void {
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

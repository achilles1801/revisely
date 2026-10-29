// One audio activity at a time: recitation, playing a recording, or recording.
// Starting one tells the others to stop (screens stay mounted under other
// tabs, so they can't rely on unmounting). Also the one place the app's audio
// mode is set, so every switch keeps the same settings.

import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';

export type AudioActivity = 'recitation' | 'recording-playback' | 'recorder' | 'preview';

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
 * Players are created with keepAudioSessionActive: by default expo-audio
 * deactivates the audio session 0.1 s after any player pauses or finishes
 * unless a player is already *playing*, and one that was just told to play is
 * still loading then, so it fell silent. The app does not deactivate the
 * session itself either: deactivating (which notifies other apps, so they can
 * take the audio back) and then activating it again to record made the next
 * recording fail to start ("Session activation failed"). The session simply
 * stays active while the app is open; iOS releases it in the background.
 */

/**
 * Before a recorder prepares: recording mode first (awaited), then the session
 * active. expo-audio's prepare activates the session too; doing it here, in
 * order, means prepare finds it already active.
 */
export async function enterRecordingMode(): Promise<void> {
  await setAudioMode(true);
  await setIsAudioActiveAsync(true).catch(() => undefined);
}

/** Whether an error is the audio session refusing to activate. */
export function isAudioSessionError(err: unknown): boolean {
  const text = [err, (err as { cause?: unknown })?.cause]
    .map((e) => (e instanceof Error ? e.message : String(e ?? '')))
    .join(' ');
  return /audio session|session activation/i.test(text);
}

/**
 * Playback or recording mode. Always `doNotMix` (other apps pause) and audible
 * in silent mode; recording mode is needed only while recording, since iOS then
 * routes playback to the earpiece. Playback goes on in the background
 * (UIBackgroundModes audio): recitation carries on with the phone locked; a
 * recording's playback pauses itself (components/recordings/RecordingsList).
 * Recording in the background stays off (expo-audio's allowsBackgroundRecording).
 */
export function setAudioMode(recording: boolean): Promise<void> {
  return setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
    shouldPlayInBackground: true,
    allowsRecording: recording,
  }).catch(() => undefined);
}

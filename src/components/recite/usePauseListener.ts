// Listening for pauses in the reciter's voice (the hidden recite mode's "reveal
// when you pause"): the microphone's level, read ten times a second, through
// lib/recite/pauseDetector.
//
// One microphone: while the session is being recorded, the level comes from
// that recording (`externalLevel`); otherwise this opens its own recorder, for
// the level only. Its file is deleted when it stops; nothing is kept or sent.
// It isn't a recording: it doesn't take the recording lock (a paused recording
// keeps that) and doesn't count as capturing (playback may start and stop it).
// It gives the microphone up when the user records or resumes (`yieldMic`,
// before the recorder asks for it, and whenever another recorder claims the
// audio), when recitation or a recording plays (they claim the audio), when
// the app leaves the foreground, and when it is no longer `active`; then it
// picks it up again (except after playback: the user turns it back on).

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  AudioQuality,
  getRecordingPermissionsAsync,
  IOSOutputFormat,
  RecordingOptions,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { claimAudio, enterRecordingMode, onAudioClaimed, setAudioMode } from '../../lib/audioFocus';
import { isRecordingActive } from '../../lib/recordings';
import { getRecitation } from '../../lib/recitation';
import { createPauseDetector } from '../../lib/recite/pauseDetector';
import { logger } from '../../lib/logger';

/** For the level only: small and quiet on the disk (deleted on stop). */
export const LISTEN_PRESET: RecordingOptions = {
  isMeteringEnabled: true,
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 24000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.LOW,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 24000 },
};

const TICK_MS = 100;
/** After yielding to the user's recorder, how long before taking the microphone back if it didn't start. */
const YIELD_MS = 3000;
/** After a failed start, before trying again. */
const RETRY_MS = 3000;

/**
 * off: not listening. listening: hearing the room. paused: something else took
 * the audio (playback); the user turns it back on. denied: no microphone access.
 * error: the microphone couldn't be opened (a call), retried shortly.
 */
export type ListenStatus = 'off' | 'starting' | 'listening' | 'paused' | 'denied' | 'error';

export function usePauseListener({
  active,
  externalLevel,
  onPause,
}: {
  active: boolean;
  /** The level from the session's own recording, or null when it isn't recording. */
  externalLevel: () => number | null;
  /** A pause after voice. */
  onPause: () => void;
}) {
  const recorder = useAudioRecorder(LISTEN_PRESET);
  const [status, setStatus] = useState<ListenStatus>('off');
  const [hearing, setHearing] = useState(false);
  const [owner] = useState(() => `recite-listener-${Math.random().toString(36).slice(2)}`);
  const detectorRef = useRef(createPauseDetector());
  const ownRef = useRef(false);
  const startingRef = useRef(false);
  const blockedUntilRef = useRef(0);
  const deniedRef = useRef(false);
  const suspendedRef = useRef(false);
  const statusRef = useRef<ListenStatus>('off');
  const onPauseRef = useRef(onPause);
  onPauseRef.current = onPause;
  const externalRef = useRef(externalLevel);
  externalRef.current = externalLevel;

  const setBoth = (s: ListenStatus) => {
    if (statusRef.current === s) return;
    statusRef.current = s;
    setStatus(s);
  };

  const stopOwn = useCallback(async () => {
    if (!ownRef.current) return;
    ownRef.current = false;
    const uri = recorder.uri;
    try {
      await recorder.stop();
    } catch {
      // Not recording, or released.
    }
    await setAudioMode(false);
    if (uri) {
      try {
        const f = new File(uri);
        if (f.exists) f.delete();
      } catch (err) {
        logger.warn('Could not delete the listening file', err);
      }
    }
  }, [recorder]);

  const startOwn = useCallback(async () => {
    if (ownRef.current || startingRef.current) return;
    startingRef.current = true;
    try {
      let perm = await getRecordingPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        deniedRef.current = true;
        setBoth('denied');
        return;
      }
      // Someone else is capturing (another screen's recording): wait for them.
      if (isRecordingActive()) {
        blockedUntilRef.current = Date.now() + RETRY_MS;
        return;
      }
      claimAudio('recorder', owner);
      getRecitation().stop();
      await enterRecordingMode();
      await recorder.prepareToRecordAsync(LISTEN_PRESET);
      recorder.record();
      ownRef.current = true;
    } catch (err) {
      logger.warn('Could not start listening', err);
      blockedUntilRef.current = Date.now() + RETRY_MS;
      setBoth('error');
    } finally {
      startingRef.current = false;
    }
  }, [recorder, owner]);

  /** Before the user's recorder takes the microphone. */
  const yieldMic = useCallback(async () => {
    blockedUntilRef.current = Date.now() + YIELD_MS;
    await stopOwn();
  }, [stopOwn]);

  /** Listening again after playback took the audio, or after denied access was fixed. */
  const resume = useCallback(() => {
    suspendedRef.current = false;
    deniedRef.current = false;
    blockedUntilRef.current = 0;
    setBoth('starting');
  }, []);

  // Playback (recitation, a recording) takes the audio: stop and wait for the user.
  useEffect(
    () =>
      onAudioClaimed((activity, by) => {
        if (by === owner) return;
        if (activity === 'recorder') {
          // Another recorder: step aside; its level comes through externalLevel.
          blockedUntilRef.current = Date.now() + YIELD_MS;
          stopOwn();
          return;
        }
        if (!ownRef.current && statusRef.current === 'off') return;
        suspendedRef.current = true;
        stopOwn();
        setBoth('paused');
      }),
    [owner, stopOwn],
  );

  // The app leaving the foreground: no listening in the background.
  // ('inactive' is Control Center or a banner: listening goes on, as recording does.)
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s !== 'background'));
    return () => sub.remove();
  }, []);

  const on = active && foreground;
  useEffect(() => {
    if (!on) {
      stopOwn();
      detectorRef.current.reset();
      setHearing(false);
      if (!suspendedRef.current) setBoth('off');
      return;
    }
    if (!suspendedRef.current && !deniedRef.current) setBoth('starting');
    const id = setInterval(() => {
      if (suspendedRef.current || deniedRef.current) return;
      let db: number | null = null;
      const external = externalRef.current();
      if (external != null) {
        // The session's recording is on: listen through it.
        if (ownRef.current) stopOwn();
        db = external;
      } else if (ownRef.current) {
        try {
          const st = recorder.getStatus();
          if (st.isRecording) db = typeof st.metering === 'number' ? st.metering : null;
        } catch {
          db = null;
        }
      } else if (Date.now() >= blockedUntilRef.current) {
        startOwn();
      }
      if (db == null) return;
      setBoth('listening');
      const paused = detectorRef.current.feed(db, Date.now());
      setHearing((h) => (h === detectorRef.current.voice ? h : detectorRef.current.voice));
      if (paused) onPauseRef.current();
    }, TICK_MS);
    return () => {
      clearInterval(id);
      stopOwn();
    };
  }, [on, recorder, startOwn, stopOwn]);

  return { status, hearing, yieldMic, resume };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking } from 'react-native';
import {
  AudioQuality,
  IOSOutputFormat,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  type RecordingOptions,
  type RecordingStatus,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { getRecitation } from '../lib/recitation';
import {
  acquireRecording,
  PageMark,
  RecordingKind,
  releaseRecording,
  saveRecording,
} from '../lib/recordings';
import { claimAudio, setAudioMode } from '../lib/audioFocus';
import { logger } from '../lib/logger';

// Speech, mono: about 15 MB an hour.
const VOICE_PRESET: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.LOW,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};

export type RecorderPhase = 'idle' | 'starting' | 'recording' | 'saving';

interface Options {
  kind: RecordingKind;
  /** Revision day the recording belongs to. */
  day: string | null;
  /** The page on screen; changes are recorded as page marks. */
  currentPage: number | null;
  /** Called after a recording is saved. */
  onSaved?: () => void;
}

/**
 * Record yourself reciting. Asks for the microphone the first time (and points
 * to Settings when it was refused), stops any recitation playing, notes which
 * page is on screen as the recording goes, and saves on Stop, when the app
 * leaves the foreground, when iOS interrupts the recording (a call), or when
 * the screen closes. Recording in the background is not supported.
 */
export function useVoiceRecorder({ kind, day, currentPage, onSaved }: Options) {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const phaseRef = useRef<RecorderPhase>('idle');
  const marksRef = useRef<PageMark[]>([]);
  const startRef = useRef(0);
  const dayRef = useRef(day);
  const uriRef = useRef<string | null>(null);
  const [owner] = useState(() => `recorder-${Math.random().toString(36).slice(2)}`);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const finishRef = useRef<() => Promise<void>>(async () => {});

  const setPhaseBoth = (p: RecorderPhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // Leaving the screen saves the recording. Declared before useAudioRecorder:
  // cleanups run in order, so this stops the recorder before the library
  // releases it (the file location is already in uriRef).
  useEffect(
    () => () => {
      finishRef.current();
    },
    [],
  );

  const recorder = useAudioRecorder(VOICE_PRESET, (status: RecordingStatus) => {
    // Interrupted or failed (a call, another app taking the microphone): keep
    // what was recorded.
    if ((status.hasError || status.isFinished) && phaseRef.current === 'recording') {
      if (status.hasError) logger.warn('Recording interrupted', status.error);
      finishRef.current();
    }
  });

  const finish = useCallback(async () => {
    if (phaseRef.current !== 'recording') return;
    setPhaseBoth('saving');
    // Everything the save needs is read now, before any await: on unmount the
    // native recorder is released right after this returns.
    const durationMs = Date.now() - startRef.current;
    const uri = uriRef.current;
    const saveDay = dayRef.current;
    const marks = marksRef.current;
    const createdAt = startRef.current;
    let stopped: Promise<void> = Promise.resolve();
    try {
      stopped = recorder.stop();
    } catch (err) {
      logger.warn('Recorder stop failed', err);
    }
    try {
      await stopped.catch((err) => logger.warn('Recorder stop failed', err));
      releaseRecording(owner);
      // Back to playback routing (while recording is allowed, iOS plays
      // through the earpiece).
      setAudioMode(false);
      if (uri && saveDay) {
        const saved = await saveRecording(uri, {
          kind,
          day: saveDay,
          durationMs,
          pageMarks: marks,
          createdAt,
        });
        if (saved) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onSavedRef.current?.();
        }
      }
    } catch (err) {
      logger.error('Could not save recording', err);
      Alert.alert("Couldn't save the recording", 'Your device may be out of storage.');
    } finally {
      releaseRecording(owner);
      uriRef.current = null;
      setStartedAt(null);
      setPhaseBoth('idle');
    }
  }, [recorder, kind, owner]);
  finishRef.current = finish;

  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle' || !day) return;
    // One recording at a time across screens (tabs stay mounted).
    if (!acquireRecording(owner)) {
      Alert.alert('Already recording', 'Stop the other recording first.');
      return;
    }
    setPhaseBoth('starting');
    try {
      let perm = await getRecordingPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        releaseRecording(owner);
        setPhaseBoth('idle');
        Alert.alert(
          'Microphone access is off',
          'Allow Revisely to use the microphone in Settings to record your recitation.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      claimAudio('recorder', owner);
      getRecitation().stop();
      await setAudioMode(true);
      await recorder.prepareToRecordAsync();
      uriRef.current = recorder.uri;
      recorder.record();
      dayRef.current = day;
      startRef.current = Date.now();
      marksRef.current = currentPage != null ? [{ atMs: 0, page: currentPage }] : [];
      setStartedAt(startRef.current);
      setPhaseBoth('recording');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      logger.error('Could not start recording', err);
      releaseRecording(owner);
      uriRef.current = null;
      setAudioMode(false);
      setPhaseBoth('idle');
      Alert.alert("Couldn't start recording", 'Please try again.');
    }
  }, [day, currentPage, recorder, owner]);

  // Page marks while recording.
  useEffect(() => {
    if (phase !== 'recording' || currentPage == null) return;
    const marks = marksRef.current;
    if (marks.length === 0 || marks[marks.length - 1].page !== currentPage) {
      marks.push({ atMs: Date.now() - startRef.current, page: currentPage });
    }
  }, [currentPage, phase]);

  // An interruption that leaves the app active (an alarm, Siri) pauses the
  // recorder without an event: notice it and keep what was recorded.
  useEffect(() => {
    if (phase !== 'recording') return;
    let misses = 0;
    const id = setInterval(() => {
      try {
        misses = recorder.getStatus().isRecording ? 0 : misses + 1;
      } catch {
        misses += 1;
      }
      if (misses >= 2) finishRef.current();
    }, 1000);
    return () => clearInterval(id);
  }, [phase, recorder]);

  // No background recording: going to the background saves it. ('inactive' is
  // Control Center or a notification banner; recording goes on.)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') finishRef.current();
    });
    return () => sub.remove();
  }, []);

  return {
    phase,
    recording: phase === 'recording',
    startedAt,
    start,
    stop: finish,
  };
}

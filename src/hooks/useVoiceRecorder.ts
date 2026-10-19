import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking } from 'react-native';
import {
  AudioQuality,
  IOSOutputFormat,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
  type RecordingStatus,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { getRecitation } from '../lib/recitation';
import {
  PageMark,
  RecordingKind,
  saveRecording,
  setRecordingActive,
} from '../lib/recordings';
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
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const setPhaseBoth = (p: RecorderPhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const finishRef = useRef<() => Promise<void>>(async () => {});
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
    const durationMs = Date.now() - startRef.current;
    try {
      await recorder.stop();
    } catch (err) {
      logger.warn('Recorder stop failed', err);
    }
    setRecordingActive(false);
    // Back to playback routing (with recording allowed, iOS plays through the
    // earpiece).
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    const uri = recorder.uri;
    try {
      if (uri && dayRef.current) {
        const saved = await saveRecording(uri, {
          kind,
          day: dayRef.current,
          durationMs,
          pageMarks: marksRef.current,
          createdAt: startRef.current,
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
      setStartedAt(null);
      setPhaseBoth('idle');
    }
  }, [recorder, kind]);
  finishRef.current = finish;

  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle' || !day) return;
    setPhaseBoth('starting');
    try {
      let perm = await getRecordingPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
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
      getRecitation().stop();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      dayRef.current = day;
      startRef.current = Date.now();
      marksRef.current = currentPage != null ? [{ atMs: 0, page: currentPage }] : [];
      setRecordingActive(true);
      setStartedAt(startRef.current);
      setPhaseBoth('recording');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      logger.error('Could not start recording', err);
      setRecordingActive(false);
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      setPhaseBoth('idle');
      Alert.alert("Couldn't start recording", 'Please try again.');
    }
  }, [day, currentPage, recorder]);

  // Page marks while recording.
  useEffect(() => {
    if (phase !== 'recording' || currentPage == null) return;
    const marks = marksRef.current;
    if (marks.length === 0 || marks[marks.length - 1].page !== currentPage) {
      marks.push({ atMs: Date.now() - startRef.current, page: currentPage });
    }
  }, [currentPage, phase]);

  // No background recording: leaving the app saves it.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') finishRef.current();
    });
    return () => sub.remove();
  }, []);

  // Leaving the screen saves it.
  useEffect(() => () => {
    finishRef.current();
  }, []);

  return {
    phase,
    recording: phase === 'recording',
    startedAt,
    start,
    stop: finish,
  };
}

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
import { getRecitation } from '../lib/recitation';
import { useHaptics } from '../design/haptics';
import { addLevel, createLevelBuffer, dbToLevel, finishLevels, LEVEL_SAMPLE_MS } from '../lib/waveform';
import {
  acquireRecording,
  appendSegment,
  closeRecording,
  findRevisionRecording,
  PageMark,
  RecordingKind,
  rebaseMarks,
  releaseRecording,
  setCapturing,
} from '../lib/recordings';
import {
  claimAudio,
  enterRecordingMode,
  isAudioSessionError,
  setAudioMode,
} from '../lib/audioFocus';

/** Before the one retry when the audio session refuses to activate. */
export const SESSION_RETRY_DELAY_MS = 400;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
import { logger } from '../lib/logger';

// Close to Voice Memos: AAC at 48 kHz, mono (the phone's main microphone),
// 96 kbps at the encoder's highest quality. About 43 MB an hour. (The first
// version recorded 22 kHz at 32 kbps, which sounded thin and muffled.)
// Metering: the recorder reports its level, sampled for the waveform
// (lib/waveform); it doesn't change what is recorded.
export const VOICE_PRESET: RecordingOptions = {
  isMeteringEnabled: true,
  extension: '.m4a',
  sampleRate: 48000,
  numberOfChannels: 1,
  bitRate: 96000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MAX,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 96000 },
};

export type RecorderPhase = 'idle' | 'starting' | 'recording' | 'paused' | 'finishing';

interface Options {
  kind: RecordingKind;
  /** Revision day the recording belongs to. */
  day: string | null;
  /** The page on screen; changes are recorded as page marks. */
  currentPage: number | null;
  /** Called after something is saved (each paused stretch, and at the end). */
  onSaved?: () => void;
  /** Called when the user ends a recording that was saved (not when the
   *  screen closes), e.g. to offer "View". */
  onFinished?: (info: { day: string; recordingId: string }) => void;
}

/**
 * One recording per session, with pause and resume. Record starts it (asking
 * for the microphone the first time, pointing to Settings when it was refused);
 * Pause and Resume add to it; Stop finishes it. A revision session's recording
 * is the day's one recording: leaving the screen or the app pauses it, and it
 * is still there, paused, when the screen is opened again that day (even after
 * the app was closed), until Stop. A reading recording lasts while the reader
 * is open; leaving the reader finishes it.
 *
 * Each Pause finishes the current stretch as its own file and saves it at once,
 * so nothing is lost if the app is closed. A call, an alarm or Siri, and going
 * to the background, pause it; the user resumes when ready.
 */
export function useVoiceRecorder({ kind, day, currentPage, onSaved, onFinished }: Options) {
  // A recording starting and stopping is marked with one impact
  // (design/haptics); taps don't buzz.
  const haptics = useHaptics();
  const hapticsRef = useRef(haptics);
  hapticsRef.current = haptics;
  /** The start / stop impact; a haptics failure never stops a recording. */
  const buzz = () => {
    try {
      hapticsRef.current.impact();
    } catch {
      // No haptics here.
    }
  };
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  /** Time recorded before the current stretch (and before this visit). */
  const [baseMs, setBaseMs] = useState(0);
  const [segmentStartedAt, setSegmentStartedAt] = useState<number | null>(null);
  const [interrupted, setInterrupted] = useState(false);

  const phaseRef = useRef<RecorderPhase>('idle');
  const baseRef = useRef(0);
  const segStartRef = useRef(0);
  const uriRef = useRef<string | null>(null);
  const marksRef = useRef<PageMark[]>([]);
  // The microphone's level over the stretch in progress (its waveform).
  const levelsRef = useRef(createLevelBuffer());
  const dayRef = useRef(day);
  const recordingIdRef = useRef<string | null>(null);
  const createdAtRef = useRef(0);
  const savedAnyRef = useRef(false);
  // Segment saves run in order, so the second never starts a new recording
  // before the first has created it.
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const [owner] = useState(() => `recorder-${Math.random().toString(36).slice(2)}`);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  const pageRef = useRef(currentPage);
  pageRef.current = currentPage;

  const setPhaseBoth = (p: RecorderPhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const finishRef = useRef<() => Promise<void>>(async () => {});
  const leaveRef = useRef<() => Promise<void>>(async () => {});
  const pauseRef = useRef<(interruption?: boolean) => Promise<void>>(async () => {});
  // A revision recording outlives the screen (paused); a reading one doesn't.
  const keepsOpen = kind === 'revision';

  // Leaving the screen pauses a revision session (it stays open) and finishes
  // a reading one. Declared before useAudioRecorder: cleanups run in order, so
  // this stops the recorder before the library releases it (the file location
  // is already in uriRef).
  const unmountedRef = useRef(false);
  useEffect(
    () => () => {
      unmountedRef.current = true;
      leaveRef.current();
    },
    [],
  );
  // Asked to pause (e.g. the app went to the background) while a stretch was
  // still starting: honoured once it has started.
  const pendingPauseRef = useRef(false);
  // Stop asked for while there was nothing to stop yet (a start in progress,
  // or the reopened session not restored yet): honoured once there is.
  const stopRequestedRef = useRef(false);

  const recorder = useAudioRecorder(VOICE_PRESET, (status: RecordingStatus) => {
    // Interrupted or failed (a call, another app taking the microphone): keep
    // what was recorded and pause.
    if ((status.hasError || status.isFinished) && phaseRef.current === 'recording') {
      if (status.hasError) logger.warn('Recording interrupted', status.error);
      pauseRef.current(true);
    }
  });

  /** Stop the current stretch and queue its save. Reads everything synchronously. */
  const endSegment = useCallback((): Promise<void> => {
    const uri = uriRef.current;
    const segmentMs = Date.now() - segStartRef.current;
    const segmentStartMs = baseRef.current;
    const levels = finishLevels(levelsRef.current);
    levelsRef.current = createLevelBuffer();
    const info = {
      kind,
      day: dayRef.current ?? '',
      segmentMs,
      pageMarks: [...marksRef.current],
      segmentStartMs,
      createdAt: createdAtRef.current,
      open: keepsOpen,
      ...(levels.length > 0 ? { levels } : {}),
    };
    uriRef.current = null;
    baseRef.current += segmentMs;
    setCapturing(false);
    let stopped: Promise<void> = Promise.resolve();
    try {
      stopped = recorder.stop();
    } catch (err) {
      logger.warn('Recorder stop failed', err);
    }
    const run = saveChainRef.current.then(async () => {
      await stopped.catch((err) => logger.warn('Recorder stop failed', err));
      if (!uri || !info.day) return;
      try {
        const result = await appendSegment(recordingIdRef.current, uri, info);
        if (result.id) recordingIdRef.current = result.id;
        if (!result.kept) {
          // Dropped (too short): take its time back off the timeline.
          baseRef.current -= segmentMs;
          marksRef.current = marksRef.current.map((m) =>
            m.atMs > segmentStartMs ? { ...m, atMs: Math.max(segmentStartMs, m.atMs - segmentMs) } : m,
          );
          setBaseMs(baseRef.current);
        } else {
          if (result.restarted) {
            // The recording being continued was deleted meanwhile: this
            // stretch began a new one, whose timeline starts here.
            baseRef.current -= segmentStartMs;
            marksRef.current = rebaseMarks(marksRef.current, segmentStartMs);
            setBaseMs(baseRef.current);
          }
          savedAnyRef.current = true;
          onSavedRef.current?.();
        }
      } catch (err) {
        logger.error('Could not save recording', err);
        Alert.alert("Couldn't save the recording", 'Your device may be out of storage.');
      }
    });
    saveChainRef.current = run;
    return run;
  }, [recorder, kind, keepsOpen]);

  /** Start a new stretch (first one or a resume). */
  const startSegment = useCallback(async () => {
    // The previous stretch's file must be moved away before anything else.
    await saveChainRef.current;
    // Recitation and recording playback stop (claimAudio tells them).
    claimAudio('recorder', owner);
    getRecitation().stop();
    // Recording mode, then the session active, then prepare (lib/audioFocus).
    // With options, each prepare records to a new file (without them the
    // recorder reuses one path, and preparing would overwrite the last stretch).
    await enterRecordingMode();
    try {
      await recorder.prepareToRecordAsync(VOICE_PRESET);
    } catch (err) {
      // iOS can refuse to activate the session for a moment (another app
      // handing back the audio): wait, set it up again, try once more.
      if (!isAudioSessionError(err)) throw err;
      logger.warn('Audio session busy, retrying', err);
      await wait(SESSION_RETRY_DELAY_MS);
      await enterRecordingMode();
      await recorder.prepareToRecordAsync(VOICE_PRESET);
    }
    uriRef.current = recorder.uri;
    levelsRef.current = createLevelBuffer();
    recorder.record();
    segStartRef.current = Date.now();
    setCapturing(true);
    const page = pageRef.current;
    const marks = marksRef.current;
    if (page != null && (marks.length === 0 || marks[marks.length - 1].page !== page)) {
      marks.push({ atMs: baseRef.current, page });
    }
    setBaseMs(baseRef.current);
    setSegmentStartedAt(segStartRef.current);
    setInterrupted(false);
    setPhaseBoth('recording');
    // The screen closed, or the app left the foreground, while this was starting.
    if (stopRequestedRef.current) {
      await finishRef.current();
    } else if (unmountedRef.current) {
      await leaveRef.current();
    } else if (pendingPauseRef.current) {
      pendingPauseRef.current = false;
      await pauseRef.current(true);
    }
  }, [recorder, owner]);

  /** After a failed start or resume: back to playback, nothing capturing. */
  const abandonStart = useCallback(() => {
    setCapturing(false);
    uriRef.current = null;
    try {
      recorder.stop().catch(() => undefined);
    } catch {
      // Not prepared, or already released.
    }
    setAudioMode(false);
  }, [recorder]);

  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle' || !day) return;
    stopRequestedRef.current = false;
    // One recording session at a time across screens (tabs stay mounted).
    if (!acquireRecording(owner)) {
      Alert.alert('Already recording', 'Finish the other recording first.');
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
      dayRef.current = day;
      savedAnyRef.current = false;
      createdAtRef.current = Date.now();
      // A day's revision is one session: carry on its recording.
      const existing = kind === 'revision' ? await findRevisionRecording(day) : null;
      recordingIdRef.current = existing?.id ?? null;
      baseRef.current = existing?.durationMs ?? 0;
      marksRef.current = existing ? [...existing.pageMarks] : [];
      await startSegment();
      buzz();
    } catch (err) {
      logger.error('Could not start recording', err);
      abandonStart();
      releaseRecording(owner);
      setPhaseBoth('idle');
      if (!unmountedRef.current) {
        Alert.alert(
          "Couldn't start recording",
          isAudioSessionError(err)
            ? 'The microphone is busy, maybe with a call or another app. Close it and try again.'
            : 'Please try again.',
        );
      }
    }
  }, [day, kind, owner, startSegment, abandonStart]);

  const pause = useCallback(
    async (interruption = false) => {
      if (phaseRef.current === 'starting' && interruption) {
        pendingPauseRef.current = true;
        return;
      }
      if (phaseRef.current !== 'recording') return;
      setPhaseBoth('paused');
      setInterrupted(interruption);
      const saved = endSegment();
      setBaseMs(baseRef.current);
      setSegmentStartedAt(null);
      // Playback (recitation, a recording) through the speaker while paused.
      setAudioMode(false);
      await saved;
    },
    [endSegment],
  );
  pauseRef.current = pause;

  const resume = useCallback(async () => {
    if (phaseRef.current !== 'paused') return;
    // A session restored on reopening: take the microphone again.
    if (!acquireRecording(owner)) {
      Alert.alert('Already recording', 'Finish the other recording first.');
      return;
    }
    setPhaseBoth('starting');
    try {
      await startSegment();
    } catch (err) {
      logger.error('Could not resume recording', err);
      abandonStart();
      if (unmountedRef.current) {
        // Left the screen while resuming.
        setPhaseBoth('paused');
        await leaveRef.current();
        return;
      }
      setPhaseBoth('paused');
      Alert.alert("Couldn't resume recording", 'Please try again.');
    }
  }, [startSegment, abandonStart, owner]);

  const finish = useCallback(async () => {
    const p = phaseRef.current;
    // While starting (or before a reopened session is restored), finished as
    // soon as it has started (or restored).
    if (p === 'starting' || p === 'idle') stopRequestedRef.current = true;
    if (p !== 'recording' && p !== 'paused') return;
    stopRequestedRef.current = false;
    setPhaseBoth('finishing');
    try {
      if (p === 'recording') endSegment();
      await saveChainRef.current;
      if (recordingIdRef.current) {
        await closeRecording(recordingIdRef.current).catch((err) =>
          logger.warn('Could not close recording', err),
        );
      }
      setAudioMode(false);
      if (savedAnyRef.current) {
        buzz();
        const id = recordingIdRef.current;
        const savedDay = dayRef.current;
        if (id && savedDay && !unmountedRef.current) onFinishedRef.current?.({ day: savedDay, recordingId: id });
      }
    } catch (err) {
      logger.error('Could not finish recording', err);
    } finally {
      releaseRecording(owner);
      recordingIdRef.current = null;
      baseRef.current = 0;
      marksRef.current = [];
      setBaseMs(0);
      setSegmentStartedAt(null);
      setInterrupted(false);
      setPhaseBoth('idle');
    }
  }, [endSegment, owner]);
  finishRef.current = finish;

  /** The screen is closing: a revision session is paused and kept (saved as
   *  open, so reopening restores it); a reading one is finished. */
  const leave = useCallback(async () => {
    if (!keepsOpen) return finish();
    const p = phaseRef.current;
    // While starting, the start checks unmountedRef and calls this when done.
    if (p !== 'recording' && p !== 'paused') return;
    if (p === 'recording') {
      setPhaseBoth('paused');
      endSegment();
    }
    try {
      await saveChainRef.current;
    } finally {
      setAudioMode(false);
      releaseRecording(owner);
    }
  }, [keepsOpen, finish, endSegment, owner]);
  leaveRef.current = leave;

  // Reopening the revision screen: a session left paused (still open) comes
  // back paused, with its time, until Stop.
  useEffect(() => {
    if (!keepsOpen || !day) return;
    let cancelled = false;
    findRevisionRecording(day)
      .then((existing) => {
        if (!existing?.open) return;
        // Stopped (e.g. the session ended) before this came back: close it,
        // even if the screen has closed since.
        if (stopRequestedRef.current && phaseRef.current === 'idle') {
          stopRequestedRef.current = false;
          closeRecording(existing.id).catch((err) => logger.warn('Could not close recording', err));
          return;
        }
        if (cancelled || unmountedRef.current || phaseRef.current !== 'idle') return;
        // Taken back only if no other screen is recording; Resume asks again.
        acquireRecording(owner);
        dayRef.current = day;
        recordingIdRef.current = existing.id;
        createdAtRef.current = existing.createdAt;
        baseRef.current = existing.durationMs;
        marksRef.current = [...existing.pageMarks];
        savedAnyRef.current = true;
        setBaseMs(existing.durationMs);
        setSegmentStartedAt(null);
        setInterrupted(false);
        setPhaseBoth('paused');
      })
      .catch((err) => logger.warn('Could not restore recording', err));
    return () => {
      cancelled = true;
    };
  }, [keepsOpen, day, owner]);

  // Page marks while recording, on the session's timeline.
  useEffect(() => {
    if (phase !== 'recording' || currentPage == null) return;
    const marks = marksRef.current;
    if (marks.length === 0 || marks[marks.length - 1].page !== currentPage) {
      marks.push({ atMs: baseRef.current + (Date.now() - segStartRef.current), page: currentPage });
    }
  }, [currentPage, phase]);

  // The level while recording, for the waveform (lib/waveform). iOS reports
  // average power in dBFS when metering is on (VOICE_PRESET); without it
  // nothing is kept, and the recording is drawn flat.
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = setInterval(() => {
      if (phaseRef.current !== 'recording') return;
      try {
        const db = recorder.getStatus().metering;
        if (typeof db === 'number' && Number.isFinite(db)) addLevel(levelsRef.current, dbToLevel(db));
      } catch {
        // Released (the screen is closing): the stretch keeps what it has.
      }
    }, LEVEL_SAMPLE_MS);
    return () => clearInterval(id);
  }, [phase, recorder]);

  // An interruption that leaves the app active (an alarm, Siri) pauses the
  // recorder without an event: notice it and pause the session too.
  useEffect(() => {
    if (phase !== 'recording') return;
    let misses = 0;
    const id = setInterval(() => {
      try {
        misses = recorder.getStatus().isRecording ? 0 : misses + 1;
      } catch {
        misses += 1;
      }
      if (misses >= 2) pauseRef.current(true);
    }, 1000);
    return () => clearInterval(id);
  }, [phase, recorder]);

  // No background recording: going to the background pauses it. ('inactive' is
  // Control Center or a notification banner; recording goes on.)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') pauseRef.current(true);
    });
    return () => sub.remove();
  }, []);

  /** The microphone's level now (dBFS) while recording, else null: the hidden
   *  recite mode listens through it instead of opening the microphone again. */
  const level = useCallback((): number | null => {
    if (phaseRef.current !== 'recording') return null;
    try {
      const db = recorder.getStatus().metering;
      return typeof db === 'number' && Number.isFinite(db) ? db : null;
    } catch {
      return null;
    }
  }, [recorder]);

  return {
    phase,
    level,
    recording: phase === 'recording',
    paused: phase === 'paused',
    /** Paused by a call, an alarm, Siri or leaving the app (not by the user). */
    interrupted,
    /** Recorded time = baseMs + (now - segmentStartedAt) while recording. */
    baseMs,
    segmentStartedAt,
    start,
    pause: () => pause(false),
    resume,
    finish,
  };
}

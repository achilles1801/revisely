import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { claimAudio, enterRecordingMode, isAudioSessionError, setAudioMode } from '../../lib/audioFocus';
import { getRecitation } from '../../lib/recitation';
import { logger } from '../../lib/logger';
import { AudioSource, startMicStream } from '../../lib/recite/micSource';
import { SAMPLE_RATE } from '../../lib/recite/segmenter';
import { MAX_SECONDS } from '../../lib/reciteCheck/service';

/** idle, starting (asking for the mic), recording, denied (no microphone access), error (couldn't start). */
export type RecorderStatus = 'idle' | 'starting' | 'recording' | 'denied' | 'error';
/** Why a recording ended: Stop, the 4-minute limit, or iOS took the microphone (a call, headphones out). */
export type RecordingEnd = 'stopped' | 'limit' | 'interrupted';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The microphone for a recitation check: 16 kHz mono PCM chunks (lib/recite/micSource), kept in memory until the
 * recording ends, then handed to `onDone`. Leaving the app or the screen throws the recording away.
 */
export function useReciteRecorder(onDone: (chunks: Int16Array[], end: RecordingEnd) => void) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [seconds, setSeconds] = useState(0);
  const chunks = useRef<Int16Array[]>([]);
  const samples = useRef(0);
  const source = useRef<AudioSource | null>(null);
  const active = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const [owner] = useState(() => `recite-check-${Math.random().toString(36).slice(2)}`);

  const finish = useCallback(async (end: RecordingEnd | null) => {
    if (!active.current) return;
    active.current = false;
    const src = source.current;
    source.current = null;
    await src?.stop().catch(() => undefined);
    await setAudioMode(false).catch(() => undefined);
    const got = chunks.current;
    chunks.current = [];
    setStatus('idle');
    if (end) onDoneRef.current(got, end);
  }, []);

  const start = useCallback(async () => {
    if (active.current) return;
    setSeconds(0);
    setStatus('starting');
    try {
      let perm = await getRecordingPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setStatus('denied');
        return;
      }
      claimAudio('recorder', owner);
      getRecitation().stop();
      chunks.current = [];
      samples.current = 0;
      active.current = true;
      const handlers = {
        onAudio: (pcm: Int16Array) => {
          if (!active.current) return;
          chunks.current.push(pcm);
          const before = Math.floor(samples.current / (SAMPLE_RATE / 2));
          samples.current += pcm.length;
          if (Math.floor(samples.current / (SAMPLE_RATE / 2)) !== before) setSeconds(samples.current / SAMPLE_RATE);
          if (samples.current >= MAX_SECONDS * SAMPLE_RATE) void finish('limit');
        },
        onStop: () => void finish('interrupted'),
      };
      await enterRecordingMode();
      try {
        source.current = await startMicStream(handlers);
      } catch (err) {
        if (!isAudioSessionError(err)) throw err;
        await wait(400);
        await enterRecordingMode();
        source.current = await startMicStream(handlers);
      }
      if (!active.current) {
        await source.current?.stop().catch(() => undefined);
        source.current = null;
        return;
      }
      setStatus('recording');
    } catch (err) {
      logger.warn('Could not start the microphone for a recitation check', err);
      active.current = false;
      await setAudioMode(false).catch(() => undefined);
      setStatus('error');
    }
  }, [finish, owner]);

  const stop = useCallback(() => void finish('stopped'), [finish]);
  const cancel = useCallback(() => void finish(null), [finish]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') void finish(null);
    });
    return () => {
      sub.remove();
      void finish(null);
    };
  }, [finish]);

  return { status, seconds, start, stop, cancel };
}

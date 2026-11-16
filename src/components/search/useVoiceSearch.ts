import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { claimAudio, enterRecordingMode, isAudioSessionError, setAudioMode } from '../../lib/audioFocus';
import { getRecitation } from '../../lib/recitation';
import { logger } from '../../lib/logger';
import { startMicStream } from '../../lib/recite/micSource';
import { closeSpeechEngine, openSpeechEngine } from '../../lib/recite/speechEngine';
import { downloadedModelPath } from '../../lib/recite/speechModel';
import { useSpeechModelState } from '../../lib/recite/speechModelStore';
import { VoiceQuery } from '../../lib/search/voiceQuery';
import { e2eVoiceHeard } from '../../lib/search/availability';
import type { LiveLevels } from '../recordings/LiveWaveform';

/** The microphone's level, read this often while listening (the waveform's bars). */
const LEVEL_MS = 100;
/** Readings kept for a waveform that mounts late. */
const LEVELS_KEPT = 64;
/** A level in dB as 0–1 for the bars: quiet room at the bottom, a full voice near the top. */
export const levelOf = (db: number) => Math.max(0, Math.min(1, (db + 55) / 45));

/**
 * idle: not listening. starting: the microphone and the model are being readied.
 * listening: speak now. thinking: the last words are being read. denied: no
 * microphone access. error: it couldn't listen.
 */
export type VoiceSearchStatus = 'idle' | 'starting' | 'listening' | 'thinking' | 'denied' | 'error';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Searching by voice: `listen()` starts the microphone (asking for access the first
 * time), and what is said goes to `onHeard` as text once the speaker pauses or
 * `stop()` is called. Words heard so far are in `partial`. Needs the speech model
 * (`needsModel`: show the download sheet first). Stops in the background and when the
 * screen goes. `enabled` is `voiceSearchEnabled(user)`: when false, nothing listens.
 */
export function useVoiceSearch(onHeard: (text: string) => void, enabled: boolean) {
  const available = enabled;
  const model = useSpeechModelState();
  const [status, setStatus] = useState<VoiceSearchStatus>('idle');
  const [partial, setPartial] = useState('');
  const queryRef = useRef<VoiceQuery | null>(null);
  const onHeardRef = useRef(onHeard);
  onHeardRef.current = onHeard;
  const [owner] = useState(() => `voice-search-${Math.random().toString(36).slice(2)}`);
  const mounted = useRef(true);
  // The microphone's level while listening, for the waveform (LiveWaveform's feed).
  const levelReadings = useRef<number[]>([]);
  const levelListeners = useRef(new Set<(level: number) => void>());
  const levelTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pushLevel = useCallback((level: number) => {
    const r = levelReadings.current;
    r.push(level);
    if (r.length > LEVELS_KEPT) r.splice(0, r.length - LEVELS_KEPT);
    levelListeners.current.forEach((l) => l(level));
  }, []);
  const stopLevels = useCallback(() => {
    if (levelTimer.current) clearInterval(levelTimer.current);
    levelTimer.current = null;
  }, []);
  const startLevels = useCallback(
    (read: () => number) => {
      stopLevels();
      levelReadings.current = [];
      levelTimer.current = setInterval(() => pushLevel(read()), LEVEL_MS);
    },
    [stopLevels, pushLevel],
  );
  const [levels] = useState<LiveLevels>(() => ({
    subscribe: (listener) => {
      levelListeners.current.add(listener);
      return () => levelListeners.current.delete(listener);
    },
    recent: () => [...levelReadings.current],
  }));

  const release = useCallback(async () => {
    await setAudioMode(false).catch(() => undefined);
    closeSpeechEngine();
  }, []);

  const listen = useCallback(async () => {
    if (!available || queryRef.current) return;
    setPartial('');
    // E2E builds: no microphone or model; the words a link gave are heard after a moment (lib/e2e/voiceSearch).
    const scripted = process.env.EXPO_PUBLIC_E2E === '1' ? e2eVoiceHeard() : null;
    if (scripted) {
      setStatus('listening');
      // A voice's rise and fall, for the waveform.
      let n = 0;
      startLevels(() => 0.35 + 0.3 * Math.abs(Math.sin(n++ / 3)));
      await wait(3000);
      stopLevels();
      if (!mounted.current) return;
      setStatus('idle');
      onHeardRef.current(scripted);
      return;
    }
    setStatus('starting');
    try {
      let perm = await getRecordingPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await requestRecordingPermissionsAsync();
      if (!mounted.current) return;
      if (!perm.granted) {
        setStatus('denied');
        return;
      }
      const path = downloadedModelPath();
      if (!path) {
        setStatus('idle');
        return;
      }
      const engine = await openSpeechEngine(path);
      if (!mounted.current) return;
      // Recitation and recording playback stop; then recording mode, then the mic.
      claimAudio('recorder', owner);
      getRecitation().stop();
      const query = new VoiceQuery({
        engine,
        startSource: async (handlers) => {
          await enterRecordingMode();
          try {
            return await startMicStream(handlers);
          } catch (err) {
            if (!isAudioSessionError(err)) throw err;
            await wait(400);
            await enterRecordingMode();
            return startMicStream(handlers);
          }
        },
        onPartial: (text) => {
          if (mounted.current) setPartial(text);
        },
      });
      queryRef.current = query;
      await query.start();
      if (!mounted.current) {
        await query.cancel();
        return;
      }
      setStatus('listening');
      startLevels(() => levelOf(query.levelDb));
      const { text, end } = await query.result;
      stopLevels();
      queryRef.current = null;
      await release();
      if (!mounted.current) return;
      setStatus(end === 'error' ? 'error' : 'idle');
      setPartial('');
      if (text) onHeardRef.current(text);
    } catch (err) {
      logger.warn('Could not listen for a search', err);
      stopLevels();
      queryRef.current = null;
      await release();
      if (mounted.current) setStatus('error');
    }
  }, [available, owner, release, startLevels, stopLevels]);

  /** Stop and search with what was said. */
  const stop = useCallback(() => {
    const q = queryRef.current;
    if (!q) return;
    setStatus('thinking');
    void q.stop();
  }, []);

  // Leaving the app or the screen stops listening, with no search.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') void queryRef.current?.cancel();
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopLevels();
      void queryRef.current?.cancel();
    };
  }, [stopLevels]);

  return {
    available,
    status,
    partial,
    /** The speech model isn't on the phone yet (E2E's scripted words need none). */
    needsModel: model.status !== 'ready' && !(process.env.EXPO_PUBLIC_E2E === '1' && e2eVoiceHeard()),
    listen,
    stop,
    /** The microphone's level while listening (0–1, every 100 ms), for a waveform. */
    levels,
  };
}

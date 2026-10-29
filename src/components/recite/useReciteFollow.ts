import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { claimAudio, enterRecordingMode, isAudioSessionError, onAudioClaimed, setAudioMode } from '../../lib/audioFocus';
import { getRecitation } from '../../lib/recitation';
import { logger } from '../../lib/logger';
import { isMicStreamAvailable, startMicStream } from '../../lib/recite/micSource';
import { closeSpeechEngine, openSpeechEngine } from '../../lib/recite/speechEngine';
import { downloadedModelPath } from '../../lib/recite/speechModel';
import { useSpeechModelState } from '../../lib/recite/speechModelStore';
import { loadQuranWords, QuranWords } from '../../lib/recite/quranWords';
import { ReciteSession } from '../../lib/recite/reciteSession';
import type { WordFollow } from '../../lib/recite/hiddenPage';

/**
 * unavailable: this binary (or platform) can't listen word by word. no-model:
 * the speech model isn't on the phone. off: not running. starting. finding:
 * listening, the reciter not found yet. following. paused: something else took
 * the audio (playback); the mic turns it back on. denied: no microphone access.
 * error: it couldn't start, or recognition kept failing.
 */
export type FollowStatus =
  | 'unavailable'
  | 'no-model'
  | 'off'
  | 'starting'
  | 'finding'
  | 'following'
  | 'paused'
  | 'denied'
  | 'error';

/** Whether this binary can follow word by word (the native mic module, on iPhone). */
export const canFollowWords = () => Platform.OS === 'ios' && isMicStreamAvailable();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The hidden recite mode, word by word: while `active`, listens on the device
 * (modules/recitation-audio → whisper.rn; nothing recorded, kept or sent) and
 * follows the reciter through `pages` (lib/recite/reciteSession). Recited words
 * show (`follow`, for the covers); reaching another page turns to it
 * (`onShowPage`); a page recited through counts as revised (`onPageDone`).
 * Stops when not active, in the background, or when something else takes the
 * audio (a recording starting, recitation playing).
 */
export function useReciteFollow({
  active,
  pages,
  currentPage,
  onShowPage,
  onPageDone,
}: {
  active: boolean;
  pages: number[];
  currentPage: number;
  onShowPage: (page: number) => void;
  onPageDone: (page: number) => void;
}) {
  const available = canFollowWords();
  const model = useSpeechModelState();
  const [status, setStatus] = useState<FollowStatus>('off');
  const [, setVersion] = useState(0);
  const [words, setWords] = useState<QuranWords | null>(null);
  const sessionRef = useRef<ReciteSession | null>(null);
  const [owner] = useState(() => `recite-follow-${Math.random().toString(36).slice(2)}`);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  const [suspended, setSuspended] = useState(false);
  const turningToRef = useRef<number | null>(null);
  const optsRef = useRef({ pages, currentPage, onShowPage, onPageDone });
  optsRef.current = { pages, currentPage, onShowPage, onPageDone };

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s !== 'background'));
    return () => sub.remove();
  }, []);

  const run = active && available && model.status === 'ready' && foreground && !suspended;

  const stopSession = useCallback(async () => {
    const s = sessionRef.current;
    sessionRef.current = null;
    if (!s) return;
    try {
      await s.stop();
    } catch (err) {
      logger.warn('Word-by-word listening did not stop cleanly', err);
    }
    await setAudioMode(false);
    closeSpeechEngine();
  }, []);

  useEffect(() => {
    if (!run) {
      stopSession();
      setStatus(!available ? 'unavailable' : model.status !== 'ready' ? 'no-model' : suspended ? 'paused' : 'off');
      return;
    }
    let cancelled = false;
    (async () => {
      setStatus('starting');
      try {
        let perm = await getRecordingPermissionsAsync();
        if (!perm.granted && perm.canAskAgain) perm = await requestRecordingPermissionsAsync();
        if (cancelled) return;
        if (!perm.granted) {
          setStatus('denied');
          return;
        }
        const path = downloadedModelPath();
        if (!path) {
          setStatus('no-model');
          return;
        }
        const [loaded, engine] = await Promise.all([loadQuranWords(), openSpeechEngine(path)]);
        if (cancelled) return;
        setWords(loaded);
        // Recitation and recording playback stop; then recording mode, then the mic.
        claimAudio('recorder', owner);
        getRecitation().stop();
        const o = optsRef.current;
        const session = new ReciteSession({
          words: loaded,
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
          pages: o.pages,
          page: o.currentPage,
          onChange: () => {
            setVersion((v) => v + 1);
            const s = sessionRef.current;
            if (s) setStatus(s.position == null ? 'finding' : 'following');
          },
          onReachPage: (page) => {
            if (page === optsRef.current.currentPage) return;
            turningToRef.current = page;
            optsRef.current.onShowPage(page);
          },
          onPageDone: (page) => optsRef.current.onPageDone(page),
          onEnd: (reason) => {
            stopSession();
            setStatus(reason === 'error' ? 'error' : reason === 'finished' ? 'off' : 'paused');
            if (reason === 'interrupted' || reason === 'route') setSuspended(true);
          },
        });
        sessionRef.current = session;
        await session.start();
        if (cancelled || sessionRef.current !== session) return;
        setStatus(session.position == null ? 'finding' : 'following');
      } catch (err) {
        logger.warn('Could not start following word by word', err);
        await stopSession();
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      stopSession();
    };
    // Starts and stops with `run`; the rest is read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  // The user turned the page: look for the reciter there.
  useEffect(() => {
    const s = sessionRef.current;
    if (!s) return;
    if (turningToRef.current === currentPage) {
      turningToRef.current = null;
      return;
    }
    s.pageTurnedByUser(currentPage);
  }, [currentPage]);

  // Something else took the audio (a recording, recitation): step aside until
  // the mic is turned back on (a recording's own end restarts it: `active`).
  useEffect(
    () =>
      onAudioClaimed((_activity, by) => {
        if (by === owner || !sessionRef.current) return;
        setSuspended(true);
      }),
    [owner],
  );
  // Not active any more (hidden mode off, recording, the screen left): the next
  // start begins afresh.
  useEffect(() => {
    if (!active) setSuspended(false);
  }, [active]);

  const session = sessionRef.current;
  const follow: WordFollow | null =
    session && words
      ? {
          words,
          shown: (w) => session.isPreviewCorrect(w) || (!session.tracker.isStale(w) && session.tracker.statusOf(w) !== 'pending'),
          next: session.position,
        }
      : null;

  return {
    status,
    available,
    follow,
    /** The last words heard, for the panel. */
    heard: session?.lastHeard(4) ?? '',
    /** Listening again after it stepped aside. */
    resume: () => setSuspended(false),
  };
}

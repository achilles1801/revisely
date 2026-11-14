import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getAuth } from 'firebase/auth';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { claimAudio, enterRecordingMode, isAudioSessionError, setAudioMode } from '../../lib/audioFocus';
import { getRecitation } from '../../lib/recitation';
import { logger } from '../../lib/logger';
import { currentRelease } from '../../lib/releaseInfo';
import { versesOnPage } from '../../lib/ayahBounds';
import { AudioSource, startMicStream } from '../../lib/recite/micSource';
import { SAMPLE_RATE } from '../../lib/recite/segmenter';
import { getQuranWords, loadQuranWords, QuranWords } from '../../lib/recite/quranWords';
import type { ReciteCheckSettings } from '../../lib/reciteCheck/settings';
import type { LiveConnect, LiveConnection, StartFrame } from '../../lib/reciteLive/feed';
import { socketFeed } from '../../lib/reciteLive/socket';
import { SavedTake, startTakeRecording, TakeRecording } from '../../lib/reciteLive/takeRecording';
import {
  applyEvent,
  dismissMark,
  LIVE_IDLE,
  liveConnecting,
  LiveState,
  liveStopping,
} from '../../lib/reciteLive/state';

/** What the mic does while reciting: follow along (free), or follow and mark mistakes (Check). */
export type LiveMode = 'recite' | 'check';

/** The microphone: off, asking for it, on, refused, or failed to start. */
export type MicStatus = 'off' | 'starting' | 'on' | 'denied' | 'error';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** E2E builds: a recorded take instead of the microphone and the checker (lib/e2e/reciteLive). */
const e2e = process.env.EXPO_PUBLIC_E2E === '1' ? (require('../../lib/e2e/reciteLive') as typeof import('../../lib/e2e/reciteLive')) : null;

/**
 * Whether to tell the checker about words shown by hand (contract draft 5: a hinted word counts as helped, never as a
 * mistake for being hinted; the server ignores frames it doesn't know).
 */
const SEND_HINTS = true;

let realConnect: LiveConnect | null = null;
/** The checker's live socket, made on first use. */
const defaultConnect: LiveConnect = (start, handlers) => {
  if (!realConnect) {
    const r = currentRelease();
    realConnect = socketFeed({
      token: async () => (await getAuth().currentUser?.getIdToken()) ?? null,
      app: `${r.version ?? '?'} (${r.build ?? '?'}) ${r.channel ?? 'dev'} ${r.updateShort ?? 'embedded'}`,
    });
  }
  return realConnect(start, handlers);
};

/** The start frame for a take from `page`'s first ayah, with the account's settings (contract draft 5). */
export function startFrameFor(page: number, mode: LiveMode, settings: ReciteCheckSettings): StartFrame {
  const first = versesOnPage(page)[0] ?? { sura: 1, ayah: 1 };
  return {
    type: 'start',
    s: first.sura,
    a: first.ayah,
    s2: null,
    a2: null,
    mon: settings.munfasil,
    mot: settings.muttasil,
    aar: settings.aared,
    letters: true,
    tajweed: settings.level === 'strict',
    keep: settings.keep,
    follow: mode === 'recite',
  };
}

/**
 * A live take on the reader (Revisely Dev): the microphone streams to the checker's `/live`, and its events become
 * what the page and the bar show (lib/reciteLive/state). The reciter's place turns the page; a page turned by hand
 * tells the checker where to look (`seek`). Leaving the app ends the take. The take's audio stays on the phone for
 * resuming (lib/reciteLive/socket). With Save recordings on (the default) and a revision day, the take is also kept as
 * a reading recording of that day (lib/reciteLive/takeRecording), whatever ends it.
 */
export function useLiveRecitation({
  settings,
  currentPage,
  onShowPage,
  recordingDay = null,
  onRecordingSaved,
  connect = defaultConnect,
}: {
  settings: ReciteCheckSettings;
  currentPage: number;
  onShowPage: (page: number) => void;
  /** The revision day a saved recording belongs to (null: nothing is saved). */
  recordingDay?: string | null;
  /** A take's recording was saved. */
  onRecordingSaved?: (saved: SavedTake) => void;
  connect?: LiveConnect;
}) {
  const [state, setState] = useState<LiveState>(LIVE_IDLE);
  const [mode, setMode] = useState<LiveMode | null>(null);
  const [mic, setMic] = useState<MicStatus>('off');
  const [seconds, setSeconds] = useState(0);
  const [words, setWords] = useState<QuranWords | null>(getQuranWords());
  const conn = useRef<LiveConnection | null>(null);
  const source = useRef<AudioSource | null>(null);
  const samples = useRef(0);
  const startWord = useRef<number | null>(null);
  const turningTo = useRef<number | null>(null);
  const pageRef = useRef(currentPage);
  pageRef.current = currentPage;
  const onShowPageRef = useRef(onShowPage);
  onShowPageRef.current = onShowPage;
  const [owner] = useState(() => `recite-live-${Math.random().toString(36).slice(2)}`);
  const recordingRef = useRef<TakeRecording | null>(null);
  const [recording, setRecording] = useState(false);
  const onSavedRef = useRef(onRecordingSaved);
  onSavedRef.current = onRecordingSaved;

  /** The take's recording, kept once the microphone has stopped (on the screen's way out too). */
  const finishRecording = useCallback(() => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    setRecording(false);
    if (!rec) return;
    rec
      .finish()
      .then((saved) => {
        if (saved) onSavedRef.current?.(saved);
      })
      .catch((err) => logger.warn('The take’s recording was not saved', err));
  }, []);

  const stopMic = useCallback(async () => {
    const src = source.current;
    source.current = null;
    if (!src) return;
    await src.stop().catch(() => undefined);
    finishRecording();
    await setAudioMode(false).catch(() => undefined);
    setMic('off');
  }, [finishRecording]);

  /** Stop: the audio ends, the checker sends its final answer, the live marks stay meanwhile. */
  const stop = useCallback(() => {
    void stopMic();
    conn.current?.send({ type: 'end' });
    setState((s) => liveStopping(s));
  }, [stopMic]);

  /** Throw the take away (the screen left): nothing more comes. */
  const cancel = useCallback(() => {
    void stopMic();
    conn.current?.close();
    conn.current = null;
    setState(LIVE_IDLE);
    setMode(null);
  }, [stopMic]);

  const start = useCallback(
    async (take: LiveMode) => {
      if (conn.current || source.current) return;
      setMic('starting');
      setSeconds(0);
      samples.current = 0;
      // The inlined variable folds this branch away in every other build.
      if (process.env.EXPO_PUBLIC_E2E === '1' && e2e?.e2eReciteLiveOn()) {
        // eslint-disable-next-line no-console
        console.log('[e2e] recite-live take starting');
        let qw: QuranWords;
        try {
          qw = await loadQuranWords();
        } catch (err) {
          logger.warn('E2E live take: the word data did not load', err);
          setMic('error');
          return;
        }
        setWords(qw);
        const frame = startFrameFor(pageRef.current, take, settings);
        startWord.current = qw.verseFirstWord(frame.s, frame.a);
        setMode(take);
        setState(liveConnecting());
        const c = e2e.e2eLiveConnect()(frame, {
          onEvent: (e) => setState((s) => applyEvent(s, e)),
          onClose: () => {
            if (conn.current === c) conn.current = null;
            clearInterval(tick);
            setMic('off');
          },
        });
        conn.current = c;
        const tick = setInterval(() => setSeconds((n) => n + 1), 1000);
        source.current = {
          stop: async () => {
            clearInterval(tick);
          },
        };
        setMic('on');
        // eslint-disable-next-line no-console
        console.log('[e2e] recite-live take started');
        return;
      }
      try {
        let perm = await getRecordingPermissionsAsync();
        if (!perm.granted && perm.canAskAgain) perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          setMic('denied');
          return;
        }
        const qw = await loadQuranWords();
        setWords(qw);
        const frame = startFrameFor(pageRef.current, take, settings);
        startWord.current = qw.verseFirstWord(frame.s, frame.a);
        claimAudio('recorder', owner);
        getRecitation().stop();
        setMode(take);
        setState(liveConnecting());
        const c = connect(frame, {
          onEvent: (e) => setState((s) => applyEvent(s, e)),
          onClose: () => {
            if (conn.current === c) conn.current = null;
            void stopMic();
          },
        });
        conn.current = c;
        recordingRef.current =
          settings.saveRecording && recordingDay ? startTakeRecording({ day: recordingDay, page: pageRef.current }) : null;
        setRecording(recordingRef.current != null);
        const handlers = {
          onAudio: (pcm: Int16Array) => {
            if (conn.current !== c) return;
            c.sendAudio(pcm);
            recordingRef.current?.add(pcm);
            const before = Math.floor(samples.current / SAMPLE_RATE);
            samples.current += pcm.length;
            if (Math.floor(samples.current / SAMPLE_RATE) !== before) setSeconds(Math.floor(samples.current / SAMPLE_RATE));
          },
          // iOS took the microphone (a call, headphones out): the take ends there.
          onStop: () => stop(),
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
        if (conn.current !== c) {
          await stopMic();
          return;
        }
        setMic('on');
      } catch (err) {
        logger.warn('Could not start a live recitation check', err);
        conn.current?.close();
        conn.current = null;
        await stopMic();
        // The microphone never started: nothing was heard to keep.
        finishRecording();
        setMic('error');
        setState((s) => (s.status === 'connecting' ? { ...s, status: 'failed', failure: 'server' } : s));
      }
    },
    [connect, owner, settings, stop, stopMic, recordingDay, finishRecording],
  );

  /** "Not a mistake": off the page at once, and told to the checker (a label for the lab). */
  const dismiss = useCallback((id: string) => {
    conn.current?.send({ type: 'dismiss', id });
    setState((s) => dismissMark(s, id));
  }, []);

  /** A word or an ayah shown by hand (hidden view), told to the checker as information. */
  const hint = useCallback((w: number, what: 'word' | 'ayah') => {
    if (SEND_HINTS) conn.current?.send({ type: 'hint', w, what });
  }, []);

  /** Done with the take: back to idle (the summary closed). */
  const clear = useCallback(() => {
    void stopMic();
    conn.current?.close();
    conn.current = null;
    setState(LIVE_IDLE);
    setMode(null);
  }, [stopMic]);

  // The reciter's place turns the page.
  const live = state.status === 'listening';
  useEffect(() => {
    if (!live || state.cursor == null || !words) return;
    const page = words.pageOf(state.cursor);
    if (page !== pageRef.current) {
      turningTo.current = page;
      onShowPageRef.current(page);
    }
  }, [live, state.cursor, words]);

  // The recording keeps the pages it turned through, as the reader's own recordings do.
  useEffect(() => {
    recordingRef.current?.pageAt(currentPage);
  }, [currentPage]);

  // A page turned by hand: tell the checker where to look.
  useEffect(() => {
    if (turningTo.current === currentPage) {
      turningTo.current = null;
      return;
    }
    if (!conn.current || !words || state.status !== 'listening') return;
    conn.current.send({ type: 'seek', w: words.pageRange(currentPage)[0] });
    // Only a page change sends it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // Leaving the app ends the take (the final answer comes when it's back).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background' && source.current) stop();
    });
    return () => sub.remove();
  }, [stop]);

  // Leaving the screen throws the take away.
  useEffect(() => () => cancel(), [cancel]);

  return {
    state,
    /** The running (or last) take's mode; null when idle. */
    mode,
    mic,
    /** The take is being kept as a recording (Save recordings on). */
    recording,
    seconds,
    words,
    /** The first word of the take (where the score's pages start). */
    startWord: startWord.current,
    active: state.status !== 'idle',
    start,
    stop,
    cancel,
    clear,
    dismiss,
    hint,
  };
}

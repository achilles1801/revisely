import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, LayoutAnimation } from 'react-native';
import { getAuth } from 'firebase/auth';
import * as Sentry from '@sentry/react-native';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { claimAudio, enterRecordingMode, isAudioSessionError, setAudioMode } from '../../lib/audioFocus';
import { getRecitation } from '../../lib/recitation';
import { logger } from '../../lib/logger';
import { currentRelease } from '../../lib/releaseInfo';
import { versesOnPage } from '../../lib/ayahBounds';
import { ayahKey } from '../../lib/ayahKeys';
import { placeOfAyah, spokenText } from '../../lib/passages';
import { AudioSource, startMicStream } from '../../lib/recite/micSource';
import { SAMPLE_RATE } from '../../lib/recite/segmenter';
import { getQuranWords, loadQuranWords, QuranWords } from '../../lib/recite/quranWords';
import type { ReciteCheckSettings } from '../../lib/reciteCheck/settings';
import { sendLabel } from '../../lib/reciteCheck/service';
import type { LiveEvent, Mark } from '../../lib/reciteLive/contract';
import type { LiveConnect, LiveConnection, StartFrame } from '../../lib/reciteLive/feed';
import { socketFeed } from '../../lib/reciteLive/socket';
import { stopHearing } from '../../lib/reciteLive/hearAudio';
import { spanEndWord, TakeSpan } from '../../lib/reciteLive/span';
import { stopTrace } from '../../lib/reciteLive/stopTrace';
import { SavedTake, startTakeRecording, TakeRecording } from '../../lib/reciteLive/takeRecording';
import {
  applyEvent,
  checkerLooks,
  dismissMark,
  restoreMark,
  LIVE_IDLE,
  liveConnecting,
  LiveState,
  liveStopping,
  seekOnPage,
} from '../../lib/reciteLive/state';
import { isDevVariant } from '../../lib/variant';
import { useReduceMotion } from '../../design/motion';

/** What the mic does while reciting: follow along (free), or follow and mark mistakes (Check). */
export type LiveMode = 'recite' | 'check';

/** The microphone: off, asking for it, on, paused (the take goes on), refused, or failed to start. */
export type MicStatus = 'off' | 'starting' | 'on' | 'paused' | 'denied' | 'error';

/** What ended a take: Stop tapped, the app left, iOS took the microphone, or a drill reached its end. */
type StopWhy = 'tap' | 'background' | 'mic-lost' | 'reached';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** E2E builds: a recorded take instead of the microphone and the checker (lib/e2e/reciteLive). */
const e2e = process.env.EXPO_PUBLIC_E2E === '1' ? (require('../../lib/e2e/reciteLive') as typeof import('../../lib/e2e/reciteLive')) : null;

/**
 * Whether to tell the checker about words shown by hand (contract draft 5: a hinted word counts as helped, never as a
 * mistake for being hinted; the server ignores frames it doesn't know).
 */
const SEND_HINTS = true;

/**
 * A take started from the reader starts anywhere on the page (Majd, Nov 14 2026: "it should assume it's anywhere on
 * that page"): the checker finds where (`locked`). A server that doesn't look starts at the page's first ayah, as
 * before, and the phone sees that from its first cursor (lib/reciteLive/state).
 */
export const START_ANYWHERE = true;

/**
 * A take from the reader's mic may start anywhere in the Qur'an (Majd, Nov 15 2026: step 2 of search and follow-along;
 * protocol 7): when the page doesn't match, the checker looks in the whole Qur'an and the reader turns to where it
 * locks. Never for a span (a drill, a Test me place, a voice search's ayahs): those know where they are.
 */
export const START_IN_QURAN = true;

/** The page's last ayah: the start frame's `startBy`. */
function lastAyahOf(page: number): [number, number] {
  const verses = versesOnPage(page);
  const last = verses[verses.length - 1] ?? { sura: 1, ayah: 1 };
  return [last.sura, last.ayah];
}

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

/**
 * The start frame for a take on `page`, with the account's settings (contract draft 5): anywhere on the page
 * (`startBy`, the page's last ayah), or from its first ayah; or over a given span (lib/reciteLive/span): a stretch of
 * ayahs ("Recite the mistakes again", from its first ayah to its last), or the ayahs a voice search found (the start
 * looked for only there).
 */
export function startFrameFor(
  page: number,
  mode: LiveMode,
  settings: ReciteCheckSettings,
  anywhere: boolean = START_ANYWHERE,
  span: TakeSpan | null = null,
): StartFrame {
  const first = versesOnPage(page)[0] ?? { sura: 1, ayah: 1 };
  const startBy = span ? span.startBy : anywhere ? lastAyahOf(page) : undefined;
  return {
    type: 'start',
    s: span ? span.from[0] : first.sura,
    a: span ? span.from[1] : first.ayah,
    s2: span?.to ? span.to[0] : null,
    a2: span?.to ? span.to[1] : null,
    mon: settings.munfasil,
    mot: settings.muttasil,
    aar: settings.aared,
    letters: true,
    tajweed: settings.level === 'strict',
    // Kept as test data only on Revisely Dev's checker: production's keeps nothing (recite-server-prod-plan.md), so the
    // store app never asks, and never says a take was kept.
    keep: settings.keep && isDevVariant(),
    follow: mode === 'recite',
    // Mark mistakes: the summary at once, where a slip went a moment later (contract draft 8)
    ...(mode === 'check' ? { namesAfter: true } : {}),
    ...(startBy ? { startBy } : {}),
    ...(startBy && !span && START_IN_QURAN ? { startIn: 'quran' as const } : {}),
  };
}

/** The state a take begins in: looking for its start on the page, or at the frame's first ayah. */
function connectingFor(frame: StartFrame, words: QuranWords): LiveState {
  const first = words.verseFirstWord(frame.s, frame.a);
  return liveConnecting(frame.startBy ? { anywhereFrom: first } : { start: first });
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
  /** Turns the screen to a page; false when it doesn't hold that page (a session's pager holds its day's alone). */
  onShowPage: (page: number) => boolean | void;
  /** The revision day a saved recording belongs to (null: nothing is saved). */
  recordingDay?: string | null;
  /** A take's recording was saved. */
  onRecordingSaved?: (saved: SavedTake) => void;
  connect?: LiveConnect;
}) {
  const [state, setState] = useState<LiveState>(LIVE_IDLE);
  const reduceMotion = useReduceMotion();
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;
  const [mode, setMode] = useState<LiveMode | null>(null);
  const [mic, setMic] = useState<MicStatus>('off');
  const [seconds, setSeconds] = useState(0);
  const [words, setWords] = useState<QuranWords | null>(getQuranWords());
  const conn = useRef<LiveConnection | null>(null);
  const source = useRef<AudioSource | null>(null);
  const samples = useRef(0);
  const turningTo = useRef<number | null>(null);
  const pageRef = useRef(currentPage);
  pageRef.current = currentPage;
  const onShowPageRef = useRef(onShowPage);
  onShowPageRef.current = onShowPage;
  const [owner] = useState(() => `recite-live-${Math.random().toString(36).slice(2)}`);
  const recordingRef = useRef<TakeRecording | null>(null);
  const [recording, setRecording] = useState(false);
  // The take went with Keep as test data on: the checker stores it (its `done` no longer says so; a `kept` event
  // follows, after the phone has hung up).
  const [testData, setTestData] = useState(false);
  const onSavedRef = useRef(onRecordingSaved);
  onSavedRef.current = onRecordingSaved;
  // Paused (Majd, Nov 15 2026: listening mid-take ended it, with no way back): the microphone is off and the take goes
  // on, on the same connection, from where it was. `reopen` starts this take's microphone (or E2E's tone) again.
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const reopen = useRef<(() => Promise<AudioSource>) | null>(null);
  // "Your recitation": the take's connection, kept until the take is closed (its audio stays on the phone for resuming),
  // and when the cursor first reached each word, in seconds of the take (for a mark that carries no time of its own).
  const lastConn = useRef<LiveConnection | null>(null);
  const wordTimes = useRef(new Map<number, number>());
  /** A drill take's last word (a span with an end): it stops by itself once the checker has decided it. */
  const endWord = useRef<number | null>(null);
  // For the Stop trace (lib/reciteLive/stopTrace), read when Stop is tapped.
  const traceRef = useRef({ state, mode, seconds });
  traceRef.current = { state, mode, seconds };
  /** Each event the take receives: its type to the Stop trace, then the live state. */
  const onEvent = useCallback((e: LiveEvent) => {
    stopTrace.event(e.type);
    // Found elsewhere in the Qur'an (protocol 7): a breadcrumb for any report that follows (numbers only; the checker
    // keeps where every kept take locked).
    if (e.type === 'locked' && e.where === 'quran') {
      Sentry.addBreadcrumb({ category: 'recite', message: 'locked elsewhere in the Quran', data: { page: getQuranWords()?.pageOf(e.w) } });
    }
    if (e.type === 'at' && !wordTimes.current.has(e.w)) wordTimes.current.set(e.w, e.t ?? samples.current / SAMPLE_RATE);
    // Where the slips went, after the summary is up (namesAfter): its rows ease in rather than push the rest down at once
    if (e.type === 'into' && e.names.length && !reduceMotionRef.current) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setState((s) => applyEvent(s, e));
  }, []);

  /** The take's recording, kept once the microphone has stopped (on the screen's way out too). */
  const finishRecording = useCallback(() => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    setRecording(false);
    if (!rec) return;
    rec
      .finish()
      .then((saved) => {
        stopTrace.step(saved ? 'recording-saved' : 'recording-none');
        if (saved) onSavedRef.current?.(saved);
      })
      .catch((err) => {
        stopTrace.step('recording-failed');
        logger.warn('The take’s recording was not saved', err);
      });
  }, []);

  const stopMic = useCallback(async () => {
    const src = source.current;
    source.current = null;
    const wasPaused = pausedRef.current;
    pausedRef.current = false;
    if (!src && !wasPaused) return;
    setPaused(false);
    if (src) await src.stop().catch(() => undefined);
    stopTrace.step('mic-off');
    finishRecording();
    await setAudioMode(false).catch(() => undefined);
    stopTrace.step('audio-mode');
    setMic('off');
  }, [finishRecording]);

  /** Stop: the audio ends, the checker sends its final answer, the live marks stay meanwhile. */
  const stopFor = useCallback(
    (why: StopWhy) => {
      const t = traceRef.current;
      stopTrace.stop({
        mode: `${t.mode ?? '?'}${why === 'tap' ? '' : ` (${why})`}`,
        status: t.state.status,
        seconds: t.seconds,
        take: t.state.take,
        socket: conn.current?.status?.(),
      });
      stopHearing();
      void stopMic();
      conn.current?.send({ type: 'end' });
      setState((s) => liveStopping(s));
    },
    [stopMic],
  );
  const stop = useCallback(() => stopFor('tap'), [stopFor]);

  /** Throw the take away (the screen left): nothing more comes. */
  const cancel = useCallback(() => {
    stopTrace.end();
    stopHearing();
    lastConn.current = null;
    void stopMic();
    conn.current?.close();
    conn.current = null;
    setState(LIVE_IDLE);
    setMode(null);
  }, [stopMic]);

  const start = useCallback(
    async (take: LiveMode, span: TakeSpan | null = null) => {
      if (source.current) return;
      if (conn.current) {
        // The take before has its final answer and only waits for where its slips went (namesAfter): it ends here.
        if (traceRef.current.state.status !== 'done') return;
        conn.current.close();
        conn.current = null;
      }
      stopHearing();
      pausedRef.current = false;
      setPaused(false);
      lastConn.current = null;
      wordTimes.current = new Map();
      setMic('starting');
      setSeconds(0);
      samples.current = 0;
      endWord.current = null;
      /** The page the take starts on: the span's first ayah's (turned to), or the one on screen. */
      const startPage = (qw: QuranWords) => {
        if (!span) return pageRef.current;
        const page = qw.pageOf(qw.verseFirstWord(span.from[0], span.from[1]));
        if (page !== pageRef.current) {
          turningTo.current = page;
          if (onShowPageRef.current(page) === false) turningTo.current = null;
        }
        endWord.current = spanEndWord(qw, span);
        return page;
      };
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
        const page = startPage(qw);
        const frame = startFrameFor(page, take, settings, START_ANYWHERE, span);
        setTestData(frame.keep);
        setMode(take);
        setState(connectingFor(frame, qw));
        const c = e2e.e2eLiveConnect()(frame, {
          onEvent,
          onClose: () => {
            stopTrace.step('closed');
            if (conn.current === c) conn.current = null;
            const tone = source.current;
            source.current = null;
            void tone?.stop();
            setMic('off');
          },
        });
        conn.current = c;
        lastConn.current = c;
        recordingRef.current =
          settings.saveRecording && recordingDay ? startTakeRecording({ day: recordingDay, page }) : null;
        setRecording(recordingRef.current != null);
        let second = 0;
        const openTone = async (): Promise<AudioSource> => {
          const tick = setInterval(() => {
            setSeconds((n) => n + 1);
            recordingRef.current?.add(e2e.e2eToneSecond(second++));
          }, 1000);
          return {
            stop: async () => {
              clearInterval(tick);
            },
          };
        };
        reopen.current = openTone;
        source.current = await openTone();
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
        const page = startPage(qw);
        const frame = startFrameFor(page, take, settings, START_ANYWHERE, span);
        setTestData(frame.keep);
        claimAudio('recorder', owner);
        getRecitation().stop();
        setMode(take);
        setState(connectingFor(frame, qw));
        const c = connect(frame, {
          onEvent,
          onClose: () => {
            stopTrace.step('closed');
            if (conn.current === c) conn.current = null;
            void stopMic();
          },
        });
        conn.current = c;
        lastConn.current = c;
        recordingRef.current =
          settings.saveRecording && recordingDay ? startTakeRecording({ day: recordingDay, page }) : null;
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
          onStop: () => stopFor('mic-lost'),
        };
        const openMic = async (): Promise<AudioSource> => {
          await enterRecordingMode();
          try {
            return await startMicStream(handlers);
          } catch (err) {
            if (!isAudioSessionError(err)) throw err;
            await wait(400);
            await enterRecordingMode();
            return await startMicStream(handlers);
          }
        };
        reopen.current = openMic;
        source.current = await openMic();
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
    [connect, owner, settings, stopFor, stopMic, recordingDay, finishRecording, onEvent],
  );

  /**
   * Pause: the microphone goes off and nothing is sent; the take stays open on the checker, its marks and place on the
   * page. Playback mode, so what plays meanwhile (Hear it) comes from the speaker.
   */
  const pause = useCallback(async () => {
    const src = source.current;
    if (!src || !conn.current || pausedRef.current) return;
    pausedRef.current = true;
    source.current = null;
    setPaused(true);
    setMic('paused');
    await src.stop().catch(() => undefined);
    await setAudioMode(false).catch(() => undefined);
  }, []);

  /** Resume the same take: its microphone again, its audio on to the same connection, from where it was. */
  const resume = useCallback(async () => {
    const open = reopen.current;
    if (!pausedRef.current || !conn.current || !open) return;
    stopHearing();
    setMic('starting');
    try {
      claimAudio('recorder', owner);
      const src = await open();
      if (!pausedRef.current || !conn.current) {
        await src.stop().catch(() => undefined);
        return;
      }
      source.current = src;
      pausedRef.current = false;
      setPaused(false);
      setMic('on');
    } catch (err) {
      logger.warn('Could not resume the live recitation', err);
      setMic('paused');
    }
  }, [owner]);

  /**
   * The reciter's own voice at a mark ("Your recitation"): the mark's time in the take (a little before and after), or
   * for a mark without one (a skipped word), around when the cursor reached that word or the one before. Null when the
   * take's audio isn't held (E2E's recorded take) or the moment isn't known.
   */
  /** Whether Your recitation has something to play for `m` (cheap: nothing is cut). */
  const hasClip = useCallback(
    (m: Mark): boolean =>
      !!lastConn.current?.audioClip && (m.t != null || wordTimes.current.has(m.w) || wordTimes.current.has(m.w - 1)),
    [],
  );
  const clipFor = useCallback((m: Mark): Int16Array | null => {
    const c = lastConn.current;
    if (!c?.audioClip) return null;
    let range: [number, number] | null = null;
    if (m.t) range = [m.t[0] - 0.6, m.t[1] + 0.4];
    else {
      const at = wordTimes.current.get(m.w) ?? wordTimes.current.get(m.w - 1);
      if (at != null) range = [at - 1.2, at + 1.2];
    }
    if (!range) return null;
    const pcm = c.audioClip(Math.max(0, range[0]), range[1]);
    return pcm && pcm.length > 0 ? pcm : null;
  }, []);

  /**
   * A label for the checker ("Not a mistake", or taking it back): on the take's connection while it's live; after its
   * final answer the connection has gone, so over HTTP, and only for a kept take (only those are stored). Before, a
   * "Not a mistake" tapped after Stop, on the card or the summary, never reached the checker.
   */
  const testDataRef = useRef(testData);
  testDataRef.current = testData;
  const label = useCallback((what: 'dismiss' | 'undismiss', id: string) => {
    const s = traceRef.current.state;
    if (s.status === 'done') {
      if (s.take && testDataRef.current) void sendLabel(what, s.take, id, Date.now());
      return;
    }
    conn.current?.send({ type: what, id });
  }, []);

  /** "Not a mistake": off the page at once, and told to the checker (a label for the lab). It can be put back. */
  const dismiss = useCallback(
    (id: string) => {
      label('dismiss', id);
      setState((s) => dismissMark(s, id));
    },
    [label],
  );

  /** Put back (Undo, or the summary's Removed list): the mark returns, and the checker takes the label back. */
  const restore = useCallback(
    (id: string) => {
      if (!traceRef.current.state.removed[id]) return;
      label('undismiss', id);
      setState((s) => restoreMark(s, id));
    },
    [label],
  );

  /** When the cursor first reached `w`, in seconds of the take (Recite's memory keeps it for ▶ on a right try). */
  const wordTime = useCallback((w: number): number | null => wordTimes.current.get(w) ?? null, []);

  /** A word or an ayah shown by hand (hidden view), told to the checker as information. */
  const hint = useCallback((w: number, what: 'word' | 'ayah') => {
    if (SEND_HINTS) conn.current?.send({ type: 'hint', w, what });
  }, []);

  /** Done with the take: back to idle (the summary closed). */
  const clear = useCallback(() => {
    stopTrace.end();
    stopHearing();
    lastConn.current = null;
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
      // A page the screen doesn't hold (past a session's last page) isn't turned to: nothing to wait for.
      if (onShowPageRef.current(page) === false) turningTo.current = null;
    }
  }, [live, state.cursor, words]);

  // A drill take stops by itself once the checker has decided its last word (reciting on would add "Added after the
  // end" marks).
  const saidUpTo = state.saidUpTo;
  useEffect(() => {
    const end = endWord.current;
    if (end == null || !live || saidUpTo == null || saidUpTo < end) return;
    endWord.current = null;
    stopFor('reached');
  }, [live, saidUpTo, stopFor]);

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
    const w = words.pageRange(currentPage)[0];
    if (checkerLooks(state)) {
      // The reciter is somewhere on this page: the checker looks for where, as at the take's start (protocol 6).
      conn.current.send({ type: 'seek', w, startBy: lastAyahOf(currentPage) });
      setState((s) => seekOnPage(s, w));
      return;
    }
    conn.current.send({ type: 'seek', w });
    // Only a page change sends it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // Leaving the app ends the take (the final answer comes when it's back).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      stopTrace.step(`app:${s}`);
      if (s === 'background' && (source.current || pausedRef.current)) stopFor('background');
    });
    return () => sub.remove();
  }, [stopFor]);

  // The Stop trace: the final answer came, or the take failed (the bar says so, so the trace has ended).
  const status = state.status;
  useEffect(() => {
    if (status === 'done') stopTrace.step('done', conn.current?.status?.());
    else if (status === 'failed') stopTrace.end();
  }, [status]);

  // Leaving the screen throws the take away.
  useEffect(() => () => cancel(), [cancel]);

  // VoiceOver hears where the take started, once the checker has found it (while listening, from a search).
  const startBefore = useRef<number | null>(null);
  const searched = state.anywhere && checkerLooks(state);
  useEffect(() => {
    const before = startBefore.current;
    startBefore.current = state.start;
    if (before != null || state.start == null || !live || !searched || !words) return;
    const r = words.ref(state.start);
    AccessibilityInfo.announceForAccessibility(`Started at ${spokenText(placeOfAyah(ayahKey(r.sura, r.ayah)))}`);
  }, [state.start, live, searched, words]);

  return {
    state,
    /** The running (or last) take's mode; null when idle. */
    mode,
    mic,
    /** The take is being kept as a recording (Save recordings on). */
    recording,
    /** The take went to the checker with Keep as test data on (it is stored there). */
    testData,
    seconds,
    words,
    /** The first word recited (where the score's pages and the summary start); null while the checker looks for it. */
    startWord: state.start,
    active: state.status !== 'idle',
    /** The take is paused: the microphone off, the take open (Resume carries on). */
    paused,
    start,
    stop,
    pause,
    resume,
    hasClip,
    clipFor,
    wordTime,
    cancel,
    clear,
    dismiss,
    restore,
    hint,
  };
}

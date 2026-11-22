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
import { AudioSource, decodePcm, startMicStream } from '../../lib/recite/micSource';
import { SAMPLE_RATE } from '../../lib/recite/segmenter';
import { getQuranWords, loadQuranWords, QuranWords } from '../../lib/recite/quranWords';
import { checkLevel, type ReciteCheckSettings } from '../../lib/reciteCheck/settings';
import { sendLabel } from '../../lib/reciteCheck/service';
import type { LiveEvent, Mark } from '../../lib/reciteLive/contract';
import type { LiveConnect, LiveConnection, StartFrame } from '../../lib/reciteLive/feed';
import { socketFeed } from '../../lib/reciteLive/socket';
import { stopHearing } from '../../lib/reciteLive/hearAudio';
import { spanEndWord, TakeSpan } from '../../lib/reciteLive/span';
import { stopTrace } from '../../lib/reciteLive/stopTrace';
import { createTakeClock } from '../../lib/reciteLive/takeClock';
import { createTakeStats } from '../../lib/reciteLive/takeStats';
import { createMistakeCue, playCueSound, playCueTap } from '../../lib/reciteLive/mistakeCue';
import { reportLongTake, reportUnfinishedTake } from '../../lib/reciteLive/takeReport';
import { SavedTake, startTakeRecording, TakeRecording } from '../../lib/reciteLive/takeRecording';
import {
  applyEvent,
  checkerLooks,
  dismissMark,
  restoreMark,
  isUnfinished,
  settleUnfinished,
  LIVE_IDLE,
  liveConnecting,
  LiveState,
  liveStopping,
  seekOnPage,
} from '../../lib/reciteLive/state';
import { isDevVariant } from '../../lib/variant';
import { useReduceMotion } from '../../design/motion';
import { t } from '../../i18n';

/** What the mic does while reciting: follow along (free), or follow and mark mistakes (Check). */
export type LiveMode = 'recite' | 'check';

/** The microphone: off, asking for it, on, paused (the take goes on), refused, or failed to start. */
export type MicStatus = 'off' | 'starting' | 'on' | 'paused' | 'denied' | 'error';

/**
 * The checker's events are applied at most this often (ms): the first at once, those that follow within the window
 * together (Revisely Dev's long takes, Nov 20 2026). Each event was a render of the whole reader, and a resume replays
 * every event of the take at once: about 300 for Majd's 3.5 minutes, each a full re-render on the phone.
 */
let LIVE_BATCH_MS = process.env.NODE_ENV === 'test' ? 0 : 100;
/** Tests apply each event at once (the default under Jest, where each event is its own act), or batch as the app does. */
export function setLiveBatchForTests(ms: number): void {
  LIVE_BATCH_MS = ms;
}

/**
 * After Stop, the checker's final answer has this long (ms); then the summary shows what the take found, marked
 * unfinished, and a final answer that comes later replaces it (long takes, Nov 20 2026: Majd's Stop spun until he left).
 */
export const STOP_BUDGET_MS = 5000;
let stopBudgetMs = STOP_BUDGET_MS;
/** Tests shorten the wait (and put it back with no argument). */
export function setStopBudgetForTests(ms: number = STOP_BUDGET_MS): void {
  stopBudgetMs = ms;
}

/**
 * What a re-check sends again from the take's start (a resume the checker didn't hold: another instance, `ready.from`
 * behind what the page shows): its cursor and what follows it, ignored until the re-check passes where the page was
 * (the checker session's ask, Nov 20 2026). Marks still apply, by id.
 */
const REPLAYED = new Set(['at', 'said', 'off', 'ayah', 'score', 'locked']);

/** Failures a take ends on without what it found being kept: the checker's gate (the Premium page opens instead). */
const GATE_FAILURES = new Set(['check_locked', 'premium_required']);

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
    tajweed: checkLevel(settings) === 'strict',
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
 * Whether a take keeps its audio (RMEM-6): with Mark mistakes (a take Recite remembers, which the audio stays with),
 * Save recordings on (the default) and a revision day. Recite alone keeps nothing.
 */
export function keepsAudio(mode: LiveMode, saveRecording: boolean, day: string | null): boolean {
  return mode === 'check' && saveRecording && day != null;
}

/**
 * A live take on the reader (Revisely Dev): the microphone streams to the checker's `/live`, and its events become
 * what the page and the bar show (lib/reciteLive/state). The reciter's place turns the page; a page turned by hand
 * tells the checker where to look (`seek`). Leaving the app ends the take. The take's audio stays on the phone for
 * resuming (lib/reciteLive/socket). A take with Mark mistakes also keeps its audio for that revision day, with the take
 * (lib/reciteLive/takeRecording, `keepsAudio`), whatever ends it: never as a recording of its own.
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
  /** The revision day a take's audio belongs to (null: nothing is kept). */
  recordingDay?: string | null;
  /** A take's audio was saved (its record notes it). */
  onRecordingSaved?: (saved: SavedTake) => void;
  connect?: LiveConnect;
}) {
  const [state, setState] = useState<LiveState>(LIVE_IDLE);
  const reduceMotion = useReduceMotion();
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;
  const [mode, setMode] = useState<LiveMode | null>(null);
  const [mic, setMic] = useState<MicStatus>('off');
  // The take's time: outside React state, so its second-by-second ticks re-render only what shows it (lib/reciteLive/takeClock).
  const [clock] = useState(createTakeClock);
  // The take's own numbers (JavaScript stalls, event-to-screen time, the checker's lag): lib/reciteLive/takeStats.
  const [stats] = useState(() =>
    createTakeStats({
      now: () => Date.now(),
      every: (fn, ms) => setInterval(fn, ms),
      clear: (h) => clearInterval(h as ReturnType<typeof setInterval>),
      heap: () =>
        (globalThis as { HermesInternal?: { getInstrumentedStats?: () => { js_heapSize?: number } } }).HermesInternal?.getInstrumentedStats?.()
          ?.js_heapSize ?? null,
    }),
  );
  /** After Stop: the summary shows what the take found once STOP_BUDGET_MS passes without a final answer. */
  const stopBudget = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearBudget = useCallback(() => {
    if (stopBudget.current) clearTimeout(stopBudget.current);
    stopBudget.current = null;
  }, []);
  /** This take's long-take numbers have gone (once a take, whatever its answer). */
  const reportedLong = useRef(false);
  // A sound and a tap as a mistake is marked (Settings → Recite → Sound on a mistake; lib/reciteLive/mistakeCue).
  const [cue] = useState(() => createMistakeCue({ now: () => Date.now(), sound: playCueSound, tap: playCueTap }));
  const soundRef = useRef(settings.mistakeSound);
  soundRef.current = settings.mistakeSound;
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
  const traceRef = useRef({ state, mode });
  traceRef.current = { state, mode };
  // Events waiting to be applied together (LIVE_BATCH_MS), and when they last were.
  const queued = useRef<LiveEvent[]>([]);
  const batchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastApplied = useRef(0);
  // When the oldest event waiting arrived, and that of the last batch applied (for event-to-screen time).
  const queuedSince = useRef<number | null>(null);
  const appliedFrom = useRef<number | null>(null);
  /** Everything waiting, applied in one update, in the order it came. */
  const applyQueued = useCallback(() => {
    if (batchTimer.current) clearTimeout(batchTimer.current);
    batchTimer.current = null;
    const batch = queued.current;
    if (!batch.length) return;
    queued.current = [];
    appliedFrom.current = queuedSince.current;
    queuedSince.current = null;
    lastApplied.current = Date.now();
    setState((s) => batch.reduce(applyEvent, s));
  }, []);
  /** A new take, or the take let go: nothing waiting carries over. */
  const dropQueued = useCallback(() => {
    if (batchTimer.current) clearTimeout(batchTimer.current);
    batchTimer.current = null;
    queued.current = [];
    queuedSince.current = null;
  }, []);
  useEffect(() => () => dropQueued(), [dropQueued]);
  // Each batch on screen: how long its oldest event waited (the take's numbers).
  useEffect(() => {
    const from = appliedFrom.current;
    appliedFrom.current = null;
    if (from != null) stats.applied(from);
  }, [state, stats]);
  // The take's `ready`s (a second one is a resume), the furthest audio time the cursor has shown, and while a re-check
  // replays the take, the time it must pass before its cursor shows again.
  const readies = useRef(0);
  const shownT = useRef(0);
  const replayUntil = useRef<number | null>(null);
  /** Each event the take receives: its type to the Stop trace, then the live state. */
  const onEvent = useCallback((e: LiveEvent) => {
    if (e.type === 'ready') {
      readies.current++;
      // A resume onto a checker that holds less than the page shows: it checks the take again from there.
      if (readies.current > 1 && (e.from ?? 0) / SAMPLE_RATE < shownT.current - 1) replayUntil.current = shownT.current;
    }
    let replayed = false;
    if (replayUntil.current != null) {
      const t = e.type === 'at' || e.type === 'beat' ? e.t : undefined;
      if (t != null && t >= replayUntil.current - 0.5) replayUntil.current = null;
      else replayed = true;
    }
    // A re-check's times start again from 0: not the checker's lag (the E2E long take read 306 s).
    stats.event(e, samples.current / SAMPLE_RATE, replayed);
    if (replayed && REPLAYED.has(e.type) && (e.type !== 'locked' || traceRef.current.state.start != null)) return;
    if (e.type === 'at' && e.t != null) shownT.current = Math.max(shownT.current, e.t);
    // A new mistake while reciting: its sound and tap at once (never one called Not a mistake, or after Stop).
    if (e.type === 'mark' && traceRef.current.state.status === 'listening' && !traceRef.current.state.dismissed.includes(e.mark.id)) {
      // Revisely Dev's until the next release.
      cue.mark(e.mark, soundRef.current && traceRef.current.mode === 'check' && isDevVariant());
    }
    // The checker's heartbeat is for the connection and the numbers only (lib/reciteLive/socket).
    if (e.type === 'beat') return;
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
    queued.current.push(e);
    if (queuedSince.current == null) queuedSince.current = Date.now();
    // The final answer and a failure show at once; so does an event after a quiet moment. Those that follow within
    // LIVE_BATCH_MS wait for one update together.
    const wait = e.type === 'done' || e.type === 'error' || LIVE_BATCH_MS <= 0 ? 0 : lastApplied.current + LIVE_BATCH_MS - Date.now();
    if (wait <= 0) applyQueued();
    else if (!batchTimer.current) batchTimer.current = setTimeout(applyQueued, wait);
  }, [applyQueued, stats, cue]);

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
        seconds: clock.get(),
        take: t.state.take,
        socket: conn.current?.status?.(),
      });
      stopHearing();
      void stopMic();
      conn.current?.send({ type: 'end' });
      applyQueued();
      setState((s) => liveStopping(s));
      // The summary within a few seconds, whatever the checker does: what the take found, if its answer is late.
      clearBudget();
      stopBudget.current = setTimeout(() => {
        stopBudget.current = null;
        applyQueued();
        setState((s) => {
          if (s.status !== 'checking') return s;
          const settled = settleUnfinished(s, clock.get());
          if (settled !== s) {
            stopTrace.step('unfinished', conn.current?.status?.());
            stats.stop(clock.get());
            reportUnfinishedTake({ why: 'late', mode: traceRef.current.mode ?? '?', socket: conn.current?.status?.(), stats: stats.snapshot() });
          }
          return settled;
        });
      }, stopBudgetMs);
    },
    [stopMic, clock, applyQueued, clearBudget, stats],
  );
  const stop = useCallback(() => stopFor('tap'), [stopFor]);

  /** Throw the take away (the screen left): nothing more comes. */
  const cancel = useCallback(() => {
    dropQueued();
    clearBudget();
    stats.stop(clock.get());
    // Let go between Stop and the summary (the reader left while it checked): Sentry hears of it, with the numbers.
    // The take itself is kept by Recite's memory (components/reciteMemory/useRememberTake), unfinished.
    stopTrace.abandon(stats.snapshot() as unknown as Record<string, unknown>);
    stopHearing();
    lastConn.current = null;
    void stopMic();
    conn.current?.close();
    conn.current = null;
    setState(LIVE_IDLE);
    setMode(null);
  }, [stopMic, dropQueued, clearBudget, stats, clock]);

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
      dropQueued();
      clearBudget();
      reportedLong.current = false;
      readies.current = 0;
      shownT.current = 0;
      replayUntil.current = null;
      cue.reset();
      setMic('starting');
      clock.set(0);
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
        stats.start();
        // A long take (long takes, Nov 20 2026): the real socket to a stand-in checker, the microphone's frames 10 a
        // second as the native module sends them (lib/e2e/reciteLive).
        const long = e2e.e2eLongTakeMinutes() > 0;
        const c = (long ? e2e.e2eLongConnect() : e2e.e2eLiveConnect())(frame, {
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
        recordingRef.current = keepsAudio(take, settings.saveRecording, recordingDay)
          ? startTakeRecording({ day: recordingDay as string, page })
          : null;
        setRecording(recordingRef.current != null);
        let second = 0;
        const openTone = async (): Promise<AudioSource> => {
          if (long) {
            const b64 = e2e.e2eToneFrameBase64();
            const frames = setInterval(() => {
              if (conn.current !== c) return;
              const pcm = decodePcm(b64);
              c.sendAudio(pcm);
              recordingRef.current?.add(pcm);
              const before = Math.floor(samples.current / SAMPLE_RATE);
              samples.current += pcm.length;
              if (Math.floor(samples.current / SAMPLE_RATE) !== before) clock.set(Math.floor(samples.current / SAMPLE_RATE));
            }, 100);
            return {
              stop: async () => {
                clearInterval(frames);
              },
            };
          }
          const tick = setInterval(() => {
            clock.set(clock.get() + 1);
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
        stats.start();
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
        recordingRef.current = keepsAudio(take, settings.saveRecording, recordingDay)
          ? startTakeRecording({ day: recordingDay as string, page })
          : null;
        setRecording(recordingRef.current != null);
        const handlers = {
          onAudio: (pcm: Int16Array) => {
            if (conn.current !== c) return;
            c.sendAudio(pcm);
            recordingRef.current?.add(pcm);
            const before = Math.floor(samples.current / SAMPLE_RATE);
            samples.current += pcm.length;
            if (Math.floor(samples.current / SAMPLE_RATE) !== before) clock.set(Math.floor(samples.current / SAMPLE_RATE));
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
    [connect, owner, settings, stopFor, stopMic, recordingDay, finishRecording, onEvent, clock, dropQueued, clearBudget, cue],
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
    // However long the pause, the take stays open on the checker (it lets a take go after 30 s without a frame).
    conn.current.hold?.(true);
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
      conn.current.hold?.(false);
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
      applyQueued();
      setState((s) => dismissMark(s, id));
    },
    [label, applyQueued],
  );

  /** Put back (Undo, or the summary's Removed list): the mark returns, and the checker takes the label back. */
  const restore = useCallback(
    (id: string) => {
      if (!traceRef.current.state.removed[id]) return;
      label('undismiss', id);
      applyQueued();
      setState((s) => restoreMark(s, id));
    },
    [label, applyQueued],
  );

  /** When the cursor first reached `w`, in seconds of the take (Recite's memory keeps it for ▶ on a right try). */
  const wordTime = useCallback((w: number): number | null => wordTimes.current.get(w) ?? null, []);

  /** A word or an ayah shown by hand (hidden view), told to the checker as information. */
  const hint = useCallback((w: number, what: 'word' | 'ayah') => {
    if (SEND_HINTS) conn.current?.send({ type: 'hint', w, what });
  }, []);

  /** Done with the take: back to idle (the summary closed). */
  const clear = useCallback(() => {
    dropQueued();
    clearBudget();
    stopTrace.end();
    stopHearing();
    lastConn.current = null;
    void stopMic();
    conn.current?.close();
    conn.current = null;
    setState(LIVE_IDLE);
    setMode(null);
  }, [stopMic, dropQueued, clearBudget]);

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
      applyQueued();
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
  const failure = state.failure;
  useEffect(() => {
    if (status === 'done') {
      clearBudget();
      stopTrace.step(isUnfinished(traceRef.current.state) ? 'summary-unfinished' : 'done', conn.current?.status?.());
      stats.stop(clock.get());
      if (process.env.EXPO_PUBLIC_E2E === '1') {
        // eslint-disable-next-line no-console
        console.log(`[e2e] take stats ${JSON.stringify({ unfinished: isUnfinished(traceRef.current.state), ...stats.snapshot() })}`);
        e2e?.e2eTakeEnded(stats.snapshot());
      }
      if (!reportedLong.current) {
        reportedLong.current = true;
        reportLongTake({ mode: traceRef.current.mode ?? '?', unfinished: isUnfinished(traceRef.current.state), stats: stats.snapshot() });
      }
    } else if (status === 'failed') {
      clearBudget();
      // A take that had found its start keeps what it found, unfinished, with its summary (long takes, Nov 20 2026):
      // before, a lost connection showed "Couldn't reach…" in the bar and the take was gone. The checker's gate isn't
      // one: the Premium page opens instead.
      if (traceRef.current.state.start != null && !GATE_FAILURES.has(failure ?? '')) {
        stats.stop(clock.get());
        reportUnfinishedTake({ why: 'failed', mode: traceRef.current.mode ?? '?', failure, socket: conn.current?.status?.(), stats: stats.snapshot() });
        setState((s) => (s.status === 'failed' ? settleUnfinished(s, clock.get()) : s));
        return;
      }
      stopTrace.end();
    }
  }, [status, failure, clearBudget, stats, clock]);

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
    AccessibilityInfo.announceForAccessibility(t('reciteLive.startedAt', { place: spokenText(placeOfAyah(ayahKey(r.sura, r.ayah))) }));
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
    /** The take's time in seconds, as of now (read it when needed; `clock` re-renders what shows it). */
    get seconds() {
      return clock.get();
    },
    clock,
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

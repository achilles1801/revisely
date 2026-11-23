// A trace of each live take's Stop, so a freeze between Stop and the summary says where it stuck (Revisely Dev).
//
// Majd's take froze after Stop ("everything froze i had to close the app", Nov 14 2026), and nothing reached Sentry:
// logger.warn is silent in release builds, and an app hang ended by a force-quit is never sent. A stuck JavaScript
// thread, or a modal host that iOS refused (SHEET-1), draws the screen and takes no taps, which is what he saw.
//
// So Stop writes a small marker on the phone and each step to the summary adds to it: the final answer, the recording
// saved, the summary shown. A heartbeat every 500 ms keeps the longest JavaScript stall it saw and, every 2 s, when it
// last beat: still beating long after Stop means the JavaScript was alive and the screen itself was stuck. The summary
// shown, the take closed or failed, or the screen left removes the marker. One still there at the next launch means
// that run ended between Stop and the summary: it goes to Sentry once (environment `dev`), then is deleted.
//
// It keeps no audio and no words: event types, the take's phase, the socket's state, whether a sheet held the screen.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { modalShowing } from '../../components/v2/modalTurn';
import { isDevVariant } from '../variant';

export const STOP_TRACE_KEY = '@revisely_recite_stop_trace:v1';

/** The heartbeat's interval, how often it saves when it last beat, and how long after Stop it keeps beating. */
export const BEAT_MS = 500;
const SAVE_BEAT_MS = 2000;
const BEAT_FOR_MS = 120_000;
/** Steps kept (a repeat of the last one counts instead of adding one). */
const MAX_STEPS = 40;
/** Event types kept from before Stop. */
const RECENT = 8;

export interface TraceStep {
  /** What happened: `stop`, `mic-off`, `audio-mode`, `recording`, `ev:<type>`, `done`, `summary-asked`, … */
  s: string;
  /** Milliseconds after Stop. */
  t: number;
  /** How many times in a row (when more than one). */
  n?: number;
  /** A sheet held the screen (lib v2/modalTurn). */
  sheet?: boolean;
  /** The socket's state (lib/reciteLive/socket `status`). */
  socket?: string;
}

export interface StopTrace {
  v: 1;
  /** When Stop was tapped (epoch ms). */
  at: number;
  mode: string;
  /** The take's phase at Stop (lib/reciteLive/state `status`). */
  status: string;
  /** The take's length at Stop, in seconds. */
  seconds: number;
  /** The checker's take id, when it had sent one. */
  take: string | null;
  /** The last events' types before Stop, oldest first. */
  recent: string[];
  steps: TraceStep[];
  /** The longest gap between heartbeats beyond their interval (ms): how long the JavaScript thread stalled. */
  stall: number;
  /** The last heartbeat saved, in ms after Stop. */
  beat: number;
  /** The take's own numbers (lib/reciteLive/takeStats), when it was let go before its summary (`abandon`). */
  stats?: Record<string, unknown>;
}

export interface StopTracerDeps {
  enabled: () => boolean;
  storage: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> };
  now: () => number;
  timers: { every: (fn: () => void, ms: number) => unknown; clear: (h: unknown) => void };
  sheet: () => boolean;
  report: (trace: StopTrace) => void;
}

export interface StopTracer {
  /** Every event the take receives (only its type is kept). */
  event(type: string): void;
  /** Stop was tapped. */
  stop(info: { mode: string; status: string; seconds: number; take: string | null; socket?: string }): void;
  /** A step on the way to the summary (ignored when no Stop is being traced). */
  step(s: string, socket?: string): void;
  /** The take reached somewhere the screen shows (the summary, a failure) or went: the trace is removed. */
  end(): void;
  /**
   * The screen let the take go between Stop and its summary (the reader left while it was checking; long takes, Nov 20
   * 2026): the trace goes to Sentry now, with the take's numbers, instead of being removed unseen. Without a Stop being
   * traced, nothing.
   */
  abandon(stats?: Record<string, unknown>): void;
  /** At launch: a trace still there is from a run that ended between Stop and the summary. */
  reportLeftover(): Promise<void>;
}

export function createStopTracer(deps: StopTracerDeps): StopTracer {
  let trace: StopTrace | null = null;
  let recent: string[] = [];
  let beat: unknown = null;
  let lastBeat = 0;
  let lastSaved = 0;

  const save = () => {
    if (!trace) return;
    deps.storage.setItem(STOP_TRACE_KEY, JSON.stringify(trace)).catch(() => undefined);
  };

  const stopBeat = () => {
    if (beat != null) deps.timers.clear(beat);
    beat = null;
  };

  const add = (s: string, socket?: string) => {
    if (!trace) return;
    const t = deps.now() - trace.at;
    const last = trace.steps[trace.steps.length - 1];
    if (last && last.s === s) {
      last.n = (last.n ?? 1) + 1;
      return;
    }
    if (trace.steps.length >= MAX_STEPS) return;
    const sheet = deps.sheet();
    trace.steps.push({ s, t, ...(sheet ? { sheet } : {}), ...(socket ? { socket } : {}) });
  };

  return {
    event(type) {
      if (trace) {
        add(`ev:${type}`);
        save();
        return;
      }
      recent.push(type);
      if (recent.length > RECENT) recent = recent.slice(-RECENT);
    },
    stop(info) {
      if (!deps.enabled()) return;
      stopBeat();
      const at = deps.now();
      trace = {
        v: 1,
        at,
        mode: info.mode,
        status: info.status,
        seconds: info.seconds,
        take: info.take,
        recent,
        steps: [],
        stall: 0,
        beat: 0,
      };
      recent = [];
      add('stop', info.socket);
      save();
      lastBeat = at;
      lastSaved = at;
      beat = deps.timers.every(() => {
        if (!trace) return stopBeat();
        const now = deps.now();
        trace.stall = Math.max(trace.stall, now - lastBeat - BEAT_MS);
        lastBeat = now;
        if (now - lastSaved >= SAVE_BEAT_MS) {
          lastSaved = now;
          trace.beat = now - trace.at;
          save();
        }
        if (now - trace.at >= BEAT_FOR_MS) stopBeat();
      }, BEAT_MS);
    },
    step(s, socket) {
      if (!trace) return;
      add(s, socket);
      save();
    },
    end() {
      stopBeat();
      recent = [];
      if (!trace) return;
      trace = null;
      deps.storage.removeItem(STOP_TRACE_KEY).catch(() => undefined);
    },
    abandon(stats) {
      stopBeat();
      recent = [];
      if (!trace) return;
      add('left');
      const left: StopTrace = { ...trace, ...(stats ? { stats } : {}) };
      trace = null;
      deps.storage.removeItem(STOP_TRACE_KEY).catch(() => undefined);
      deps.report(left);
    },
    async reportLeftover() {
      if (!deps.enabled()) return;
      let raw: string | null = null;
      try {
        raw = await deps.storage.getItem(STOP_TRACE_KEY);
      } catch {
        return;
      }
      if (!raw) return;
      await deps.storage.removeItem(STOP_TRACE_KEY).catch(() => undefined);
      let left: StopTrace | null = null;
      try {
        left = JSON.parse(raw) as StopTrace;
      } catch {
        return;
      }
      if (left && left.v === 1 && Array.isArray(left.steps)) deps.report(left);
    },
  };
}

/** The take's Stop, as Sentry sees it: one issue, its last step a tag to group and search by. */
function reportToSentry(trace: StopTrace): void {
  const last = trace.steps[trace.steps.length - 1]?.s ?? 'none';
  Sentry.captureMessage("Recite: a take's Stop never reached the summary", {
    level: 'warning',
    fingerprint: ['recite-stop-unfinished'],
    tags: { recite_stop_last: last, recite_mode: trace.mode },
    extra: { trace },
  });
}

/** The app's tracer: Revisely Dev only (the store app never starts a live take). */
export const stopTrace = createStopTracer({
  enabled: isDevVariant,
  storage: AsyncStorage,
  now: () => Date.now(),
  timers: { every: (fn, ms) => setInterval(fn, ms), clear: (h) => clearInterval(h as ReturnType<typeof setInterval>) },
  sheet: modalShowing,
  report: reportToSentry,
});

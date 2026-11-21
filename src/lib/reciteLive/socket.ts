// The live check's connection to the checker on revisely-dev (`/live`, a WebSocket; revisely-internal's checker/, the server
// session's). Audio goes out as 16 kHz mono PCM; the checker's events come back (lib/reciteLive/contract).
//
// A dropped connection carries on: the take's audio stays on the phone, a new socket sends the same start frame with
// a fresh token and `resume`, and the checker says how much it already holds (`ready.from`, in samples). The audio
// from there is sent again, with each seek, dismissal and the end at the point in the audio where it first went. The
// checker then sends the same events again (on another instance it re-runs the take), which the live state applies
// as snapshots and by id, so nothing counts twice.
//
// Two services (recite-contract.md, "Two services"; Majd approved Nov 15 2026): the light levels (Recite, and Words &
// harakat with letters off) go to recite-check-pair, two takes an instance; everything else to recite-check. A take the
// pair service refuses (`level_elsewhere`) or can't start (unreachable, or its 403 while it is private) starts again on
// recite-check, with no resume; once a service has said `ready`, a resume goes back to it. A pair service that couldn't
// start a take, or whose /health refused (lib/reciteLive/pairService), is passed over for an hour.
//
// Long takes (Majd's 3.5-minute take of Nov 19 2026, lost): a connection can go quiet without closing, and the phone
// then sent audio into it for 76 s with nothing coming back. A checker that beats (`ready.beat`, contract draft 9) is
// watched: WATCHDOG_MS without a word from it counts as a drop, and the take resumes. And a resume's held audio goes out
// a slice at a time, paced: never in one loop that holds the JavaScript thread, and never as one pile on the uplink,
// where the socket's keepalive pong queued behind 38 s of resent audio and the checker dropped it after 20 s (the
// checker session's finding). With beats, no more than CATCHUP_LEAD_SAMPLES ahead of what the checker has received
// (`beat.rx`); without, CATCHUP_SLICE_SAMPLES every CATCHUP_TICK_MS.

import { LiveEvent, parseEvent } from './contract';
import { pairClosed, pairOpen } from './pairService';
import type { ClientFrame, LiveConnect, LiveConnection, LiveHandlers, StartFrame } from './feed';
import { checker } from '../reciteCheck/endpoints';

const live = (base: string) => `${base.replace(/^https:/, 'wss:')}/live`;
/** The checker's live endpoint (the same Cloud Run service as lib/reciteCheck/service, in the app's own project). */
export const RECITE_LIVE_URL = live(checker().base);
/** recite-check-pair's (the same image and protocol): Recite and Words & harakat without letters only. */
export const RECITE_PAIR_LIVE_URL = live(checker().pair);

/** Whether recite-check-pair takes this take: what the server calls `recite` or `harakat` (health.level). */
export function pairTakes(start: StartFrame): boolean {
  return start.follow === true || (start.tajweed === false && start.letters === false);
}

/** The take's audio rate (16 kHz mono). */
const SAMPLE_RATE_HZ = 16_000;
/** Samples per frame when sending held audio again after a drop (1 s). */
const RESEND_SAMPLES = 16_000;
/** Held audio sent at a time while catching up after a drop (1 s of samples), and how often (ms): 8× real time at most. */
export const CATCHUP_SLICE_SAMPLES = SAMPLE_RATE_HZ;
export const CATCHUP_TICK_MS = 125;
/** With beats: held audio sent no further than this ahead of what the checker says it has received (5 s). */
export const CATCHUP_LEAD_SAMPLES = 5 * SAMPLE_RATE_HZ;
/** Once the checker has beaten: this long without a word from it, and the connection counts as dropped (ms). */
export const WATCHDOG_MS = 8000;
/** How often the watchdog looks (ms). */
const WATCH_EVERY_MS = 2000;
/** Tries to reconnect before giving up, and the waits between them. */
const RETRY_WAITS_MS = [500, 1500, 4000];
/**
 * A take started with `namesAfter` (contract draft 8): after `done` the socket waits this long at most for `into`, where
 * the slips went. The checker always sends it (with no names when naming failed); this is for a checker that doesn't.
 */
export const NAMES_WAIT_MS = 5000;

/** The parts of a WebSocket this uses (React Native's, or a test's). */
export interface SocketLike {
  binaryType?: string;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e?: { code?: number }) => void) | null;
  onerror: ((e?: unknown) => void) | null;
  send(data: string | ArrayBuffer): void;
  close(): void;
}

export interface SocketDeps {
  url?: string;
  /** recite-check-pair's endpoint (RECITE_PAIR_LIVE_URL); null: every take on `url`. */
  pairUrl?: string | null;
  now?: () => number;
  /** A fresh Firebase ID token for each socket. */
  token: () => Promise<string | null>;
  /** The app's version, kept with the take ("1.0.4 (40) dev 1a2b3c4d"). */
  app?: string;
  open?: (url: string) => SocketLike;
  timers?: { set: (fn: () => void, ms: number) => unknown; clear: (h: unknown) => void };
}

type Control = Exclude<ClientFrame, StartFrame>;

/** A sample range of the take as a frame of its own (the chunk's bytes only). */
function bytes(chunk: Int16Array): ArrayBuffer {
  return chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer;
}

/** A text frame's `type`, read on its own (for a frame `parseEvent` couldn't read). */
function typeOf(data: unknown): unknown {
  if (typeof data !== 'string') return undefined;
  try {
    const x = JSON.parse(data) as unknown;
    return x && typeof x === 'object' ? (x as { type?: unknown }).type : undefined;
  } catch {
    return undefined;
  }
}

export function socketFeed(deps: SocketDeps): LiveConnect {
  const mainUrl = deps.url ?? RECITE_LIVE_URL;
  const pairUrl = deps.pairUrl === undefined ? RECITE_PAIR_LIVE_URL : deps.pairUrl;
  const now = deps.now ?? Date.now;
  const open = deps.open ?? ((u: string) => new WebSocket(u) as unknown as SocketLike);
  const timers = deps.timers ?? {
    set: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clear: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
  };

  return (start: StartFrame, handlers: LiveHandlers): LiveConnection => {
    /** The take's audio, in the order it came. */
    const audio: Int16Array[] = [];
    let samples = 0;
    /** Text frames with the sample they went at. */
    const controls: { at: number; frame: Control }[] = [];
    let take: string | null = null;
    let socket: SocketLike | null = null;
    /** Sending live (after `ready` and the held audio). */
    let live = false;
    let finished = false;
    /** `done` came on a take started with namesAfter: only `into` is still to come. */
    let answered = false;
    let namesWait: unknown = null;
    let tries = 0;
    let retry: unknown = null;
    /** The checker beats (it has sent `beat`): its silence then means a dead connection. */
    let beats = false;
    /** When the current socket last heard from the checker, and the watchdog's next look. */
    let heardAt = 0;
    /** The take's audio the checker has received, by its last beat (samples); null until a beat on this socket. */
    let rxSamples: number | null = null;
    let watch: unknown = null;
    /** A resume's held audio still going out (the next slice's timer). */
    let catching: unknown = null;
    const stopWatch = () => {
      if (watch != null) timers.clear(watch);
      watch = null;
      if (catching != null) timers.clear(catching);
      catching = null;
    };
    /** Where the take goes: the pair service for the light levels while it's up, else recite-check. */
    let url = pairUrl && pairTakes(start) && pairOpen(now()) ? pairUrl : mainUrl;
    /** On the pair service, which hasn't said `ready` yet: a refusal or a drop sends the take to recite-check. */
    let unproven = url !== mainUrl;
    /** Start again on recite-check, as a new take there. `down`: the pair service couldn't be reached. */
    const toMain = (down: boolean) => {
      if (down) pairClosed(now());
      url = mainUrl;
      unproven = false;
      take = null;
      tries = 0;
      void connect();
    };
    /** The take has ended (`end` went): only its answer is still to come. */
    const ended = () => controls.some((c) => c.frame.type === 'end');

    const finish = (e?: LiveEvent) => {
      if (finished) return;
      finished = true;
      stopWatch();
      if (retry != null) timers.clear(retry);
      if (namesWait != null) timers.clear(namesWait);
      if (e) handlers.onEvent(e);
      const s = socket;
      socket = null;
      live = false;
      if (s) {
        s.onclose = null;
        s.onmessage = null;
        try {
          s.close();
        } catch {
          // already closed
        }
      }
      handlers.onClose();
    };

    /**
     * Send the held audio from sample `from`, each text frame at its place in it, then go live. A slice at a time
     * (CATCHUP_SLICE_SAMPLES), the rest between frames: after a drop on another instance it's the whole take again, which
     * in one loop held the JavaScript thread (and the screen) for as long as it took. Audio and frames that come in
     * meanwhile join the end, in order.
     */
    const catchUp = (s: SocketLike, from: number) => {
      // Frames sent before `from` reached the checker with the audio it holds.
      let c = controls.findIndex((x) => x.at >= from);
      if (c < 0) c = controls.length;
      let at = from;
      let ci = 0;
      let pos = 0;
      const step = () => {
        catching = null;
        if (socket !== s || finished) return;
        // Paced: a slice a tick, and with beats no further ahead of what the checker has received than the lead allows.
        let budget = CATCHUP_SLICE_SAMPLES;
        if (rxSamples != null) budget = Math.min(budget, rxSamples + CATCHUP_LEAD_SAMPLES - at);
        while (budget > 0) {
          while (c < controls.length && controls[c].at <= at) s.send(JSON.stringify(controls[c++].frame));
          if (ci >= audio.length) break;
          const chunk = audio[ci];
          const end = pos + chunk.length;
          if (at >= end) {
            pos = end;
            ci++;
            continue;
          }
          const next = c < controls.length ? controls[c].at : Infinity;
          const stop = Math.min(end, at + Math.min(RESEND_SAMPLES, budget), next);
          s.send(bytes(chunk.subarray(at - pos, stop - pos)));
          budget -= stop - at;
          at = stop;
        }
        // Past the chunks sent in full: nothing held left means live now, not a tick later.
        while (ci < audio.length && at >= pos + audio[ci].length) pos += audio[ci++].length;
        if (ci < audio.length) {
          catching = timers.set(step, CATCHUP_TICK_MS);
          return;
        }
        while (c < controls.length) s.send(JSON.stringify(controls[c++].frame));
        live = true;
      };
      step();
    };

    /** The socket went quiet (the watchdog): let it go as if it had closed, and resume. */
    const stale = (s: SocketLike) => {
      if (socket !== s) return;
      socket = null;
      s.onclose = null;
      s.onmessage = null;
      try {
        s.close();
      } catch {
        // already closed
      }
      if (answered) {
        finish();
        return;
      }
      dropped();
    };
    const look = () => {
      watch = null;
      const s = socket;
      if (finished || !s || !beats) return;
      if (now() - heardAt > WATCHDOG_MS) {
        stale(s);
        return;
      }
      watch = timers.set(look, WATCH_EVERY_MS);
    };
    /** Watch the socket once it's ready and the checker beats. */
    const watchFrom = () => {
      if (watch != null || !beats || finished) return;
      watch = timers.set(look, WATCH_EVERY_MS);
    };

    const connect = async () => {
      if (finished) return;
      let token: string | null = null;
      try {
        token = await deps.token();
      } catch {
        token = null;
      }
      if (finished) return;
      if (!token) {
        finish({ type: 'error', reason: 'sign_in' });
        return;
      }
      let s: SocketLike;
      try {
        s = open(url);
      } catch {
        if (unproven) toMain(true);
        else dropped();
        return;
      }
      socket = s;
      s.binaryType = 'arraybuffer';
      s.onopen = () => {
        const frame: Record<string, unknown> = { ...start, token };
        if (deps.app) frame.app = deps.app;
        if (take) frame.resume = take;
        s.send(JSON.stringify(frame));
      };
      s.onmessage = (m) => {
        if (socket !== s || typeof m.data !== 'string') return;
        heardAt = now();
        const e = parseEvent(m.data);
        if (!e) {
          // A final answer this app can't read still ends the take. Resuming instead had the checker finish it
          // again, answer again and close again, round after round (a Recite take, Nov 14 2026).
          if (typeOf(m.data) === 'done') finish({ type: 'error', reason: 'server' });
          return;
        }
        if (e.type === 'error' && e.reason === 'level_elsewhere' && unproven) {
          // This service doesn't take that level: the take starts on recite-check.
          socket = null;
          s.onclose = null;
          s.onmessage = null;
          try {
            s.close();
          } catch {
            // already closed
          }
          toMain(false);
          return;
        }
        if (e.type === 'ready') {
          unproven = false;
          take = e.take ?? take;
          // A checker that beats announces it (draft 9): watched from now. What it already holds, it has received.
          if (e.beat) beats = true;
          rxSamples = beats ? Math.max(0, e.from ?? 0) : null;
          // Once the take has ended, a resume only waits for the answer: its tries aren't renewed, so a checker
          // that keeps closing without one can't hold the take on Checking… for good.
          if (!ended()) tries = 0;
          handlers.onEvent(e);
          catchUp(s, Math.min(samples, Math.max(0, e.from ?? 0)));
          watchFrom();
          return;
        }
        if (e.type === 'beat') {
          beats = true;
          if (e.rx != null) rxSamples = Math.round(e.rx * SAMPLE_RATE_HZ);
          watchFrom();
          handlers.onEvent(e);
          return;
        }
        if (e.type === 'done' && start.namesAfter) {
          // The final answer at once; where the slips went comes after it (`into`), NAMES_WAIT_MS at most.
          handlers.onEvent(e);
          if (!answered) {
            answered = true;
            namesWait = timers.set(() => {
              namesWait = null;
              finish();
            }, NAMES_WAIT_MS);
          }
          return;
        }
        if (e.type === 'done' || e.type === 'error' || (e.type === 'into' && answered)) {
          finish(e);
          return;
        }
        handlers.onEvent(e);
      };
      s.onerror = () => undefined;
      s.onclose = () => {
        if (socket !== s) return;
        socket = null;
        rxSamples = null;
        stopWatch();
        // The take has its final answer: the names are only a nicety, not worth a resume.
        if (answered) {
          finish();
          return;
        }
        // The pair service didn't start the take (unreachable, or 403 while private): recite-check does.
        if (unproven) toMain(true);
        else dropped();
      };
    };

    /** The socket went without an answer: try again, then give up. */
    const dropped = () => {
      socket = null;
      live = false;
      stopWatch();
      if (finished) return;
      if (tries >= RETRY_WAITS_MS.length) {
        finish({ type: 'error', reason: 'offline' });
        return;
      }
      const wait = RETRY_WAITS_MS[tries++];
      retry = timers.set(() => {
        retry = null;
        void connect();
      }, wait);
    };

    void connect();

    const control = (frame: Control) => {
      if (finished) return;
      controls.push({ at: samples, frame });
      if (live && socket) socket.send(JSON.stringify(frame));
    };

    return {
      sendAudio: (pcm) => {
        if (finished || pcm.length === 0) return;
        if (ended()) return;
        const copy = new Int16Array(pcm);
        audio.push(copy);
        samples += copy.length;
        if (live && socket) socket.send(bytes(copy));
      },
      send: control,
      close: () => finish(),
      status: () =>
        // i18n-ignore (a status for the log and Sentry)
        (finished ? 'finished' : retry != null ? `retry ${tries}` : socket ? (live ? 'live' : 'opening') : 'none') +
        (url !== mainUrl ? ' pair' : ''),
      // Still there after the take ends (the audio is held for resuming), for "Your recitation" on its marks.
      audioClip: (from, to) => {
        const a = Math.max(0, Math.floor(from * SAMPLE_RATE_HZ));
        const b = Math.min(samples, Math.ceil(to * SAMPLE_RATE_HZ));
        if (b <= a) return null;
        const out = new Int16Array(b - a);
        let pos = 0;
        for (const chunk of audio) {
          const end = pos + chunk.length;
          if (end > a && pos < b) {
            const s0 = Math.max(a, pos);
            out.set(chunk.subarray(s0 - pos, Math.min(b, end) - pos), s0 - a);
          }
          pos = end;
          if (pos >= b) break;
        }
        return out;
      },
    };
  };
}

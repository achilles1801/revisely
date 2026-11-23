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
//
// A long pause parks the take (contract draft 12, Nov 22 2026): a paused take held a checker instance, billed and closed
// to anyone else, for as long as the pause lasted (one Dev take: 25 s of audio on a socket open 299 s). With a checker
// whose `ready` says `pause`, a pause past PARK_AFTER_MS sends `pause` and closes the socket, no `end`: the checker
// keeps the take in memory, the phone keeps its audio, and Resume (or Stop) connects again with `resume`, as after a
// drop. A connection that drops while such a take is paused waits for Resume too. Shorter pauses keep the socket open
// (most pauses are under a minute), and a checker that doesn't say `pause` keeps it open however long the pause lasts.

import { LiveEvent, parseEvent } from './contract';
import { encodeBlock, MAX_BLOCK_SAMPLES } from './adpcm';
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
/**
 * How long a take waits for its first `ready` (ms) before it ends as `busy`. At capacity Cloud Run holds a new take about
 * 35 s and then refuses it, and with the retries a take said "Starting…" for over two minutes while the microphone
 * recorded (the checker's capacity test, Nov 22 2026). A cold instance answers within about 10 s.
 */
export const READY_WAIT_MS = 20_000;
/**
 * While a take is paused (the microphone off, the take open), a frame this often (ms). The checker lets a take go after
 * 30 s without a frame from the phone (`IDLE`, error `idle`): Majd paused a take in a session and its summary came up
 * by itself (Nov 21 2026). Any text frame counts, and it ignores a type it doesn't know.
 */
export const KEEPALIVE_MS = 10_000;
const KEEPALIVE_FRAME = JSON.stringify({ type: 'keepalive' });
/**
 * A pause longer than this parks the take (ms; contract draft 12): `pause`, then the socket closed until Resume or Stop.
 * Five of the six paused Dev takes the checker measured (Nov 22 2026) paused for under 45 s, and they keep their socket.
 */
export const PARK_AFTER_MS = 60_000;
const PAUSE_FRAME = JSON.stringify({ type: 'pause' });

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

/** A sample range of the take as a frame of its own, raw (the chunk's bytes only). */
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
    /** The first `ready`'s deadline (READY_WAIT_MS from the take's start); null once it has come or the take ended. */
    let readyWait: unknown = null;
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
    /** This socket's checker decodes ADPCM (its `ready`), and the step index the last block ended at. */
    let adpcm = false;
    let adpcmIndex = 0;
    /** A sample range as frames: IMA-ADPCM blocks (at most MAX_BLOCK_SAMPLES each) when the checker said so, else raw. */
    const sendAudioTo = (s: SocketLike, chunk: Int16Array) => {
      if (!adpcm) {
        s.send(bytes(chunk));
        return;
      }
      for (let at = 0; at < chunk.length; at += MAX_BLOCK_SAMPLES) {
        const r = encodeBlock(chunk.subarray(at, Math.min(chunk.length, at + MAX_BLOCK_SAMPLES)), adpcmIndex);
        adpcmIndex = r.index;
        s.send(r.block);
      }
    };
    /** Paused: the keepalive's next frame. */
    let holding = false;
    let keep: unknown = null;
    /** The last `ready` said its checker holds a parked take (draft 12). */
    let pausable = false;
    /** Parked: paused, the socket let go; Resume or Stop connects again (draft 12). And the park's timer. */
    let parked = false;
    let parkWait: unknown = null;
    const keepAlive = () => {
      keep = null;
      if (!holding || finished) return;
      if (live && socket) socket.send(KEEPALIVE_FRAME);
      keep = timers.set(keepAlive, KEEPALIVE_MS);
    };
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
      if (keep != null) timers.clear(keep);
      keep = null;
      if (parkWait != null) timers.clear(parkWait);
      parkWait = null;
      if (retry != null) timers.clear(retry);
      if (namesWait != null) timers.clear(namesWait);
      if (readyWait != null) timers.clear(readyWait);
      readyWait = null;
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
          sendAudioTo(s, chunk.subarray(at - pos, stop - pos));
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
      // Raw until this socket's `ready` says the checker decodes ADPCM (a resume may land on a checker that doesn't).
      adpcm = false;
      adpcmIndex = 0;
      pausable = false;
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
          if (readyWait != null) timers.clear(readyWait);
          readyWait = null;
          take = e.take ?? take;
          // A checker that beats announces it (draft 9): watched from now. What it already holds, it has received.
          if (e.beat) beats = true;
          // The audio 4:1 from here, only if this checker said it decodes it (and the start frame asked).
          adpcm = start.audio === 'adpcm' && e.audio === 'adpcm';
          pausable = e.pause === true;
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
        // The checker let the take go for want of frames (a pause past its IDLE, or a phone that sent nothing): a drop
        // to resume from, never the take's end (Nov 21 2026).
        if (e.type === 'error' && e.reason === 'idle' && !answered) {
          stale(s);
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
      // Paused on a checker that holds a parked take (draft 12): connecting again now would only hold an instance for the
      // rest of the pause (the checker's own `idle` backstop included). Resume or Stop connects.
      if (holding && pausable && !ended()) {
        parked = true;
        return;
      }
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

    /** Paused for PARK_AFTER_MS on a checker that holds a parked take: `pause`, then let the socket go (draft 12). */
    const park = () => {
      parkWait = null;
      const s = socket;
      if (!holding || finished || parked || ended() || !s || !live || !pausable) return;
      s.send(PAUSE_FRAME);
      parked = true;
      socket = null;
      live = false;
      rxSamples = null;
      stopWatch();
      s.onclose = null;
      s.onmessage = null;
      try {
        s.close();
      } catch {
        // already closed
      }
    };
    /** Resume or Stop on a parked take: connect again with `resume`, as after a drop. */
    const wake = () => {
      if (!parked || finished) return;
      parked = false;
      tries = 0;
      void connect();
    };

    // The first `ready` must come in time; a resume after it is the retries' business.
    readyWait = timers.set(() => {
      readyWait = null;
      if (!take && !finished) finish({ type: 'error', reason: 'busy' });
    }, READY_WAIT_MS);
    void connect();

    const control = (frame: Control) => {
      if (finished) return;
      controls.push({ at: samples, frame });
      if (live && socket) socket.send(JSON.stringify(frame));
      // Stop while parked: the end goes out with the held audio once the checker is back.
      else if (frame.type === 'end') wake();
    };

    return {
      sendAudio: (pcm) => {
        if (finished || pcm.length === 0) return;
        if (ended()) return;
        const copy = new Int16Array(pcm);
        audio.push(copy);
        samples += copy.length;
        if (live && socket) sendAudioTo(socket, copy);
      },
      send: control,
      close: () => finish(),
      hold: (on) => {
        holding = on;
        if (keep != null) timers.clear(keep);
        keep = null;
        if (parkWait != null) timers.clear(parkWait);
        parkWait = null;
        if (on) {
          keepAlive();
          parkWait = timers.set(park, PARK_AFTER_MS);
          return;
        }
        wake();
      },
      status: () =>
        // i18n-ignore (a status for the log and Sentry)
        (finished ? 'finished' : parked ? 'parked' : retry != null ? `retry ${tries}` : socket ? (live ? 'live' : 'opening') : 'none') +
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

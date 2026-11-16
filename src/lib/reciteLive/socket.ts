// The live check's connection to the checker on revisely-dev (`/live`, a WebSocket; scripts/recite-check, the server
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

import { LiveEvent, parseEvent } from './contract';
import { pairClosed, pairOpen } from './pairService';
import type { ClientFrame, LiveConnect, LiveConnection, LiveHandlers, StartFrame } from './feed';

/** The checker's live endpoint (the same Cloud Run service as lib/reciteCheck/service). */
export const RECITE_LIVE_URL = 'wss://recite-check-433792838929.us-east1.run.app/live';
/** recite-check-pair's (the same image and protocol): Recite and Words & harakat without letters only. */
export const RECITE_PAIR_LIVE_URL = 'wss://recite-check-pair-433792838929.us-east1.run.app/live';

/** Whether recite-check-pair takes this take: what the server calls `recite` or `harakat` (health.level). */
export function pairTakes(start: StartFrame): boolean {
  return start.follow === true || (start.tajweed === false && start.letters === false);
}

/** The take's audio rate (16 kHz mono). */
const SAMPLE_RATE_HZ = 16_000;
/** Samples per frame when sending held audio again after a drop (1 s). */
const RESEND_SAMPLES = 16_000;
/** Tries to reconnect before giving up, and the waits between them. */
const RETRY_WAITS_MS = [500, 1500, 4000];

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
    let tries = 0;
    let retry: unknown = null;
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
      if (retry != null) timers.clear(retry);
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

    /** Send the held audio from sample `from`, each text frame at its place in it, then go live. */
    const catchUp = (s: SocketLike, from: number) => {
      // Frames sent before `from` reached the checker with the audio it holds.
      let c = controls.findIndex((x) => x.at >= from);
      if (c < 0) c = controls.length;
      let pos = 0;
      for (const chunk of audio) {
        const end = pos + chunk.length;
        let at = Math.max(pos, from);
        while (at < end) {
          const next = c < controls.length ? controls[c].at : Infinity;
          if (next <= at) {
            s.send(JSON.stringify(controls[c++].frame));
            continue;
          }
          const stop = Math.min(end, at + RESEND_SAMPLES, next);
          s.send(bytes(chunk.subarray(at - pos, stop - pos)));
          at = stop;
        }
        pos = end;
      }
      while (c < controls.length) s.send(JSON.stringify(controls[c++].frame));
      live = true;
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
          // Once the take has ended, a resume only waits for the answer: its tries aren't renewed, so a checker
          // that keeps closing without one can't hold the take on Checking… for good.
          if (!ended()) tries = 0;
          handlers.onEvent(e);
          catchUp(s, Math.min(samples, Math.max(0, e.from ?? 0)));
          return;
        }
        if (e.type === 'done' || e.type === 'error') {
          finish(e);
          return;
        }
        handlers.onEvent(e);
      };
      s.onerror = () => undefined;
      s.onclose = () => {
        if (socket !== s) return;
        socket = null;
        // The pair service didn't start the take (unreachable, or 403 while private): recite-check does.
        if (unproven) toMain(true);
        else dropped();
      };
    };

    /** The socket went without an answer: try again, then give up. */
    const dropped = () => {
      socket = null;
      live = false;
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

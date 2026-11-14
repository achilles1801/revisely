// The live check's connection to the checker on revisely-dev (`/live`, a WebSocket; scripts/recite-check, the server
// session's). Audio goes out as 16 kHz mono PCM; the checker's events come back (lib/reciteLive/contract).
//
// A dropped connection carries on: the take's audio stays on the phone, a new socket sends the same start frame with
// a fresh token and `resume`, and the checker says how much it already holds (`ready.from`, in samples). The audio
// from there is sent again, with each seek, dismissal and the end at the point in the audio where it first went. The
// checker then sends the same events again (on another instance it re-runs the take), which the live state applies
// as snapshots and by id, so nothing counts twice.

import { LiveEvent, parseEvent } from './contract';
import type { ClientFrame, LiveConnect, LiveConnection, LiveHandlers, StartFrame } from './feed';

/** The checker's live endpoint (the same Cloud Run service as lib/reciteCheck/service). */
export const RECITE_LIVE_URL = 'wss://recite-check-433792838929.us-east1.run.app/live';

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

export function socketFeed(deps: SocketDeps): LiveConnect {
  const url = deps.url ?? RECITE_LIVE_URL;
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
        dropped();
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
        if (!e) return;
        if (e.type === 'ready') {
          take = e.take ?? take;
          tries = 0;
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
        dropped();
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
        if (controls.some((c) => c.frame.type === 'end')) return;
        const copy = new Int16Array(pcm);
        audio.push(copy);
        samples += copy.length;
        if (live && socket) socket.send(bytes(copy));
      },
      send: control,
      close: () => finish(),
    };
  };
}

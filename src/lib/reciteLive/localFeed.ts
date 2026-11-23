// A live take on the phone's own engine (modules-dev/recite-engine): the same frames as the checker's socket
// (lib/reciteLive/socket), so everything above this reads a take the same way (on-device-plan.md §5, §12). Nothing here
// can drop: there is no connection, no resume, no keepalive, and no token.
//
// A take the engine won't start (it refuses the start frame, or its first frame is an error) goes to the server by
// itself, with what the reciter has said so far: the take's audio and controls are kept until the engine has said
// `ready`. After that a failure ends the take like any other error.
//
// The engine also emits frames for the host alone, `clip` (a word for the teacher) and `health`: they go to `onHostFrame`
// and never reach the take's state.

import type { ClipSender, Verdict } from './clipSender';
import { LiveEvent, parseEvent } from './contract';
import type { ClientFrame, LiveConnect, LiveConnection, LiveHandlers, StartFrame } from './feed';
import { NAMES_WAIT_MS } from './socket';
import type { PhoneTakeEnd } from './phoneTake';
import type { WhereAnswer } from './where';

const SAMPLE_RATE_HZ = 16_000;

/** A take's frames from the engine's thread, in order. `code`: 0, or the RC_ERR_* of the call that failed. */
export interface EngineFrames {
  take: number;
  frames: string[];
  code: number;
}

/** The native engine as a transport needs it (lib/onDevice/engine). */
export interface EngineBridge {
  start(frame: string): Promise<{ take?: number; code?: number; error?: string }>;
  feed(take: number, pcm: Int16Array): void;
  control(take: number, frame: string): void;
  finish(take: number): void;
  close(take: number): void;
  /** Samples [s0, s1) of the take as base64, for the teacher's clips. */
  clip?(take: number, s0: number, s1: number): Promise<string | null>;
  onFrames(listener: (e: EngineFrames) => void): () => void;
}

export interface LocalDeps {
  engine: EngineBridge;
  /** Why this take came to the phone (lib/reciteLive/where). */
  asked: WhereAnswer;
  /** Where a take goes when the engine won't start it: the server. */
  fallback: LiveConnect;
  /** `clip` and `health` frames. */
  onHostFrame?: (frame: Record<string, unknown>) => void;
  /** The engine refused this take, and why. */
  onFallback?: (why: string) => void;
  /** The teacher's second opinion on this take's marks (lib/reciteLive/clipSender); absent: its marks stand as they are. */
  clips?: (hooks: { cut: (s0: number, s1: number) => Promise<string | null>; verdict: (id: string, v: Verdict) => void }) => ClipSender;
  /** Once, when a take that ran here has ended (lib/onDevice/takeReport). */
  onPhoneEnd?: (end: PhoneTakeEnd) => void;
  timers?: { set: (fn: () => void, ms: number) => unknown; clear: (h: unknown) => void };
}

type Control = Exclude<ClientFrame, StartFrame>;

function parsed(raw: string): Record<string, unknown> | null {
  try {
    const x = JSON.parse(raw) as unknown;
    return x && typeof x === 'object' ? (x as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function localFeed(deps: LocalDeps): LiveConnect {
  const timers = deps.timers ?? {
    set: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clear: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
  };

  return (start: StartFrame, handlers: LiveHandlers): LiveConnection => {
    const { engine } = deps;
    /** The take's audio, in the order it came: for the moments played back, and for the server if the engine refuses. */
    const audio: Int16Array[] = [];
    let samples = 0;
    /** Control frames with the sample they came at, until the engine says `ready`. */
    const held: { at: number; frame: Control }[] = [];
    let take: number | null = null;
    /** The engine's frames that came before its answer to `start` said which take is ours. */
    let early: EngineFrames[] = [];
    /** The server, once the engine has refused this take. */
    let server: LiveConnection | null = null;
    let holding = false;
    let ready = false;
    let ended = false;
    let finished = false;
    /** `done` came on a take started with namesAfter: only `into` is still to come. */
    let answered = false;
    let namesWait: unknown = null;
    let unsubscribe: (() => void) | null = null;
    // What the server would have noted of this take (lib/reciteLive/phoneTake).
    let how: PhoneTakeEnd['how'] = 'left';
    let named: string | null = null;
    let health: Record<string, unknown> | null = null;
    let meter: Record<string, unknown> | null = null;
    let result: Record<string, unknown> | null = null;
    const events: Record<string, unknown>[] = [];
    const dismissed = new Set<string>();
    const hints: PhoneTakeEnd['hints'] = [];
    let told = false;
    const sender =
      deps.clips?.({
        cut: (s0, s1) => (take != null && engine.clip ? engine.clip(take, s0, s1) : Promise.resolve(null)),
        verdict: (id, verdict) => {
          if (take != null && !finished) engine.control(take, JSON.stringify({ type: 'verdict', id, verdict }));
        },
      }) ?? null;

    /** `health` comes after `done`, in the same batch: a take that has just finished still takes it. */
    const hostFrame = (x: Record<string, unknown> | null): boolean => {
      if (x?.type === 'meter') {
        meter = x;
        return true;
      }
      if (x?.type !== 'clip' && x?.type !== 'health') return false;
      if (x.type === 'health') health = x;
      if (x.type === 'clip') sender?.add(x);
      deps.onHostFrame?.(x);
      return true;
    };

    const tell = () => {
      if (told || !finished || server || !ready) return;
      told = true;
      deps.onPhoneEnd?.({
        start,
        asked: deps.asked,
        how,
        take: named,
        health,
        meter,
        audio,
        samples,
        result,
        events,
        dismissed: [...dismissed],
        hints,
      });
    };

    const finish = (e?: LiveEvent) => {
      if (finished) return;
      finished = true;
      if (e?.type === 'error' && how !== 'done') how = 'error';
      sender?.close();
      if (namesWait != null) timers.clear(namesWait);
      namesWait = null;
      unsubscribe?.();
      unsubscribe = null;
      if (take != null) engine.close(take);
      if (e) handlers.onEvent(e);
      handlers.onClose();
    };

    /** The engine won't run this take: the server gets it, with everything said so far. */
    const toServer = (why: string) => {
      if (finished || server) return;
      unsubscribe?.();
      unsubscribe = null;
      sender?.close();
      if (take != null) engine.close(take);
      take = null;
      deps.onFallback?.(why);
      const conn = deps.fallback(start, handlers);
      server = conn;
      replay((pcm) => conn.sendAudio(pcm), (frame) => conn.send(frame));
      if (holding) conn.hold?.(true);
    };

    /** The audio and controls so far, each control at its place in the audio. */
    const replay = (sendAudio: (pcm: Int16Array) => void, send: (frame: Control) => void) => {
      let c = 0;
      let at = 0;
      for (const chunk of audio) {
        while (c < held.length && held[c].at <= at) send(held[c++].frame);
        sendAudio(chunk);
        at += chunk.length;
      }
      while (c < held.length) send(held[c++].frame);
    };

    const apply = (id: number, frame: Control) => {
      if (frame.type !== 'end') engine.control(id, JSON.stringify(frame));
      else if (!sender) engine.finish(id);
      // Stop waits a moment for the verdicts still out (at most 0.5 s), which the engine uses as it decides the take.
      else
        void sender.stop().then(() => {
          if (!finished && !server && take === id) engine.finish(id);
        });
    };

    const onFrame = (raw: string) => {
      if (finished || server) return;
      const x = parsed(raw);
      if (hostFrame(x)) return;
      const e = parseEvent(raw);
      if (!e) {
        // A final answer this app can't read still ends the take.
        if (x?.type === 'done') finish({ type: 'error', reason: 'server' });
        return;
      }
      if (e.type === 'error' && !ready) {
        toServer(`error:${e.reason}`);
        return;
      }
      if (start.keep && x) events.push(x);
      if (e.type === 'unmark') sender?.drop(e.id);
      if (e.type === 'done') {
        how = 'done';
        result = x?.result && typeof x.result === 'object' ? (x.result as Record<string, unknown>) : null;
      }
      if (e.type === 'ready') {
        ready = true;
        named = e.take;
        held.length = 0; // the engine has them, and from here the server never will
        handlers.onEvent(e);
        return;
      }
      if (e.type === 'done' && start.namesAfter) {
        handlers.onEvent(e);
        if (!answered) {
          answered = true;
          namesWait = timers.set(() => {
            namesWait = null;
            finish();
            tell();
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

    const onFrames = (batch: EngineFrames) => {
      for (const raw of batch.frames) {
        if (server) return;
        if (finished) hostFrame(parsed(raw));
        else onFrame(raw);
      }
      if (batch.code < 0 && !finished && !server) {
        if (ready) finish({ type: 'error', reason: 'server' });
        else toServer(`code:${batch.code}`);
      }
      tell();
    };

    unsubscribe = engine.onFrames((batch) => {
      if (take == null) early.push(batch);
      else if (batch.take === take) onFrames(batch);
    });

    engine
      .start(JSON.stringify(sender ? { ...start, clips: true } : start))
      .catch((err: unknown) => ({ error: String(err), code: -1, take: undefined }))
      .then((r) => {
        if (r.take == null) {
          early = [];
          toServer(`start:${r.code ?? 0}`);
          return;
        }
        if (finished) {
          engine.close(r.take);
          return;
        }
        const id = r.take;
        take = id;
        replay(
          (pcm) => engine.feed(id, pcm),
          (frame) => apply(id, frame),
        );
        const waiting = early.filter((b) => b.take === id);
        early = [];
        for (const b of waiting) onFrames(b);
      });

    return {
      sendAudio: (pcm) => {
        if (finished || pcm.length === 0) return;
        if (server) {
          // Kept here too, for `audioClip`.
          const kept = new Int16Array(pcm);
          audio.push(kept);
          samples += kept.length;
          server.sendAudio(kept);
          return;
        }
        if (ended) return;
        // A copy with no offset of its own: the native side reads the array's bytes from its start.
        const copy = new Int16Array(pcm);
        audio.push(copy);
        samples += copy.length;
        if (take != null) engine.feed(take, copy);
      },
      send: (frame) => {
        if (finished) return;
        if (server) {
          server.send(frame);
          return;
        }
        if (frame.type === 'end') ended = true;
        if (frame.type === 'dismiss') dismissed.add(frame.id);
        if (frame.type === 'undismiss') dismissed.delete(frame.id);
        if (frame.type === 'hint') hints.push([Math.round(samples / 160) / 100, { w: frame.w, what: frame.what }]);
        // Until `ready` the server may still get this take, so it needs them too.
        if (!ready) held.push({ at: samples, frame });
        if (take != null) apply(take, frame);
      },
      close: () => {
        if (server) server.close();
        else {
          finish();
          tell();
        }
      },
      // Nothing to keep open: a pause is only audio that doesn't come.
      hold: (on) => {
        holding = on;
        server?.hold?.(on);
      },
      // i18n-ignore (a status for the log and Sentry)
      status: () => (server ? (server.status?.() ?? 'server') : finished ? 'finished' : take != null ? 'local' : 'local opening'),
      ranWhere: () => (server ? (server.ranWhere?.() ?? { on: 'server', why: 'refused' }) : deps.asked),
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

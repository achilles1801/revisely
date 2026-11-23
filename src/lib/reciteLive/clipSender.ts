// The teacher's second opinion on a take checked on the phone (on-device-plan.md §8, recite-contract.md draft 14). Majd,
// Nov 23 2026: "it should be as marks appear that they get checked by the teacher not when the session ends otherwise
// it'd take forever". The engine asks for a clip as soon as a mark's window is whole; this sends them to `POST /second`, a
// few at a time, and hands each verdict back to the engine, which applies them when the take ends.
//
// Nothing here can hurt a take: a clip that isn't answered, for any reason, leaves the phone's mark standing.

export type Verdict = 'keep' | 'veto' | 'confirm';

/** The engine's `clip` frame (recite_core.h): `s0`, `s1` are samples of the take. */
export type ClipFrame =
  | { id: string; kind: 'word'; a: number; b: number; w: number; s0: number; s1: number }
  | { id: string; kind: 'letters'; s: number; a: number; lo: number; hi: number; i: number; s0: number; s1: number };

/** One clip of `/second`'s body. */
export type SecondClip =
  | { id: string; kind: 'word'; a: number; b: number; w: number; audio: string }
  | { id: string; kind: 'letters'; s: number; a: number; lo: number; hi: number; i: number; audio: string };

export const CLIPS = {
  /** The most `/second` takes in a call. */
  perCall: 8,
  /** Audio in a call, so its verdicts come soon (a longer clip goes alone). */
  maxCallSamples: 12 * 16_000,
  /** Calls out at once: the service takes one a instance and starts more. */
  parallel: 3,
  /** The teacher's pace on Dev, Nov 23 2026: seconds of call per second of audio. The one place to change it. */
  teacherRate: 1.5,
  /** On top of that, for an instance that has to start. */
  coldStartMs: 20_000,
  /** Waiting to be sent, beyond which the oldest is dropped (a slow network mustn't hold a take's worth of audio). */
  queue: 16,
  /** Stop waits this long for verdicts still out, and never longer. */
  stopWaitMs: 500,
  /** The contract's limits on a clip. */
  minSamples: 3_200,
  maxSamples: 320_000,
  maxIdLength: 80,
} as const;

/** How long a call of this much audio may take before its marks are left standing. */
export const callTimeoutMs = (samples: number): number => CLIPS.coldStartMs + (samples / 16_000) * CLIPS.teacherRate * 1000;

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** A `clip` frame this host can send, or null. */
export function parseClip(x: Record<string, unknown>): ClipFrame | null {
  const { id, kind, s0, s1 } = x;
  if (typeof id !== 'string' || id.length === 0 || id.length > CLIPS.maxIdLength) return null;
  if (!isInt(s0) || !isInt(s1) || s0 < 0) return null;
  if (s1 - s0 < CLIPS.minSamples || s1 - s0 > CLIPS.maxSamples) return null;
  if (kind === 'word') {
    const { a, b, w } = x;
    return isInt(a) && isInt(b) && isInt(w) ? { id, kind, a, b, w, s0, s1 } : null;
  }
  if (kind === 'letters') {
    const { s, a, lo, hi, i } = x;
    return isInt(s) && isInt(a) && isInt(lo) && isInt(hi) && isInt(i) ? { id, kind, s, a, lo, hi, i, s0, s1 } : null;
  }
  return null;
}

function bodyClip(c: ClipFrame, audio: string): SecondClip {
  return c.kind === 'word'
    ? { id: c.id, kind: c.kind, a: c.a, b: c.b, w: c.w, audio }
    : { id: c.id, kind: c.kind, s: c.s, a: c.a, lo: c.lo, hi: c.hi, i: c.i, audio };
}

export interface ClipDeps {
  /** Samples [s0, s1) of the take, as base64 of 16-bit little-endian PCM; null if they can't be cut. */
  cut(s0: number, s1: number): Promise<string | null>;
  post(clips: SecondClip[], timeoutMs: number): Promise<{ status: number; results?: unknown }>;
  verdict(id: string, verdict: Verdict): void;
  online(): boolean;
  later(fn: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
}

export interface ClipSender {
  /** A `clip` frame from the engine. */
  add(frame: Record<string, unknown>): void;
  /** The take took this mark back: its clip needn't go. */
  drop(id: string): void;
  /** Stop was pressed: resolves when nothing is out, or after `stopWaitMs`. Verdicts after that are ignored. */
  stop(): Promise<void>;
  /** The take is over. */
  close(): void;
}

/** A refusal that the next call of this take would get too (sign-in, App Check, no endpoint, the hourly limit, no teacher). */
const STOPS_THE_TAKE = new Set([401, 403, 404, 429, 503]);

export function clipSender(d: ClipDeps): ClipSender {
  const queue: ClipFrame[] = [];
  const seen = new Set<string>();
  const dropped = new Set<string>();
  /** Calls on their way. */
  let out = 0;
  /** No more verdicts are wanted. */
  let closed = false;
  /** `/second` refused in a way that won't change during this take. */
  let refused = false;
  let waiters: (() => void)[] = [];

  const idle = () => out === 0 && (queue.length === 0 || refused || !d.online());
  const wake = () => {
    if (!idle()) return;
    const those = waiters;
    waiters = [];
    those.forEach((fn) => fn());
  };

  const send = async (batch: ClipFrame[]) => {
    const cut = await Promise.all(
      batch.map(async (c) => {
        const audio = await d.cut(c.s0, c.s1).catch(() => null);
        return audio && !dropped.has(c.id) ? bodyClip(c, audio) : null;
      }),
    );
    const clips = cut.filter((c): c is SecondClip => c !== null);
    if (clips.length === 0 || closed) return;
    const samples = batch.filter((c) => clips.some((x) => x.id === c.id)).reduce((n, c) => n + c.s1 - c.s0, 0);
    const res = await d.post(clips, callTimeoutMs(samples));
    if (res.status !== 200) {
      if (STOPS_THE_TAKE.has(res.status)) refused = true;
      return;
    }
    if (closed || !Array.isArray(res.results)) return;
    const asked = new Set(clips.map((c) => c.id));
    for (const r of res.results as { id?: unknown; verdict?: unknown }[]) {
      if (typeof r?.id !== 'string' || !asked.has(r.id) || dropped.has(r.id)) continue;
      if (r.verdict === 'keep' || r.verdict === 'veto' || r.verdict === 'confirm') d.verdict(r.id, r.verdict);
    }
  };

  /** The next call's clips: up to 8 and about 12 s of audio. The first always goes, however long. */
  const nextBatch = (): ClipFrame[] => {
    let n = 0;
    let samples = 0;
    while (n < queue.length && n < CLIPS.perCall) {
      const length = queue[n].s1 - queue[n].s0;
      if (n > 0 && samples + length > CLIPS.maxCallSamples) break;
      samples += length;
      n++;
    }
    return queue.splice(0, n);
  };

  const pump = () => {
    while (out < CLIPS.parallel && !closed && !refused && queue.length > 0 && d.online()) {
      out++;
      send(nextBatch())
        .catch(() => undefined) // not answered: those marks stand
        .finally(() => {
          out--;
          pump();
        });
    }
    wake();
  };

  return {
    add: (frame) => {
      if (closed || refused) return;
      const clip = parseClip(frame);
      if (!clip || seen.has(clip.id)) return;
      seen.add(clip.id);
      queue.push(clip);
      if (queue.length > CLIPS.queue) queue.shift();
      pump();
    },
    drop: (id) => {
      dropped.add(id);
      const at = queue.findIndex((c) => c.id === id);
      if (at >= 0) queue.splice(at, 1);
      wake();
    },
    stop: () =>
      new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          d.cancel(timer);
          closed = true;
          resolve();
        };
        const timer = d.later(finish, CLIPS.stopWaitMs);
        pump();
        if (idle()) finish();
        else waiters.push(finish);
      }),
    close: () => {
      closed = true;
      queue.length = 0;
      const those = waiters;
      waiters = [];
      those.forEach((fn) => fn());
    },
  };
}

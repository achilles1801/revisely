// The real engine's speed and memory on a phone (Revisely Dev; BEHAVIOUR.md ONDEV-1): a take of the bench's recorded clip
// (Husary, page 7), fed at the live pace: Strict, or words and harakat on a phone whose engine has no Strict level. Nobody recites, so every phone runs the same take through the
// whole pipeline. The record holds the host's meter, the app's peak memory and how many frames of each kind came:
// no audio and no words.

import type { StartFrame } from '../reciteLive/feed';
import type { EngineBridge } from '../reciteLive/localFeed';
import { fellBehind } from './speedCheck';

/** Strict, anywhere on page 7 of the mushaf (2:38–2:48 in both prints), where the clip is. */
export const TEST_START: StartFrame = {
  type: 'start',
  s: 2,
  a: 38,
  s2: null,
  a2: null,
  mon: 4,
  mot: 4,
  aar: 0,
  letters: true,
  tajweed: true,
  keep: false,
  startBy: [2, 48],
};

const RATE = 16_000;
/** 100 ms at a time, as the microphone hands it over. */
const CHUNK = 1_600;
/** The final pass after the last audio. */
export const ANSWER_MS = 60_000;
/** The meter comes with the answer, or just after it. */
export const METER_MS = 2_000;
const POLL_MS = 50;

export type EngineTestLevel = 'strict' | 'harakat';

export interface EngineTestDeps {
  bridge: EngineBridge;
  level: EngineTestLevel;
  pcm: Int16Array;
  /** The engine's hop, as it opened. */
  hop: number | null;
  peakMb(): number;
  now(): number;
  sleep(ms: number): Promise<void>;
  /** False once the app has left the foreground or the screen has gone: the timing would mean nothing. */
  keepGoing(): boolean;
  onProgress?(doneSec: number, totalSec: number): void;
}

export interface EngineTestRun {
  mode: 'engineTest';
  level: EngineTestLevel;
  ok: boolean;
  error: string | null;
  interrupted: boolean;
  audioSec: number;
  wallSec: number;
  hop: number | null;
  hops: number | null;
  lateHops: number | null;
  worstHopMs: number | null;
  maxLagS: number | null;
  /** The in-take safety net's own rule on this take. The test changes nothing: a real take would step down next time. */
  wouldStepDown: boolean;
  thermalStart: number | null;
  thermalEnd: number | null;
  peakBeforeMb: number;
  peakAfterMb: number;
  /** How many frames of each type the take produced: proof it ran end to end. */
  frames: Record<string, number>;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round = (v: number) => Math.round(v * 10) / 10;

function parsed(raw: string): Record<string, unknown> | null {
  try {
    const x = JSON.parse(raw) as unknown;
    return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Runs the take. Never rejects for the engine's sake: what went wrong is in the result. */
export async function runEngineTest(d: EngineTestDeps): Promise<EngineTestRun> {
  const peakBeforeMb = d.peakMb();
  const started = d.now();
  const frames: Record<string, number> = {};
  let meter: Record<string, unknown> | null = null;
  let answered = false;
  let failure: string | null = null;
  let interrupted = false;
  let take: number | null = null;

  const off = d.bridge.onFrames((e) => {
    if (take !== null && e.take !== take) return;
    for (const raw of e.frames) {
      const x = parsed(raw);
      if (!x) continue;
      const type = String(x.type);
      frames[type] = (frames[type] ?? 0) + 1;
      if (type === 'meter') meter = x;
      if (type === 'done') answered = true;
      if (type === 'error') {
        failure = typeof x.reason === 'string' ? x.reason : 'error';
        answered = true;
      }
    }
  });

  /** Waits for `until`, for at most `ms`. */
  const waitFor = async (until: () => boolean, ms: number) => {
    const end = d.now() + ms;
    while (!until() && d.now() < end && d.keepGoing()) await d.sleep(POLL_MS);
  };

  const totalSec = d.pcm.length / RATE;
  try {
    const opened = await d.bridge.start(JSON.stringify({ ...TEST_START, tajweed: d.level === 'strict' }));
    if (opened.take == null) {
      failure = opened.error ?? `the engine refused the take (${opened.code ?? '?'})`;
    } else {
      take = opened.take;
      const feedStart = d.now();
      let lastSecond = -1;
      for (let at = 0; at < d.pcm.length && !failure; at += CHUNK) {
        const due = feedStart + (at / RATE) * 1000;
        const wait = due - d.now();
        if (wait > 0) await d.sleep(wait);
        if (!d.keepGoing()) {
          interrupted = true;
          break;
        }
        d.bridge.feed(take, d.pcm.slice(at, at + CHUNK));
        const second = Math.floor(at / RATE);
        if (second !== lastSecond) {
          lastSecond = second;
          d.onProgress?.(second, Math.round(totalSec));
        }
      }
      if (!interrupted && !failure) {
        d.bridge.finish(take);
        await waitFor(() => answered, ANSWER_MS);
        if (!d.keepGoing()) interrupted = true;
        else if (!answered) failure = 'no answer after the last audio';
        else await waitFor(() => meter !== null, METER_MS);
      }
      d.bridge.close(take);
    }
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
  } finally {
    off();
  }

  const m: Record<string, unknown> = meter ?? {};
  return {
    mode: 'engineTest',
    level: d.level,
    ok: !interrupted && !failure && answered,
    error: failure,
    interrupted,
    audioSec: round(totalSec),
    wallSec: round((d.now() - started) / 1000),
    hop: d.hop,
    hops: num(m.hops),
    lateHops: num(m.late_hops),
    worstHopMs: num(m.worst_hop_ms),
    maxLagS: num(m.max_lag_s),
    wouldStepDown: fellBehind(meter),
    thermalStart: num(m.thermal_start),
    thermalEnd: num(m.thermal_end),
    peakBeforeMb: round(peakBeforeMb),
    peakAfterMb: round(d.peakMb()),
    frames,
  };
}

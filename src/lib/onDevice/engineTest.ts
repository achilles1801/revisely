// The real engine on a phone (Revisely Dev; BEHAVIOUR.md ONDEV-1): a take of the bench's recorded clip, fed at the live
// pace: Strict, or words and harakat on a phone whose engine has no Strict level. The clip is the first 90 s (1,440,000
// samples) of the lab's golden/bench-v0-on/husary.p7.clean.clean: Al-Husary from An-Naba 78:1 ("p7" is the item's name,
// not a mushaf page), so the Python can run the same samples and the marks can be compared one by one. Nobody recites, so every phone runs the same take through the
// whole pipeline. The record holds the host's meter, memory, the marks, the score and how many frames of each kind came:
// never any audio.

import type { StartFrame } from '../reciteLive/feed';
import type { EngineBridge } from '../reciteLive/localFeed';
import { fellBehind } from './speedCheck';

/** That golden's own start frame (its take.json): An-Naba 78:1–30, with Strict's tajweed set per run. */
export const TEST_START: StartFrame = {
  type: 'start',
  s: 78,
  a: 1,
  s2: 78,
  a2: 30,
  mon: 4,
  mot: 4,
  aar: 0,
  letters: true,
  tajweed: true,
  keep: false,
  namesAfter: true,
};

const RATE = 16_000;
/** 100 ms at a time, as the microphone hands it over. */
const CHUNK = 1_600;
/** The final pass after the last audio. */
export const ANSWER_MS = 60_000;
/** The meter comes with the answer, or just after it. */
export const METER_MS = 2_000;
const POLL_MS = 50;
/** Enough for any real take; a runaway one can't outgrow its record. */
const MAX_KEPT = 200;

export type EngineTestLevel = 'strict' | 'harakat';

export interface EngineTestDeps {
  bridge: EngineBridge;
  level: EngineTestLevel;
  /** The clip's start frame (TEST_START: the Husary clip's) and its name in the record. */
  start?: StartFrame;
  clip?: string;
  pcm: Int16Array;
  /** The engine's hop, as it opened. */
  hop: number | null;
  peakMb(): number;
  /** The app's memory now, in MB, on builds that can say (null otherwise). Read about once a second during the take. */
  memoryNow?(): number | null;
  /** The same, just before and just after the engine opened. */
  beforeOpenMb?: number | null;
  afterOpenMb?: number | null;
  now(): number;
  sleep(ms: number): Promise<void>;
  /** False once the app has left the foreground or the screen has gone: the timing would mean nothing. */
  keepGoing(): boolean;
  onProgress?(doneSec: number, totalSec: number): void;
}

export interface EngineTestRun {
  mode: 'engineTest';
  level: EngineTestLevel;
  clip: string | null;
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
  /** Null until a build can read the app's memory now. The engine's share is afterOpen less beforeOpen. */
  memoryMb: { beforeOpen: number | null; afterOpen: number | null; takeMax: number | null };
  /** How many frames of each type the take produced: proof it ran end to end. */
  frames: Record<string, number>;
  /** The final answer, to compare mark for mark with the Python on the same samples. */
  result: EngineTestAnswer | null;
  /** The last word the cursor reached (`at`), to compare with the Python's. */
  lastAt: number | null;
  /** Each live mark as it came, and how many samples had been fed then. */
  liveMarks: (KeptMark & { atSample: number })[];
  unmarks: { id: string; why: string | null; atSample: number }[];
}

export interface KeptMark {
  id: string;
  w: number | null;
  ayah: number[] | null;
  kind: string | null;
  detail: string | null;
  sure: string | null;
  t: number[] | null;
}

export interface EngineTestAnswer {
  from: number | null;
  to: number | null;
  secs: number | null;
  start: number | null;
  why: string | null;
  score: Record<string, number> | null;
  marks: KeptMark[];
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round = (v: number) => Math.round(v * 10) / 10;

const text = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numbers = (v: unknown): number[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? (v as number[]) : null;

function keptMark(raw: unknown): KeptMark | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== 'string') return null;
  return {
    id: m.id,
    w: num(m.w),
    ayah: numbers(m.ayah),
    kind: text(m.kind),
    detail: text(m.detail),
    sure: text(m.sure),
    t: numbers(m.t),
  };
}

function keptAnswer(raw: unknown): EngineTestAnswer | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const score =
    r.score && typeof r.score === 'object'
      ? Object.fromEntries(Object.entries(r.score).filter((e): e is [string, number] => typeof e[1] === 'number'))
      : null;
  const marks = Array.isArray(r.marks) ? r.marks.map(keptMark).filter((m): m is KeptMark => m !== null) : [];
  return { from: num(r.from), to: num(r.to), secs: num(r.secs), start: num(r.start), why: text(r.why), score, marks: marks.slice(0, MAX_KEPT) };
}

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
  let fed = 0;
  let takeMax: number | null = null;
  let result: EngineTestAnswer | null = null;
  let lastAt: number | null = null;
  const liveMarks: EngineTestRun['liveMarks'] = [];
  const unmarks: EngineTestRun['unmarks'] = [];
  const noteMemory = () => {
    const now = d.memoryNow?.() ?? null;
    if (now !== null && (takeMax === null || now > takeMax)) takeMax = now;
  };

  const off = d.bridge.onFrames((e) => {
    if (take !== null && e.take !== take) return;
    for (const raw of e.frames) {
      const x = parsed(raw);
      if (!x) continue;
      const type = String(x.type);
      frames[type] = (frames[type] ?? 0) + 1;
      if (type === 'meter') meter = x;
      if (type === 'done') {
        answered = true;
        result = keptAnswer(x.result);
      }
      if (type === 'at') lastAt = num(x.w) ?? lastAt;
      if (type === 'mark' && liveMarks.length < MAX_KEPT) {
        const mark = keptMark(x.mark);
        if (mark) liveMarks.push({ ...mark, atSample: fed });
      }
      if (type === 'unmark' && unmarks.length < MAX_KEPT && typeof x.id === 'string') {
        unmarks.push({ id: x.id, why: text(x.why), atSample: fed });
      }
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
    const opened = await d.bridge.start(JSON.stringify({ ...(d.start ?? TEST_START), tajweed: d.level === 'strict' }));
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
        const chunk = d.pcm.slice(at, at + CHUNK);
        d.bridge.feed(take, chunk);
        fed += chunk.length;
        const second = Math.floor(at / RATE);
        if (second !== lastSecond) {
          lastSecond = second;
          noteMemory();
          d.onProgress?.(second, Math.round(totalSec));
        }
      }
      if (!interrupted && !failure) {
        d.bridge.finish(take);
        await waitFor(() => answered, ANSWER_MS);
        noteMemory();
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
    clip: d.clip ?? null,
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
    memoryMb: {
      beforeOpen: d.beforeOpenMb ?? null,
      afterOpen: d.afterOpenMb ?? null,
      takeMax: takeMax === null ? null : round(takeMax),
    },
    frames,
    result,
    lastAt,
    liveMarks,
    unmarks,
  };
}

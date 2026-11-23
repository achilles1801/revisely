// The phone's speed check (on-device-plan.md §2, §12; BEHAVIOUR.md ONDEV-4): how long one model call takes here, at the
// pace of a live take, decides the hop and whether `auto` may use the phone at all. It runs once per pack, engine, device
// and thread count, on a phone that is idle and cool, and a result is kept only from a clean run.
//
// What the numbers below come from (the bench's per-call runs, Nov 23 2026):
// - Calls are spaced as a take spaces them: back to back, an iPhone reads 48 ms where a live take sees 71.
// - A Galaxy A15 just after launch ran its first ~30 calls at 266–296 ms, then settled at 221, so the check warms up
//   until two blocks agree.
// - Its p95 stayed noisy for ~80 calls after the median had settled. Over 400 ms costs the phone its on-device checking,
//   so a high first reading is timed for three more blocks and the last one counts: it is the most warmed up, and it
//   gives a phone truly over 400 no lucky draw. On the 8 Test Lab runs scaled around 400 ms (96 cases), one block sent
//   11 of 48 good phones to the server and kept 5 of 48 slow ones; the best of four 1 and 8; the median 6 and 5; the
//   last 1 and 6. This rests on one noisy A15 run, so the figure is a starting point, not a measurement of every phone.

import { cleanWindows, quantile } from './bench';

export const SPEED = {
  spacingMs: 500,
  block: 6,
  settleWithin: 0.1,
  maxWarmup: 40,
  timed: 24,
  serverBlocks: 4,
  halfHopUnderMs: 150,
  serverOverMs: 400,
} as const;

/** The checker's hop on this phone, in seconds; null: too slow, the server. */
export type SpeedHop = 0.5 | 1;

export function hopFor(p95: number): SpeedHop | null {
  if (p95 < SPEED.halfHopUnderMs) return 0.5;
  return p95 <= SPEED.serverOverMs ? 1 : null;
}

const medianOf = (values: readonly number[]) => quantile([...values].sort((a, b) => a - b), 0.5);

/** The last two whole blocks of calls agree: the phone has warmed up. */
export function isSettled(calls: readonly number[]): boolean {
  const { block, settleWithin } = SPEED;
  if (calls.length < 2 * block || calls.length % block !== 0) return false;
  const newer = medianOf(calls.slice(-block));
  const older = medianOf(calls.slice(-2 * block, -block));
  return Math.abs(newer - older) / Math.max(newer, older) <= settleWithin;
}

export interface SpeedDeps {
  /** One model call on the pack's check input, on the engine's thread: its time in ms, or null when it can't run. */
  probe(): Promise<number | null>;
  /** No take open, the app in front, no power saving, and the phone cool. */
  calm(): boolean;
  now(): number;
  sleep(ms: number): Promise<void>;
}

export type SpeedRun =
  | { kept: true; p95: number; hop: SpeedHop | null; calls: number }
  | { kept: false; why: 'no-probe' | 'disturbed' | 'unsettled' };

/** Warms the model up, then times it. Nothing here keeps a result from a run that was disturbed. */
export async function runSpeedCheck(d: SpeedDeps): Promise<SpeedRun> {
  let calls = 0;
  const timeOne = async (): Promise<{ at: number; ms: number } | 'no-probe' | 'disturbed'> => {
    if (!d.calm()) return 'disturbed';
    const at = d.now();
    const ms = await d.probe();
    if (ms == null || !(ms > 0)) return 'no-probe';
    if (!d.calm()) return 'disturbed';
    calls++;
    await d.sleep(Math.max(0, SPEED.spacingMs - (d.now() - at)));
    return { at, ms };
  };

  const warm: number[] = [];
  while (!isSettled(warm)) {
    if (warm.length >= SPEED.maxWarmup) return { kept: false, why: 'unsettled' };
    const c = await timeOne();
    if (typeof c === 'string') return { kept: false, why: c };
    warm.push(c.ms);
  }

  let reading = Infinity;
  for (let b = 0; b < SPEED.serverBlocks; b++) {
    const start: number[] = [];
    const run: number[] = [];
    for (let i = 0; i < SPEED.timed; i++) {
      const c = await timeOne();
      if (typeof c === 'string') return { kept: false, why: c };
      start.push(c.at);
      run.push(c.ms);
    }
    if (cleanWindows(start, run, run.map(() => 0)).suspensions > 0) return { kept: false, why: 'disturbed' };
    reading = quantile([...run].sort((x, y) => x - y), 0.95);
    if (b === 0 && reading <= SPEED.serverOverMs) break;
  }
  return { kept: true, p95: reading, hop: hopFor(reading), calls };
}

// iOS's fair is Android's light at most: from there up the phone is already holding itself back.
const TOO_WARM = new Set(['light', 'moderate', 'serious', 'severe', 'critical', 'emergency', 'shutdown']);

/** Whether a phone in this state gives a number worth keeping. */
export const coolAndFull = (device: { thermal?: string; lowPower?: boolean }): boolean =>
  device.lowPower !== true && !TOO_WARM.has(device.thermal ?? '');

export interface SpeedRecord {
  /** The pack, engine, device and threads it was measured on. */
  key: string;
  p95: number;
  hop: SpeedHop | null;
  /** Steps down since that check, each from a take that fell behind. The next clean check clears them. */
  demoted?: number;
}

/** From the fastest a phone can run to the server. */
const LADDER: readonly (SpeedHop | null)[] = [0.5, 1, null];

/** The hop this phone runs now: what it measured, less any steps down. */
export function effectiveHop(r: SpeedRecord): SpeedHop | null {
  return LADDER[Math.min(LADDER.length - 1, LADDER.indexOf(r.hop) + (r.demoted ?? 0))];
}

// A take that fell behind (the lead, Nov 23 2026): nothing changes inside it, and the next take runs one step slower.
const LATE_SHARE = 0.05;
const LAG_S = 2;
/** Below this a single slow hop is more than 5% of the take, and proves nothing. */
const MIN_HOPS = 20;

export function fellBehind(meter: Record<string, unknown> | null | undefined): boolean {
  if (!meter) return false;
  const lag = typeof meter.max_lag_s === 'number' ? meter.max_lag_s : 0;
  const hops = typeof meter.hops === 'number' ? meter.hops : 0;
  const late = typeof meter.late_hops === 'number' ? meter.late_hops : 0;
  return lag > LAG_S || (hops >= MIN_HOPS && late / hops > LATE_SHARE);
}

export const speedKey = (info: { pack?: string; version?: string }, model: string, threads: number): string =>
  `${info.pack ?? ''}|${info.version ?? ''}|${model}|${threads}`;

export function parseSpeedRecord(raw: string | null | undefined): SpeedRecord | null {
  if (!raw) return null;
  try {
    const x = JSON.parse(raw) as Partial<SpeedRecord>;
    if (typeof x.key !== 'string' || typeof x.p95 !== 'number' || !(x.p95 > 0)) return null;
    const demoted = typeof x.demoted === 'number' && x.demoted > 0 ? Math.min(2, Math.floor(x.demoted)) : 0;
    return { key: x.key, p95: x.p95, hop: hopFor(x.p95), ...(demoted ? { demoted } : {}) };
  } catch {
    return null;
  }
}

/** Whether `auto` may use the phone: null until this pack, engine and device have a result. */
export const fastEnoughFrom = (record: SpeedRecord | null, key: string | null): boolean | null =>
  record && key && record.key === key ? effectiveHop(record) !== null : null;

/** A phone that measured fast enough and has since been moved to the server by takes that fell behind. */
export const demotedOff = (record: SpeedRecord | null, key: string | null): boolean =>
  !!record && record.key === key && record.hop !== null && effectiveHop(record) === null;

/** Idle this long before the check: never during app start, or between a take and the next. */
const IDLE_MS = 20_000;
/** Checks one app run may try for one pack: a take or a warm phone can stop them. */
const MAX_TRIES = 3;

export interface KeeperDeps {
  /** The open engine's rc_info. */
  info(): { pack?: string; version?: string; hop?: number; self_check?: { models?: { v7?: { ran?: boolean; ok?: boolean } } } } | null;
  device(): { model?: string; thermal?: string; lowPower?: boolean } | null;
  threads: number;
  probe(): Promise<number | null>;
  /** The app is in front. */
  active(): boolean;
  read(): Promise<string | null>;
  write(json: string): Promise<void>;
  /** Close the engine and open it again, for a hop that changed. */
  reopen(): void;
  now(): number;
  sleep(ms: number): Promise<void>;
  later(fn: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
  log?(message: string): void;
}

/** The phone's speed result, kept across launches: when to measure, and what a take that fell behind changes. */
export function speedKeeper(d: KeeperDeps) {
  let record: SpeedRecord | null = null;
  let takes = 0;
  let running = false;
  let stop = false;
  let timer: unknown = null;
  const tries = new Map<string, number>();
  /** Demoted during this app run: the phone is still warm from that take, so a check now would clear it wrongly. */
  let demotedNow: string | null = null;
  let reopenedFor: string | null = null;

  const keyNow = (): string | null => {
    const info = d.info();
    const device = d.device();
    return info && device?.model ? speedKey(info, device.model, d.threads) : null;
  };
  const save = () => {
    if (record) d.write(JSON.stringify(record)).catch(() => undefined);
  };

  const check = async () => {
    const info = d.info();
    const key = keyNow();
    if (running || takes > 0 || !info || !key || info.self_check?.models?.v7?.ran !== true || info.self_check.models.v7.ok !== true || /replay/.test(info.version ?? '')) return;
    const mine = record?.key === key ? record : null;
    const want = mine ? effectiveHop(mine) : null;
    if (mine && want && info.hop !== want && reopenedFor !== `${key}:${want}`) {
      reopenedFor = `${key}:${want}`;
      d.reopen();
      return;
    }
    if ((mine && !mine.demoted) || demotedNow === key || (tries.get(key) ?? 0) >= MAX_TRIES) return;
    tries.set(key, (tries.get(key) ?? 0) + 1);
    running = true;
    stop = false;
    try {
      const r = await runSpeedCheck({
        probe: d.probe,
        calm: () => {
          const device = d.device();
          return !stop && takes === 0 && d.active() && !!device && coolAndFull(device);
        },
        now: d.now,
        sleep: d.sleep,
      });
      if (!r.kept) {
        d.log?.(`Recite speed check: nothing kept (${r.why})`);
        return;
      }
      record = { key, p95: r.p95, hop: r.hop };
      save();
      d.log?.(`Recite speed check: p95 ${Math.round(r.p95)} ms, hop ${r.hop ?? 'server'}`);
      if (r.hop && info.hop !== r.hop) schedule();
    } catch {
      d.log?.('Recite speed check: failed');
    } finally {
      running = false;
    }
  };

  function schedule() {
    if (timer != null) d.cancel(timer);
    timer = d.later(() => {
      timer = null;
      void check();
    }, IDLE_MS);
  }

  return {
    load: async () => {
      record = parseSpeedRecord(await d.read().catch(() => null)) ?? record;
    },
    fastEnough: () => fastEnoughFrom(record, keyNow()),
    demoted: () => demotedOff(record, keyNow()),
    /** The hop to open the engine with; undefined until this phone has a result. */
    hop: (): SpeedHop | undefined => (record ? (effectiveHop(record) ?? undefined) : undefined),
    /** How many steps down the phone is, for the take's line. */
    steps: () => (record?.key === keyNow() ? (record?.demoted ?? 0) : 0),
    schedule,
    takeOpened: () => {
      takes++;
      stop = true;
      if (timer != null) d.cancel(timer);
      timer = null;
    },
    takeClosed: () => {
      takes = Math.max(0, takes - 1);
      if (takes === 0) schedule();
    },
    /** A take on the phone ended: if it fell behind, the next one runs a step slower. Never this one. */
    noteTake: (meter: Record<string, unknown> | null) => {
      const key = keyNow();
      if (!fellBehind(meter) || !record || record.key !== key || effectiveHop(record) === null) return;
      record = { ...record, demoted: (record.demoted ?? 0) + 1 };
      demotedNow = key;
      reopenedFor = null;
      save();
    },
  };
}
